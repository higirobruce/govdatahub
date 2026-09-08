import { promises as dns } from 'dns';
import { BadRequestException } from '@nestjs/common';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

type Resolver = (hostname: string) => Promise<{ address: string }[]>;

const defaultResolver: Resolver = (hostname) =>
  dns.lookup(hostname, { all: true, verbatim: true });

/**
 * True when the address is loopback, private (RFC1918), link-local,
 * CGNAT, unspecified, or otherwise unsafe for server-side fetches.
 * Malformed input is treated as private (fail closed).
 */
export function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const addr = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
    if (addr === '::' || addr === '::1') return true;
    if (addr.startsWith('fe80:')) return true; // link-local
    if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // ULA
    if (addr.startsWith('::ffff:')) return isPrivateIp(addr.slice(7)); // v4-mapped
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Validates a user-supplied URL for server-side fetching (SSRF guard).
 * Checks protocol, hostname blocklist, literal IPs, and every DNS-resolved
 * address. Throws BadRequestException when the URL is unsafe.
 */
export async function assertSafeUrl(
  rawUrl: string,
  resolve: Resolver = defaultResolver,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid URL format');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestException(
      `Invalid protocol: ${parsed.protocol}. Only HTTP and HTTPS are supported.`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    throw new BadRequestException('URL host is not allowed');
  }

  const isLiteralIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
  if (isLiteralIp) {
    if (isPrivateIp(hostname)) {
      throw new BadRequestException('URL resolves to a private address');
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await resolve(hostname);
  } catch {
    throw new BadRequestException(`Could not resolve host: ${hostname}`);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new BadRequestException('URL resolves to a private address');
  }
}
