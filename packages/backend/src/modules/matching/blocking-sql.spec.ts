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

describe('comparatorExprs scale (every score must be numeric in [0,1])', () => {
  it('casts every boolean-derived comparator to numeric, for every role', () => {
    const roles: FieldRole[] = ['person_name', 'org_name', 'text', 'address', 'phone', 'identifier'];
    for (const role of roles) {
      const exprs = comparatorExprs(role, 'l."x"', 'r."x"');
      for (const e of exprs) {
        if (e.name === 'trgm' || e.name === 'lev') continue; // bounded numerically, not boolean-shaped
        expect(e.sql).toContain('::int');
      }
    }
  });

  it('bounds the date comparator to a one-year decay instead of a raw day count', () => {
    const [daydiff] = comparatorExprs('date', 'l."dob"', 'r."dob"');
    expect(daydiff.sql).toContain('greatest(0,');
    expect(daydiff.sql).toContain('/ 365');
  });
});

describe('weightedScoreExpr type-safety', () => {
  it('never multiplies a weight by a bare parenthesised equality (the surname/dob/phone field map)', () => {
    const sql = weightedScoreExpr(fieldMap);
    // This exact shape — `<weight> * (l."col" = r."col")` with NOTHING cast
    // onto the closing paren — is a PostgreSQL type error: operator does not
    // exist: numeric * boolean. The negative lookahead is what makes this a
    // real constraint: a naive substring check would also flag the correct,
    // `::int::numeric`-cast form, since both contain `(l."col" =`.
    expect(sql).not.toMatch(/\d+(\.\d+)?\s*\*\s*\(l\."[a-z_]+"\s*=\s*r\."[a-z_]+"\)(?!::)/);
  });
});
