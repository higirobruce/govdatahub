import { OrganizationSettings } from '../../../database/entities/organization-settings.entity';

/**
 * Schema context for providing database structure to AI
 */
export interface SchemaContext {
  connections: ConnectionSchema[];
}

export interface ConnectionSchema {
  connectionId: string;
  connectionName: string;
  databaseType: string; // 'postgres', 'mysql', etc.
  tables: TableSchema[];
}

export interface TableSchema {
  name: string;
  schema?: string;
  columns: ColumnSchema[];
  relationships?: RelationshipSchema[];
  sampleData?: Record<string, any>[];
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  foreignKey?: {
    referencedTable: string;
    referencedColumn: string;
  };
}

export interface RelationshipSchema {
  type: 'one-to-many' | 'many-to-one' | 'many-to-many';
  sourceTable: string;
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
}

/**
 * Response from NL2SQL generation
 */
export interface NL2SqlResponse {
  sql: string;
  reasoning?: string;
  confidence?: number;
  warnings?: string[];
  suggestedLimit?: number;
}

/**
 * Request for NL2SQL generation
 */
export interface NL2SqlRequest {
  naturalLanguageQuery: string;
  schemaContext: SchemaContext;
  settings: OrganizationSettings;
  conversationHistory?: ConversationMessage[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Base interface for all AI providers
 */
export interface IAiProvider {
  /**
   * Convert natural language to SQL
   */
  generateSql(request: NL2SqlRequest): Promise<NL2SqlResponse>;

  /**
   * Explain what a SQL query does in natural language
   */
  explainSql(sql: string, schemaContext: SchemaContext): Promise<string>;

  /**
   * Test connection to AI provider
   */
  testConnection(settings: OrganizationSettings): Promise<{
    success: boolean;
    message: string;
    model?: string;
  }>;

  /**
   * Get provider name
   */
  getName(): string;
}
