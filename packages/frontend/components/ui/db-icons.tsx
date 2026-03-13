'use client';

import { ConnectionType } from '@/types';

interface DbIconProps {
  type: ConnectionType;
  size?: number;
  className?: string;
}

// ── PostgreSQL ──────────────────────────────────────────────────────────────
function PostgreSQLIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="12" fill="#336791" />
      <path d="M43.2 13.6c-1.4-.4-2.9-.6-4.4-.5-1.8.1-3.3.6-4.7 1.4-1.3-.3-2.6-.4-4-.4-7.8 0-14.1 5.4-14.1 12.1 0 2.5.9 4.9 2.5 6.8-.3.8-.5 1.6-.5 2.5 0 2 .8 3.8 2.2 5.1-.4 1.4-.3 2.9.3 4.3 1.2 2.8 4.3 4.4 8.3 4.4 2.1 0 4.1-.5 5.7-1.5.8.1 1.6.2 2.4.2 1.8 0 3.6-.4 5.1-1.2 2.9 1.2 6 1.3 8.1.1 2.1-1.2 3.1-3.4 2.8-5.9.4-.7.8-1.5 1-2.3.8-3.4-.2-7-2.8-9.7.4-1 .6-2.1.6-3.2 0-5.5-4.1-10.4-8.5-12.2z" fill="white" />
      <path d="M32 20c-4.4 0-8 2.7-8 6s3.6 6 8 6 8-2.7 8-6-3.6-6-8-6z" fill="#336791" />
      <ellipse cx="29" cy="25" rx="1.5" ry="2" fill="white" />
      <ellipse cx="35" cy="25" rx="1.5" ry="2" fill="white" />
      <path d="M27 30c1.4 1.2 3.2 1.8 5 1.8s3.6-.6 5-1.8" stroke="#336791" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ── MySQL ────────────────────────────────────────────────────────────────────
function MySQLIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="12" fill="#00758F" />
      <path d="M12 44V22l8 14 8-14v22" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M44 44V26M44 26c0-2.2-1.8-4-4-4H37c-2.2 0-4 1.8-4 4v4c0 2.2 1.8 4 4 4h3c2.2 0 4 1.8 4 4v2c0 2.2-1.8 4-4 4h-3c-2.2 0-4-1.8-4-4" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="50" cy="26" r="4" fill="#F29111" />
    </svg>
  );
}

// ── MongoDB ──────────────────────────────────────────────────────────────────
function MongoDBIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="12" fill="#13AA52" />
      <path d="M32 10c-1 8-10 14-10 22 0 5.5 4.5 10 10 10s10-4.5 10-10c0-8-9-14-10-22z" fill="white" />
      <rect x="30.5" y="40" width="3" height="14" rx="1.5" fill="white" />
    </svg>
  );
}

// ── Amazon Redshift ──────────────────────────────────────────────────────────
function RedshiftIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="12" fill="#8C4FFF" />
      <polygon points="32,12 52,24 52,40 32,52 12,40 12,24" fill="none" stroke="white" strokeWidth="3" />
      <polygon points="32,20 44,27 44,37 32,44 20,37 20,27" fill="white" fillOpacity="0.25" />
      <circle cx="32" cy="32" r="5" fill="white" />
    </svg>
  );
}

// ── Snowflake ────────────────────────────────────────────────────────────────
function SnowflakeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="12" fill="#29B5E8" />
      {/* vertical arm */}
      <line x1="32" y1="10" x2="32" y2="54" stroke="white" strokeWidth="4" strokeLinecap="round" />
      {/* horizontal arm */}
      <line x1="10" y1="32" x2="54" y2="32" stroke="white" strokeWidth="4" strokeLinecap="round" />
      {/* diagonal arms */}
      <line x1="15" y1="15" x2="49" y2="49" stroke="white" strokeWidth="4" strokeLinecap="round" />
      <line x1="49" y1="15" x2="15" y2="49" stroke="white" strokeWidth="4" strokeLinecap="round" />
      {/* center */}
      <circle cx="32" cy="32" r="5" fill="#29B5E8" stroke="white" strokeWidth="3" />
      {/* tips */}
      {[0, 60, 120, 180, 240, 300].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x = 32 + 21 * Math.cos(rad);
        const y = 32 + 21 * Math.sin(rad);
        return <circle key={i} cx={x} cy={y} r="2.5" fill="white" />;
      })}
    </svg>
  );
}

// ── BigQuery ─────────────────────────────────────────────────────────────────
function BigQueryIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="12" fill="#4285F4" />
      <circle cx="30" cy="29" r="12" stroke="white" strokeWidth="3.5" fill="none" />
      <line x1="39" y1="38" x2="52" y2="51" stroke="white" strokeWidth="4" strokeLinecap="round" />
      <line x1="24" y1="29" x2="36" y2="29" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="30" y1="23" x2="30" y2="35" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ── SQL Server ───────────────────────────────────────────────────────────────
function SQLServerIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="12" fill="#CC2927" />
      <ellipse cx="32" cy="20" rx="18" ry="8" fill="white" />
      <path d="M14 20v8c0 4.4 8.1 8 18 8s18-3.6 18-8v-8" fill="white" fillOpacity="0.7" />
      <path d="M14 28v8c0 4.4 8.1 8 18 8s18-3.6 18-8v-8" fill="white" fillOpacity="0.4" />
      <ellipse cx="32" cy="44" rx="18" ry="8" fill="white" fillOpacity="0.3" />
    </svg>
  );
}

// ── ClickHouse ───────────────────────────────────────────────────────────────
function ClickHouseIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="12" fill="#FFCC00" />
      <rect x="10" y="14" width="8" height="36" rx="3" fill="#1a1a1a" />
      <rect x="22" y="14" width="8" height="36" rx="3" fill="#1a1a1a" />
      <rect x="34" y="14" width="8" height="36" rx="3" fill="#1a1a1a" />
      <rect x="46" y="25" width="8" height="14" rx="3" fill="#1a1a1a" fillOpacity="0.35" />
    </svg>
  );
}

// ── SQLite ───────────────────────────────────────────────────────────────────
function SQLiteIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="12" fill="#003B57" />
      <path d="M20 12h14c7 0 12 5 12 12v16c0 7-5 12-12 12H20V12z" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2.5" />
      <path d="M20 12v40" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M26 22h10M26 30h10M26 38h6" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// ── Icon map ──────────────────────────────────────────────────────────────────
const ICON_MAP: Record<ConnectionType, (props: { size: number }) => JSX.Element> = {
  postgresql: PostgreSQLIcon,
  mysql: MySQLIcon,
  mongodb: MongoDBIcon,
  redshift: RedshiftIcon,
  snowflake: SnowflakeIcon,
  bigquery: BigQueryIcon,
  sqlserver: SQLServerIcon,
  clickhouse: ClickHouseIcon,
  sqlite: SQLiteIcon,
};

export function DbIcon({ type, size = 40, className }: DbIconProps) {
  const Icon = ICON_MAP[type];
  if (!Icon) return null;
  return (
    <span className={className} style={{ display: 'inline-flex', flexShrink: 0 }}>
      <Icon size={size} />
    </span>
  );
}

// Background color per type (for subtle card tinting)
export const DB_BG: Record<ConnectionType, string> = {
  postgresql: 'bg-blue-50',
  mysql: 'bg-orange-50',
  mongodb: 'bg-green-50',
  redshift: 'bg-purple-50',
  snowflake: 'bg-sky-50',
  bigquery: 'bg-blue-50',
  sqlserver: 'bg-red-50',
  clickhouse: 'bg-yellow-50',
  sqlite: 'bg-slate-50',
};

export const DB_BORDER: Record<ConnectionType, string> = {
  postgresql: 'border-blue-200',
  mysql: 'border-orange-200',
  mongodb: 'border-green-200',
  redshift: 'border-purple-200',
  snowflake: 'border-sky-200',
  bigquery: 'border-blue-200',
  sqlserver: 'border-red-200',
  clickhouse: 'border-yellow-200',
  sqlite: 'border-slate-300',
};

export const DB_LABELS: Record<ConnectionType, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  redshift: 'Amazon Redshift',
  snowflake: 'Snowflake',
  bigquery: 'Google BigQuery',
  sqlserver: 'SQL Server',
  clickhouse: 'ClickHouse',
  sqlite: 'SQLite',
};
