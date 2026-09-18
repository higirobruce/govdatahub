import { BadRequestException } from '@nestjs/common';
import { assertIdent, blockingKeyExpr, comparatorExprs, weightedScoreExpr } from './blocking-sql';
import type { BlockingPass, FieldMapping, FieldRole } from '../../database/entities';

const fieldMap: FieldMapping[] = [
  { left: 'surname', right: 'surname', role: 'person_name', weight: 0.5, comparator: 'default' },
  { left: 'dob',     right: 'dob',     role: 'date',        weight: 0.3, comparator: 'default' },
  { left: 'phone',   right: 'phone',   role: 'phone',       weight: 0.2, comparator: 'default' },
];

describe('assertIdent', () => {
  it('accepts a plain identifier', () => expect(assertIdent('surname', 'field')).toBe('surname'));
  it('rejects anything with SQL punctuation', () => {
    expect(() => assertIdent('a"; DROP TABLE x; --', 'field')).toThrow(BadRequestException);
    expect(() => assertIdent('a.b', 'field')).toThrow(BadRequestException);
  });
});

describe('blockingKeyExpr', () => {
  it('builds a phonetic plus birth-year key', () => {
    const pass: BlockingPass = { name: 'name_dob', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(dob)' };
    expect(blockingKeyExpr(pass, fieldMap))
      .toBe(`dmetaphone("surname") || '|' || substring("dob" from 1 for 4)`);
  });

  it('builds a last-nine-digits key', () => {
    const pass: BlockingPass = { name: 'phone', kind: 'equi', keyExpr: 'last9(phone)' };
    expect(blockingKeyExpr(pass, fieldMap)).toBe(`right(regexp_replace("phone", '\\D', '', 'g'), 9)`);
  });

  it('refuses a field that is not in the field map', () => {
    const pass: BlockingPass = { name: 'bad', kind: 'equi', keyExpr: 'dmetaphone(secret_salary)' };
    expect(() => blockingKeyExpr(pass, fieldMap)).toThrow(BadRequestException);
  });

  it('refuses an unknown function', () => {
    const pass: BlockingPass = { name: 'bad', kind: 'equi', keyExpr: 'pg_read_file(surname)' };
    expect(() => blockingKeyExpr(pass, fieldMap)).toThrow(BadRequestException);
  });
});

describe('comparatorExprs', () => {
  it('gives names a trigram score, a bounded edit distance and a token-set equality', () => {
    const exprs = comparatorExprs('person_name', 'l."surname"', 'r."surname"');
    expect(exprs.map((e) => e.name)).toEqual(['trgm', 'lev', 'tokenset']);
    expect(exprs[0].sql).toContain('similarity(');
    expect(exprs[1].sql).toContain('levenshtein_less_equal(');
  });

  it('gives dates a day difference', () => {
    const exprs = comparatorExprs('date', 'l."dob"', 'r."dob"');
    expect(exprs.map((e) => e.name)).toEqual(['daydiff']);
  });

  it('gives phones exact-or-one-edit', () => {
    const exprs = comparatorExprs('phone', 'l."phone"', 'r."phone"');
    expect(exprs.map((e) => e.name)).toEqual(['exact', 'lev1']);
  });
});

describe('weightedScoreExpr', () => {
  it('normalizes by the total weight so the score lands in 0..1', () => {
    const sql = weightedScoreExpr(fieldMap);
    expect(sql).toContain('/ 1');       // 0.5 + 0.3 + 0.2
    expect(sql).toContain('0.5 *');
  });

  it('refuses a field map whose weights sum to zero', () => {
    expect(() => weightedScoreExpr([{ ...fieldMap[0], weight: 0 }])).toThrow(BadRequestException);
  });
});

// R3: every comparator must be guarded so a missing value on either side
// scores 0, rather than erroring (blank-string cast to date), returning NULL
// (poisoning the weighted sum), or claiming a perfect match on two shared
// blanks. No comparator is exempt from this — not even trgm/lev, which were
// already individually NULL-safe — because the whole point of the ruling is
// that the doc comment's "every comparator" claim has no unstated exception
// a future reader has to rediscover.
describe('comparatorExprs presence guard (no exemptions)', () => {
  const ALL_ROLES: FieldRole[] = ['person_name', 'org_name', 'text', 'address', 'date', 'phone', 'identifier'];

  it('wraps every comparator, for every role, in a presence guard against null/blank input on either side', () => {
    for (const role of ALL_ROLES) {
      const exprs = comparatorExprs(role, 'l."x"', 'r."x"');
      for (const e of exprs) {
        expect(e.sql).toContain(
          `case when l."x" is null or r."x" is null or l."x" = '' or r."x" = '' then 0 else `,
        );
        expect(e.sql.trimEnd()).toMatch(/ end$/);
      }
    }
  });

  it('fully casts every boolean-derived comparator (tokenset, exact, lev1) to numeric, not just a piece of it', () => {
    // A cast on the column operands (e.g. `l."x"::int = r."x"::int`) would
    // satisfy a bare `toContain('::int')` check without fixing the
    // numeric*boolean type error. The whole boolean clause must be the thing
    // cast, which — given the guard's `else <core> end` shape — means the
    // cast is the last thing before the closing `end`.
    const booleanComparatorNames = new Set(['tokenset', 'exact', 'lev1']);
    for (const role of ALL_ROLES) {
      for (const e of comparatorExprs(role, 'l."x"', 'r."x"')) {
        if (!booleanComparatorNames.has(e.name)) continue;
        expect(e.sql).toContain('::int::numeric end');
      }
    }
  });

  it('exact-matches the guarded phone "exact" comparator end to end', () => {
    const [exact] = comparatorExprs('phone', 'l."phone"', 'r."phone"');
    expect(exact.sql).toBe(
      `case when l."phone" is null or r."phone" is null or l."phone" = '' or r."phone" = '' then 0 else (l."phone" = r."phone")::int::numeric end`,
    );
  });

  it('bounds the date comparator to a guarded one-year decay, using nullif before the date cast', () => {
    const [daydiff] = comparatorExprs('date', 'l."dob"', 'r."dob"');
    expect(daydiff.sql).toBe(
      `case when l."dob" is null or r."dob" is null or l."dob" = '' or r."dob" = '' then 0 else greatest(0, 1 - abs(nullif(l."dob", '')::date - nullif(r."dob", '')::date)::numeric / 365) end`,
    );
  });

  it('truncates levenshtein operands to 255 bytes for the length-unbounded roles (text/address/phone)', () => {
    for (const role of ['text', 'address', 'phone'] as FieldRole[]) {
      const levExpr = comparatorExprs(role, 'l."x"', 'r."x"').find((e) => e.name === 'lev' || e.name === 'lev1');
      expect(levExpr).toBeDefined();
      expect(levExpr!.sql).toContain('left(l."x", 255)');
      expect(levExpr!.sql).toContain('left(r."x", 255)');
    }
  });
});

describe('weightedScoreExpr type-safety', () => {
  it('never multiplies a weight by a bare parenthesised equality (the surname/dob/phone field map)', () => {
    const sql = weightedScoreExpr(fieldMap);
    // This exact shape — `<weight> * (l."col" = r."col")` with NOTHING cast
    // onto the closing paren — is a PostgreSQL type error: operator does not
    // exist: numeric * boolean. The negative lookahead is what makes this a
    // real constraint: a naive substring check would also flag the correct,
    // `::int::numeric`-cast form, since both contain `(l."col" =`. The
    // identifier class matches IDENT (not just lowercase-with-underscore) so
    // a column like "Phone1" would still be caught.
    expect(sql).not.toMatch(/\d+(\.\d+)?\s*\*\s*\(l\."[A-Za-z0-9_]+"\s*=\s*r\."[A-Za-z0-9_]+"\)(?!::)/);
  });
});

describe('weightedScoreExpr weight validation', () => {
  it('rejects a non-finite weight (NaN or Infinity)', () => {
    expect(() => weightedScoreExpr([{ ...fieldMap[0], weight: NaN }])).toThrow(BadRequestException);
    expect(() => weightedScoreExpr([{ ...fieldMap[0], weight: Infinity }])).toThrow(BadRequestException);
  });

  it('rejects a negative weight', () => {
    expect(() => weightedScoreExpr([{ ...fieldMap[0], weight: -0.1 }])).toThrow(BadRequestException);
  });

  it('rejects a non-numeric weight arriving from JSONB storage as a string', () => {
    const polluted = { ...fieldMap[0], weight: '1' as unknown as number };
    expect(() => weightedScoreExpr([polluted])).toThrow(BadRequestException);
  });
});
