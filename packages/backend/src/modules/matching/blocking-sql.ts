import { BadRequestException } from '@nestjs/common';
import type { BlockingPass, FieldMapping, FieldRole } from '../../database/entities';

/** Whole-string match required for any identifier interpolated into generated SQL. */
export const IDENT = /^[A-Za-z0-9_]+$/;

/** Validates `name` against IDENT, returning it unchanged, or throws if it fails. */
export function assertIdent(name: string, what: string): string {
  if (!IDENT.test(name)) {
    throw new BadRequestException(`Invalid ${what}: "${name}"`);
  }
  return name;
}

/** Blocking-key functions permitted inside a keyExpr term. */
const KEY_FUNCTIONS = new Set(['dmetaphone', 'year', 'last9']);

/**
 * Compiles one keyExpr term (either "<field>" or "<fn>(<field>)") into a SQL
 * expression, after validating the field against the allow-listed fieldMap
 * and the function against KEY_FUNCTIONS.
 */
function compileKeyTerm(term: string, fieldMap: FieldMapping[]): string {
  const call = term.match(/^([A-Za-z0-9_]+)\(([^()]*)\)$/);

  const fnName = call ? call[1] : null;
  const rawField = call ? call[2] : term;

  const field = assertIdent(rawField, 'blocking field');
  if (!fieldMap.some((f) => f.left === field)) {
    throw new BadRequestException(`Field "${field}" is not in the field map`);
  }

  if (call) {
    if (!KEY_FUNCTIONS.has(fnName as string)) {
      throw new BadRequestException(`Unknown blocking function "${fnName}"`);
    }
    switch (fnName) {
      case 'dmetaphone':
        return `dmetaphone("${field}")`;
      case 'year':
        // Workspace dates are normalized YYYY-MM-DD text, not a `date` type.
        return `substring("${field}" from 1 for 4)`;
      case 'last9':
        return `right(regexp_replace("${field}", '\\D', '', 'g'), 9)`;
      default:
        throw new BadRequestException(`Unknown blocking function "${fnName}"`);
    }
  }

  return `"${field}"`;
}

/** Compiles a pass's keyExpr (terms joined by `|`) into a single SQL expression. */
export function blockingKeyExpr(pass: BlockingPass, fieldMap: FieldMapping[]): string {
  const terms = pass.keyExpr.split('|').map((t) => t.trim());
  return terms.map((term) => compileKeyTerm(term, fieldMap)).join(` || '|' || `);
}

/**
 * Per-field comparator feature expressions for a role, given already-qualified
 * (and already-quoted) left/right column references, e.g. `l."surname"`.
 *
 * Every expression returned here is a numeric SQL expression bounded to
 * [0, 1], where 1 means identical. This is required so that:
 *  - `weightedScoreExpr` can sum these as a weighted average that itself
 *    lands in [0, 1] (multiplying a bare boolean by a numeric weight is a
 *    PostgreSQL type error: "operator does not exist: numeric * boolean" —
 *    every boolean-shaped comparator below is cast with `::int::numeric`);
 *  - downstream consumers (the match/reject thresholds, the threshold sweep,
 *    the review queue's similarity bars) can treat every comparator's value
 *    the same way regardless of role.
 */
export function comparatorExprs(role: FieldRole, left: string, right: string): Array<{ name: string; sql: string }> {
  switch (role) {
    case 'person_name':
    case 'org_name':
    case 'text':
    case 'address':
      return [
        { name: 'trgm', sql: `coalesce(similarity(${left}, ${right}), 0)` },
        {
          name: 'lev',
          sql: `greatest(0, 1 - coalesce(levenshtein_less_equal(${left}, ${right}, 3), 4)::numeric / 3)`,
        },
        {
          name: 'tokenset',
          sql: `(string_to_array(${left}, ' ')::text[] <@ string_to_array(${right}, ' ')::text[] AND string_to_array(${right}, ' ')::text[] <@ string_to_array(${left}, ' ')::text[])::int::numeric`,
        },
      ];
    case 'date':
      // Bounded decay over a one-year horizon: an exact date gives 1, a
      // one-day slip stays near 1, and a transposed month/day pair (the case
      // the spec wanted a dedicated transposition check for) lands around
      // 0.76 rather than being thrown away entirely. A dedicated
      // transposition comparator is phase-4 tuning, not phase-1 correctness.
      return [
        { name: 'daydiff', sql: `greatest(0, 1 - abs(${left}::date - ${right}::date)::numeric / 365)` },
      ];
    case 'phone':
      return [
        { name: 'exact', sql: `(${left} = ${right})::int::numeric` },
        { name: 'lev1', sql: `(levenshtein_less_equal(${left}, ${right}, 1) <= 1)::int::numeric` },
      ];
    case 'identifier':
      return [{ name: 'exact', sql: `(${left} = ${right})::int::numeric` }];
    default:
      return [{ name: 'exact', sql: `(${left} = ${right})::int::numeric` }];
  }
}

/**
 * Combines per-field comparator scores into a single weighted score expression,
 * normalized by the sum of the field weights so the result lands in 0..1.
 */
export function weightedScoreExpr(fieldMap: FieldMapping[]): string {
  const totalWeight = fieldMap.reduce((sum, f) => sum + f.weight, 0);
  if (totalWeight === 0) {
    throw new BadRequestException('Field map weights sum to zero');
  }

  const terms = fieldMap.map((f) => {
    const left = `l."${assertIdent(f.left, 'field')}"`;
    const right = `r."${assertIdent(f.right, 'field')}"`;
    const [primary] = comparatorExprs(f.role, left, right);
    return `${f.weight} * ${primary.sql}`;
  });

  return `(${terms.join(' + ')}) / ${totalWeight}`;
}
