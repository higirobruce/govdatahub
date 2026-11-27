import { sha256Hex } from './hash.util';

describe('sha256Hex', () => {
  it('produces the known SHA-256 of "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is deterministic and 64 hex chars', () => {
    expect(sha256Hex('gd_x')).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('gd_x')).toBe(sha256Hex('gd_x'));
  });
});
