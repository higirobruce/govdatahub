import { BadRequestException } from '@nestjs/common';
import { assertSafeUrl, isPrivateIp } from './url-guard';

const publicResolver = async () => [{ address: '93.184.216.34' }];
const loopbackResolver = async () => [{ address: '127.0.0.1' }];

describe('isPrivateIp', () => {
  it.each([
    '127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '0.0.0.0', '100.64.0.1', '100.127.255.255', '::1', '::',
    'fe80::1', 'fe9a::1', 'fc00::1', 'fd00::1', '::ffff:127.0.0.1',
    // hex-form IPv4-mapped IPv6 (what WHATWG URL actually serializes bracketed
    // dotted literals to — see node -e verification in the fix report)
    '::ffff:7f00:1', '::ffff:a9fe:a9fe',
    // NAT64 well-known prefix — embedded IPv4 is untrusted, block outright
    '64:ff9b::7f00:1',
    // multicast/reserved/broadcast
    '224.0.0.1', '240.0.0.1', '255.255.255.255',
  ])('flags %s as private', (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each([
    '93.184.216.34', '8.8.8.8', '2606:4700::6810:84e5', '::ffff:8.8.8.8',
    '::ffff:808:808', // hex-form of 8.8.8.8 — must still be treated as public
  ])(
    'allows public %s',
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    },
  );

  it('treats malformed addresses as private (fail closed)', () => {
    expect(isPrivateIp('999.1.1.1')).toBe(true);
  });
});

describe('assertSafeUrl', () => {
  it('rejects non-http(s) protocols', async () => {
    await expect(assertSafeUrl('ftp://example.com/x.csv')).rejects.toThrow(
      BadRequestException,
    );
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects blocked hostnames without resolving', async () => {
    await expect(assertSafeUrl('http://localhost/x.csv')).rejects.toThrow();
    await expect(
      assertSafeUrl('http://metadata.google.internal/computeMetadata'),
    ).rejects.toThrow();
    await expect(assertSafeUrl('http://foo.internal/x')).rejects.toThrow();
    await expect(assertSafeUrl('http://printer.local/x')).rejects.toThrow();
  });

  it('rejects literal private IPs', async () => {
    await expect(assertSafeUrl('http://169.254.169.254/latest')).rejects.toThrow();
    await expect(assertSafeUrl('http://[::1]:8080/x')).rejects.toThrow();
  });

  it('rejects hex-form IPv4-mapped IPv6 literals (bracket-stripped by WHATWG URL)', async () => {
    // new URL('http://[::ffff:169.254.169.254]/x').hostname === '[::ffff:a9fe:a9fe]'
    await expect(
      assertSafeUrl('http://[::ffff:169.254.169.254]/x'),
    ).rejects.toThrow(BadRequestException);
    // new URL('http://[::ffff:127.0.0.1]:8080/x').hostname === '[::ffff:7f00:1]'
    await expect(
      assertSafeUrl('http://[::ffff:127.0.0.1]:8080/x'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects hostnames that resolve to private addresses', async () => {
    await expect(
      assertSafeUrl('https://evil.example.com/x.csv', loopbackResolver),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a public https URL', async () => {
    await expect(
      assertSafeUrl('https://data.example.org/report.csv', publicResolver),
    ).resolves.toBeUndefined();
  });

  it('rejects unresolvable hosts', async () => {
    const failResolver = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(
      assertSafeUrl('https://nope.example.org/x.csv', failResolver),
    ).rejects.toThrow(BadRequestException);
  });
});
