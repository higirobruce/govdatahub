'use client';

import Image from 'next/image';
import { ConnectionType } from '@/types';

// ── Labels ────────────────────────────────────────────────────────────────────
export const DB_LABELS: Record<ConnectionType, string> = {
  postgresql: 'PostgreSQL',
  mysql:      'MySQL',
  mongodb:    'MongoDB',
  redshift:   'Amazon Redshift',
  snowflake:  'Snowflake',
  bigquery:   'Google BigQuery',
  sqlserver:  'SQL Server',
  clickhouse: 'ClickHouse',
  sqlite:     'SQLite',
};

// ── Card styles (neutral — logos carry the brand identity) ───────────────────
export const DB_BG: Record<ConnectionType, string> = {
  postgresql: 'bg-white',
  mysql:      'bg-white',
  mongodb:    'bg-white',
  redshift:   'bg-white',
  snowflake:  'bg-white',
  bigquery:   'bg-white',
  sqlserver:  'bg-white',
  clickhouse: 'bg-white',
  sqlite:     'bg-white',
};

export const DB_BORDER: Record<ConnectionType, string> = {
  postgresql: 'border-gray-200',
  mysql:      'border-gray-200',
  mongodb:    'border-gray-200',
  redshift:   'border-gray-200',
  snowflake:  'border-gray-200',
  bigquery:   'border-gray-200',
  sqlserver:  'border-gray-200',
  clickhouse: 'border-gray-200',
  sqlite:     'border-gray-200',
};

// ── Types with a logo in /public/logos/ ───────────────────────────────────────
const LOGO_FILES: Partial<Record<ConnectionType, string>> = {
  postgresql: '/logos/postgresql.svg',
  mysql:      '/logos/mysql.svg',
  mongodb:    '/logos/mongodb.svg',
  sqlserver:  '/logos/sqlserver.svg',
  sqlite:     '/logos/sqlite.svg',
};

// ── Types without a logo yet — hidden from the UI until logos are added ───────
export const HIDDEN_TYPES: Set<ConnectionType> = new Set<ConnectionType>([
  'redshift',
  'snowflake',
  'bigquery',
  'clickhouse',
]);

// ── Component ─────────────────────────────────────────────────────────────────
interface DbIconProps {
  type: ConnectionType;
  size?: number;
  className?: string;
}

export function DbIcon({ type, size = 40, className }: DbIconProps) {
  const src = LOGO_FILES[type];
  if (!src) return null;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: 10,
        background: '#f5f5f5',
        padding: 6,
      }}
    >
      <Image
        src={src}
        alt={DB_LABELS[type]}
        width={size - 12}
        height={size - 12}
        style={{ objectFit: 'contain' }}
        unoptimized
      />
    </span>
  );
}
