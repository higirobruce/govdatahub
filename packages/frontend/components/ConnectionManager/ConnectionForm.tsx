'use client';

import { useState } from 'react';
import { ConnectionType, CreateConnectionDto } from '@/types';
import { Button } from '@/components/ui/button';
import { DbIcon, DB_LABELS, DB_BORDER, DB_BG } from '@/components/ui/db-icons';

interface ConnectionFormProps {
  onSubmit: (data: CreateConnectionDto) => Promise<void>;
  onCancel?: () => void;
}

const ALL_TYPES: ConnectionType[] = [
  'postgresql',
  'mysql',
  'mongodb',
  'redshift',
  'snowflake',
  'bigquery',
  'sqlserver',
  'clickhouse',
  'sqlite',
];

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
};

const NO_HOST_TYPES: ConnectionType[] = ['bigquery', 'sqlite'];
const NO_PORT_TYPES: ConnectionType[] = ['bigquery', 'snowflake', 'sqlite'];
const NO_CREDS_TYPES: ConnectionType[] = ['bigquery', 'sqlite'];
const SSL_TYPES: ConnectionType[] = ['postgresql', 'mysql', 'redshift', 'sqlserver', 'clickhouse'];

const NEEDS_HOST = (t: ConnectionType) => !NO_HOST_TYPES.includes(t);
const NEEDS_PORT = (t: ConnectionType) => !NO_PORT_TYPES.includes(t);
const NEEDS_CREDENTIALS = (t: ConnectionType) => !NO_CREDS_TYPES.includes(t);
const IS_SNOWFLAKE = (t: ConnectionType) => t === 'snowflake';
const IS_BIGQUERY = (t: ConnectionType) => t === 'bigquery';
const IS_MONGODB = (t: ConnectionType) => t === 'mongodb';
const IS_SQLITE = (t: ConnectionType) => t === 'sqlite';

const initialData = (): CreateConnectionDto => ({
  name: '',
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  username: '',
  password: '',
  database: '',
  ssl: false,
});

export default function ConnectionForm({ onSubmit, onCancel }: ConnectionFormProps) {
  const [step, setStep] = useState<'pick-type' | 'configure'>('pick-type');
  const [formData, setFormData] = useState<CreateConnectionDto>(initialData());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTypeSelect = (type: ConnectionType) => {
    setFormData({
      name: '',
      type,
      host: NEEDS_HOST(type) ? (IS_SNOWFLAKE(type) ? '' : 'localhost') : undefined,
      port: DEFAULT_PORTS[type],
      username: NEEDS_CREDENTIALS(type) ? '' : undefined,
      password: NEEDS_CREDENTIALS(type) ? '' : undefined,
      database: '',
      ssl: SSL_TYPES.includes(type) ? false : undefined,
      warehouse: undefined,
      keyFile: undefined,
    });
    setStep('configure');
    setError(null);
  };

  const handleBack = () => {
    setStep('pick-type');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(formData);
      setFormData(initialData());
      setStep('pick-type');
    } catch (err: any) {
      setError(err.message || 'Failed to create connection');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'mt-1 block w-full rounded-lg border border-[#dddddd] px-3 py-2.5 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none bg-white';
  const labelClass = 'block text-xs font-semibold text-[#555555] uppercase tracking-wide';

  // ── Step 1: type picker ──────────────────────────────────────────────────
  if (step === 'pick-type') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[#777777]">Choose the database engine you want to connect to.</p>
        <div className="grid grid-cols-3 gap-3">
          {ALL_TYPES.map((type) => {
            const border = DB_BORDER[type] ?? 'border-gray-200';
            const bg = DB_BG[type] ?? 'bg-gray-50';
            return (
              <button
                key={type}
                onClick={() => handleTypeSelect(type)}
                className={`flex flex-col items-center gap-2.5 rounded-2xl border-2 ${border} ${bg}
                  p-4 text-center cursor-pointer hover:shadow-md hover:scale-[1.03]
                  transition-all duration-150 active:scale-[0.98]`}
              >
                <DbIcon type={type} size={44} className="rounded-xl overflow-hidden shadow-sm" />
                <span className="text-[11px] font-semibold text-[#333333] leading-tight">
                  {DB_LABELS[type]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Step 2: configuration form ───────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Selected type header */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-[#f7f7f7] border border-[#ececec]">
        <DbIcon type={formData.type} size={36} className="rounded-lg overflow-hidden shadow-sm" />
        <div>
          <p className="text-sm font-semibold text-[#1a1a1a]">{DB_LABELS[formData.type]}</p>
          <button
            type="button"
            onClick={handleBack}
            className="text-xs text-[#888888] hover:text-[#1a1a1a] underline underline-offset-2 transition-colors"
          >
            Change database type
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-[#fee2e2] border border-[#fca5a5] text-[#991b1b] px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Connection Name */}
      <div>
        <label className={labelClass}>Connection Name *</label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={inputClass}
          placeholder={`My ${DB_LABELS[formData.type]}`}
          autoFocus
        />
      </div>

      {/* Host / Account / URI */}
      {NEEDS_HOST(formData.type) && (
        <div>
          <label className={labelClass}>
            {IS_SNOWFLAKE(formData.type) ? 'Account Identifier *' : IS_MONGODB(formData.type) ? 'Host or Connection URI *' : 'Host *'}
          </label>
          <input
            type="text"
            required
            value={formData.host || ''}
            onChange={(e) => setFormData({ ...formData, host: e.target.value })}
            className={inputClass}
            placeholder={
              IS_SNOWFLAKE(formData.type)
                ? 'myorg-myaccount.us-east-1'
                : IS_MONGODB(formData.type)
                  ? 'localhost  or  mongodb+srv://user:pass@cluster.mongodb.net/db'
                  : 'localhost'
            }
          />
          {IS_MONGODB(formData.type) && (
            <p className="mt-1 text-xs text-[#aaaaaa]">
              For Atlas, paste the full <code>mongodb+srv://</code> URI here and leave other fields blank.
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
      {NEEDS_CREDENTIALS(formData.type) && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Username *</label>
            <input
              type="text"
              required
              value={formData.username || ''}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className={inputClass}
              placeholder="admin"
              autoComplete="off"
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
              autoComplete="new-password"
            />
          </div>
        </div>
      )}

      {/* Database / Project ID / File Path */}
      <div>
        <label className={labelClass}>
          {IS_BIGQUERY(formData.type) ? 'Project ID *' : IS_SQLITE(formData.type) ? 'File Path *' : 'Database Name *'}
        </label>
        <input
          type="text"
          required
          value={formData.database}
          onChange={(e) => setFormData({ ...formData, database: e.target.value })}
          className={inputClass}
          placeholder={
            IS_BIGQUERY(formData.type) ? 'my-gcp-project' : IS_SQLITE(formData.type) ? '/data/mydb.sqlite3' : 'mydb'
          }
        />
        {IS_SQLITE(formData.type) && (
          <p className="mt-1 text-xs text-[#aaaaaa]">
            Absolute path to the SQLite file, or <code>:memory:</code> for in-memory.
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

      {/* BigQuery: Service Account JSON */}
      {IS_BIGQUERY(formData.type) && (
        <div>
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

      {/* SSL toggle */}
      {SSL_TYPES.includes(formData.type) && (
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={formData.ssl || false}
              onChange={(e) => setFormData({ ...formData, ssl: e.target.checked })}
            />
            <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-[#1a1a1a] transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
          </div>
          <span className="text-sm text-[#555555]">Enable SSL / TLS</span>
        </label>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? 'Creating…' : 'Create Connection'}
        </Button>
      </div>
    </form>
  );
}
