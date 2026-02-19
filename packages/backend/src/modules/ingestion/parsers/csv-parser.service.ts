import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import csv from 'csv-parser';

export interface ParsedData {
  rows: Record<string, any>[];
  schema: Array<{ name: string; type: string; sample: any }>;
  totalRows: number;
  errors: Array<{
    row: number;
    column: string;
    value: any;
    error: string;
    type: string;
    severity: 'error' | 'warning';
  }>;
}

export interface CsvParserOptions {
  delimiter?: string;
  hasHeader?: boolean;
  skipEmptyLines?: boolean;
}

@Injectable()
export class CsvParserService {
  private readonly logger = new Logger(CsvParserService.name);

  /**
   * Parse CSV file and return preview data (first 100 rows)
   */
  async parsePreview(
    fileBuffer: Buffer,
    options: CsvParserOptions = {}
  ): Promise<ParsedData> {
    const { delimiter = ',', hasHeader = true } = options;

    const rows: Record<string, any>[] = [];
    const errors: any[] = [];
    let totalRows = 0;
    let rowNumber = hasHeader ? 0 : 1; // Start from 1 if no header

    return new Promise((resolve, reject) => {
      const stream = Readable.from(fileBuffer);

      stream
        .pipe(
          csv({
            separator: delimiter,
            headers: hasHeader ? undefined : false,
          })
        )
        .on('data', (row: Record<string, any>) => {
          rowNumber++;
          totalRows++;

          // Only keep first 100 rows for preview
          if (rows.length < 100) {
            const { validatedRow, rowErrors } = this.validateRow(row, rowNumber);
            rows.push(validatedRow);

            if (rowErrors.length > 0) {
              errors.push(...rowErrors);
            }
          }
        })
        .on('end', () => {
          const schema = this.detectSchema(rows);

          this.logger.log(
            `CSV preview parsed: ${totalRows} total rows, ${rows.length} preview rows, ${errors.length} errors`
          );

          resolve({
            rows,
            schema,
            totalRows,
            errors,
          });
        })
        .on('error', (error) => {
          this.logger.error('CSV parsing error', error);
          reject(error);
        });
    });
  }

  /**
   * Parse entire CSV file with chunked processing for large files
   * Calls onChunk callback for each chunk of rows
   */
  async parseWithChunking(
    fileBuffer: Buffer,
    options: CsvParserOptions = {},
    onChunk: (chunk: Record<string, any>[], chunkErrors: any[]) => Promise<void>,
    chunkSize = 500
  ): Promise<{ totalRows: number; totalErrors: number }> {
    const { delimiter = ',', hasHeader = true } = options;

    let currentChunk: Record<string, any>[] = [];
    let currentChunkErrors: any[] = [];
    let totalRows = 0;
    let totalErrors = 0;
    let rowNumber = hasHeader ? 0 : 1;

    return new Promise((resolve, reject) => {
      const stream = Readable.from(fileBuffer);

      stream
        .pipe(
          csv({
            separator: delimiter,
            headers: hasHeader ? undefined : false,
          })
        )
        .on('data', async (row: Record<string, any>) => {
          rowNumber++;
          totalRows++;

          const { validatedRow, rowErrors } = this.validateRow(row, rowNumber);
          currentChunk.push(validatedRow);

          if (rowErrors.length > 0) {
            currentChunkErrors.push(...rowErrors);
            totalErrors += rowErrors.length;
          }

          // Process chunk when it reaches chunk size
          if (currentChunk.length >= chunkSize) {
            // Pause stream while processing chunk
            stream.pause();

            try {
              await onChunk(currentChunk, currentChunkErrors);
              currentChunk = [];
              currentChunkErrors = [];
            } catch (error) {
              this.logger.error('Error processing chunk', error);
              stream.destroy();
              reject(error);
              return;
            }

            // Resume stream after chunk processed
            stream.resume();
          }
        })
        .on('end', async () => {
          // Process remaining rows
          if (currentChunk.length > 0) {
            try {
              await onChunk(currentChunk, currentChunkErrors);
            } catch (error) {
              this.logger.error('Error processing final chunk', error);
              reject(error);
              return;
            }
          }

          this.logger.log(
            `CSV parsing complete: ${totalRows} rows, ${totalErrors} errors`
          );

          resolve({ totalRows, totalErrors });
        })
        .on('error', (error) => {
          this.logger.error('CSV parsing error', error);
          reject(error);
        });
    });
  }

  /**
   * Validate a single row and categorize errors
   */
  private validateRow(
    row: Record<string, any>,
    rowNumber: number
  ): {
    validatedRow: Record<string, any>;
    rowErrors: any[];
  } {
    const validatedRow = { ...row };
    const rowErrors: any[] = [];

    for (const [column, value] of Object.entries(row)) {
      // Check for missing required values (empty strings or null)
      if (value === '' || value === null || value === undefined) {
        rowErrors.push({
          row: rowNumber,
          column,
          value,
          error: 'Missing required value',
          type: 'MISSING_VALUE',
          severity: 'warning',
          suggestion: 'Provide a value for this field or mark it as optional',
        });
      }

      // Check for obviously invalid values (you can extend this)
      if (typeof value === 'string' && value.trim() === '') {
        validatedRow[column] = null; // Convert empty strings to null
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
   * Detect column data type by sampling values
   */
  private detectColumnType(rows: Record<string, any>[], column: string): string {
    const samples = rows
      .map((row) => row[column])
      .filter((val) => val !== null && val !== undefined && val !== '')
      .slice(0, 100); // Sample first 100 non-null values

    if (samples.length === 0) {
      return 'text';
    }

    // Check if all samples are numbers
    const allNumbers = samples.every((val) => !isNaN(Number(val)));
    if (allNumbers) {
      // Check if all are integers
      const allIntegers = samples.every((val) => Number.isInteger(Number(val)));
      return allIntegers ? 'integer' : 'numeric';
    }

    // Check if all samples are booleans
    const allBooleans = samples.every((val) =>
      ['true', 'false', 'yes', 'no', '1', '0'].includes(
        String(val).toLowerCase()
      )
    );
    if (allBooleans) {
      return 'boolean';
    }

    // Check if all samples are dates
    const allDates = samples.every((val) => !isNaN(Date.parse(String(val))));
    if (allDates) {
      return 'timestamp';
    }

    // Default to text
    return 'text';
  }
}
