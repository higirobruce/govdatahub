import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import {
  IAiProvider,
  NL2SqlRequest,
  NL2SqlResponse,
  SchemaContext,
} from './base-provider.interface';
import { OrganizationSettings } from '../../../database/entities/organization-settings.entity';

/**
 * Local AI Provider for Ollama, LM Studio, and other OpenAI-compatible local APIs
 *
 * Supports:
 * - Ollama (http://localhost:11434)
 * - LM Studio (http://localhost:1234/v1)
 * - LocalAI, text-generation-webui, etc.
 */
@Injectable()
export class LocalProviderService implements IAiProvider {
  private readonly logger = new Logger(LocalProviderService.name);
  private readonly DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
  private readonly DEFAULT_TIMEOUT = 120000; // 2 minutes for local inference

  getName(): string {
    return 'Local (Ollama/LM Studio)';
  }

  async generateSql(request: NL2SqlRequest): Promise<NL2SqlResponse> {
    const { naturalLanguageQuery, schemaContext, settings } = request;

    try {
      const endpoint = settings.aiApiEndpoint || this.DEFAULT_OLLAMA_ENDPOINT;
      const model = settings.aiModel || 'codellama';

      this.logger.log(`Generating SQL with local model: ${model} at ${endpoint}`);

      // Build prompt
      const prompt = this.buildPrompt(naturalLanguageQuery, schemaContext, settings);

      // Detect API type (Ollama vs OpenAI-compatible)
      const isOllama = endpoint.includes('11434') || !endpoint.includes('/v1');

      let response;
      if (isOllama) {
        response = await this.callOllamaApi(endpoint, model, prompt, settings);
      } else {
        response = await this.callOpenAICompatibleApi(endpoint, model, prompt, settings);
      }

      // Parse response
      const sqlResponse = this.parseResponse(response);

      // Add suggested limit if not present
      if (!sqlResponse.sql.toUpperCase().includes('LIMIT')) {
        sqlResponse.suggestedLimit = settings.maxRowsLimit;
      }

      return sqlResponse;
    } catch (error) {
      this.logger.error('Error generating SQL with local provider:', error);
      throw new Error(`Failed to generate SQL: ${error.message}`);
    }
  }

  async explainSql(sql: string, schemaContext: SchemaContext): Promise<string> {
    // For explain, we can use a simpler prompt
    const prompt = `Explain what this SQL query does in simple terms:\n\n${sql}`;

    // Use a lightweight model for explanations
    try {
      const response = await axios.post(
        `${this.DEFAULT_OLLAMA_ENDPOINT}/api/generate`,
        {
          model: 'llama2',
          prompt,
          stream: false,
        },
        { timeout: 30000 }
      );

      return response.data.response;
    } catch (error) {
      this.logger.error('Error explaining SQL:', error);
      return 'Unable to explain SQL at this time.';
    }
  }

  async testConnection(settings: OrganizationSettings): Promise<{
    success: boolean;
    message: string;
    model?: string;
  }> {
    try {
      const endpoint = settings.aiApiEndpoint || this.DEFAULT_OLLAMA_ENDPOINT;
      const model = settings.aiModel || 'codellama';

      this.logger.log(`Testing connection to ${endpoint} with model ${model}`);

      const isOllama = endpoint.includes('11434') || !endpoint.includes('/v1');

      if (isOllama) {
        // Test Ollama endpoint
        const response = await axios.get(`${endpoint}/api/tags`, {
          timeout: 5000,
        });

        // Check if requested model is available
        const models = response.data.models || [];
        const modelExists = models.some((m: any) => m.name.includes(model));

        if (!modelExists) {
          return {
            success: false,
            message: `Model "${model}" not found. Available models: ${models.map((m: any) => m.name).join(', ')}`,
          };
        }

        return {
          success: true,
          message: `Successfully connected to Ollama at ${endpoint}`,
          model,
        };
      } else {
        // Test OpenAI-compatible endpoint
        const response = await axios.get(`${endpoint}/models`, {
          timeout: 5000,
        });

        return {
          success: true,
          message: `Successfully connected to OpenAI-compatible API at ${endpoint}`,
          model,
        };
      }
    } catch (error) {
      this.logger.error('Error testing connection:', error);
      return {
        success: false,
        message: `Connection failed: ${error.message}. Make sure Ollama or your local AI server is running.`,
      };
    }
  }

  /**
   * Call Ollama API
   */
  private async callOllamaApi(
    endpoint: string,
    model: string,
    prompt: string,
    settings: OrganizationSettings
  ): Promise<string> {
    const response = await axios.post(
      `${endpoint}/api/generate`,
      {
        model,
        prompt,
        stream: false,
        options: {
          temperature: settings.aiTemperature,
          num_predict: settings.aiMaxTokens,
        },
      },
      { timeout: this.DEFAULT_TIMEOUT }
    );

    return response.data.response;
  }

  /**
   * Call OpenAI-compatible API (LM Studio, LocalAI, etc.)
   */
  private async callOpenAICompatibleApi(
    endpoint: string,
    model: string,
    prompt: string,
    settings: OrganizationSettings
  ): Promise<string> {
    const response = await axios.post(
      `${endpoint}/chat/completions`,
      {
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a SQL expert. Generate valid SQL queries based on user requests.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: settings.aiTemperature,
        max_tokens: settings.aiMaxTokens,
      },
      { timeout: this.DEFAULT_TIMEOUT }
    );

    return response.data.choices[0].message.content;
  }

  /**
   * Build prompt for SQL generation
   */
  private buildPrompt(
    query: string,
    schemaContext: SchemaContext,
    settings: OrganizationSettings
  ): string {
    const schemaDescription = this.formatSchemaContext(schemaContext);

    let prompt = `You are a SQL expert. Generate a SQL query based on the following request.

DATABASE SCHEMA:
${schemaDescription}

USER REQUEST:
${query}

INSTRUCTIONS:
- Generate ONLY the SQL query, no explanations unless explicitly requested
- Use proper JOINs based on foreign key relationships shown above
- Always include a LIMIT clause (max ${settings.maxRowsLimit} rows)
- Only use SELECT statements (no INSERT, UPDATE, DELETE)
- Use standard SQL syntax compatible with PostgreSQL and MySQL
`;

    if (settings.nl2sqlShowReasoning) {
      prompt += `\n- After the SQL, add a line starting with "REASONING:" explaining your query\n`;
    }

    prompt += `\nSQL QUERY:`;

    return prompt;
  }

  /**
   * Format schema context for prompt
   */
  private formatSchemaContext(schemaContext: SchemaContext): string {
    let formatted = '';

    for (const connection of schemaContext.connections) {
      formatted += `\n--- ${connection.name} (${connection.type}) ---\n`;

      for (const table of connection.tables) {
        formatted += `\nTable: ${table.schema ? table.schema + '.' : ''}${table.name}\n`;
        formatted += 'Columns:\n';

        for (const column of table.columns) {
          let columnDesc = `  - ${column.name} (${column.type})`;
          if (column.primaryKey) columnDesc += ' [PRIMARY KEY]';
          if (column.foreignKey) {
            columnDesc += ` [FOREIGN KEY -> ${column.foreignKey.referencedTable}.${column.foreignKey.referencedColumn}]`;
          }
          if (!column.nullable) columnDesc += ' [NOT NULL]';
          formatted += columnDesc + '\n';
        }

        // Add sample data if available
        if (table.sampleData && table.sampleData.length > 0) {
          formatted += `Sample data (first ${table.sampleData.length} rows):\n`;
          formatted += JSON.stringify(table.sampleData, null, 2) + '\n';
        }
      }
    }

    return formatted;
  }

  /**
   * Parse AI response to extract SQL and reasoning
   */
  private parseResponse(response: string): NL2SqlResponse {
    const lines = response.split('\n');
    let sql = '';
    let reasoning = '';
    let inSqlBlock = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Extract reasoning
      if (trimmedLine.startsWith('REASONING:')) {
        reasoning = trimmedLine.substring('REASONING:'.length).trim();
        continue;
      }

      // Handle SQL code blocks
      if (trimmedLine.startsWith('```sql')) {
        inSqlBlock = true;
        continue;
      }
      if (trimmedLine === '```') {
        inSqlBlock = false;
        continue;
      }

      // Collect SQL
      if (inSqlBlock || (!sql && (trimmedLine.startsWith('SELECT') || trimmedLine.startsWith('WITH')))) {
        sql += line + '\n';
      } else if (sql && !trimmedLine.startsWith('REASONING:')) {
        // Continue collecting SQL until we hit reasoning or end
        if (trimmedLine.length > 0 && !trimmedLine.startsWith('---')) {
          sql += line + '\n';
        }
      }
    }

    // Clean up SQL
    sql = sql.trim();

    // If no SQL was extracted, use the whole response (fallback)
    if (!sql || sql.length < 10) {
      sql = response.split('REASONING:')[0].trim();
      // Remove common prefixes
      sql = sql.replace(/^(Here's the SQL query:|SQL query:|Query:)/i, '').trim();
      // Remove code block markers
      sql = sql.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
    }

    return {
      sql,
      reasoning: reasoning || undefined,
      confidence: sql.length > 10 ? 0.8 : 0.3,
      warnings: [],
    };
  }
}
