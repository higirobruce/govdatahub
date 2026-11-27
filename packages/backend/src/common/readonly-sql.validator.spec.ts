import { BadRequestException } from '@nestjs/common';
import { validateReadOnlySql, stripSqlComments } from './readonly-sql.validator';

describe('validateReadOnlySql (SEC-08)', () => {
  it.each([
    'SELECT * FROM customers LIMIT 10',
    'select id, name from t where created_at > now()', // "create" inside created_at must NOT match
    "SELECT description FROM datasets", // old validator blocked /script/i inside "description"
    'WITH x AS (SELECT 1) SELECT * FROM x',
    'SELECT * FROM t;', // single trailing semicolon ok
  ])('accepts read-only query: %s', (sql) => {
    expect(() => validateReadOnlySql(sql)).not.toThrow();
  });

  it.each([
    'DROP TABLE users',
    'DELETE FROM t',
    'INSERT INTO t VALUES (1)',
    'UPDATE t SET a=1',
    'SELECT 1; DROP TABLE users',
    'SELECT pg_read_file(\'/etc/passwd\')',
    'SELECT * FROM dblink(\'host=internal\', \'select 1\') AS t(a int)',
    'COPY t TO PROGRAM \'rm -rf /\'',
    'SELECT pg_sleep(60)',
    "SELECT pg_read_binary_file('x')",
    "SELECT pg_stat_file('x')",
    'SELECT lo_get(1)',
    "SELECT 1 INTO OUTFILE '/tmp/x'",
    'WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x',
    '/* hidden */ DROP TABLE t',
    '',
  ])('rejects: %j', (sql) => {
    expect(() => validateReadOnlySql(sql as string)).toThrow(BadRequestException);
  });

  it('strips comments before deciding the statement head', () => {
    expect(() =>
      validateReadOnlySql('-- note\nSELECT 1'),
    ).not.toThrow();
    expect(stripSqlComments('SELECT 1 -- trailing')).not.toContain('--');
  });
});
