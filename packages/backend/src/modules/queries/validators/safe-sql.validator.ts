import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'safeSql', async: false })
export class SafeSqlValidator implements ValidatorConstraintInterface {
  validate(sql: string): boolean {
    if (!sql || typeof sql !== 'string') {
      return false;
    }

    // Normalize SQL (trim and convert to lowercase for pattern matching)
    const normalizedSql = sql.trim().toLowerCase();

    // Block SQL comments
    if (normalizedSql.includes('--') || normalizedSql.includes('/*') || normalizedSql.includes('*/')) {
      return false;
    }

    // Block dangerous patterns with semicolons (SQL injection attempts)
    const dangerousWithSemicolon = [
      /;\s*(drop|delete|truncate|alter|create|grant|revoke)\s+/i,
    ];

    for (const pattern of dangerousWithSemicolon) {
      if (pattern.test(sql)) {
        return false;
      }
    }

    // Block system stored procedures and commands
    const systemCommands = [
      /xp_cmdshell/i,
      /sp_executesql/i,
      /exec(\s+|\()/i,
      /execute(\s+|\()/i,
      /into\s+outfile/i,
      /into\s+dumpfile/i,
      /load_file/i,
    ];

    for (const pattern of systemCommands) {
      if (pattern.test(sql)) {
        return false;
      }
    }

    return true;
  }

  defaultMessage(): string {
    return 'SQL query contains potentially dangerous patterns or commands';
  }
}

export function IsSafeSql(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: SafeSqlValidator,
    });
  };
}
