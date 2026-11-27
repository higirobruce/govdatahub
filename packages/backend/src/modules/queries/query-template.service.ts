import { Injectable, BadRequestException } from '@nestjs/common';

export type ParamType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'date_range'
  | 'select'
  | 'multi_select';

export interface ParamDef {
  name: string;
  type: ParamType;
  required: boolean;
  default?: unknown;
}

export interface RenderResult {
  sql: string;
  bindings: unknown[];
}

// IDENT_RX intentionally rejects dots — schema-qualified identifiers
// (e.g. "public.users") are not supported. Callers should split into two
// tokens and whitelist each segment separately.
const TOKEN_RX = /\{\{\s*(!?)\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;
const IDENT_RX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const MAX_SQL_BYTES = 64 * 1024;
const MAX_BINDINGS = 256;

@Injectable()
export class QueryTemplateService {
  render(
    sql: string,
    defs: ParamDef[],
    values: Record<string, unknown>,
    allowedIdentifiers: Set<string> = new Set(),
  ): RenderResult {
    if (sql.length > MAX_SQL_BYTES) {
      throw new BadRequestException(
        `SQL template exceeds ${MAX_SQL_BYTES} bytes`,
      );
    }

    const defsByName = new Map(defs.map((d) => [d.name, d]));
    const bindings: unknown[] = [];

    const rendered = sql.replace(TOKEN_RX, (_match, identMark, accessor) => {
      const isIdent = identMark === '!';
      const rootName = accessor.split('.')[0];
      const def = defsByName.get(rootName);

      if (!def) {
        throw new BadRequestException(`Unknown parameter "${accessor}"`);
      }

      if (isIdent && def.type !== 'string' && def.type !== 'select') {
        throw new BadRequestException(
          `Parameter "${def.name}" cannot be used as an identifier; type must be 'string' or 'select'`,
        );
      }

      const raw = this.resolveValue(def, values, accessor);

      if (isIdent) {
        if (
          typeof raw !== 'string' ||
          !IDENT_RX.test(raw) ||
          !allowedIdentifiers.has(raw)
        ) {
          throw new BadRequestException(
            `Identifier "${String(raw)}" not in allow-list`,
          );
        }
        return `"${raw}"`;
      }

      if (bindings.length >= MAX_BINDINGS) {
        throw new BadRequestException(
          `SQL template exceeds ${MAX_BINDINGS} parameter bindings`,
        );
      }
      bindings.push(raw);
      return `$${bindings.length}`;
    });

    return { sql: rendered, bindings };
  }

  private resolveValue(
    def: ParamDef,
    values: Record<string, unknown>,
    accessor: string,
  ): unknown {
    const present = Object.prototype.hasOwnProperty.call(values, def.name);
    let source: unknown;

    if (present) {
      source = values[def.name];
    } else if (def.required) {
      throw new BadRequestException(
        `Missing required parameter "${def.name}"`,
      );
    } else if (def.default === undefined) {
      throw new BadRequestException(
        `Optional parameter "${def.name}" has no value and no default; set default: null to bind SQL NULL explicitly`,
      );
    } else {
      source = def.default;
    }

    if (source === null) {
      if (accessor !== def.name) {
        throw new BadRequestException(
          `Cannot access "${accessor}" on null parameter "${def.name}"`,
        );
      }
      if (def.type === 'date_range') {
        throw new BadRequestException(
          `Parameter "${def.name}" is a date_range; use ${def.name}.start / ${def.name}.end`,
        );
      }
      return null;
    }

    const parts = accessor.split('.');
    let raw: unknown = source;
    if (parts.length > 1) {
      for (let i = 1; i < parts.length; i++) {
        if (typeof raw !== 'object' || raw === null) {
          throw new BadRequestException(
            `Cannot access "${parts.slice(0, i + 1).join('.')}" on parameter "${def.name}"`,
          );
        }
        raw = (raw as Record<string, unknown>)[parts[i]];
      }
      if (raw === undefined || raw === null) {
        throw new BadRequestException(`Missing field "${accessor}"`);
      }
    }

    this.validateType(def, accessor, raw);
    return raw;
  }

  /**
   * Validate that a value is shape-compatible with a parameter definition.
   * Intended for save-time default validation; runtime values flow through
   * `render` which uses the private `validateType` via dotted accessors.
   * Explicit `null` is always accepted (caller's signal to bind SQL NULL).
   */
  validateValue(def: ParamDef, value: unknown): void {
    if (value === null) return;
    const fail = (expected: string) => {
      throw new BadRequestException(
        `Parameter "${def.name}" default expected ${expected}, got ${
          Array.isArray(value) ? 'array' : typeof value
        }`,
      );
    };
    switch (def.type) {
      case 'string':
      case 'select':
        if (typeof value !== 'string') fail('string');
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          fail('finite number');
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') fail('boolean');
        break;
      case 'date':
        if (typeof value !== 'string' && !(value instanceof Date)) {
          fail('date string or Date');
        }
        break;
      case 'date_range':
        if (
          typeof value !== 'object' ||
          value === null ||
          !('start' in (value as object)) ||
          !('end' in (value as object))
        ) {
          fail('object with start and end fields');
        }
        break;
      case 'multi_select':
        if (
          !Array.isArray(value) ||
          value.some((v) => typeof v !== 'string')
        ) {
          fail('string array');
        }
        break;
    }
  }

  private validateType(def: ParamDef, accessor: string, value: unknown) {
    const fail = (expected: string) => {
      throw new BadRequestException(
        `Parameter "${accessor}" expected ${expected}, got ${typeof value}`,
      );
    };

    switch (def.type) {
      case 'string':
      case 'select':
        if (typeof value !== 'string') fail('string');
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          fail('finite number');
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') fail('boolean');
        break;
      case 'date':
        if (typeof value !== 'string' && !(value instanceof Date)) {
          fail('date string or Date');
        }
        break;
      case 'date_range':
        if (accessor === def.name) {
          throw new BadRequestException(
            `Parameter "${def.name}" is a date_range; use ${def.name}.start / ${def.name}.end`,
          );
        }
        if (typeof value !== 'string' && !(value instanceof Date)) {
          fail('date string or Date');
        }
        break;
      case 'multi_select':
        if (
          !Array.isArray(value) ||
          value.some((v) => typeof v !== 'string')
        ) {
          fail('string array');
        }
        break;
    }
  }
}
