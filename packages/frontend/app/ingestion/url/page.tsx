'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

type AuthType = 'none' | 'bearer' | 'basic' | 'api_key';
type ImportTab = 'file' | 'database' | 'url';

export default function UrlImportPage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [authType, setAuthType] = useState<AuthType>('none');
  const [bearerToken, setBearerToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyHeader, setApiKeyHeader] = useState('X-API-Key');
  const [customHeaders, setCustomHeaders] = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [importJobId, setImportJobId] = useState<string | null>(null);

  const handleTabChange = (tab: ImportTab) => {
    if (tab === 'file') {
      router.push('/ingestion');
    } else if (tab === 'database') {
      router.push('/ingestion/database');
    }
    // 'url' tab is current page, no navigation needed
  };

  const tabs = [
    {
      id: 'file' as ImportTab,
      label: 'Import from File',
      description: 'Upload CSV, Excel, or JSON files',
    },
    {
      id: 'database' as ImportTab,
      label: 'Import from Database',
      description: 'Import data from connected databases',
    },
    {
      id: 'url' as ImportTab,
      label: 'Import from URL',
      description: 'Download and import from URL',
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setImportJobId(null);

    // Validate URL
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    try {
      new URL(url); // Validate URL format
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setIsImporting(true);

    try {
      // Build auth config
      let auth: any = undefined;
      if (authType !== 'none') {
        auth = { type: authType };

        if (authType === 'bearer' && bearerToken) {
          auth.token = bearerToken;
        } else if (authType === 'basic' && username && password) {
          auth.username = username;
          auth.password = password;
        } else if (authType === 'api_key' && apiKey && apiKeyHeader) {
          auth.apiKey = apiKey;
          auth.apiKeyHeader = apiKeyHeader;
        }
      }

      // Parse custom headers
      let headers: Record<string, string> | undefined;
      if (customHeaders.trim()) {
        try {
          headers = JSON.parse(customHeaders);
        } catch {
          setError('Invalid JSON format for custom headers');
          setIsImporting(false);
          return;
        }
      }

      // Start import
      const result = await api.ingestion.importFromUrl({
        url: url.trim(),
        targetType: 'staging',
        targetTable: targetTable.trim() || undefined,
        auth,
        headers,
      });

      setSuccess(true);
      setImportJobId(result.id);
      setError(null);

      // Redirect to job status page after 2 seconds
      setTimeout(() => {
        router.push(`/ingestion`);
      }, 2000);

    } catch (err: any) {
      setError(err.message || 'Failed to start import');
      setSuccess(false);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Data Ingestion</h1>
        <p className="mt-2 text-gray-600">
          Import data from multiple sources into your data hub
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white shadow sm:rounded-lg mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`
                  flex-1 py-4 px-1 text-center border-b-2 font-medium text-sm
                  ${
                    tab.id === 'url'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <div>
                  <div className="font-semibold">{tab.label}</div>
                  <div className="text-xs mt-1 opacity-75">{tab.description}</div>
                </div>
              </button>
            ))}
          </nav>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6 space-y-6">
          {/* URL Input */}
          <div>
            <label htmlFor="url" className="block text-sm font-medium text-gray-700">
              File URL *
            </label>
            <input
              type="url"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/data.csv"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Supported formats: CSV, JSON, Excel (.xlsx, .xls)
            </p>
          </div>

          {/* Target Table Name */}
          <div>
            <label htmlFor="targetTable" className="block text-sm font-medium text-gray-700">
              Target Table Name (optional)
            </label>
            <input
              type="text"
              id="targetTable"
              value={targetTable}
              onChange={(e) => setTargetTable(e.target.value)}
              placeholder="Leave empty to use filename"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
            />
          </div>

          {/* Authentication */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Authentication
            </label>
            <select
              value={authType}
              onChange={(e) => setAuthType(e.target.value as AuthType)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
            >
              <option value="none">No Authentication</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth (Username/Password)</option>
              <option value="api_key">API Key</option>
            </select>

            {/* Auth Fields */}
            {authType === 'bearer' && (
              <div className="mt-3">
                <input
                  type="text"
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  placeholder="Bearer token"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                />
              </div>
            )}

            {authType === 'basic' && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                />
              </div>
            )}

            {authType === 'api_key' && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={apiKeyHeader}
                  onChange={(e) => setApiKeyHeader(e.target.value)}
                  placeholder="Header name (e.g., X-API-Key)"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                />
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="API key value"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                />
              </div>
            )}
          </div>

          {/* Custom Headers */}
          <div>
            <label htmlFor="headers" className="block text-sm font-medium text-gray-700">
              Custom Headers (optional)
            </label>
            <textarea
              id="headers"
              value={customHeaders}
              onChange={(e) => setCustomHeaders(e.target.value)}
              placeholder={'{\n  "User-Agent": "GovDataHub/1.0",\n  "Accept": "application/json"\n}'}
              rows={4}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border font-mono text-xs"
            />
            <p className="mt-1 text-xs text-gray-500">
              JSON format: key-value pairs for custom HTTP headers
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Import Error</h3>
                  <div className="mt-2 text-sm text-red-700">{error}</div>
                </div>
              </div>
            </div>
          )}

          {/* Success Display */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-green-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">Import Started</h3>
                  <div className="mt-2 text-sm text-green-700">
                    Import job created successfully! Job ID: {importJobId}
                    <br />
                    Redirecting to import jobs page...
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse rounded-b-lg">
          <button
            type="submit"
            disabled={isImporting || !url.trim()}
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Starting Import...
              </>
            ) : (
              'Start Import'
            )}
          </button>
          <button
            type="button"
            onClick={() => router.push('/ingestion')}
            className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
