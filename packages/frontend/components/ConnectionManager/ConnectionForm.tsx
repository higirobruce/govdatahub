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
  mongodb: 27017,
  sqlserver: 1433,
  clickhouse: 8123,
  sqlite: undefined,
  duckdb: undefined,
  elasticsearch: 9200,
  cassandra: 9042,
};

const TYPE_LABELS: Record<ConnectionType, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  redshift: 'Amazon Redshift',
  snowflake: 'Snowflake',
  bigquery: 'Google BigQuery',
  mongodb: 'MongoDB',
  sqlserver: 'Microsoft SQL Server',
  clickhouse: 'ClickHouse',
  sqlite: 'SQLite',
  duckdb: 'DuckDB',
  elasticsearch: 'Elasticsearch',
  cassandra: 'Cassandra / ScyllaDB',
};

/** Types with no host field (in-process or cloud-credential-based) */
const NO_HOST_TYPES: ConnectionType[] = ['bigquery', 'sqlite', 'duckdb'];
/** Types with no port field */
const NO_PORT_TYPES: ConnectionType[] = ['bigquery', 'snowflake', 'sqlite', 'duckdb'];
/** Types that hide the credentials fields entirely */
const NO_CREDS_TYPES: ConnectionType[] = ['bigquery', 'sqlite', 'duckdb'];
/** Types that show credentials but don't require them */
const OPTIONAL_CREDS_TYPES: ConnectionType[] = ['elasticsearch', 'cassandra'];
/** Types that expose the SSL toggle */
const SSL_TYPES: ConnectionType[] = [
  'postgresql', 'mysql', 'redshift', 'sqlserver', 'clickhouse', 'elasticsearch', 'cassandra',
];
/** File-path database types */
const FILE_DB_TYPES: ConnectionType[] = ['sqlite', 'duckdb'];

const NEEDS_HOST = (t: ConnectionType) => !NO_HOST_TYPES.includes(t);
const NEEDS_PORT = (t: ConnectionType) => !NO_PORT_TYPES.includes(t);
/** Whether to render the credentials fields at all */
const SHOWS_CREDENTIALS = (t: ConnectionType) => !NO_CREDS_TYPES.includes(t);
/** Whether the credentials fields carry the HTML `required` attribute */
const REQUIRES_CREDENTIALS = (t: ConnectionType) =>
  !NO_CREDS_TYPES.includes(t) && !OPTIONAL_CREDS_TYPES.includes(t);

const IS_SNOWFLAKE = (t: ConnectionType) => t === 'snowflake';
const IS_BIGQUERY = (t: ConnectionType) => t === 'bigquery';
const IS_MONGODB = (t: ConnectionType) => t === 'mongodb';
const IS_FILE_DB = (t: ConnectionType) => FILE_DB_TYPES.includes(t);

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
      host: NEEDS_HOST(type) ? (IS_SNOWFLAKE(type) ? '' : 'localhost') : undefined,
      port: DEFAULT_PORTS[type],
      username: SHOWS_CREDENTIALS(type) ? '' : undefined,
      password: SHOWS_CREDENTIALS(type) ? '' : undefined,
      database: '',
      ssl: SSL_TYPES.includes(type) ? false : undefined,
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

        {/* Host / Account */}
        {NEEDS_HOST(formData.type) && (
          <div className={IS_MONGODB(formData.type) ? 'sm:col-span-2' : ''}>
            <label className={labelClass}>
              {IS_SNOWFLAKE(formData.type)
                ? 'Account Identifier *'
                : IS_MONGODB(formData.type)
                  ? 'Host or Connection URI *'
                  : 'Host *'}
            </label>
            <input
              type="text"
              required
              value={formData.host || ''}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              className={inputClass}
              placeholder={
                IS_SNOWFLAKE(formData.type)
                  ? 'myorg-myaccount'
                  : IS_MONGODB(formData.type)
                    ? 'localhost  or  mongodb+srv://user:pass@cluster.mongodb.net/db'
                    : 'localhost'
              }
            />
            {IS_SNOWFLAKE(formData.type) && (
              <p className="mt-1 text-xs text-[#aaaaaa]">e.g. myorg-myaccount.us-east-1</p>
            )}
            {IS_MONGODB(formData.type) && (
              <p className="mt-1 text-xs text-[#aaaaaa]">
                For Atlas, paste the full <code>mongodb+srv://</code> URI here and leave other
                fields blank.
              </p>
            )}
          </div>
        )}

        {/* Port */}
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

        {/* Username / Password */}
        {SHOWS_CREDENTIALS(formData.type) && (
          <>
            <div>
              <label className={labelClass}>
                {REQUIRES_CREDENTIALS(formData.type) ? 'Username *' : 'Username'}
              </label>
              <input
                type="text"
                required={REQUIRES_CREDENTIALS(formData.type)}
                value={formData.username || ''}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className={inputClass}
                placeholder="admin"
              />
            </div>
            <div>
              <label className={labelClass}>
                {REQUIRES_CREDENTIALS(formData.type) ? 'Password *' : 'Password'}
              </label>
              <input
                type="password"
                required={REQUIRES_CREDENTIALS(formData.type)}
                value={formData.password || ''}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
          </>
        )}

        {/* Database / Project ID / File Path */}
        <div className={IS_FILE_DB(formData.type) ? 'sm:col-span-2' : ''}>
          <label className={labelClass}>
            {IS_BIGQUERY(formData.type)
              ? 'Project ID *'
              : IS_FILE_DB(formData.type)
                ? 'File Path *'
                : formData.type === 'cassandra'
                  ? 'Keyspace *'
                  : 'Database Name *'}
          </label>
          <input
            type="text"
            required
            value={formData.database}
            onChange={(e) => setFormData({ ...formData, database: e.target.value })}
            className={inputClass}
            placeholder={
              IS_BIGQUERY(formData.type)
                ? 'my-gcp-project'
                : IS_FILE_DB(formData.type)
                  ? '/data/mydb.' + (formData.type === 'duckdb' ? 'duckdb' : 'sqlite3') + '  or  :memory:'
                  : formData.type === 'cassandra'
                    ? 'my_keyspace'
                    : 'mydb'
            }
          />
          {IS_FILE_DB(formData.type) && (
            <p className="mt-1 text-xs text-[#aaaaaa]">
              Absolute path to the {formData.type === 'duckdb' ? 'DuckDB' : 'SQLite'} file, or{' '}
              <code>:memory:</code> for an in-memory database.
              {formData.type === 'duckdb' && (
                <> DuckDB can also query Parquet and CSV files via <code>read_parquet()</code>.</>
              )}
            </p>
          )}
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

        {/* SSL */}
        {SSL_TYPES.includes(formData.type) && (
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
