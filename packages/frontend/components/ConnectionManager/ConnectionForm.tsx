'use client';

import { useState } from 'react';
import { ConnectionType, CreateConnectionDto } from '@/types';
import { Button } from '@/components/ui/button';

interface ConnectionFormProps {
  onSubmit: (data: CreateConnectionDto) => Promise<void>;
}

const DEFAULT_PORTS: Record<ConnectionType, number | undefined> = {
  postgresql: 5432,
  mysql: 3306,
  redshift: 5439,
  snowflake: undefined,
  bigquery: undefined,
};

const TYPE_LABELS: Record<ConnectionType, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  redshift: 'Amazon Redshift',
  snowflake: 'Snowflake',
  bigquery: 'Google BigQuery',
};

const STANDARD_TYPES: ConnectionType[] = ['postgresql', 'mysql', 'redshift'];
const NEEDS_PORT = (type: ConnectionType) => STANDARD_TYPES.includes(type);
const NEEDS_HOST = (type: ConnectionType) => type !== 'bigquery';
const NEEDS_CREDENTIALS = (type: ConnectionType) => type !== 'bigquery';
const IS_SNOWFLAKE = (type: ConnectionType) => type === 'snowflake';
const IS_BIGQUERY = (type: ConnectionType) => type === 'bigquery';

export default function ConnectionForm({ onSubmit }: ConnectionFormProps) {
  const [formData, setFormData] = useState<CreateConnectionDto>({
    name: '',
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    username: '',
    password: '',
    database: '',
    ssl: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTypeChange = (type: ConnectionType) => {
    setFormData({
      name: formData.name,
      type,
      host: type !== 'bigquery' ? (type === 'snowflake' ? '' : 'localhost') : undefined,
      port: DEFAULT_PORTS[type],
      username: type !== 'bigquery' ? '' : undefined,
      password: type !== 'bigquery' ? '' : undefined,
      database: '',
      ssl: STANDARD_TYPES.includes(type) ? false : undefined,
      warehouse: undefined,
      keyFile: undefined,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await onSubmit(formData);
      setFormData({
        name: '',
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        username: '',
        password: '',
        database: '',
        ssl: false,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create connection');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'mt-1 block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none';
  const labelClass = 'block text-sm font-medium text-[#555555]';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-[#fee2e2] border border-[#fca5a5] text-[#991b1b] px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Name */}
        <div>
          <label className={labelClass}>Connection Name *</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={inputClass}
            placeholder="My Database"
          />
        </div>

        {/* Type */}
        <div>
          <label className={labelClass}>Database Type *</label>
          <select
            required
            value={formData.type}
            onChange={(e) => handleTypeChange(e.target.value as ConnectionType)}
            className={inputClass}
          >
            {(Object.entries(TYPE_LABELS) as [ConnectionType, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Host / Account (not BigQuery) */}
        {NEEDS_HOST(formData.type) && (
          <div>
            <label className={labelClass}>
              {IS_SNOWFLAKE(formData.type) ? 'Account Identifier *' : 'Host *'}
            </label>
            <input
              type="text"
              required
              value={formData.host || ''}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              className={inputClass}
              placeholder={IS_SNOWFLAKE(formData.type) ? 'myorg-myaccount' : 'localhost'}
            />
            {IS_SNOWFLAKE(formData.type) && (
              <p className="mt-1 text-xs text-[#aaaaaa]">e.g. myorg-myaccount.us-east-1</p>
            )}
          </div>
        )}

        {/* Port (PostgreSQL, MySQL, Redshift only) */}
        {NEEDS_PORT(formData.type) && (
          <div>
            <label className={labelClass}>Port *</label>
            <input
              type="number"
              required
              min="1"
              max="65535"
              value={formData.port ?? ''}
              onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value, 10) })}
              className={inputClass}
            />
          </div>
        )}

        {/* Username / Password (not BigQuery) */}
        {NEEDS_CREDENTIALS(formData.type) && (
          <>
            <div>
              <label className={labelClass}>Username *</label>
              <input
                type="text"
                required
                value={formData.username || ''}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className={inputClass}
                placeholder="admin"
              />
            </div>
            <div>
              <label className={labelClass}>Password *</label>
              <input
                type="password"
                required
                value={formData.password || ''}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
          </>
        )}

        {/* Database / Project ID */}
        <div>
          <label className={labelClass}>
            {IS_BIGQUERY(formData.type) ? 'Project ID *' : 'Database Name *'}
          </label>
          <input
            type="text"
            required
            value={formData.database}
            onChange={(e) => setFormData({ ...formData, database: e.target.value })}
            className={inputClass}
            placeholder={IS_BIGQUERY(formData.type) ? 'my-gcp-project' : 'mydb'}
          />
        </div>

        {/* Snowflake: Warehouse */}
        {IS_SNOWFLAKE(formData.type) && (
          <div>
            <label className={labelClass}>Warehouse</label>
            <input
              type="text"
              value={formData.warehouse || ''}
              onChange={(e) => setFormData({ ...formData, warehouse: e.target.value })}
              className={inputClass}
              placeholder="COMPUTE_WH"
            />
          </div>
        )}

        {/* BigQuery: Service Account Key */}
        {IS_BIGQUERY(formData.type) && (
          <div className="sm:col-span-2">
            <label className={labelClass}>Service Account Key JSON *</label>
            <textarea
              required
              rows={6}
              value={formData.keyFile || ''}
              onChange={(e) => setFormData({ ...formData, keyFile: e.target.value })}
              className={`${inputClass} font-mono text-xs resize-none`}
              placeholder='{"type":"service_account","project_id":"...","private_key":"..."}'
            />
            <p className="mt-1 text-xs text-[#aaaaaa]">
              Paste the full contents of your service account JSON key file.
            </p>
          </div>
        )}

        {/* SSL (standard types only) */}
        {STANDARD_TYPES.includes(formData.type) && (
          <div className="flex items-center">
            <input
              type="checkbox"
              id="ssl"
              checked={formData.ssl || false}
              onChange={(e) => setFormData({ ...formData, ssl: e.target.checked })}
              className="h-4 w-4 text-[#1a1a1a] focus:ring-[#1a1a1a] border-[#dddddd] rounded"
            />
            <label htmlFor="ssl" className="ml-2 block text-sm text-[#555555]">
              Enable SSL
            </label>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Connection'}
        </Button>
      </div>
    </form>
  );
}
