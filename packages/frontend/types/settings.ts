export enum AiProvider {
  OPENAI = 'OPENAI',
  ANTHROPIC = 'ANTHROPIC',
  AZURE = 'AZURE',
  LOCAL = 'LOCAL',
  CUSTOM = 'CUSTOM',
}

export interface CatalogSyncResult {
  created: number;
  updated: number;
  errors: string[];
}

export interface CatalogConfig {
  provider: 'openmetadata';
  host: string;
  jwtToken?: string; // masked on read (••••••••), plaintext on write
  enabled: boolean;
  lastSyncAt?: string;
  lastSyncResult?: CatalogSyncResult;
}

export interface OrganizationSettings {
  id: string;
  organizationId: string;

  // AI Provider Configuration
  aiProvider: AiProvider;
  aiModel?: string;
  aiApiKey?: string; // Masked in API responses
  aiApiEndpoint?: string;
  aiTemperature: number;
  aiMaxTokens: number;

  // NL2SQL Settings
  nl2sqlEnabled: boolean;
  nl2sqlIncludeSchemaContext: boolean;
  nl2sqlMaxQueryLength: number;
  nl2sqlAutoExecute: boolean;
  nl2sqlShowReasoning: boolean;

  // SQL Safety Settings
  sqlValidationEnabled: boolean;
  allowedSqlOperations: string[];
  maxRowsLimit: number;

  // General Query Settings
  queryTimeoutSeconds: number;
  enableQueryHistory: boolean;
  enableQuerySharing: boolean;

  // Catalog Integration
  catalogConfig?: CatalogConfig | null;

  // Audit
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface AiProviderModel {
  id: string;
  name: string;
  description: string;
}

export interface AiProviderInfo {
  id: AiProvider;
  name: string;
  models: AiProviderModel[];
  requiresApiKey: boolean;
  requiresEndpoint: boolean;
}

export interface UpdateSettingsDto {
  aiProvider?: AiProvider;
  aiModel?: string;
  aiApiKey?: string;
  aiApiEndpoint?: string;
  aiTemperature?: number;
  aiMaxTokens?: number;
  nl2sqlEnabled?: boolean;
  nl2sqlIncludeSchemaContext?: boolean;
  nl2sqlMaxQueryLength?: number;
  nl2sqlAutoExecute?: boolean;
  nl2sqlShowReasoning?: boolean;
  sqlValidationEnabled?: boolean;
  allowedSqlOperations?: string[];
  maxRowsLimit?: number;
  queryTimeoutSeconds?: number;
  enableQueryHistory?: boolean;
  enableQuerySharing?: boolean;
  catalogConfig?: {
    provider: 'openmetadata';
    host: string;
    jwtToken?: string;
    enabled: boolean;
  } | null;
}
