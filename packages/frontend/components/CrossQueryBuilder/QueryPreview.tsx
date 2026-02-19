'use client';

import { QueryDefinition } from '@/types';

interface QueryPreviewProps {
  queryDefinition: QueryDefinition;
}

export function QueryPreview({ queryDefinition }: QueryPreviewProps) {
  // Generate SQL preview (simplified version - actual SQL generation happens on backend)
  const generatePreviewSQL = (): string => {
    if (queryDefinition.tables.length === 0) {
      return '-- Add tables to see SQL preview';
    }

    if (queryDefinition.columns.length === 0) {
      return '-- Select columns to see SQL preview';
    }

    const lines: string[] = [];

    // SELECT clause
    const columnList = queryDefinition.columns.map((col) => {
      return col.alias
        ? `${col.table}.${col.column} AS ${col.alias}`
        : `${col.table}.${col.column}`;
    });
    lines.push(`SELECT ${columnList.join(', ')}`);

    // FROM clause
    const firstTable = queryDefinition.tables[0];
    lines.push(`FROM ${firstTable.schemaName}.${firstTable.tableName} AS ${firstTable.alias}`);

    // JOIN clauses
    queryDefinition.joins.forEach((join) => {
      const conditions = join.conditions
        .map((c) => `${join.leftTable}.${c.leftColumn} ${c.operator} ${join.rightTable}.${c.rightColumn}`)
        .join(' AND ');

      const rightTable = queryDefinition.tables.find((t) => t.alias === join.rightTable);
      if (rightTable) {
        lines.push(
          `${join.type} JOIN ${rightTable.schemaName}.${rightTable.tableName} AS ${rightTable.alias} ON ${conditions}`
        );
      }
    });

    // WHERE clause
    if (queryDefinition.filters && queryDefinition.filters.length > 0) {
      const conditions = queryDefinition.filters.map((f) => {
        if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
          return `${f.table}.${f.column} ${f.operator}`;
        }
        return `${f.table}.${f.column} ${f.operator} '${f.value}'`;
      });
      lines.push(`WHERE ${conditions.join(' AND ')}`);
    }

    // ORDER BY clause
    if (queryDefinition.orderBy && queryDefinition.orderBy.length > 0) {
      const orderClauses = queryDefinition.orderBy.map(
        (o) => `${o.table}.${o.column} ${o.direction}`
      );
      lines.push(`ORDER BY ${orderClauses.join(', ')}`);
    }

    // LIMIT clause
    if (queryDefinition.limit) {
      lines.push(`LIMIT ${queryDefinition.limit}`);
    }

    return lines.join('\n');
  };

  const sql = generatePreviewSQL();

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <pre className="text-xs font-mono bg-gray-900 text-gray-100 p-3 rounded-md overflow-x-auto">
          {sql}
        </pre>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Preview only - actual SQL may differ based on database type
      </div>
    </div>
  );
}
