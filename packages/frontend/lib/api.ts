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
    login: (credentials: { email: string; password: string }) =>
      request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    register: (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }) =>
      request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    me: () => request('/auth/me'),
  },

  // Connections
  connections: {
    list: () => request('/connections'),
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
    getSchemas: (connectionId: string) =>
      request(`/connections/${connectionId}/schema/schemas`),
    getTables: (connectionId: string, schema?: string) => {
      const params = schema ? `?schema=${encodeURIComponent(schema)}` : '';
      return request(`/connections/${connectionId}/schema/tables${params}`);
    },
    getColumns: (connectionId: string, table: string, schema?: string) => {
      const params = schema ? `?schema=${encodeURIComponent(schema)}` : '';
      return request(
        `/connections/${connectionId}/schema/tables/${encodeURIComponent(table)}/columns${params}`
      );
    },
    // Staging schema endpoints
    getStagingTables: (): Promise<any> =>
      request('/schema/staging/tables'),
    getStagingColumns: (table: string): Promise<any> =>
      request(`/schema/staging/tables/${encodeURIComponent(table)}/columns`),
  },

  // Queries
  queries: {
    execute: (data: any) =>
      request('/query', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    executeStaging: (sqlQuery: string): Promise<any> =>
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
    list: (status?: string) => {
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
    getTablesMetadata: (connectionIds: string[]) =>
      request('/cross-query/metadata/tables', {
        method: 'POST',
        body: JSON.stringify({ connectionIds }),
      }),
    // Saved queries
    saveQuery: (data: any) =>
      request('/cross-query/saved', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    listSaved: () => request('/cross-query/saved'),
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
      request(`/dashboard/shares/${id}/regenerate-share-token`, {
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
};

export { ApiError };
