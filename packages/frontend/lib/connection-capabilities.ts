export type ConnectionType =
  | 'postgresql'
  | 'mysql'
  | 'redshift'
  | 'sqlserver'
  | 'mongodb'
  | 'sqlite'
  | 'clickhouse'
  | 'bigquery'
  | 'snowflake';

const SQL_TYPES = new Set(['postgresql', 'mysql', 'redshift', 'sqlserver']);
const FDW_TYPES = new Set(['postgresql', 'mysql', 'redshift', 'sqlserver']);

export const isSqlBased = (type: string): boolean => SQL_TYPES.has(type);
export const supportsCrossQuery = (type: string): boolean => FDW_TYPES.has(type);
export const usesFdw = (type: string): boolean => FDW_TYPES.has(type);
export const supportsTransformations = (_type: string): boolean => true;
export const supportsIngestionWrite = (type: string): boolean => SQL_TYPES.has(type);

/**
 * Generate a default source query for a non-FDW connection.
 * Used in the cross-query builder to pre-populate the source query editor.
 */
export function defaultSourceQuery(
  type: string,
  schemaName: string,
  tableName: string,
): string {
  if (type === 'mongodb') {
    return JSON.stringify({ collection: tableName, filter: {}, limit: 10000 }, null, 2);
  }
  const fqTable = schemaName
    ? `"${schemaName}"."${tableName}"`
    : `"${tableName}"`;
  return `SELECT * FROM ${fqTable} LIMIT 10000`;
}

export interface CapabilityChip {
  label: string;
  title: string;
  variant: 'green' | 'gray';
}

export function getCapabilityChips(type: string): CapabilityChip[] {
  return [
    {
      label: 'Query',
      title: 'Supports the Query page',
      variant: 'green',
    },
    {
      label: 'Cross-query',
      title: usesFdw(type)
        ? 'Joins via FDW — fast, real-time'
        : 'Joins via materialization — data snapshotted at query time',
      variant: 'green',
    },
    {
      label: 'Transforms',
      title: 'Can be used as a transformation source',
      variant: 'green',
    },
  ];
}
