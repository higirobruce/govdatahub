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
    if (/^fe[89ab]/.test(addr)) return true; // link-local fe80::/10
    if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // ULA
    // NAT64 well-known prefix (RFC 6052) — embedded IPv4 is attacker-controlled
    // and unauthenticated, so block outright rather than trust it.
    if (addr.startsWith('64:ff9b:')) return true;
    if (addr.startsWith('::ffff:')) {
      const embedded = addr.slice(7);
      if (embedded.includes('.')) return isPrivateIp(embedded); // dotted v4-mapped
      // WHATWG URL serializes bracketed dotted v4-mapped literals to hex form,
      // e.g. new URL('http://[::ffff:127.0.0.1]/').hostname === '[::ffff:7f00:1]'.
      // Parse the trailing one-or-two 16-bit hex groups as the 32-bit IPv4 value.
      const groups = embedded.split(':');
      if (groups.length === 1 || groups.length === 2) {
        const hi = groups.length === 2 ? parseInt(groups[0], 16) : 0;
        const lo = parseInt(groups[groups.length - 1], 16);
        if (Number.isInteger(hi) && Number.isInteger(lo) && hi >= 0 && hi <= 0xffff && lo >= 0 && lo <= 0xffff) {
          const combined = (hi << 16) | lo;
          const a = (combined >>> 24) & 0xff;
          const b = (combined >>> 16) & 0xff;
          const c = (combined >>> 8) & 0xff;
          const d = combined & 0xff;
          return isPrivateIp(`${a}.${b}.${c}.${d}`);
        }
      }
      return true; // unrecognized v4-mapped form — fail closed
    }
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
  if (a >= 224) return true; // multicast 224/4, reserved 240/4, broadcast 255.255.255.255
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
