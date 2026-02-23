import { Injectable, Logger } from '@nestjs/common';
import { OrganizationSettings } from '../../database/entities/organization-settings.entity';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedSql?: string;
}

/**
 * SQL Validator Service
 *
 * Validates AI-generated SQL queries to ensure they are safe to execute.
 * Enforces organization-level security policies:
 * - Allowed SQL operations (SELECT, INSERT, UPDATE, DELETE)
 * - Row limit enforcement
 * - Dangerous pattern detection (DROP, TRUNCATE, etc.)
 * - SQL injection pattern detection
 */
@Injectable()
export class SqlValidatorService {
  private readonly logger = new Logger(SqlValidatorService.name);

  // Dangerous SQL patterns that should always be blocked
  private readonly DANGEROUS_PATTERNS = [
    /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|FUNCTION|PROCEDURE)\b/i,
    /\bTRUNCATE\s+TABLE\b/i,
    /\bALTER\s+(TABLE|DATABASE|SCHEMA)\b/i,
    /\bCREATE\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|FUNCTION|PROCEDURE)\b/i,
    /\bGRANT\b/i,
    /\bREVOKE\b/i,
    /\bEXEC(UTE)?\s*\(/i,
    /\bSHUTDOWN\b/i,
    /\bKILL\b/i,
    /xp_cmdshell/i,
    /;\s*(DROP|TRUNCATE|DELETE|UPDATE|INSERT)/i, // SQL injection attempt
  ];

  /**
   * Validate SQL query against organization settings
   */
  validate(sql: string, settings: OrganizationSettings): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if validation is enabled
    if (!settings.sqlValidationEnabled) {
      this.logger.warn('SQL validation is disabled for this organization');
      return {
        isValid: true,
        errors: [],
        warnings: ['SQL validation is disabled'],
      };
    }

    // 1. Check for dangerous patterns
    const dangerousPatternCheck = this.checkDangerousPatterns(sql);
    if (!dangerousPatternCheck.isValid) {
      errors.push(...dangerousPatternCheck.errors);
    }

    // 2. Check allowed operations
    const operationCheck = this.checkAllowedOperations(sql, settings.allowedSqlOperations);
    if (!operationCheck.isValid) {
      errors.push(...operationCheck.errors);
    }

    // 3. Check for LIMIT clause (only for SELECT)
    if (this.isSelectQuery(sql)) {
      const limitCheck = this.checkLimitClause(sql, settings.maxRowsLimit);
      if (!limitCheck.isValid) {
        warnings.push(...limitCheck.warnings);
      }
    }

    // 4. Check for SQL injection patterns
    const injectionCheck = this.checkSqlInjection(sql);
    if (!injectionCheck.isValid) {
      errors.push(...injectionCheck.errors);
    }

    // 5. Sanitize SQL (remove comments, extra whitespace)
    const sanitizedSql = this.sanitizeSql(sql);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedSql,
    };
  }

  /**
   * Check for dangerous SQL patterns
   */
  private checkDangerousPatterns(sql: string): Pick<ValidationResult, 'isValid' | 'errors'> {
    const errors: string[] = [];

    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(sql)) {
        errors.push(`Dangerous SQL pattern detected: ${pattern.source}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if SQL operation is allowed
   */
  private checkAllowedOperations(
    sql: string,
    allowedOperations: string[]
  ): Pick<ValidationResult, 'isValid' | 'errors'> {
    const errors: string[] = [];

    // Determine the operation type
    const operation = this.getOperationType(sql);

    if (!operation) {
      errors.push('Unable to determine SQL operation type');
      return { isValid: false, errors };
    }

    if (!allowedOperations.includes(operation)) {
      errors.push(
        `SQL operation '${operation}' is not allowed. Allowed operations: ${allowedOperations.join(', ')}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check for LIMIT clause in SELECT queries
   */
  private checkLimitClause(
    sql: string,
    maxRowsLimit: number
  ): Pick<ValidationResult, 'isValid' | 'warnings'> {
    const warnings: string[] = [];

    const hasLimit = /\bLIMIT\s+\d+/i.test(sql);

    if (!hasLimit) {
      warnings.push(
        `Query does not have a LIMIT clause. Consider adding LIMIT ${maxRowsLimit} to prevent large result sets.`
      );
    } else {
      // Extract limit value
      const limitMatch = sql.match(/\bLIMIT\s+(\d+)/i);
      if (limitMatch) {
        const limitValue = parseInt(limitMatch[1], 10);
        if (limitValue > maxRowsLimit) {
          warnings.push(
            `LIMIT ${limitValue} exceeds the maximum allowed limit of ${maxRowsLimit}. Consider reducing it.`
          );
        }
      }
    }

    return {
      isValid: true,
      warnings,
    };
  }

  /**
   * Check for SQL injection patterns
   */
  private checkSqlInjection(sql: string): Pick<ValidationResult, 'isValid' | 'errors'> {
    const errors: string[] = [];

    // Check for multiple statements (semicolon followed by another statement)
    const multipleStatements = sql.split(';').filter(s => s.trim().length > 0);
    if (multipleStatements.length > 1) {
      errors.push('Multiple SQL statements detected. Only single statements are allowed.');
    }

    // Check for suspicious comment patterns
    if (/--.*(\bOR\b|\bAND\b)/i.test(sql)) {
      errors.push('Suspicious SQL comment pattern detected');
    }

    // Check for UNION-based injection
    if (/\bUNION\s+(ALL\s+)?SELECT\b/i.test(sql)) {
      // UNION is allowed but log a warning
      this.logger.warn('UNION query detected - review for potential injection');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get SQL operation type (SELECT, INSERT, UPDATE, DELETE)
   */
  private getOperationType(sql: string): string | null {
    const trimmed = sql.trim().toUpperCase();

    if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
      return 'SELECT';
    }
    if (trimmed.startsWith('INSERT')) {
      return 'INSERT';
    }
    if (trimmed.startsWith('UPDATE')) {
      return 'UPDATE';
    }
    if (trimmed.startsWith('DELETE')) {
      return 'DELETE';
    }

    return null;
  }

  /**
   * Check if query is a SELECT statement
   */
  private isSelectQuery(sql: string): boolean {
    return this.getOperationType(sql) === 'SELECT';
  }

  /**
   * Sanitize SQL by removing comments and normalizing whitespace
   */
  private sanitizeSql(sql: string): string {
    // Remove single-line comments (-- ...)
    let sanitized = sql.replace(/--[^\n]*/g, '');

    // Remove multi-line comments (/* ... */)
    sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }

  /**
   * Auto-add LIMIT clause to SELECT queries if missing
   */
  addLimitIfMissing(sql: string, maxRowsLimit: number): string {
    if (!this.isSelectQuery(sql)) {
      return sql;
    }

    const hasLimit = /\bLIMIT\s+\d+/i.test(sql);
    if (hasLimit) {
      return sql;
    }

    // Add LIMIT clause at the end
    const trimmed = sql.trim();
    const endsWithSemicolon = trimmed.endsWith(';');

    if (endsWithSemicolon) {
      return `${trimmed.slice(0, -1)} LIMIT ${maxRowsLimit};`;
    } else {
      return `${trimmed} LIMIT ${maxRowsLimit}`;
    }
  }
}
