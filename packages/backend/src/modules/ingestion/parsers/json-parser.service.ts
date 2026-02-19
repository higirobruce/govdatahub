import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ParsedData } from './csv-parser.service';

export interface JsonParserOptions {
  rootPath?: string; // JSONPath to array (e.g., "data.users")
}

@Injectable()
export class JsonParserService {
  private readonly logger = new Logger(JsonParserService.name);

  /**
   * Parse JSON file and return preview data (first 100 rows)
   */
  async parsePreview(
    fileBuffer: Buffer,
    options: JsonParserOptions = {}
  ): Promise<ParsedData> {
    const { rootPath } = options;

    let parsed: any;
    try {
      parsed = JSON.parse(fileBuffer.toString('utf-8'));
    } catch (error) {
      throw new BadRequestException('Invalid JSON format');
    }

    // Extract array from root path if specified
    let data = parsed;
    if (rootPath) {
      data = this.getValueByPath(parsed, rootPath);
    }

    // Ensure data is an array
    if (!Array.isArray(data)) {
      // If single object, wrap in array
      if (typeof data === 'object' && data !== null) {
        data = [data];
      } else {
        throw new BadRequestException(
          'JSON must contain an array of objects or a single object'
        );
      }
    }

    const totalRows = data.length;
    const previewRows = data.slice(0, 100);

    const errors: any[] = [];
    const validatedRows: Record<string, any>[] = [];

    // Validate and flatten preview rows
    previewRows.forEach((row, index) => {
      const rowNumber = index + 1;

      if (typeof row !== 'object' || row === null) {
        errors.push({
          row: rowNumber,
          column: '*',
          value: row,
          error: 'Row must be an object',
          type: 'VALIDATION_ERROR',
          severity: 'error',
          suggestion: 'Ensure each element in the array is a JSON object',
        });
        return;
      }

      const { validatedRow, rowErrors } = this.validateRow(row, rowNumber);
      validatedRows.push(validatedRow);
      errors.push(...rowErrors);
    });

    const schema = this.detectSchema(validatedRows);

    this.logger.log(
      `JSON preview parsed: ${totalRows} total rows, ${validatedRows.length} preview rows, ${errors.length} errors`
    );

    return {
      rows: validatedRows,
      schema,
      totalRows,
      errors,
    };
  }

  /**
   * Parse entire JSON file with chunked processing
   */
  async parseWithChunking(
    fileBuffer: Buffer,
    options: JsonParserOptions = {},
    onChunk: (chunk: Record<string, any>[], chunkErrors: any[]) => Promise<void>,
    chunkSize = 500
  ): Promise<{ totalRows: number; totalErrors: number }> {
    const { rootPath } = options;

    let parsed: any;
    try {
      parsed = JSON.parse(fileBuffer.toString('utf-8'));
    } catch (error) {
      throw new BadRequestException('Invalid JSON format');
    }

    let data = parsed;
    if (rootPath) {
      data = this.getValueByPath(parsed, rootPath);
    }

    if (!Array.isArray(data)) {
      if (typeof data === 'object' && data !== null) {
        data = [data];
      } else {
        throw new BadRequestException(
          'JSON must contain an array of objects or a single object'
        );
      }
    }

    const totalRows = data.length;
    let totalErrors = 0;

    // Process in chunks
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      const chunkErrors: any[] = [];
      const validatedChunk: Record<string, any>[] = [];

      chunk.forEach((row, index) => {
        const rowNumber = i + index + 1;

        if (typeof row !== 'object' || row === null) {
          chunkErrors.push({
            row: rowNumber,
            column: '*',
            value: row,
            error: 'Row must be an object',
            type: 'VALIDATION_ERROR',
            severity: 'error',
          });
          totalErrors++;
          return;
        }

        const { validatedRow, rowErrors } = this.validateRow(row, rowNumber);
        validatedChunk.push(validatedRow);

        if (rowErrors.length > 0) {
          chunkErrors.push(...rowErrors);
          totalErrors += rowErrors.length;
        }
      });

      await onChunk(validatedChunk, chunkErrors);
    }

    this.logger.log(
      `JSON parsing complete: ${totalRows} rows, ${totalErrors} errors`
    );

    return { totalRows, totalErrors };
  }

  /**
   * Get value from object by dot-notation path
   */
  private getValueByPath(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        throw new BadRequestException(`Path '${path}' not found in JSON`);
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Validate and flatten nested objects
   */
  private validateRow(
    row: Record<string, any>,
    rowNumber: number
  ): {
    validatedRow: Record<string, any>;
    rowErrors: any[];
  } {
    const validatedRow: Record<string, any> = {};
    const rowErrors: any[] = [];

    // Flatten nested objects (one level deep)
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined || value === '') {
        rowErrors.push({
          row: rowNumber,
          column: key,
          value,
          error: 'Missing required value',
          type: 'MISSING_VALUE',
          severity: 'warning',
          suggestion: 'Provide a value for this field or mark it as optional',
        });
        validatedRow[key] = null;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // Flatten nested object (e.g., { address: { city: "NYC" } } -> { "address.city": "NYC" })
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          validatedRow[`${key}.${nestedKey}`] = nestedValue;
        }
      } else if (Array.isArray(value)) {
        // Convert arrays to JSON strings
        validatedRow[key] = JSON.stringify(value);
      } else {
        validatedRow[key] = value;
      }
    }

    return { validatedRow, rowErrors };
  }

  /**
   * Detect schema from sample rows
   */
  private detectSchema(
    rows: Record<string, any>[]
  ): Array<{ name: string; type: string; sample: any }> {
    if (rows.length === 0) {
      return [];
    }

    const firstRow = rows[0];
    const schema: Array<{ name: string; type: string; sample: any }> = [];

    for (const [column, value] of Object.entries(firstRow)) {
      const type = this.detectColumnType(rows, column);
      schema.push({
        name: column,
        type,
        sample: value,
      });
    }

    return schema;
  }

  /**
   * Detect column data type
   */
  private detectColumnType(rows: Record<string, any>[], column: string): string {
    const samples = rows
      .map((row) => row[column])
      .filter((val) => val !== null && val !== undefined && val !== '')
      .slice(0, 100);

    if (samples.length === 0) {
      return 'text';
    }

    const allNumbers = samples.every((val) => !isNaN(Number(val)));
    if (allNumbers) {
      const allIntegers = samples.every((val) => Number.isInteger(Number(val)));
      return allIntegers ? 'integer' : 'numeric';
    }

    const allBooleans = samples.every((val) =>
      typeof val === 'boolean' ||
      ['true', 'false'].includes(String(val).toLowerCase())
    );
    if (allBooleans) {
      return 'boolean';
    }

    const allDates = samples.every((val) => !isNaN(Date.parse(String(val))));
    if (allDates) {
      return 'timestamp';
    }

    return 'text';
  }
}
