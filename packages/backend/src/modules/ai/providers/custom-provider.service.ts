import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  IAiProvider,
  NL2SqlRequest,
  NL2SqlResponse,
  SchemaContext,
} from './base-provider.interface';
import { OrganizationSettings } from '../../../database/entities/organization-settings.entity';

/**
 * Custom AI Provider for any HTTP API endpoint
 *
 * Allows users to integrate with any custom AI service by providing:
 * - Custom endpoint URL
 * - Custom request/response format
 */
@Injectable()
export class CustomProviderService implements IAiProvider {
  private readonly logger = new Logger(CustomProviderService.name);
  private readonly DEFAULT_TIMEOUT = 120000;

  getName(): string {
    return 'Custom API';
  }

  async generateSql(request: NL2SqlRequest): Promise<NL2SqlResponse> {
    const { naturalLanguageQuery, schemaContext, settings } = request;

    if (!settings.aiApiEndpoint) {
      throw new Error('Custom provider requires an API endpoint URL');
    }

    try {
      this.logger.log(`Generating SQL with custom provider at ${settings.aiApiEndpoint}`);

      const prompt = this.buildPrompt(naturalLanguageQuery, schemaContext, settings);

      // Send request to custom endpoint
      // We'll use a generic format that should work with most APIs
      const response = await axios.post(
        settings.aiApiEndpoint,
        {
          prompt,
          query: naturalLanguageQuery,
          schema: schemaContext,
          settings: {
            temperature: settings.aiTemperature,
            maxTokens: settings.aiMaxTokens,
            model: settings.aiModel,
          },
        },
        {
          timeout: this.DEFAULT_TIMEOUT,
          headers: {
            'Content-Type': 'application/json',
            ...(settings.aiApiKey && { 'Authorization': `Bearer ${settings.aiApiKey}` }),
          },
        }
      );

      // Try to parse response
      // Support multiple response formats
      const sqlResponse = this.parseCustomResponse(response.data);

      // Add suggested limit if not present
      if (!sqlResponse.sql.toUpperCase().includes('LIMIT')) {
        sqlResponse.suggestedLimit = settings.maxRowsLimit;
      }

      return sqlResponse;
    } catch (error) {
      this.logger.error('Error with custom provider:', error);
      throw new Error(`Custom provider failed: ${error.message}`);
    }
  }

  async explainSql(sql: string, schemaContext: SchemaContext): Promise<string> {
    return `Custom provider does not support SQL explanations. Query: ${sql.substring(0, 50)}...`;
  }

  async testConnection(settings: OrganizationSettings): Promise<{
    success: boolean;
    message: string;
  }> {
    if (!settings.aiApiEndpoint) {
      return {
        success: false,
        message: 'No API endpoint configured',
      };
    }

    try {
      // Try a simple ping/health check
      const response = await axios.get(settings.aiApiEndpoint, {
        timeout: 5000,
        headers: {
          ...(settings.aiApiKey && { 'Authorization': `Bearer ${settings.aiApiKey}` }),
        },
      });

      return {
        success: true,
        message: `Successfully connected to ${settings.aiApiEndpoint}`,
      };
    } catch (error) {
      // If GET fails, try POST with a test payload
      try {
        await axios.post(
          settings.aiApiEndpoint,
          { test: true },
          {
            timeout: 5000,
            headers: {
              'Content-Type': 'application/json',
              ...(settings.aiApiKey && { 'Authorization': `Bearer ${settings.aiApiKey}` }),
            },
          }
        );

        return {
          success: true,
          message: `Endpoint is reachable at ${settings.aiApiEndpoint}`,
        };
      } catch (postError) {
        return {
          success: false,
          message: `Failed to connect: ${error.message}`,
        };
      }
    }
  }

  private buildPrompt(
    query: string,
    schemaContext: SchemaContext,
    settings: OrganizationSettings
  ): string {
    const schemaDescription = JSON.stringify(schemaContext, null, 2);

    return `Generate a SQL query for the following request:

USER REQUEST: ${query}

DATABASE SCHEMA:
${schemaDescription}

REQUIREMENTS:
- Generate only valid SQL
- Use SELECT statements only
- Include LIMIT ${settings.maxRowsLimit}
- Return format: { "sql": "your query here", "reasoning": "optional explanation" }
`;
  }

  /**
   * Parse custom API response
   * Supports multiple response formats:
   * - { sql: "...", reasoning: "..." }
   * - { query: "...", explanation: "..." }
   * - { result: { sql: "..." } }
   * - Plain text SQL
   */
  private parseCustomResponse(data: any): NL2SqlResponse {
    // Format 1: Direct SQL and reasoning
    if (data.sql) {
      return {
        sql: data.sql,
        reasoning: data.reasoning || data.explanation,
        confidence: 0.8,
        warnings: [],
      };
    }

    // Format 2: Query field
    if (data.query) {
      return {
        sql: data.query,
        reasoning: data.explanation || data.reasoning,
        confidence: 0.8,
        warnings: [],
      };
    }

    // Format 3: Nested result
    if (data.result && data.result.sql) {
      return {
        sql: data.result.sql,
        reasoning: data.result.reasoning,
        confidence: 0.8,
        warnings: [],
      };
    }

    // Format 4: OpenAI-style choices
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const content = data.choices[0].message.content;
      return this.parseTextResponse(content);
    }

    // Format 5: Plain text response
    if (typeof data === 'string') {
      return this.parseTextResponse(data);
    }

    // Format 6: Response in 'text' or 'content' field
    if (data.text || data.content) {
      return this.parseTextResponse(data.text || data.content);
    }

    throw new Error('Unable to parse custom provider response format');
  }

  private parseTextResponse(text: string): NL2SqlResponse {
    // Try to extract SQL from text
    let sql = text;

    // Remove code blocks
    sql = sql.replace(/```sql\n?/g, '').replace(/```\n?/g, '');

    // Try to find JSON in response
    const jsonMatch = text.match(/\{[\s\S]*"sql"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          sql: parsed.sql,
          reasoning: parsed.reasoning,
          confidence: 0.7,
          warnings: [],
        };
      } catch (e) {
        // JSON parse failed, continue with text extraction
      }
    }

    // Extract SELECT statement
    const selectMatch = text.match(/SELECT[\s\S]*?;/i);
    if (selectMatch) {
      sql = selectMatch[0];
    }

    return {
      sql: sql.trim(),
      confidence: 0.6,
      warnings: ['Response format may not be optimal. Consider adjusting your custom API.'],
    };
  }
}
