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
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers,
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
  },

  // Queries
  queries: {
    execute: (data: any) =>
      request('/query', {
        method: 'POST',
        body: JSON.stringify(data),
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
};

export { ApiError };
