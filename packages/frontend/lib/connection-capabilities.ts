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
export const supportsTransformations = (type: string): boolean => SQL_TYPES.has(type);
export const supportsIngestionWrite = (type: string): boolean => SQL_TYPES.has(type);

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
      title: supportsCrossQuery(type)
        ? 'Can participate in cross-database joins'
        : 'No FDW adapter — cannot join across databases',
      variant: supportsCrossQuery(type) ? 'green' : 'gray',
    },
    {
      label: 'Transforms',
      title: supportsTransformations(type)
        ? 'Can be used as a transformation source'
        : 'Cannot be used as a transformation source',
      variant: supportsTransformations(type) ? 'green' : 'gray',
    },
  ];
}
