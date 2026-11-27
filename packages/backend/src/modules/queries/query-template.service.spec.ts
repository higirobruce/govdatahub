import { BadRequestException } from '@nestjs/common';
import {
  ParamDef,
  QueryTemplateService,
} from './query-template.service';

describe('QueryTemplateService', () => {
  let svc: QueryTemplateService;

  beforeEach(() => {
    svc = new QueryTemplateService();
  });

  describe('value mode', () => {
    it('binds via $1, never interpolates user input', () => {
      const defs: ParamDef[] = [
        { name: 'x', type: 'string', required: true },
      ];
      const r = svc.render(
        'SELECT * FROM users WHERE name = {{x}}',
        defs,
        { x: "1; DROP TABLE users; --" },
        new Set(),
      );
      expect(r.sql).toBe('SELECT * FROM users WHERE name = $1');
      expect(r.bindings).toEqual(["1; DROP TABLE users; --"]);
    });

    it('numbers bindings sequentially across multiple tokens', () => {
      const defs: ParamDef[] = [
        { name: 'a', type: 'string', required: true },
        { name: 'b', type: 'number', required: true },
      ];
      const r = svc.render(
        'SELECT {{a}} FROM t WHERE id = {{b}} AND name = {{a}}',
        defs,
        { a: 'col', b: 42 },
        new Set(),
      );
      expect(r.sql).toBe('SELECT $1 FROM t WHERE id = $2 AND name = $3');
      expect(r.bindings).toEqual(['col', 42, 'col']);
    });

    it('accepts boolean and number types', () => {
      const defs: ParamDef[] = [
        { name: 'active', type: 'boolean', required: true },
        { name: 'limit', type: 'number', required: true },
      ];
      const r = svc.render(
        'WHERE active = {{active}} LIMIT {{limit}}',
        defs,
        { active: true, limit: 10 },
        new Set(),
      );
      expect(r.bindings).toEqual([true, 10]);
    });

    it('rejects type mismatches', () => {
      const defs: ParamDef[] = [
        { name: 'n', type: 'number', required: true },
      ];
      expect(() =>
        svc.render('SELECT {{n}}', defs, { n: 'not-a-number' }, new Set()),
      ).toThrow(BadRequestException);
    });

    it('rejects non-finite numbers', () => {
      const defs: ParamDef[] = [
        { name: 'n', type: 'number', required: true },
      ];
      expect(() =>
        svc.render('SELECT {{n}}', defs, { n: Number.NaN }, new Set()),
      ).toThrow(BadRequestException);
    });

    it('multi_select binds as an array', () => {
      const defs: ParamDef[] = [
        { name: 'tags', type: 'multi_select', required: true },
      ];
      const r = svc.render(
        'WHERE tag = ANY({{tags}})',
        defs,
        { tags: ['a', 'b', 'c'] },
        new Set(),
      );
      expect(r.sql).toBe('WHERE tag = ANY($1)');
      expect(r.bindings).toEqual([['a', 'b', 'c']]);
    });
  });

  describe('identifier mode', () => {
    it('rejects non-whitelisted identifiers', () => {
      const defs: ParamDef[] = [
        { name: 't', type: 'string', required: true },
      ];
      expect(() =>
        svc.render(
          'SELECT * FROM {{!t}}',
          defs,
          { t: 'users; DROP --' },
          new Set(['orders']),
        ),
      ).toThrow(/not in allow-list/);
    });

    it('rejects identifiers with non-word characters even if whitelisted by coincidence', () => {
      const defs: ParamDef[] = [
        { name: 't', type: 'string', required: true },
      ];
      // Set contains the malicious string, but IDENT_RX rejects it.
      expect(() =>
        svc.render(
          'SELECT * FROM {{!t}}',
          defs,
          { t: 'users; DROP --' },
          new Set(['users; DROP --']),
        ),
      ).toThrow(/not in allow-list/);
    });

    it('quotes a whitelisted identifier and does not bind it', () => {
      const defs: ParamDef[] = [
        { name: 't', type: 'string', required: true },
      ];
      const r = svc.render(
        'SELECT * FROM {{!t}}',
        defs,
        { t: 'orders' },
        new Set(['orders']),
      );
      expect(r.sql).toBe('SELECT * FROM "orders"');
      expect(r.bindings).toEqual([]);
    });

    it('rejects identifier use of non-string-typed defs', () => {
      // Fail-fast: numeric def used in identifier mode throws before resolveValue.
      expect(() =>
        svc.render(
          'SELECT * FROM {{!t}}',
          [{ name: 't', type: 'number', required: true }],
          { t: 42 },
          new Set(['42']),
        ),
      ).toThrow(/cannot be used as an identifier/);
    });

    it('accepts identifier use of select-typed defs', () => {
      const r = svc.render(
        'SELECT * FROM {{!t}}',
        [{ name: 't', type: 'select', required: true }],
        { t: 'orders' },
        new Set(['orders']),
      );
      expect(r.sql).toBe('SELECT * FROM "orders"');
    });
  });

  describe('unknown parameters', () => {
    it('throws on a referenced parameter with no def', () => {
      expect(() =>
        svc.render('SELECT {{ghost}}', [], {}, new Set()),
      ).toThrow(/Unknown parameter/);
    });
  });

  describe('date_range', () => {
    it('expands .start and .end to two bindings', () => {
      const defs: ParamDef[] = [
        { name: 'r', type: 'date_range', required: true },
      ];
      const r = svc.render(
        'WHERE d BETWEEN {{r.start}} AND {{r.end}}',
        defs,
        { r: { start: '2026-01-01', end: '2026-03-31' } },
        new Set(),
      );
      expect(r.sql).toBe('WHERE d BETWEEN $1 AND $2');
      expect(r.bindings).toEqual(['2026-01-01', '2026-03-31']);
    });

    it('rejects direct {{range}} reference', () => {
      const defs: ParamDef[] = [
        { name: 'r', type: 'date_range', required: true },
      ];
      expect(() =>
        svc.render(
          'WHERE d = {{r}}',
          defs,
          { r: { start: '2026-01-01', end: '2026-03-31' } },
          new Set(),
        ),
      ).toThrow(/date_range/);
    });

    it('rejects missing nested field', () => {
      const defs: ParamDef[] = [
        { name: 'r', type: 'date_range', required: true },
      ];
      expect(() =>
        svc.render(
          'WHERE d BETWEEN {{r.start}} AND {{r.end}}',
          defs,
          { r: { start: '2026-01-01' } },
          new Set(),
        ),
      ).toThrow(/Missing field "r.end"/);
    });
  });

  describe('required vs optional', () => {
    it('throws when a required parameter is missing', () => {
      const defs: ParamDef[] = [
        { name: 'x', type: 'string', required: true },
      ];
      expect(() =>
        svc.render('SELECT {{x}}', defs, {}, new Set()),
      ).toThrow(/Missing required parameter "x"/);
    });

    it('applies default when value missing and not required', () => {
      const defs: ParamDef[] = [
        { name: 'x', type: 'string', required: false, default: 'fallback' },
      ];
      const r = svc.render('SELECT {{x}}', defs, {}, new Set());
      expect(r.bindings).toEqual(['fallback']);
    });

    it('throws when optional has no value AND no default', () => {
      // Footgun-prevention: silent NULL binding is a foot-gun, force explicit opt-in.
      const defs: ParamDef[] = [
        { name: 'x', type: 'string', required: false },
      ];
      expect(() =>
        svc.render('SELECT {{x}}', defs, {}, new Set()),
      ).toThrow(/has no value and no default/);
    });

    it('binds null when default is explicitly null', () => {
      const defs: ParamDef[] = [
        { name: 'x', type: 'string', required: false, default: null },
      ];
      const r = svc.render('SELECT {{x}}', defs, {}, new Set());
      expect(r.bindings).toEqual([null]);
    });

    it('rejects explicit null default on date_range', () => {
      const defs: ParamDef[] = [
        { name: 'r', type: 'date_range', required: false, default: null },
      ];
      expect(() =>
        svc.render('WHERE d = {{r}}', defs, {}, new Set()),
      ).toThrow(/date_range/);
    });
  });

  describe('validateValue (save-time default check)', () => {
    it('accepts a valid string default', () => {
      expect(() =>
        svc.validateValue(
          { name: 'x', type: 'string', required: false },
          'hello',
        ),
      ).not.toThrow();
    });

    it('rejects wrong-typed default for number', () => {
      expect(() =>
        svc.validateValue(
          { name: 'n', type: 'number', required: false },
          '5',
        ),
      ).toThrow(/expected finite number/);
    });

    it('accepts explicit null default for any non-date_range type', () => {
      expect(() =>
        svc.validateValue(
          { name: 'x', type: 'string', required: false },
          null,
        ),
      ).not.toThrow();
    });

    it('requires date_range default to have start and end fields', () => {
      expect(() =>
        svc.validateValue(
          { name: 'r', type: 'date_range', required: false },
          { start: '2026-01-01' },
        ),
      ).toThrow(/start and end fields/);
    });

    it('accepts well-formed date_range default', () => {
      expect(() =>
        svc.validateValue(
          { name: 'r', type: 'date_range', required: false },
          { start: '2026-01-01', end: '2026-03-31' },
        ),
      ).not.toThrow();
    });

    it('rejects non-array default for multi_select', () => {
      expect(() =>
        svc.validateValue(
          { name: 't', type: 'multi_select', required: false },
          'a,b,c',
        ),
      ).toThrow(/string array/);
    });
  });

  describe('size caps', () => {
    it('rejects SQL templates over 64KB', () => {
      const huge = 'SELECT 1 -- ' + 'x'.repeat(64 * 1024);
      expect(() => svc.render(huge, [], {}, new Set())).toThrow(
        /SQL template exceeds/,
      );
    });

    it('rejects more than 256 value bindings', () => {
      const tokens = Array.from({ length: 300 }, () => '{{x}}').join(',');
      const defs: ParamDef[] = [
        { name: 'x', type: 'string', required: true },
      ];
      expect(() =>
        svc.render(`SELECT ${tokens}`, defs, { x: 'v' }, new Set()),
      ).toThrow(/256 parameter bindings/);
    });
  });

  describe('token tolerance', () => {
    it('tolerates whitespace inside braces', () => {
      const defs: ParamDef[] = [
        { name: 'x', type: 'string', required: true },
      ];
      const r = svc.render('SELECT {{   x   }}', defs, { x: 'v' }, new Set());
      expect(r.sql).toBe('SELECT $1');
    });

    it('ignores tokens that do not match the regex (no replacement)', () => {
      // "{{ 1abc }}" starts with a digit — TOKEN_RX rejects it entirely.
      const r = svc.render('SELECT {{ 1abc }}', [], {}, new Set());
      expect(r.sql).toBe('SELECT {{ 1abc }}');
      expect(r.bindings).toEqual([]);
    });
  });
});
