'use client';

import { QueryDefinition } from '@/types/cross-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Code } from 'lucide-react';

interface QueryPreviewProps {
  queryDefinition: QueryDefinition;
}

export function QueryPreview({ queryDefinition }: QueryPreviewProps) {
  const generatePreviewSql = (): string => {
    try {
      const { tables, joins, columns, filters, orderBy, limit } = queryDefinition;

      if (tables.length === 0 || columns.length === 0) {
        return '-- No query to preview';
      }

      let sql = 'SELECT\n  ';

      // Columns
      sql += columns
        .map((col) => {
          const ref = `${col.table}.${col.column}`;
          return col.alias ? `${ref} AS ${col.alias}` : ref;
        })
        .join(',\n  ');

      // FROM clause
      sql += `\nFROM ${tables[0].alias}`;

      // JOINs
      if (joins && joins.length > 0) {
        joins.forEach((join) => {
          sql += `\n${join.type} JOIN ${join.rightTable}`;
          sql += `\n  ON ${join.conditions
            .map(
              (cond) =>
                `${join.leftTable}.${cond.leftColumn} ${cond.operator} ${join.rightTable}.${cond.rightColumn}`
            )
            .join(' AND ')}`;
        });
      }

      // WHERE clause
      if (filters && filters.length > 0) {
        sql += '\nWHERE\n  ';
        sql += filters
          .map((filter) => {
            const column = `${filter.table}.${filter.column}`;
            if (filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL') {
              return `${column} ${filter.operator}`;
            }
            const value =
              typeof filter.value === 'string' ? `'${filter.value}'` : filter.value;
            return `${column} ${filter.operator} ${value}`;
          })
          .join('\n  AND ');
      }

      // ORDER BY clause
      if (orderBy && orderBy.length > 0) {
        sql += '\nORDER BY\n  ';
        sql += orderBy
          .map((order) => `${order.table}.${order.column} ${order.direction}`)
          .join(',\n  ');
      }

      // LIMIT clause
      if (limit) {
        sql += `\nLIMIT ${limit}`;
      }

      return sql;
    } catch (error) {
      return '-- Error generating preview';
    }
  };

  const sql = generatePreviewSql();

  if (sql === '-- No query to preview') {
    return (
      <Alert>
        <AlertDescription>
          Select tables and columns to see the query preview
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Code className="h-4 w-4" />
        <span>Generated SQL Preview</span>
      </div>
      <div className="bg-muted rounded-md p-4 overflow-x-auto">
        <pre className="text-sm font-mono whitespace-pre">{sql}</pre>
      </div>
      <p className="text-xs text-muted-foreground">
        Note: This is a simplified preview. The actual SQL will include foreign table
        references.
      </p>
    </div>
  );
}
