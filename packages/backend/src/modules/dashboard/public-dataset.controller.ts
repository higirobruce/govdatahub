import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UnauthorizedException,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { DatasetSharingService } from './dataset-sharing.service';

/**
 * Public Dataset Controller
 *
 * Provides public access to shared datasets without authentication.
 * Supports two access methods:
 * 1. API Key - for programmatic access (format: gd_[64-char-hex])
 * 2. Share Token - for web-based sharing (format: [48-char-hex])
 *
 * Dataset Types:
 * - staged: Imported data stored in the system
 * - connection: Database connections (requires query execution)
 * - transformation: Transformation pipeline results
 */
@Public()
@Throttle({ default: { ttl: 60000, limit: 30 } })
@ApiTags('public')
@Controller('public')
export class PublicDatasetController {
  constructor(private readonly sharingService: DatasetSharingService) {}

  /**
   * Get dataset metadata and data via API key
   *
   * For 'staged' datasets: Returns data directly
   * For 'connection' datasets: Returns metadata only, use /query endpoint to fetch data
   * For 'transformation' datasets: Returns latest cached results
   *
   * @param apiKey - API key (format: gd_[64-char-hex])
   * @returns Dataset metadata and data
   */
  @Get('datasets/:apiKey')
  @ApiOperation({
    summary: 'Access dataset via API key',
    description: `
      Retrieve dataset metadata and data using an API key.

      **Dataset Types:**
      - \`staged\`: Returns data directly from imported files
      - \`connection\`: Returns metadata only (use POST /datasets/:apiKey/query to fetch data)
      - \`transformation\`: Returns latest transformation results

      **Response Format:**
      \`\`\`json
      {
        "metadata": {
          "name": "Dataset Name",
          "description": "Description",
          "connectionType": "postgresql" // for connections
        },
        "data": {
          "type": "connection",
          "message": "Use the query API to fetch data from this connection"
        }
      }
      \`\`\`
    `,
  })
  @ApiParam({
    name: 'apiKey',
    description: 'API key for dataset access (format: gd_[64-char-hex])',
    example: 'gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da',
  })
  @ApiResponse({
    status: 200,
    description: 'Dataset metadata and data returned successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Invalid API key or dataset not found',
  })
  async getDataByApiKey(@Param('apiKey') apiKey: string) {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    return await this.sharingService.getDataByApiKey(apiKey);
  }

  /**
   * Execute SQL query on a shared connection or staged dataset
   *
   * This endpoint allows executing SELECT queries on shared databases or staged data.
   * Only read-only queries are allowed (INSERT/UPDATE/DELETE are blocked).
   *
   * @param apiKey - API key for the shared dataset
   * @param sqlQuery - SQL SELECT query to execute
   * @param limit - Maximum number of rows to return (default: 1000, max: 10000)
   * @param offset - Number of rows to skip for pagination (default: 0)
   * @returns Query results with metadata
   */
  @Post('datasets/:apiKey/query')
  @ApiOperation({
    summary: 'Execute SQL query on shared dataset',
    description: `
      Execute a SQL query against a shared connection or staged dataset.

      **Supported Operations:**
      - SELECT queries only (read-only access)
      - JOINs, WHERE, GROUP BY, ORDER BY, etc.
      - Pagination via LIMIT/OFFSET

      **Security:**
      - Only SELECT queries allowed
      - Dangerous patterns blocked (DROP, DELETE, INSERT, UPDATE, etc.)
      - Query timeout: 30 seconds
      - Rate limiting applied

      **Examples:**
      \`\`\`sql
      -- List all tables (PostgreSQL)
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'

      -- Query a table
      SELECT * FROM users WHERE created_at > '2024-01-01' LIMIT 10

      -- Aggregate query
      SELECT country, COUNT(*) as total FROM users GROUP BY country
      \`\`\`
    `,
  })
  @ApiParam({
    name: 'apiKey',
    description: 'API key for the shared dataset',
    example: 'gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['sqlQuery'],
      properties: {
        sqlQuery: {
          type: 'string',
          description: 'SQL SELECT query to execute',
          example: 'SELECT * FROM vehicles LIMIT 10',
        },
      },
    },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum rows to return (default: 1000, max: 10000)',
    example: 100,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Rows to skip for pagination (default: 0)',
    example: 0,
  })
  @ApiResponse({
    status: 200,
    description: 'Query executed successfully',
    schema: {
      example: {
        rows: [
          { id: 1, make: 'Toyota', model: 'Camry', year: 2023 },
          { id: 2, make: 'Honda', model: 'Accord', year: 2022 },
        ],
        rowCount: 2,
        fields: [
          { name: 'id', type: 'integer' },
          { name: 'make', type: 'varchar' },
          { name: 'model', type: 'varchar' },
          { name: 'year', type: 'integer' },
        ],
        executionTimeMs: 45,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid SQL query or dangerous pattern detected',
  })
  @ApiResponse({
    status: 404,
    description: 'Invalid API key or dataset not found',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
  })
  async executeQuery(
    @Param('apiKey') apiKey: string,
    @Body('sqlQuery') sqlQuery: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    return await this.sharingService.executeQueryByApiKey(
      apiKey,
      sqlQuery,
      limit,
      offset,
    );
  }

  /**
   * Get dataset via share token (web-based sharing)
   *
   * Similar to API key access but uses a share token instead.
   * Primarily for web-based sharing and previews.
   *
   * @param shareToken - Share token (format: [48-char-hex])
   * @returns Dataset metadata and data
   */
  @Get('shared/:shareToken')
  @ApiOperation({
    summary: 'Access dataset via share token',
    description: `
      Retrieve dataset using a share token (for web-based sharing).

      Share tokens are shorter than API keys and intended for:
      - Web-based dataset previews
      - Embedded visualizations
      - Internal organization sharing

      For programmatic access, use the API key endpoint instead.
    `,
  })
  @ApiParam({
    name: 'shareToken',
    description: 'Share token for dataset access',
    example: 'abc123def456...',
  })
  @ApiResponse({
    status: 200,
    description: 'Dataset returned successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Invalid share token or dataset not found',
  })
  async getDataByShareToken(@Param('shareToken') shareToken: string) {
    return await this.sharingService.getDataByShareToken(shareToken);
  }

  /**
   * Execute query using share token
   *
   * Same as POST /datasets/:apiKey/query but uses share token for authentication.
   *
   * @param shareToken - Share token
   * @param sqlQuery - SQL query to execute
   * @param limit - Result limit
   * @param offset - Pagination offset
   * @returns Query results
   */
  @Post('shared/:shareToken/query')
  @ApiOperation({
    summary: 'Execute query via share token',
    description: 'Execute SQL query using share token authentication. Same functionality as API key query endpoint.',
  })
  @ApiParam({
    name: 'shareToken',
    description: 'Share token for authentication',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['sqlQuery'],
      properties: {
        sqlQuery: {
          type: 'string',
          description: 'SQL SELECT query',
          example: 'SELECT * FROM table_name LIMIT 10',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Query executed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid query' })
  @ApiResponse({ status: 404, description: 'Invalid share token' })
  async executeQueryByToken(
    @Param('shareToken') shareToken: string,
    @Body('sqlQuery') sqlQuery: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return await this.sharingService.executeQueryByShareToken(
      shareToken,
      sqlQuery,
      limit,
      offset,
    );
  }
}
