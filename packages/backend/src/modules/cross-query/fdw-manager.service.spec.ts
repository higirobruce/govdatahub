import { BadRequestException } from '@nestjs/common';
import { assertSafeSqlIdentifier } from './fdw-manager.service';

describe('assertSafeSqlIdentifier (SEC-05)', () => {
  it('returns well-formed identifiers unchanged', () => {
    expect(assertSafeSqlIdentifier('ft_customers_1234567890')).toBe(
      'ft_customers_1234567890',
    );
    expect(assertSafeSqlIdentifier('fdw_org_abc123')).toBe('fdw_org_abc123');
  });

  it.each([
    'foo"; DROP TABLE users;--',
    'foo bar',
    'foo;bar',
    'foo.bar',
    '1starts_with_digit',
    '',
    'a'.repeat(129),
  ])('rejects malicious or malformed identifier %j', (identifier) => {
    expect(() => assertSafeSqlIdentifier(identifier as string)).toThrow(
      BadRequestException,
    );
  });
});
