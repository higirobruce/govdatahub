'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { AiConfig, AiProvider, UpsertAiConfigDto } from '@/types';
import { Button } from '@/components/ui/button';

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  ollama: 'Ollama (Local)',
};

const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o-mini',
  ollama: 'llama3',
};

export default function SettingsPage() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [form, setForm] = useState<UpsertAiConfigDto>({
    provider: 'anthropic',
    apiKey: '',
    model: '',
    ollamaUrl: '',
    ollamaModel: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api.ai.getConfig()
      .then((cfg: AiConfig) => {
        setConfig(cfg);
        setForm({
          provider: cfg.provider,
          apiKey: '',
          model: cfg.model || '',
          ollamaUrl: cfg.ollamaUrl || '',
          ollamaModel: cfg.ollamaModel || '',
        });
      })
      .catch(() => {
        // No config yet — use defaults
      })
      .finally(() => setLoading(false));
  }, []);

  const handleProviderChange = (provider: AiProvider) => {
    setForm({ ...form, provider, model: DEFAULT_MODELS[provider] });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload: UpsertAiConfigDto = { provider: form.provider };
      if (form.apiKey) payload.apiKey = form.apiKey;
      if (form.model) payload.model = form.model;
      if (form.ollamaUrl) payload.ollamaUrl = form.ollamaUrl;
      if (form.ollamaModel) payload.ollamaModel = form.ollamaModel;

      const updated: AiConfig = await api.ai.upsertConfig(payload);
      setConfig(updated);
      setForm({ ...form, apiKey: '' });
      setMessage({ type: 'success', text: 'AI configuration saved.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save configuration.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove AI configuration? The NL2SQL feature will stop working.')) return;
    setDeleting(true);
    setMessage(null);
    try {
      await api.ai.deleteConfig();
      setConfig(null);
      setForm({ provider: 'anthropic', apiKey: '', model: '', ollamaUrl: '', ollamaModel: '' });
      setMessage({ type: 'success', text: 'AI configuration removed.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to remove configuration.' });
    } finally {
      setDeleting(false);
    }
  };

  const inputClass = 'mt-1 block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none';
  const labelClass = 'block text-sm font-medium text-[#555555]';

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1a1a1a]">Settings</h1>
        <p className="mt-1 text-sm text-[#555555]">Configure platform-wide settings for your organization.</p>
      </div>

      <div className="bg-white border border-[#f0f0f0] rounded-lg p-6">
        <h2 className="text-lg font-medium text-[#1a1a1a] mb-1">AI Provider</h2>
        <p className="text-sm text-[#555555] mb-5">
          Used for the Natural Language to SQL feature in the query editor.
          API keys are encrypted and stored securely — they are never returned to the browser.
        </p>

        {loading ? (
          <p className="text-sm text-[#aaaaaa]">Loading...</p>
        ) : (
          <>
            {config?.hasApiKey && (
              <div className="mb-4 px-3 py-2 bg-[#d1fae5] border border-[#6ee7b7] rounded text-sm text-[#065f46]">
                AI is configured: <strong>{PROVIDER_LABELS[config.provider]}</strong>
                {config.model && <span> · Model: {config.model}</span>}
              </div>
            )}

            {message && (
              <div className={`mb-4 px-3 py-2 rounded text-sm border ${
                message.type === 'success'
                  ? 'bg-[#d1fae5] border-[#6ee7b7] text-[#065f46]'
                  : 'bg-[#fee2e2] border-[#fca5a5] text-[#991b1b]'
              }`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className={labelClass}>Provider *</label>
                <select
                  value={form.provider}
                  onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
                  className={inputClass}
                >
                  {(Object.entries(PROVIDER_LABELS) as [AiProvider, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {form.provider !== 'ollama' && (
                <div>
                  <label className={labelClass}>
                    API Key {config?.hasApiKey ? '(leave blank to keep existing)' : '*'}
                  </label>
                  <input
                    type="password"
                    value={form.apiKey}
                    required={!config?.hasApiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder={config?.hasApiKey ? '••••••••  (stored)' : 'sk-...'}
                    className={inputClass}
                  />
                </div>
              )}

              {form.provider === 'ollama' && (
                <>
                  <div>
                    <label className={labelClass}>Ollama Base URL</label>
                    <input
                      type="text"
                      value={form.ollamaUrl}
                      onChange={(e) => setForm({ ...form, ollamaUrl: e.target.value })}
                      placeholder="http://localhost:11434"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Model</label>
                    <input
                      type="text"
                      value={form.ollamaModel}
                      onChange={(e) => setForm({ ...form, ollamaModel: e.target.value })}
                      placeholder="llama3"
                      className={inputClass}
                    />
                  </div>
                </>
              )}

              {form.provider !== 'ollama' && (
                <div>
                  <label className={labelClass}>Model</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder={DEFAULT_MODELS[form.provider]}
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-[#aaaaaa]">
                    {form.provider === 'anthropic' && 'e.g. claude-sonnet-4-5, claude-opus-4-5'}
                    {form.provider === 'openai' && 'e.g. gpt-4o-mini, gpt-4o'}
                  </p>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
                {config?.hasApiKey && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-[#ef4444] border-[#fca5a5] hover:bg-[#fee2e2]"
                  >
                    {deleting ? 'Removing...' : 'Remove Configuration'}
                  </Button>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
