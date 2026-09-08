import { BadRequestException } from '@nestjs/common';

/**
 * Strongest-common-denominator validation for SQL that reaches a database
 * on behalf of an UNAUTHENTICATED caller (public dataset shares).
 * Deliberately conservative: false positives are acceptable on this path.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\b(drop|delete|insert|update|alter|create|truncate|grant|revoke|vacuum|reindex|merge|copy|call|do)\b/i,
  /\b(pg_read_file|pg_write_file|pg_ls_dir|pg_sleep|pg_terminate_backend|pg_cancel_backend|lo_import|lo_export|dblink|xp_cmdshell)\b/i,
  /\binto\s+(outfile|dumpfile)\b/i,
  /\bexec(ute)?\s*\(/i,
];

export function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

export function validateReadOnlySql(sqlQuery: string): void {
  if (!sqlQuery || typeof sqlQuery !== 'string' || !sqlQuery.trim()) {
    throw new BadRequestException('SQL query is required');
  }

  const stripped = stripSqlComments(sqlQuery).trim();
  const lowered = stripped.toLowerCase();

  if (!lowered.startsWith('select') && !lowered.startsWith('with')) {
    throw new BadRequestException('Only SELECT queries are allowed');
  }

  const body = stripped.endsWith(';') ? stripped.slice(0, -1) : stripped;
  if (body.includes(';')) {
    throw new BadRequestException('Multiple statements are not allowed');
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(stripped)) {
      throw new BadRequestException(
        'Query contains a forbidden keyword and has been blocked',
      );
    }
  }
}
