import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { QueryDefinitionDto } from './dto/query-definition.dto';

@Injectable()
export class QueryBuilderService {
  private readonly logger = new Logger(QueryBuilderService.name);

  /**
   * Generate SQL from query definition
   */
  generateSqlFromDefinition(
    queryDef: QueryDefinitionDto,
    foreignTableMap: Map<string, string>,
  ): string {
    // Validate query definition
    this.validateQueryDefinition(queryDef);

    // SELECT clause
    const selectColumns = queryDef.columns.map((col) => {
      // Validate that the table alias exists
      const foreignTable = foreignTableMap.get(col.table);
      if (!foreignTable) {
        throw new BadRequestException(
          `Table alias '${col.table}' not found in query`,
        );
      }

      // Use table alias, not the full foreign table name
      let columnRef = `${this.quoteIdent(col.table)}.${this.quoteIdent(col.column)}`;

      // Wrap with aggregate function if specified
      if (col.aggregate) {
        if (col.aggregate === 'COUNT_DISTINCT') {
          columnRef = `COUNT(DISTINCT ${columnRef})`;
        } else {
          columnRef = `${col.aggregate}(${columnRef})`;
        }
      }

      return col.alias
        ? `${columnRef} AS ${this.quoteIdent(col.alias)}`
        : columnRef;
    });

    if (selectColumns.length === 0) {
      throw new BadRequestException('No columns selected');
    }

    let sql = `SELECT ${selectColumns.join(', ')}`;

    // FROM clause (first table)
    const firstTable = queryDef.tables[0];
    const fromTable = foreignTableMap.get(firstTable.alias);
    if (!fromTable) {
      throw new BadRequestException(
        `Table alias '${firstTable.alias}' not found`,
      );
    }
    sql += ` FROM ${fromTable} AS ${this.quoteIdent(firstTable.alias)}`;

    // JOIN clauses
    for (const join of queryDef.joins) {
      const rightTable = foreignTableMap.get(join.rightTable);
      if (!rightTable) {
        throw new BadRequestException(
          `Table alias '${join.rightTable}' not found in join`,
        );
      }

      const conditions = join.conditions
        .map((cond) => {
          // Cast both columns to TEXT to handle type mismatches (UUID vs VARCHAR, etc.)
          const leftColumn = `${this.quoteIdent(join.leftTable)}.${this.quoteIdent(cond.leftColumn)}::text`;
          const rightColumn = `${this.quoteIdent(join.rightTable)}.${this.quoteIdent(cond.rightColumn)}::text`;

          return `${leftColumn} ${cond.operator} ${rightColumn}`;
        })
        .join(' AND ');

      sql += ` ${join.type} JOIN ${rightTable} AS ${this.quoteIdent(join.rightTable)} ON ${conditions}`;
    }

    // WHERE clause
    if (queryDef.filters && queryDef.filters.length > 0) {
      const conditions = queryDef.filters.map((filter) => {
        const column = `${this.quoteIdent(filter.table)}.${this.quoteIdent(filter.column)}`;

        if (
          filter.operator === 'IS NULL' ||
          filter.operator === 'IS NOT NULL'
        ) {
          return `${column} ${filter.operator}`;
        }

        return `${column} ${filter.operator} ${this.quoteLiteral(filter.value)}`;
      });

      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    // GROUP BY clause
    if (queryDef.groupBy && queryDef.groupBy.length > 0) {
      const groupClauses = queryDef.groupBy.map(
        (group) =>
          `${this.quoteIdent(group.table)}.${this.quoteIdent(group.column)}`,
      );
      sql += ` GROUP BY ${groupClauses.join(', ')}`;
    }

    // ORDER BY clause
    if (queryDef.orderBy && queryDef.orderBy.length > 0) {
      const orderClauses = queryDef.orderBy.map(
        (order) =>
          `${this.quoteIdent(order.table)}.${this.quoteIdent(order.column)} ${order.direction}`,
      );
      sql += ` ORDER BY ${orderClauses.join(', ')}`;
    }

    // LIMIT clause
    if (queryDef.limit) {
      sql += ` LIMIT ${queryDef.limit}`;
    }

    this.logger.log(`Generated SQL: ${sql}`);

    return sql;
  }

  /**
   * Validate query definition
   */
  validateQueryDefinition(queryDef: QueryDefinitionDto): void {
    // Validate tables
    if (!queryDef.tables || queryDef.tables.length === 0) {
      throw new BadRequestException('At least one table is required');
    }

    if (queryDef.tables.length > 10) {
      throw new BadRequestException('Maximum 10 tables allowed per query');
    }

    // Validate joins
    if (queryDef.joins && queryDef.joins.length > 8) {
      throw new BadRequestException('Maximum 8 joins allowed per query');
    }

    // Check for joins if more than one table
    if (queryDef.tables.length > 1 && (!queryDef.joins || queryDef.joins.length === 0)) {
      throw new BadRequestException('Joins are required when querying multiple tables');
    }

    // Validate columns
    if (!queryDef.columns || queryDef.columns.length === 0) {
      throw new BadRequestException('At least one column must be selected');
    }

    // Validate table aliases are unique
    const aliases = new Set<string>();
    for (const table of queryDef.tables) {
      if (aliases.has(table.alias)) {
        throw new BadRequestException(`Duplicate table alias: ${table.alias}`);
      }
      aliases.add(table.alias);
    }

    // Validate join references
    for (const join of queryDef.joins || []) {
      if (!aliases.has(join.leftTable)) {
        throw new BadRequestException(
          `Join references unknown table alias: ${join.leftTable}`,
        );
      }
      if (!aliases.has(join.rightTable)) {
        throw new BadRequestException(
          `Join references unknown table alias: ${join.rightTable}`,
        );
      }
      if (join.conditions.length === 0) {
        throw new BadRequestException('Join must have at least one condition');
      }
    }

    // Validate column references
    for (const column of queryDef.columns) {
      if (!aliases.has(column.table)) {
        throw new BadRequestException(
          `Column references unknown table alias: ${column.table}`,
        );
      }
    }

    // Validate filter references
    for (const filter of queryDef.filters || []) {
      if (!aliases.has(filter.table)) {
        throw new BadRequestException(
          `Filter references unknown table alias: ${filter.table}`,
        );
      }
    }

    // Validate orderBy references
    for (const order of queryDef.orderBy || []) {
      if (!aliases.has(order.table)) {
        throw new BadRequestException(
          `OrderBy references unknown table alias: ${order.table}`,
        );
      }
    }
  }

  /**
   * Quote PostgreSQL identifier
   */
  private quoteIdent(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Quote PostgreSQL literal
   */
  private quoteLiteral(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    const strValue = String(value);
    return `'${strValue.replace(/'/g, "''")}'`;
  }
}
