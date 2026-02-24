'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/ui/toast';
import { Settings, Save, RefreshCw, Bot, Database, Shield, Clock, Library, Wifi } from 'lucide-react';
import { OrganizationSettings, AiProviderInfo, AiProvider, UpdateSettingsDto, CatalogSyncResult } from '@/types/settings';
import { PageHeader } from '@/components/ui/page-header';

export default function SettingsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<UpdateSettingsDto>({});

  // Catalog integration state
  const [catalogForm, setCatalogForm] = useState({ enabled: false, host: '', jwtToken: '' });
  const [isSavingCatalog, setIsSavingCatalog] = useState(false);
  const [isTestingCatalog, setIsTestingCatalog] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [latestSyncResult, setLatestSyncResult] = useState<CatalogSyncResult | null>(null);

  // Fetch settings
  const { data: settings, error: settingsError, isLoading: loadingSettings } = useSWR<OrganizationSettings>(
    '/settings',
    () => api.settings.get()
  );

  // Fetch available providers
  const { data: providers, isLoading: loadingProviders } = useSWR<AiProviderInfo[]>(
    '/settings/ai-providers',
    () => api.settings.getAiProviders()
  );

  // Initialize form data when settings load
  useEffect(() => {
    if (settings) {
      setFormData({
        aiProvider: settings.aiProvider,
        aiModel: settings.aiModel,
        aiApiEndpoint: settings.aiApiEndpoint,
        aiTemperature: settings.aiTemperature,
        aiMaxTokens: settings.aiMaxTokens,
        nl2sqlEnabled: settings.nl2sqlEnabled,
        nl2sqlIncludeSchemaContext: settings.nl2sqlIncludeSchemaContext,
        nl2sqlMaxQueryLength: settings.nl2sqlMaxQueryLength,
        nl2sqlAutoExecute: settings.nl2sqlAutoExecute,
        nl2sqlShowReasoning: settings.nl2sqlShowReasoning,
        sqlValidationEnabled: settings.sqlValidationEnabled,
        allowedSqlOperations: settings.allowedSqlOperations,
        maxRowsLimit: settings.maxRowsLimit,
        queryTimeoutSeconds: settings.queryTimeoutSeconds,
        enableQueryHistory: settings.enableQueryHistory,
        enableQuerySharing: settings.enableQuerySharing,
      });
      setCatalogForm({
        enabled: settings.catalogConfig?.enabled ?? false,
        host: settings.catalogConfig?.host ?? '',
        jwtToken: '', // never pre-fill the masked token
      });
    }
  }, [settings]);

  // Get selected provider info
  const selectedProvider = providers?.find(p => p.id === formData.aiProvider);

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.settings.update(formData);
      await mutate('/settings');
      showToast('Settings saved', 'success');
    } catch (error: any) {
      console.error('Save error:', error);
      showToast(error.message || 'Failed to update settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reset
  const handleReset = () => {
    if (settings) {
      setFormData({
        aiProvider: settings.aiProvider,
        aiModel: settings.aiModel,
        aiApiEndpoint: settings.aiApiEndpoint,
        aiTemperature: settings.aiTemperature,
        aiMaxTokens: settings.aiMaxTokens,
        nl2sqlEnabled: settings.nl2sqlEnabled,
        nl2sqlIncludeSchemaContext: settings.nl2sqlIncludeSchemaContext,
        nl2sqlMaxQueryLength: settings.nl2sqlMaxQueryLength,
        nl2sqlAutoExecute: settings.nl2sqlAutoExecute,
        nl2sqlShowReasoning: settings.nl2sqlShowReasoning,
        sqlValidationEnabled: settings.sqlValidationEnabled,
        allowedSqlOperations: settings.allowedSqlOperations,
        maxRowsLimit: settings.maxRowsLimit,
        queryTimeoutSeconds: settings.queryTimeoutSeconds,
        enableQueryHistory: settings.enableQueryHistory,
        enableQuerySharing: settings.enableQuerySharing,
      });
    }
  };

  // Catalog handlers
  const handleCatalogSave = async () => {
    setIsSavingCatalog(true);
    try {
      await api.settings.update({
        catalogConfig: {
          provider: 'openmetadata',
          host: catalogForm.host,
          ...(catalogForm.jwtToken ? { jwtToken: catalogForm.jwtToken } : {}),
          enabled: catalogForm.enabled,
        },
      });
      await mutate('/settings');
      setCatalogForm(f => ({ ...f, jwtToken: '' }));
      showToast('Catalog settings saved', 'success');
    } catch (error: any) {
      showToast(error.message || 'Error saving catalog settings', 'error');
    } finally {
      setIsSavingCatalog(false);
    }
  };

  const handleTestCatalog = async () => {
    setIsTestingCatalog(true);
    try {
      const result = await api.catalog.testConnection();
      showToast(result.message, result.ok ? 'success' : 'error');
    } catch (error: any) {
      showToast(error.message || 'Connection test failed', 'error');
    } finally {
      setIsTestingCatalog(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setLatestSyncResult(null);
    try {
      const result = await api.catalog.sync();
      setLatestSyncResult(result);
      await mutate('/settings');
      showToast(`Sync complete — ${result.synced} entities pushed`, 'success');
    } catch (error: any) {
      showToast(error.message || 'Sync failed', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  if (settingsError) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-6">
          <p className="text-red-600">Error loading settings: {settingsError.message}</p>
        </Card>
      </div>
    );
  }

  if (loadingSettings || loadingProviders || !settings || !providers) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-6">
          <p className="text-gray-500">Loading settings...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <PageHeader
        icon={Settings}
        title="Organization Settings"
        subtitle="Configure AI providers, NL2SQL features, and query settings"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isSaving}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* AI Provider Configuration */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold">AI Provider Configuration</h2>
            </div>

            <div className="space-y-4">
              {/* Provider Selection */}
              <div>
                <Label htmlFor="aiProvider">AI Provider</Label>
                <Select
                  value={formData.aiProvider}
                  onValueChange={(value) => setFormData({ ...formData, aiProvider: value as AiProvider })}
                >
                  <SelectTrigger id="aiProvider" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedProvider?.name || 'Select an AI provider'}
                </p>
              </div>

              {/* Model Selection */}
              {selectedProvider && (
                <div>
                  <Label htmlFor="aiModel">Model</Label>
                  <Select
                    value={formData.aiModel}
                    onValueChange={(value) => setFormData({ ...formData, aiModel: value })}
                  >
                    <SelectTrigger id="aiModel" className="mt-1">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedProvider.models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <div>
                            <div className="font-medium">{model.name}</div>
                            <div className="text-xs text-gray-500">{model.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* API Endpoint (for LOCAL and CUSTOM providers) */}
              {selectedProvider && selectedProvider.requiresEndpoint && (
                <div>
                  <Label htmlFor="aiApiEndpoint">API Endpoint</Label>
                  <Input
                    id="aiApiEndpoint"
                    type="url"
                    placeholder={
                      formData.aiProvider === AiProvider.LOCAL
                        ? 'http://localhost:11434'
                        : 'https://your-api.com/v1'
                    }
                    value={formData.aiApiEndpoint || ''}
                    onChange={(e) => setFormData({ ...formData, aiApiEndpoint: e.target.value })}
                    className="mt-1"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    {formData.aiProvider === AiProvider.LOCAL
                      ? 'Ollama default: http://localhost:11434 | LM Studio: http://localhost:1234/v1'
                      : 'Enter your custom API endpoint URL'}
                  </p>
                </div>
              )}

              {/* API Key (for cloud providers) */}
              {selectedProvider && selectedProvider.requiresApiKey && (
                <div>
                  <Label htmlFor="aiApiKey">API Key</Label>
                  <Input
                    id="aiApiKey"
                    type="password"
                    placeholder="Enter your API key"
                    value={formData.aiApiKey || ''}
                    onChange={(e) => setFormData({ ...formData, aiApiKey: e.target.value })}
                    className="mt-1"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    {settings.aiApiKey === '••••••••' ? 'API key is set (masked for security)' : 'Your API key will be encrypted'}
                  </p>
                </div>
              )}

              {/* Temperature */}
              <div>
                <Label htmlFor="aiTemperature">Temperature: {typeof formData.aiTemperature === 'number' ? formData.aiTemperature.toFixed(1) : '0.1'}</Label>
                <Slider
                  id="aiTemperature"
                  min={0}
                  max={2}
                  step={0.1}
                  value={[formData.aiTemperature || 0]}
                  onValueChange={([value]) => setFormData({ ...formData, aiTemperature: value })}
                  className="mt-2"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Controls randomness. Lower is more deterministic, higher is more creative.
                </p>
              </div>

              {/* Max Tokens */}
              <div>
                <Label htmlFor="aiMaxTokens">Max Tokens</Label>
                <Input
                  id="aiMaxTokens"
                  type="number"
                  min={100}
                  max={100000}
                  value={formData.aiMaxTokens || 2000}
                  onChange={(e) => setFormData({ ...formData, aiMaxTokens: parseInt(e.target.value) })}
                  className="mt-1"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Maximum tokens in AI response (100-100,000)
                </p>
              </div>
            </div>
          </Card>

          {/* NL2SQL Settings */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold">NL2SQL Settings</h2>
            </div>

            <div className="space-y-4">
              {/* Enable NL2SQL */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="nl2sqlEnabled">Enable NL2SQL</Label>
                  <p className="text-sm text-gray-500">Allow natural language to SQL conversion</p>
                </div>
                <Switch
                  id="nl2sqlEnabled"
                  checked={formData.nl2sqlEnabled || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, nl2sqlEnabled: checked })}
                />
              </div>

              {/* Include Schema Context */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="nl2sqlIncludeSchemaContext">Include Schema Context</Label>
                  <p className="text-sm text-gray-500">Provide table schemas to AI for better results</p>
                </div>
                <Switch
                  id="nl2sqlIncludeSchemaContext"
                  checked={formData.nl2sqlIncludeSchemaContext || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, nl2sqlIncludeSchemaContext: checked })}
                />
              </div>

              {/* Show Reasoning */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="nl2sqlShowReasoning">Show AI Reasoning</Label>
                  <p className="text-sm text-gray-500">Display AI explanation of generated SQL</p>
                </div>
                <Switch
                  id="nl2sqlShowReasoning"
                  checked={formData.nl2sqlShowReasoning || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, nl2sqlShowReasoning: checked })}
                />
              </div>

              {/* Auto Execute */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="nl2sqlAutoExecute">Auto-Execute Queries</Label>
                  <p className="text-sm text-gray-500">Automatically run generated SQL queries</p>
                </div>
                <Switch
                  id="nl2sqlAutoExecute"
                  checked={formData.nl2sqlAutoExecute || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, nl2sqlAutoExecute: checked })}
                />
              </div>

              {/* Max Query Length */}
              <div>
                <Label htmlFor="nl2sqlMaxQueryLength">Max Query Length (characters)</Label>
                <Input
                  id="nl2sqlMaxQueryLength"
                  type="number"
                  min={10}
                  max={10000}
                  value={formData.nl2sqlMaxQueryLength || 1000}
                  onChange={(e) => setFormData({ ...formData, nl2sqlMaxQueryLength: parseInt(e.target.value) })}
                  className="mt-1"
                />
              </div>
            </div>
          </Card>

          {/* SQL Safety Settings */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-semibold">SQL Safety Settings</h2>
            </div>

            <div className="space-y-4">
              {/* Enable SQL Validation */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="sqlValidationEnabled">Enable SQL Validation</Label>
                  <p className="text-sm text-gray-500">Validate queries for dangerous patterns</p>
                </div>
                <Switch
                  id="sqlValidationEnabled"
                  checked={formData.sqlValidationEnabled || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, sqlValidationEnabled: checked })}
                />
              </div>

              {/* Max Rows Limit */}
              <div>
                <Label htmlFor="maxRowsLimit">Max Rows Limit</Label>
                <Input
                  id="maxRowsLimit"
                  type="number"
                  min={1}
                  max={100000}
                  value={formData.maxRowsLimit || 10000}
                  onChange={(e) => setFormData({ ...formData, maxRowsLimit: parseInt(e.target.value) })}
                  className="mt-1"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Maximum rows returned by queries (prevents large result sets)
                </p>
              </div>

              {/* Allowed Operations */}
              <div>
                <Label>Allowed SQL Operations</Label>
                <div className="mt-2 space-y-2">
                  {['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((op) => (
                    <div key={op} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`op-${op}`}
                        checked={formData.allowedSqlOperations?.includes(op) || false}
                        onChange={(e) => {
                          const current = formData.allowedSqlOperations || [];
                          const updated = e.target.checked
                            ? [...current, op]
                            : current.filter(o => o !== op);
                          setFormData({ ...formData, allowedSqlOperations: updated });
                        }}
                        className="rounded"
                      />
                      <Label htmlFor={`op-${op}`} className="font-normal cursor-pointer">
                        {op}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* General Query Settings */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold">General Query Settings</h2>
            </div>

            <div className="space-y-4">
              {/* Query Timeout */}
              <div>
                <Label htmlFor="queryTimeoutSeconds">Query Timeout (seconds)</Label>
                <Input
                  id="queryTimeoutSeconds"
                  type="number"
                  min={5}
                  max={300}
                  value={formData.queryTimeoutSeconds || 30}
                  onChange={(e) => setFormData({ ...formData, queryTimeoutSeconds: parseInt(e.target.value) })}
                  className="mt-1"
                />
              </div>

              {/* Enable Query History */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="enableQueryHistory">Enable Query History</Label>
                  <p className="text-sm text-gray-500">Track all executed queries</p>
                </div>
                <Switch
                  id="enableQueryHistory"
                  checked={formData.enableQueryHistory || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableQueryHistory: checked })}
                />
              </div>

              {/* Enable Query Sharing */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="enableQuerySharing">Enable Query Sharing</Label>
                  <p className="text-sm text-gray-500">Allow users to share queries</p>
                </div>
                <Switch
                  id="enableQuerySharing"
                  checked={formData.enableQuerySharing || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableQuerySharing: checked })}
                />
              </div>
            </div>
          </Card>
          {/* Catalog Integration */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Library className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-semibold">Catalog Integration</h2>
            </div>

            <div className="space-y-4">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="catalogEnabled">Enable Catalog Integration</Label>
                  <p className="text-sm text-gray-500">Push metadata to your data catalog on sync</p>
                </div>
                <Switch
                  id="catalogEnabled"
                  checked={catalogForm.enabled}
                  onCheckedChange={(checked) => setCatalogForm({ ...catalogForm, enabled: checked })}
                />
              </div>

              {/* Provider selector */}
              <div>
                <Label>Catalog Provider</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 p-3 rounded-lg border-2 border-indigo-500 bg-indigo-50">
                    <span className="font-medium text-sm text-indigo-700">OpenMetadata</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border-2 border-gray-200 bg-gray-50 opacity-50">
                    <span className="font-medium text-sm text-gray-500">
                      DataHub <span className="text-xs font-normal">(coming soon)</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Host URL */}
              <div>
                <Label htmlFor="catalogHost">OpenMetadata Host</Label>
                <Input
                  id="catalogHost"
                  type="url"
                  placeholder="https://your-openmetadata.example.com"
                  value={catalogForm.host}
                  onChange={(e) => setCatalogForm({ ...catalogForm, host: e.target.value })}
                  className="mt-1"
                />
              </div>

              {/* JWT Token */}
              <div>
                <Label htmlFor="catalogToken">Bot JWT Token</Label>
                <Input
                  id="catalogToken"
                  type="password"
                  placeholder={settings.catalogConfig?.jwtToken ? '••••••••' : 'Enter bot JWT token'}
                  value={catalogForm.jwtToken}
                  onChange={(e) => setCatalogForm({ ...catalogForm, jwtToken: e.target.value })}
                  className="mt-1"
                />
                <p className="text-sm text-gray-500 mt-1">
                  {settings.catalogConfig?.jwtToken
                    ? 'Token is set — leave blank to keep existing'
                    : 'JWT token from OpenMetadata Settings → Bots'}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestCatalog}
                  disabled={isTestingCatalog || !catalogForm.host}
                >
                  {isTestingCatalog
                    ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    : <Wifi className="w-4 h-4 mr-2" />}
                  Test Connection
                </Button>
                <Button
                  size="sm"
                  onClick={handleCatalogSave}
                  disabled={isSavingCatalog}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSavingCatalog ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>

            {/* Sync Status Panel */}
            {(settings.catalogConfig || latestSyncResult) && (
              <div className="mt-6 pt-6 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Sync Status</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncNow}
                    disabled={isSyncing || !settings.catalogConfig?.enabled}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                  </Button>
                </div>

                <p className="text-sm text-gray-500">
                  {settings.catalogConfig?.lastSyncAt
                    ? `Last synced: ${new Date(settings.catalogConfig.lastSyncAt).toLocaleString()}`
                    : 'Never synced'}
                </p>

                {(() => {
                  const r = latestSyncResult ?? settings.catalogConfig?.lastSyncResult;
                  if (!r) return null;
                  return (
                    <div className="space-y-2">
                      <div className="flex gap-3 text-sm flex-wrap">
                        <span className="text-green-700 bg-green-50 px-2 py-1 rounded">
                          Synced: {r.synced}
                        </span>
                        {r.categories && (
                          <>
                            {r.categories.connections > 0 && (
                              <span className="text-indigo-700 bg-indigo-50 px-2 py-1 rounded">
                                Connections: {r.categories.connections}
                              </span>
                            )}
                            {r.categories.tables > 0 && (
                              <span className="text-blue-700 bg-blue-50 px-2 py-1 rounded">
                                Tables: {r.categories.tables}
                              </span>
                            )}
                            {r.categories.pipelines > 0 && (
                              <span className="text-purple-700 bg-purple-50 px-2 py-1 rounded">
                                Pipelines: {r.categories.pipelines}
                              </span>
                            )}
                          </>
                        )}
                        {r.errors.length > 0 && (
                          <span className="text-red-700 bg-red-50 px-2 py-1 rounded">
                            Errors: {r.errors.length}
                          </span>
                        )}
                      </div>
                      {r.errors.length > 0 && (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-red-600 font-medium">
                            {r.errors.length} error{r.errors.length > 1 ? 's' : ''}
                          </summary>
                          <ul className="mt-2 space-y-1 pl-4 text-red-600">
                            {r.errors.map((err, i) => (
                              <li key={i}>• {err}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
