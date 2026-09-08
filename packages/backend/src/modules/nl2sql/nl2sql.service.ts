import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { AiAuditService } from '../ai/ai-audit.service';
import { SettingsService } from '../settings/settings.service';
import { SchemaContextBuilderService } from './schema-context-builder.service';
import { SqlValidatorService } from './sql-validator.service';
import { QueriesService } from '../queries/queries.service';
import { GenerateSqlDto } from './dto/nl2sql-request.dto';
import { GenerateSqlResponseDto, ExplainSqlResponseDto } from './dto/nl2sql-response.dto';
import { NL2SqlRequest } from '../ai/providers/base-provider.interface';

/**
 * NL2SQL Service
 *
 * Main service for natural language to SQL conversion.
 * Orchestrates:
 * 1. Schema context building
 * 2. AI provider selection
 * 3. SQL generation
 * 4. SQL validation
 * 5. Optional query execution
 */
@Injectable()
export class Nl2sqlService {
  private readonly logger = new Logger(Nl2sqlService.name);

  constructor(
    private aiService: AiService,
    private aiAudit: AiAuditService,
    private settingsService: SettingsService,
    private schemaContextBuilder: SchemaContextBuilderService,
    private sqlValidator: SqlValidatorService,
    private queriesService: QueriesService
  ) {}

  /**
   * Generate SQL from natural language query
   */
  async generateSql(
    organizationId: string,
    userId: string,
    dto: GenerateSqlDto
  ): Promise<GenerateSqlResponseDto> {
    this.logger.log(`Generating SQL for query: "${dto.query}"`);

    // 1. Get organization settings
    const settings = await this.settingsService.getOrganizationSettings(organizationId);

    // Check if NL2SQL is enabled
    if (!settings.nl2sqlEnabled) {
      throw new BadRequestException('NL2SQL feature is not enabled for this organization');
    }

    // Validate query length
    if (dto.query.length > settings.nl2sqlMaxQueryLength) {
      throw new BadRequestException(
        `Query exceeds maximum length of ${settings.nl2sqlMaxQueryLength} characters`
      );
    }

    // 2. Build schema context
    const schemaContext = await this.schemaContextBuilder.buildContext(
      organizationId,
      dto.connectionIds,
      {
        includeSampleData: settings.nl2sqlIncludeSchemaContext,
        maxTablesPerConnection: 20,
        maxColumnsPerTable: 50,
      }
    );

    if (schemaContext.connections.length === 0) {
      throw new BadRequestException('No database connections found. Please add a connection first.');
    }

    // 3. Get AI provider
    const provider = this.aiService.getProvider(settings.aiProvider);

    // 4. Prepare request
    const request: NL2SqlRequest = {
      naturalLanguageQuery: dto.query,
      schemaContext,
      settings,
      conversationHistory: dto.conversationHistory,
    };

    // 5. Generate SQL using AI
    const startTime = Date.now();
    let aiResponse;
    try {
      aiResponse = await provider.generateSql(request);
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      await this.aiAudit.log({
        organizationId,
        userId,
        feature: 'nl2sql_generate',
        model: settings.aiModel,
        promptChars: dto.query.length,
        responseChars: 0,
        latencyMs,
        success: false,
        errorMessage: error.message || 'AI provider error',
        executed: false,
      });
      this.logger.error('AI provider error:', error);
      throw new BadRequestException(
        `Failed to generate SQL: ${error.message || 'AI provider error'}`
      );
    }
    const latencyMs = Date.now() - startTime;
    const responseChars = aiResponse.sql?.length || 0;

    // 6. Validate generated SQL
    const validationResult = this.sqlValidator.validate(aiResponse.sql, settings);

    if (!validationResult.isValid) {
      this.logger.warn('Generated SQL failed validation:', validationResult.errors);
      await this.aiAudit.log({
        organizationId,
        userId,
        feature: 'nl2sql_generate',
        model: settings.aiModel,
        promptChars: dto.query.length,
        responseChars,
        latencyMs,
        success: true,
        generatedSql: aiResponse.sql,
        executed: false,
      });
      return {
        sql: aiResponse.sql,
        reasoning: aiResponse.reasoning,
        confidence: aiResponse.confidence,
        warnings: aiResponse.warnings,
        validationErrors: validationResult.errors,
      };
    }

    // 7. Auto-add LIMIT if missing
    let finalSql = aiResponse.sql;
    if (aiResponse.suggestedLimit) {
      finalSql = this.sqlValidator.addLimitIfMissing(finalSql, aiResponse.suggestedLimit);
    } else {
      finalSql = this.sqlValidator.addLimitIfMissing(finalSql, settings.maxRowsLimit);
    }

    // 8. Execute query if auto-execute is enabled
    let executionResult;
    if (dto.autoExecute && settings.nl2sqlAutoExecute) {
      try {
        // For now, execute on first connection
        // TODO: Support cross-database queries
        const firstConnectionId = schemaContext.connections[0]?.connectionId;
        if (firstConnectionId) {
          const startTime = Date.now();
          const result = await this.queriesService.executeQuery(
            {
              connectionId: firstConnectionId,
              sql: finalSql,
              cacheResults: false,
            },
            organizationId
          );
          const executionTime = Date.now() - startTime;

          executionResult = {
            rows: result.rows,
            rowCount: result.rowCount,
            executionTime,
          };
        }
      } catch (error) {
        this.logger.error('Query execution error:', error);
        await this.aiAudit.log({
          organizationId,
          userId,
          feature: 'nl2sql_generate',
          model: settings.aiModel,
          promptChars: dto.query.length,
          responseChars,
          latencyMs,
          success: true,
          generatedSql: finalSql,
          executed: false,
        });
        // Don't throw - return the SQL with execution error as warning
        return {
          sql: finalSql,
          reasoning: aiResponse.reasoning,
          confidence: aiResponse.confidence,
          warnings: [
            ...(aiResponse.warnings || []),
            ...(validationResult.warnings || []),
            `Execution failed: ${error.message}`,
          ],
        };
      }
    }

    // 9. Record audit trail and return response
    await this.aiAudit.log({
      organizationId,
      userId,
      feature: 'nl2sql_generate',
      model: settings.aiModel,
      promptChars: dto.query.length,
      responseChars,
      latencyMs,
      success: true,
      generatedSql: finalSql,
      executed: Boolean(executionResult),
    });

    return {
      sql: finalSql,
      reasoning: settings.nl2sqlShowReasoning ? aiResponse.reasoning : undefined,
      confidence: aiResponse.confidence,
      warnings: [...(aiResponse.warnings || []), ...(validationResult.warnings || [])],
      suggestedLimit: aiResponse.suggestedLimit,
      executionResult,
    };
  }

  /**
   * Explain SQL query in natural language
   */
  async explainSql(
    organizationId: string,
    sql: string,
    connectionIds?: string[],
    userId?: string
  ): Promise<ExplainSqlResponseDto> {
    this.logger.log(`Explaining SQL: ${sql.substring(0, 50)}...`);

    // 1. Get organization settings
    const settings = await this.settingsService.getOrganizationSettings(organizationId);

    // 2. Build schema context
    const schemaContext = await this.schemaContextBuilder.buildContext(
      organizationId,
      connectionIds,
      {
        includeSampleData: false,
        maxTablesPerConnection: 20,
        maxColumnsPerTable: 50,
      }
    );

    // 3. Get AI provider
    const provider = this.aiService.getProvider(settings.aiProvider);

    // 4. Get explanation
    const startTime = Date.now();
    let explanation;
    try {
      explanation = await provider.explainSql(sql, schemaContext, settings);
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      await this.aiAudit.log({
        organizationId,
        userId,
        feature: 'nl2sql_explain',
        model: settings.aiModel,
        promptChars: sql.length,
        responseChars: 0,
        latencyMs,
        success: false,
        errorMessage: error.message || 'AI provider error',
        executed: false,
      });
      this.logger.error('AI provider error:', error);
      throw new BadRequestException(
        `Failed to explain SQL: ${error.message || 'AI provider error'}`
      );
    }
    const latencyMs = Date.now() - startTime;
    await this.aiAudit.log({
      organizationId,
      userId,
      feature: 'nl2sql_explain',
      model: settings.aiModel,
      promptChars: sql.length,
      responseChars: explanation.length || 0,
      latencyMs,
      success: true,
      executed: false,
    });

    // 5. Extract tables and operations from SQL
    const tables = this.extractTablesFromSql(sql);
    const operations = this.extractOperationsFromSql(sql);

    return {
      explanation,
      tables,
      operations,
    };
  }

  /**
   * Extract table names from SQL query
   */
  private extractTablesFromSql(sql: string): string[] {
    const tables: string[] = [];

    // Match FROM and JOIN clauses
    const fromMatches = sql.matchAll(/\bFROM\s+([a-zA-Z0-9_."]+)/gi);
    const joinMatches = sql.matchAll(/\bJOIN\s+([a-zA-Z0-9_."]+)/gi);

    for (const match of fromMatches) {
      tables.push(match[1].replace(/"/g, ''));
    }

    for (const match of joinMatches) {
      tables.push(match[1].replace(/"/g, ''));
    }

    return [...new Set(tables)]; // Remove duplicates
  }

  /**
   * Extract SQL operations (SELECT, WHERE, JOIN, etc.)
   */
  private extractOperationsFromSql(sql: string): string[] {
    const operations: string[] = [];
    const upperSql = sql.toUpperCase();

    const keywords = ['SELECT', 'WHERE', 'JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT', 'HAVING'];

    for (const keyword of keywords) {
      if (upperSql.includes(keyword)) {
        operations.push(keyword);
      }
    }

    return operations;
  }
}
