import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ParsedData } from './csv-parser.service';

export interface ExcelParserOptions {
  sheetName?: string;
  hasHeader?: boolean;
}

@Injectable()
export class ExcelParserService {
  private readonly logger = new Logger(ExcelParserService.name);

  /**
   * Parse Excel file and return preview data (first 100 rows)
   */
  async parsePreview(
    fileBuffer: Buffer,
    options: ExcelParserOptions = {}
  ): Promise<ParsedData> {
    const { sheetName, hasHeader = true } = options;

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Use specified sheet or first sheet
    const sheet =
      sheetName && workbook.Sheets[sheetName]
        ? workbook.Sheets[sheetName]
        : workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet) {
      throw new Error('No sheet found in Excel file');
    }

    // Convert sheet to JSON
    const allRows: any[] = XLSX.utils.sheet_to_json(sheet, {
      header: hasHeader ? undefined : 1,
      defval: null,
    });

    const totalRows = allRows.length;
    const previewRows = allRows.slice(0, 100);

    const errors: any[] = [];
    const validatedRows: Record<string, any>[] = [];

    // Validate preview rows
    previewRows.forEach((row, index) => {
      const rowNumber = index + (hasHeader ? 2 : 1); // Excel rows start at 1, +1 if header
      const { validatedRow, rowErrors } = this.validateRow(row, rowNumber);
      validatedRows.push(validatedRow);
      errors.push(...rowErrors);
    });

    const schema = this.detectSchema(validatedRows);

    this.logger.log(
      `Excel preview parsed: ${totalRows} total rows, ${validatedRows.length} preview rows, ${errors.length} errors`
    );

    return {
      rows: validatedRows,
      schema,
      totalRows,
      errors,
    };
  }

  /**
   * Parse entire Excel file with chunked processing
   */
  async parseWithChunking(
    fileBuffer: Buffer,
    options: ExcelParserOptions = {},
    onChunk: (chunk: Record<string, any>[], chunkErrors: any[]) => Promise<void>,
    chunkSize = 500
  ): Promise<{ totalRows: number; totalErrors: number }> {
    const { sheetName, hasHeader = true } = options;

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    const sheet =
      sheetName && workbook.Sheets[sheetName]
        ? workbook.Sheets[sheetName]
        : workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet) {
      throw new Error('No sheet found in Excel file');
    }

    const allRows: any[] = XLSX.utils.sheet_to_json(sheet, {
      header: hasHeader ? undefined : 1,
      defval: null,
    });

    const totalRows = allRows.length;
    let totalErrors = 0;

    // Process in chunks
    for (let i = 0; i < allRows.length; i += chunkSize) {
      const chunk = allRows.slice(i, i + chunkSize);
      const chunkErrors: any[] = [];
      const validatedChunk: Record<string, any>[] = [];

      chunk.forEach((row, index) => {
        const rowNumber = i + index + (hasHeader ? 2 : 1);
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
      `Excel parsing complete: ${totalRows} rows, ${totalErrors} errors`
    );

    return { totalRows, totalErrors };
  }

  /**
   * Get list of sheet names in Excel file
   */
  getSheetNames(fileBuffer: Buffer): string[] {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    return workbook.SheetNames;
  }

  /**
   * Validate a single row
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

      if (typeof value === 'string' && value.trim() === '') {
        validatedRow[column] = null;
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
      ['true', 'false', 'yes', 'no', '1', '0'].includes(
        String(val).toLowerCase()
      )
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
