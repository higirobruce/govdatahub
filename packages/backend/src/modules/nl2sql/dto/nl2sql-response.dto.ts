export class GenerateSqlResponseDto {
  sql: string;
  reasoning?: string;
  confidence?: number;
  warnings?: string[];
  suggestedLimit?: number;
  executionResult?: {
    rows: any[];
    rowCount: number;
    executionTime: number;
  };
  validationErrors?: string[];
}

export class ExplainSqlResponseDto {
  explanation: string;
  tables: string[];
  operations: string[];
}

export class DiagnoseSqlResponseDto {
  diagnosis: string;
  suggestedSql: string | null;
  validationWarnings: string[];
}
