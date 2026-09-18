import type {
  Connection,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
  SavedCrossQuery,
} from '@/types';
import type { User, AuthResponse } from '@/types/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Get auth token from localStorage
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('govdatahub_token');
}

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  try {
    // Get token and add to headers
    const token = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    };

    // Add Authorization header if token exists
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized - redirect to login
    if (response.status === 401) {
      // Remove invalid token
      if (typeof window !== 'undefined') {
        localStorage.removeItem('govdatahub_token');
        // Redirect to login unless already there
        if (!window.location.pathname.startsWith('/login') &&
            !window.location.pathname.startsWith('/register')) {
          window.location.href = '/login';
        }
      }
      throw new ApiError('Unauthorized', 401);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: response.statusText,
      }));
      throw new ApiError(
        error.message || 'Request failed',
        response.status,
        error
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Network error occurred', 0, error);
  }
}

export const api = {
  // Auth
  auth: {
    login: (credentials: { email: string; password: string }): Promise<AuthResponse> =>
      request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    register: (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }): Promise<AuthResponse> =>
      request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    me: (): Promise<User> => request('/auth/me'),
  },

  // Connections
  connections: {
    list: (): Promise<Connection[]> => request('/connections'),
    get: (id: string) => request(`/connections/${id}`),
    create: (data: any) =>
      request('/connections', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`/connections/${id}`, {
        method: 'DELETE',
      }),
    test: (id: string) =>
      request(`/connections/${id}/test`, {
        method: 'POST',
      }),
  },

  // Schema
  schema: {
    getSchemas: (connectionId: string): Promise<SchemaInfo[]> =>
      request(`/connections/${connectionId}/schema/schemas`),
    getTables: (connectionId: string, schema?: string): Promise<TableInfo[]> => {
      const params = schema ? `?schema=${encodeURIComponent(schema)}` : '';
      return request(`/connections/${connectionId}/schema/tables${params}`);
    },
    getColumns: (connectionId: string, table: string, schema?: string): Promise<ColumnInfo[]> => {
      const params = schema ? `?schema=${encodeURIComponent(schema)}` : '';
      return request(
        `/connections/${connectionId}/schema/tables/${encodeURIComponent(table)}/columns${params}`
      );
    },
    // Staging schema endpoints
    getStagingTables: (): Promise<StagingTable[]> =>
      request('/schema/staging/tables'),
    getStagingColumns: (table: string): Promise<any> =>
      request(`/schema/staging/tables/${encodeURIComponent(table)}/columns`),
  },

  // Queries
  queries: {
    execute: (data: any): Promise<QueryResult> =>
      request('/query', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    executeStaging: (sqlQuery: string): Promise<QueryResult> =>
      request('/query/staging', {
        method: 'POST',
        body: JSON.stringify({ sqlQuery }),
      }),
    getHistory: (limit?: number, offset?: number) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', limit.toString());
      if (offset) params.set('offset', offset.toString());
      const query = params.toString();
      return request(`/query/history${query ? `?${query}` : ''}`);
    },
    getById: (id: string) => request(`/query/${id}`),
    getCachedResults: (id: string) => request(`/query/${id}/results`),
  },

  // Transformations
  transformations: {
    list: (status?: string): Promise<Transformation[]> => {
      const params = status ? `?status=${encodeURIComponent(status)}` : '';
      return request(`/transformations${params}`);
    },
    get: (id: string) => request(`/transformations/${id}`),
    create: (data: any) =>
      request('/transformations', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`/transformations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`/transformations/${id}`, {
        method: 'DELETE',
      }),
    execute: (id: string) =>
      request(`/transformations/${id}/execute`, {
        method: 'POST',
      }),
    pause: (id: string) =>
      request(`/transformations/${id}/pause`, {
        method: 'POST',
      }),
    resume: (id: string) =>
      request(`/transformations/${id}/resume`, {
        method: 'POST',
      }),
    getRuns: (id: string, limit?: number, offset?: number) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', limit.toString());
      if (offset) params.set('offset', offset.toString());
      const query = params.toString();
      return request(`/transformations/${id}/runs${query ? `?${query}` : ''}`);
    },
    getRunDetails: (runId: string) => request(`/transformations/runs/${runId}`),
    getRunResults: (runId: string) => request(`/transformations/runs/${runId}/results`),
  },

  // Cross-Query
  crossQuery: {
    validate: (data: any) =>
      request('/cross-query/validate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    execute: (data: any) =>
      request('/cross-query/execute', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    // Saved queries
    saveQuery: (data: any) =>
      request('/cross-query/saved', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    listSaved: (): Promise<SavedCrossQuery[]> => request('/cross-query/saved'),
    getSaved: (id: string) => request(`/cross-query/saved/${id}`),
    deleteSaved: (id: string) =>
      request(`/cross-query/saved/${id}`, {
        method: 'DELETE',
      }),
  },

  // Dashboard
  dashboard: {
    getStats: (): Promise<any> => request('/dashboard/stats'),
    getCatalog: (): Promise<any> => request('/dashboard/catalog'),

    // Dataset sharing
    getShares: (): Promise<any> => request('/dashboard/shares'),
    getShare: (id: string): Promise<any> => request(`/dashboard/shares/${id}`),
    createShare: (data: {
      name: string;
      description: string;
      datasetType: 'staged' | 'connection' | 'transformation' | 'cross-query';
      datasetId: string;
      tableName?: string;
      accessLevel: 'private' | 'organization' | 'public';
      generateApiKey?: boolean;
      generateShareToken?: boolean;
    }): Promise<any> =>
      request('/dashboard/shares', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    regenerateApiKey: (id: string): Promise<any> =>
      request(`/dashboard/shares/${id}/regenerate-api-key`, {
        method: 'POST',
      }),
    regenerateShareToken: (id: string): Promise<any> =>
      request(`/dashboard/shares/${id}/regenerate-token`, {
        method: 'POST',
      }),
    deleteShare: (id: string): Promise<void> =>
      request(`/dashboard/shares/${id}`, {
        method: 'DELETE',
      }),

    // Analytics
    getQueryPerformance: (): Promise<any> =>
      request('/dashboard/analytics/query-performance'),
    getSharedDatasetStats: (): Promise<any> =>
      request('/dashboard/analytics/shared-datasets'),
    getDataFreshnessStats: (): Promise<any> =>
      request('/dashboard/analytics/data-freshness'),
    getConnectionHealthStats: (): Promise<any> =>
      request('/dashboard/analytics/connection-health'),
  },

  // Public datasets (no auth required)
  publicDatasets: {
    getByApiKey: (apiKey: string): Promise<any> =>
      request(`/public/datasets/${apiKey}`),
    getByShareToken: (shareToken: string): Promise<any> =>
      request(`/public/shared/${shareToken}`),
  },

  // Data Ingestion
  ingestion: {
    importFromUrl: async (data: {
      url: string;
      targetType?: 'staging' | 'database';
      targetTable?: string;
      connectionId?: string;
      auth?: {
        type: 'none' | 'bearer' | 'basic' | 'api_key';
        token?: string;
        username?: string;
        password?: string;
        apiKey?: string;
        apiKeyHeader?: string;
      };
      headers?: Record<string, string>;
      config?: any;
    }): Promise<any> => {
      return request('/ingestion/import/url', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    importFromDatabase: async (data: {
      connectionId: string;
      schema: string;
      table: string;
      columns?: string[];
      whereClause?: string;
      rowLimit?: number;
      targetTable?: string;
    }): Promise<any> => {
      return request('/ingestion/import/database', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    preview: async (file: File, config?: any): Promise<any> => {
      const formData = new FormData();
      formData.append('file', file);
      if (config) {
        formData.append('config', JSON.stringify(config));
      }

      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/ingestion/preview`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: response.statusText,
        }));
        throw new ApiError(
          error.message || 'Preview failed',
          response.status,
          error
        );
      }

      return response.json();
    },

    upload: async (file: File, uploadDto: any): Promise<any> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('targetType', uploadDto.targetType);

      if (uploadDto.targetTable) {
        formData.append('targetTable', uploadDto.targetTable);
      }
      if (uploadDto.connectionId) {
        formData.append('connectionId', uploadDto.connectionId);
      }
      if (uploadDto.config) {
        formData.append('config', JSON.stringify(uploadDto.config));
      }

      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/ingestion/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: response.statusText,
        }));
        throw new ApiError(
          error.message || 'Upload failed',
          response.status,
          error
        );
      }

      return response.json();
    },

    getJob: (id: string): Promise<any> => request(`/ingestion/jobs/${id}`),

    listJobs: (status?: string, limit?: number, offset?: number): Promise<any> => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (limit) params.set('limit', limit.toString());
      if (offset) params.set('offset', offset.toString());
      const query = params.toString();
      return request(`/ingestion/jobs${query ? `?${query}` : ''}`);
    },

    deleteJob: (id: string): Promise<void> =>
      request(`/ingestion/jobs/${id}`, {
        method: 'DELETE',
      }),

    // Staged data endpoints
    listStagedData: (limit?: number, offset?: number): Promise<any> => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', limit.toString());
      if (offset) params.set('offset', offset.toString());
      const query = params.toString();
      return request(`/ingestion/staged${query ? `?${query}` : ''}`);
    },

    getStagedData: (id: string): Promise<any> =>
      request(`/ingestion/staged/${id}`),

    getStagedDataByJobId: (jobId: string): Promise<any> =>
      request(`/ingestion/jobs/${jobId}/staged`),

    deleteStagedData: (id: string): Promise<void> =>
      request(`/ingestion/staged/${id}`, {
        method: 'DELETE',
      }),
  },

  // Settings
  settings: {
    get: (): Promise<any> => request('/settings'),
    update: (data: any): Promise<any> =>
      request('/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getAiProviders: (): Promise<any> => request('/settings/ai-providers'),
  },

  // NL2SQL
  nl2sql: {
    generateSql: (data: {
      query: string;
      connectionIds?: string[];
      autoExecute?: boolean;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }): Promise<any> =>
      request('/nl2sql/generate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    explainSql: (data: { sql: string; connectionIds?: string[] }): Promise<ExplainSqlResponse> =>
      request('/nl2sql/explain', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    diagnose: (data: {
      sql: string;
      errorMessage: string;
      connectionIds?: string[];
    }): Promise<DiagnoseSqlResponse> =>
      request('/nl2sql/diagnose', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // Catalog Search (semantic search over the catalog index)
  catalogSearch: {
    search: (q: string): Promise<CatalogSearchResult[]> =>
      request(`/catalog-search?q=${encodeURIComponent(q)}`),
    reindex: (): Promise<{ indexed: number }> =>
      request('/catalog-search/reindex', { method: 'POST' }),
  },

  lineage: {
    getGraph: (params?: any): Promise<any> => {
      const searchParams = new URLSearchParams();
      if (params?.nodeTypes) {
        params.nodeTypes.forEach((type: string) => searchParams.append('nodeTypes', type));
      }
      if (params?.datasetId) searchParams.set('datasetId', params.datasetId);
      if (params?.direction) searchParams.set('direction', params.direction);
      if (params?.maxDepth) searchParams.set('maxDepth', params.maxDepth.toString());
      if (params?.startDate) searchParams.set('startDate', params.startDate);
      if (params?.endDate) searchParams.set('endDate', params.endDate);

      const query = searchParams.toString();
      return request(`/lineage/graph${query ? `?${query}` : ''}`);
    },

    getDatasetLineage: (
      datasetId: string,
      direction: 'upstream' | 'downstream' | 'both' = 'both',
      maxDepth: number = 3
    ): Promise<any> => {
      return request(
        `/lineage/dataset/${datasetId}?direction=${direction}&maxDepth=${maxDepth}`
      );
    },
  },

  notebooks: {
    list: (): Promise<any[]> => request('/notebooks'),

    get: (id: string): Promise<any> => request(`/notebooks/${id}`),

    create: (data: { name: string; description?: string }): Promise<any> =>
      request('/notebooks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (
      id: string,
      data: { name?: string; description?: string; cells?: any[] },
    ): Promise<any> =>
      request(`/notebooks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    delete: (id: string): Promise<void> =>
      request(`/notebooks/${id}`, { method: 'DELETE' }),

    executeCell: (
      notebookId: string,
      cellId: string,
      data: { connectionId: string; sql: string },
    ): Promise<any> =>
      request(`/notebooks/${notebookId}/cells/${cellId}/execute`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    saveAsTransformation: (
      notebookId: string,
      data: {
        name: string;
        description: string;
        sourceConnectionId: string;
        combinedSql: string;
      },
    ): Promise<any> =>
      request(`/notebooks/${notebookId}/save-as-transformation`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  pipelines: {
    list: (): Promise<any[]> => request('/pipelines'),

    get: (id: string): Promise<any> => request(`/pipelines/${id}`),

    create: (data: { name: string; description?: string; schedule?: string; stopOnError?: boolean }): Promise<any> =>
      request('/pipelines', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: {
      name?: string;
      description?: string;
      schedule?: string | null;
      stopOnError?: boolean;
      status?: 'active' | 'paused';
      definition?: { steps: any[]; edges: any[] };
    }): Promise<any> =>
      request(`/pipelines/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    delete: (id: string): Promise<void> =>
      request(`/pipelines/${id}`, { method: 'DELETE' }),

    run: (id: string): Promise<any> =>
      request(`/pipelines/${id}/run`, { method: 'POST' }),

    getRuns: (id: string, limit?: number): Promise<any[]> =>
      request(`/pipelines/${id}/runs${limit ? `?limit=${limit}` : ''}`),

    getRun: (pipelineId: string, runId: string): Promise<any> =>
      request(`/pipelines/${pipelineId}/runs/${runId}`),
  },

  catalog: {
    getStatus: (): Promise<any> => request('/catalog/status'),

    testConnection: (): Promise<{ ok: boolean; message: string }> =>
      request('/catalog/test-connection', { method: 'POST' }),

    sync: (): Promise<{
      synced: number;
      errors: string[];
      categories: { connections: number; tables: number; pipelines: number; lineage: number; queries: number };
    }> => request('/catalog/sync', { method: 'POST' }),
  },

  dataQuality: {
    getProfile: (connectionId: string, schemaName: string, tableName: string): Promise<any> =>
      request(`/data-quality/profiles?connectionId=${encodeURIComponent(connectionId)}&schemaName=${encodeURIComponent(schemaName)}&tableName=${encodeURIComponent(tableName)}`),

    profileTable: (body: { connectionId: string; schemaName: string; tableName: string }): Promise<any> =>
      request('/data-quality/profiles', { method: 'POST', body: JSON.stringify(body) }),

    listChecks: (params?: { connectionId?: string; schemaName?: string; tableName?: string }): Promise<any[]> => {
      const qs = new URLSearchParams();
      if (params?.connectionId) qs.set('connectionId', params.connectionId);
      if (params?.schemaName) qs.set('schemaName', params.schemaName);
      if (params?.tableName) qs.set('tableName', params.tableName);
      const q = qs.toString();
      return request(`/data-quality/checks${q ? `?${q}` : ''}`);
    },

    createCheck: (body: any): Promise<any> =>
      request('/data-quality/checks', { method: 'POST', body: JSON.stringify(body) }),

    updateCheck: (id: string, body: any): Promise<any> =>
      request(`/data-quality/checks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

    deleteCheck: (id: string): Promise<void> =>
      request(`/data-quality/checks/${id}`, { method: 'DELETE' }),

    runCheck: (id: string): Promise<any> =>
      request(`/data-quality/checks/${id}/run`, { method: 'POST' }),

    getCheckRuns: (id: string): Promise<any[]> =>
      request(`/data-quality/checks/${id}/runs`),

    suggestChecks: (body: {
      connectionId: string;
      schemaName: string;
      tableName: string;
    }): Promise<SuggestedCheck[]> =>
      request('/data-quality/suggest', { method: 'POST', body: JSON.stringify(body) }),
  },

  savedQueries: {
    list: (): Promise<SavedQuery[]> => request('/saved-queries'),
    get: (id: string): Promise<SavedQuery> => request(`/saved-queries/${id}`),
    create: (body: SavedQueryCreatePayload): Promise<SavedQuery> =>
      request('/saved-queries', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<SavedQueryCreatePayload>): Promise<SavedQuery> =>
      request(`/saved-queries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    remove: (id: string): Promise<void> =>
      request(`/saved-queries/${id}`, { method: 'DELETE' }),
    execute: (
      id: string,
      parameters: Record<string, unknown> = {},
    ): Promise<SavedQueryExecuteResult> =>
      request(`/saved-queries/${id}/execute`, {
        method: 'POST',
        body: JSON.stringify({ parameters }),
      }),
  },

  dashboards: {
    list: (): Promise<Dashboard[]> => request('/dashboards'),
    get: (id: string): Promise<Dashboard> => request(`/dashboards/${id}`),
    create: (body: DashboardCreatePayload): Promise<Dashboard> =>
      request('/dashboards', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<DashboardCreatePayload>): Promise<Dashboard> =>
      request(`/dashboards/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    remove: (id: string): Promise<void> =>
      request(`/dashboards/${id}`, { method: 'DELETE' }),
  },

  // Entity Matching
  matching: {
    listProjects: (): Promise<MatchProjectDto[]> => request('/matching/projects'),

    getProject: (id: string): Promise<MatchProjectDto> =>
      request(`/matching/projects/${id}`),

    createProject: (body: CreateMatchProjectBody): Promise<MatchProjectDto> =>
      request('/matching/projects', { method: 'POST', body: JSON.stringify(body) }),

    updateProject: (id: string, body: Partial<CreateMatchProjectBody>): Promise<MatchProjectDto> =>
      request(`/matching/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

    deleteProject: (id: string): Promise<void> =>
      request(`/matching/projects/${id}`, { method: 'DELETE' }),

    estimate: (id: string): Promise<BlockingEstimate> =>
      request(`/matching/projects/${id}/estimate`, { method: 'POST' }),

    startRun: (id: string): Promise<MatchRunDto> =>
      request(`/matching/projects/${id}/runs`, { method: 'POST' }),

    listRuns: (id: string): Promise<MatchRunDto[]> =>
      request(`/matching/projects/${id}/runs`),

    getRun: (runId: string): Promise<MatchRunDto> =>
      request(`/matching/runs/${runId}`),

    /**
     * Ruling R54: mark a run stranded in a non-terminal status as failed,
     * so it stops blocking "Run now" forever. The server refuses with a
     * 409 unless the project's advisory lock is free -- i.e. unless no
     * pipeline can possibly still be working on it.
     */
    abandonRun: (runId: string): Promise<MatchRunDto> =>
      request(`/matching/runs/${runId}/abandon`, { method: 'POST' }),

    listCandidates: (runId: string, decision: string, limit = 50, offset = 0): Promise<MatchCandidateDto[]> =>
      request(
        `/matching/runs/${runId}/candidates?decision=${encodeURIComponent(decision)}&limit=${limit}&offset=${offset}`,
      ),

    submitDecision: (projectId: string, body: SubmitDecisionBody): Promise<void> =>
      request(`/matching/projects/${projectId}/decisions`, { method: 'POST', body: JSON.stringify(body) }),

    /**
     * Ruling R43 (part 2): retracts a verdict -- it does not assert the
     * opposite one. Deletes whatever decision row(s) exist for this key
     * pair (matched in either order, server-side); returning the pair to
     * the grey band it came from is the actual inverse of
     * `submitDecision`, not a second verdict.
     */
    retractDecision: (projectId: string, leftKey: string, rightKey: string): Promise<void> =>
      request(
        `/matching/projects/${projectId}/decisions?leftKey=${encodeURIComponent(leftKey)}&rightKey=${encodeURIComponent(rightKey)}`,
        { method: 'DELETE' },
      ),

    listClusters: (runId: string, limit = 50, offset = 0): Promise<MatchClusterDto[]> =>
      request(`/matching/runs/${runId}/clusters?limit=${limit}&offset=${offset}`),

    /**
     * Ruling R53: `evaluate` and `addGoldPair` have no callers and there
     * is no gold-set UI to give them one. They are left in place
     * deliberately -- the evaluation screen is the first phase-2 item and
     * these are the endpoints it will use -- but nothing in the product
     * may instruct an operator to act on numbers only these can produce.
     * The wizard's threshold copy was corrected accordingly.
     */
    evaluate: (runId: string): Promise<{ metrics: EvalMetrics; sweep: SweepPoint[] }> =>
      request(`/matching/runs/${runId}/evaluate`),

    addGoldPair: (projectId: string, body: AddGoldPairBody): Promise<void> =>
      request(`/matching/projects/${projectId}/gold-pairs`, { method: 'POST', body: JSON.stringify(body) }),
  },
};

// ============================================================================
// Types for endpoints with no shared type in '@/types' yet
// ============================================================================

export interface Transformation {
  id: string;
  name: string;
  description: string;
  sourceConnectionId: string;
  sqlQuery: string;
  outputConfig: {
    mode: 'cache';
    maxRows?: number;
  };
  status: 'active' | 'paused';
  createdAt: string;
  lastRunAt: string | null;
}

export interface StagingTable {
  name: string;
  schema: string;
  rowCount: number | null;
  sizeBytes: number;
}

// ============================================================================
// Types for the new namespaces (M1-01 / M1-02 backends)
// ============================================================================

export type SavedQueryParamType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'date_range'
  | 'select'
  | 'multi_select';

export interface SavedQueryParamDef {
  name: string;
  type: SavedQueryParamType;
  required: boolean;
  default?: unknown;
}

export interface SavedQuery {
  id: string;
  organizationId: string;
  createdBy: string;
  connectionId: string;
  name: string;
  description: string | null;
  sql: string;
  parameters: SavedQueryParamDef[];
  cacheTtlSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedQueryCreatePayload {
  name: string;
  description?: string;
  connectionId: string;
  sql: string;
  parameters?: SavedQueryParamDef[];
  cacheTtlSeconds?: number;
}

export interface SavedQueryExecuteResult {
  id: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: { name: string; type?: string }[];
  executionTimeMs: number;
  status: 'success' | 'error';
}

export type DashboardFilterType =
  | 'date_range'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'text'
  | 'number';

export interface DashboardFilterDef {
  name: string;
  type: DashboardFilterType;
  label?: string;
  default?: unknown;
  options?: string[];
}

export interface DashboardWidget {
  id: string;
  type: string;
  title?: string;
  savedQueryId?: string;
  parameterBindings?: Record<string, string>;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Dashboard {
  id: string;
  organizationId: string;
  createdBy: string;
  name: string;
  description: string | null;
  widgets: DashboardWidget[];
  layout: DashboardLayoutItem[];
  filters: DashboardFilterDef[];
  createdAt: string;
  updatedAt: string;
}

export interface DashboardCreatePayload {
  name: string;
  description?: string;
  widgets?: DashboardWidget[];
  layout?: DashboardLayoutItem[];
  filters?: DashboardFilterDef[];
}

export interface ExplainSqlResponse {
  explanation: string;
  tables: string[];
  operations: string[];
}

export interface DiagnoseSqlResponse {
  diagnosis: string;
  suggestedSql: string | null;
  validationWarnings: string[];
}

export interface CatalogSearchResult {
  object_type: string;
  object_key: string;
  content: string;
  score: number;
}

// Response shape verified against QualityChecksService.suggestChecks — a plain
// array of suggestions, NOT wrapped in a `{ suggestions: [...] }` envelope.
export interface SuggestedCheck {
  checkType: string;
  columnName?: string;
  config: Record<string, any>;
  rationale: string;
}

// ============================================================================
// Entity Matching (Task 16) — types mirror the backend entities/DTOs in
// packages/backend/src/database/entities/match-*.entity.ts and
// packages/backend/src/modules/matching/*, verified field-for-field against
// them rather than guessed.
// ============================================================================

export type MatchMode = 'dedupe' | 'link';
export type FieldRole = 'person_name' | 'org_name' | 'date' | 'phone' | 'identifier' | 'address' | 'text';
export type BlockingKind = 'equi' | 'trigram';
export type MatchRunStatus =
  | 'pending'
  | 'materializing'
  | 'normalizing'
  | 'blocking'
  | 'scoring'
  | 'clustering'
  | 'completed'
  | 'failed';
/** A candidate pair's state within one run — never what a human submits (see MatchVerdict). */
export type CandidateDecision = 'auto_match' | 'grey' | 'confirmed' | 'rejected';
/** The only vocabulary a human reviewer can produce (Ruling R25) — distinct from CandidateDecision. */
export type MatchVerdict = 'match' | 'no_match';

/** A Match Project's Match Source: either a table behind a Connection, or a Staged Data dataset. */
export interface MatchSourceRef {
  kind: 'connection' | 'staged';
  connectionId?: string;
  schemaName?: string;
  tableName?: string;
  stagedDataId?: string;
  primaryKey: string;
}

/** One field's role, comparator and weight in the scoring formula. */
export interface FieldMapping {
  left: string;
  right: string;
  role: FieldRole;
  weight: number;
  comparator: string;
}

/** One Blocking Pass: an equi-join key, or a trigram-similarity key with a threshold. */
export interface BlockingPass {
  name: string;
  kind: BlockingKind;
  keyExpr: string;
  threshold?: number;
}

export interface MatchThresholds {
  matchAt: number;
  rejectAt: number;
}

export interface MatchProjectDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  mode: MatchMode;
  leftSource: MatchSourceRef;
  rightSource: MatchSourceRef | null;
  fieldMap: FieldMapping[];
  blockingPasses: BlockingPass[];
  thresholds: MatchThresholds;
  columnAllowlist: string[];
  lawfulBasis: string;
  dataOwner: string;
  retentionDays: number;
  /** 'active' | 'inactive' (soft-deleted — Ruling R31). Not a closed union server-side. */
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMatchProjectBody {
  name: string;
  description?: string;
  mode: MatchMode;
  leftSource: MatchSourceRef;
  rightSource?: MatchSourceRef;
  fieldMap: FieldMapping[];
  blockingPasses: BlockingPass[];
  thresholds: MatchThresholds;
  columnAllowlist: string[];
  lawfulBasis: string;
  dataOwner: string;
  retentionDays: number;
}

/**
 * Ruling R23/R24: candidatePairs is NOT autoMatch + grey + autoReject once any
 * human decision exists on the run — a pair carrying a verdict is stored as
 * confirmed/rejected and is counted by neither. Never render these four as a
 * total that must add up.
 */
export interface MatchRunCounters {
  leftRows: number;
  rightRows: number;
  candidatePairs: number;
  autoMatch: number;
  grey: number;
  autoReject: number;
  clusters: number;
  flaggedClusters: number;
  /** What the blocking estimate projected before the run started — not a count of anything the run did. */
  estimatedPairs: number;
  /**
   * Ruling R20: true when any blocking pass was inexact (trigram). When true,
   * `estimatedPairs` is a LOWER BOUND, not an estimate — render it as
   * "at least N", never a bare number.
   */
  hasInexactPass: boolean;
}

/** One Blocking Pass's degenerate (dropped) key values, as recorded on the run. */
export interface RunDroppedKeys {
  pass: string;
  keys: string[];
}

export interface MatchRunDto {
  id: string;
  organizationId: string;
  projectId: string;
  status: MatchRunStatus;
  counters: MatchRunCounters;
  watermarks: Record<string, unknown>;
  droppedKeys: RunDroppedKeys[];
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}

/**
 * One row of match_candidates as read for the review queue — raw SQL, not a
 * TypeORM entity, so the field names stay snake_case exactly as the backend
 * (MatchingService.CandidateRow) returns them.
 *
 * Ruling R39: `features` (one score per mapped field, each already numeric
 * in [0,1] with 1 = identical — Ruling R2, do not rescale) and
 * `left_record`/`right_record` were added so the review queue can render
 * more than two opaque keys and a number. Both records are `null` when the
 * run's materialized workspace table has since been dropped by the
 * retention sweep — render that as "record values no longer available",
 * never as an empty/blank record, and collect no verdict for that pair.
 */
export interface MatchCandidateDto {
  left_key: string;
  right_key: string;
  score: number;
  decision: CandidateDecision;
  blocking_pass: string;
  features: Record<string, number>;
  left_record: Record<string, unknown> | null;
  right_record: Record<string, unknown> | null;
}

export interface SubmitDecisionBody {
  leftSourceRef: string;
  leftKey: string;
  rightSourceRef: string;
  rightKey: string;
  decision: MatchVerdict;
}

/** One member of a Cluster: which Match Source it came from, and its key within that source. */
export interface MatchMember {
  sourceRef: string;
  sourceKey: string;
}

export interface MatchClusterDto {
  id: string;
  organizationId: string;
  projectId: string;
  runId: string;
  entityKey: string;
  members: MatchMember[];
  golden: Record<string, unknown>;
  size: number;
  flagged: boolean;
  createdAt: string;
}

export interface EvalMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface SweepPoint {
  matchAt: number;
  metrics: EvalMetrics;
}

export interface AddGoldPairBody {
  leftKey: string;
  rightKey: string;
  isMatch: boolean;
}

/**
 * One Blocking Pass's projected pair count. For an inexact (trigram) pass,
 * `exact: false` and `estimatedPairs` is a declared LOWER BOUND only — see
 * `BlockingEstimate.hasInexactPass`. No caller may present it as an estimate.
 */
export interface PassEstimate {
  pass: string;
  distinctKeys: number;
  estimatedPairs: number;
  droppedKeys: string[];
  exact: boolean;
}

export interface BlockingEstimate {
  perPass: PassEstimate[];
  totalEstimatedPairs: number;
  /** True when any pass reports exact: false — totalEstimatedPairs is then a lower bound, not an estimate. */
  hasInexactPass: boolean;
  exceedsCap: boolean;
  refused: boolean;
}

export { ApiError };
