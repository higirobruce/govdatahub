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
 * Wraps a comparator's core expression with a presence guard so a missing
 * value on either side scores 0 rather than:
 *  - erroring (e.g. `''::date` is not NULL in PostgreSQL, it is
 *    `ERROR: invalid input syntax for type date: ""`, which aborts the whole
 *    candidate-pair query, not just that one pair);
 *  - returning NULL and poisoning the weighted sum (`0.2 * NULL` makes the
 *    entire summed score NULL, and `NULL >= matchAt` is never true, so the
 *    pair silently vanishes from both sides of the grey band); or
 *  - claiming a perfect match on two shared blanks (`('' = '')::int::numeric`
 *    is 1 — two records that both lack a phone would otherwise contribute the
 *    full weight as if they agreed).
 * Applied uniformly to all six comparators, including the two (`trgm`,
 * `lev`) that are already individually NULL-safe, so the invariant below
 * ("every comparator scores 0..1, with a missing value scoring 0") holds the
 * same way for every branch, and the next reader never has to work out which
 * ones are the exception.
 */
function guarded(left: string, right: string, core: string): string {
  return `case when ${left} is null or ${right} is null or ${left} = '' or ${right} = '' then 0 else ${core} end`;
}

/**
 * Per-field comparator feature expressions for a role, given already-qualified
 * (and already-quoted) left/right column references, e.g. `l."surname"`.
 *
 * Every expression returned here is a numeric SQL expression bounded to
 * [0, 1], where 1 means identical and a missing value on either side scores
 * 0 (see `guarded`). This is required so that:
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
    case 'address': {
      // fuzzystrmatch's levenshtein_less_equal raises "argument exceeds the
      // maximum length of 255 bytes" past MAX_LEVENSHTEIN_STRLEN; `text` and
      // `address` values are the roles most likely to hit that, and Task 8
      // materializes every comparator of a role into `features` regardless
      // of which one is the primary score, so it is evaluated even when
      // unused. Truncate both operands defensively.
      const leftLev = `left(${left}, 255)`;
      const rightLev = `left(${right}, 255)`;
      return [
        {
          name: 'trgm',
          // The presence guard already keeps '' from reaching similarity(),
          // but similarity() returning NULL for some other non-empty input
          // is cheap to defend against and expensive to debug, so the inner
          // coalesce stays as a belt-and-braces measure even though it is
          // now redundant.
          sql: guarded(left, right, `coalesce(similarity(${left}, ${right}), 0)`),
        },
        {
          name: 'lev',
          sql: guarded(
            left,
            right,
            `greatest(0, 1 - coalesce(levenshtein_less_equal(${leftLev}, ${rightLev}, 3), 4)::numeric / 3)`,
          ),
        },
        {
          name: 'tokenset',
          sql: guarded(
            left,
            right,
            `(string_to_array(${left}, ' ')::text[] <@ string_to_array(${right}, ' ')::text[] AND string_to_array(${right}, ' ')::text[] <@ string_to_array(${left}, ' ')::text[])::int::numeric`,
          ),
        },
      ];
    }
    case 'date':
      return [
        {
          name: 'daydiff',
          // Bounded decay over a one-year horizon: an exact date gives 1, a
          // one-day slip stays near 1, and a transposed month/day pair (the
          // case the spec wanted a dedicated transposition check for) lands
          // around 0.76 rather than being thrown away entirely. A dedicated
          // transposition comparator is phase-4 tuning, not phase-1
          // correctness.
          // `nullif(..., '')::date` is a second, independent defence beyond
          // the presence guard: the guard should prevent '' ever reaching
          // the cast, but PostgreSQL does not promise a CASE shields a
          // constant-folded subexpression from evaluation, and this
          // particular error aborts an entire run, not just one pair.
          sql: guarded(
            left,
            right,
            `greatest(0, 1 - abs(nullif(${left}, '')::date - nullif(${right}, '')::date)::numeric / 365)`,
          ),
        },
      ];
    case 'phone': {
      const leftLev = `left(${left}, 255)`;
      const rightLev = `left(${right}, 255)`;
      return [
        { name: 'exact', sql: guarded(left, right, `(${left} = ${right})::int::numeric`) },
        {
          name: 'lev1',
          sql: guarded(left, right, `(levenshtein_less_equal(${leftLev}, ${rightLev}, 1) <= 1)::int::numeric`),
        },
      ];
    }
    case 'identifier':
      return [{ name: 'exact', sql: guarded(left, right, `(${left} = ${right})::int::numeric`) }];
    default:
      return [{ name: 'exact', sql: guarded(left, right, `(${left} = ${right})::int::numeric`) }];
  }
}

/**
 * Combines per-field comparator scores into a single weighted score expression,
 * normalized by the sum of the field weights so the result lands in 0..1.
 *
 * Weights are validated here, not just at the DTO layer: `FieldMapping` is
 * stored in JSONB, so the compile-time `number` type is not a runtime
 * guarantee — a weight can arrive as a string, NaN, or negative from the
 * database itself, and this function's interpolation of `weight` into SQL is
 * the last line of defence against that reaching a query un-checked.
 */
export function weightedScoreExpr(fieldMap: FieldMapping[]): string {
  const totalWeight = fieldMap.reduce((sum, f) => {
    if (typeof f.weight !== 'number' || !Number.isFinite(f.weight) || f.weight < 0) {
      throw new BadRequestException(`Invalid field weight: ${JSON.stringify(f.weight)}`);
    }
    return sum + f.weight;
  }, 0);
  if (!(totalWeight > 0)) {
    throw new BadRequestException('Field map weights must sum to more than zero');
  }

  const terms = fieldMap.map((f) => {
    const left = `l."${assertIdent(f.left, 'field')}"`;
    const right = `r."${assertIdent(f.right, 'field')}"`;
    const [primary] = comparatorExprs(f.role, left, right);
    return `${f.weight} * ${primary.sql}`;
  });

  return `(${terms.join(' + ')}) / ${totalWeight}`;
}
