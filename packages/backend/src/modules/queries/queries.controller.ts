import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { QueriesService } from './queries.service';
import { ExecuteQueryDto } from './dto/execute-query.dto';
import { QueryResultDto } from './dto/query-result.dto';
import { QueryHistory, User } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('queries')
@Controller('query')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@ApiBearerAuth()
export class QueriesController {
  constructor(private readonly queriesService: QueriesService) {}

  @Post()
  @Throttle({ default: { ttl: 60000, limit: 10 } }) // More restrictive for queries
  @ApiOperation({
    summary: 'Execute SQL query',
    description: 'Execute a SQL query on a specified connection with timeout and security checks',
  })
  @ApiResponse({
    status: 200,
    description: 'Query executed successfully',
    type: QueryResultDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid query or execution failed',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  executeQuery(
    @Body() executeQueryDto: ExecuteQueryDto,
    @CurrentUser() user: User,
  ): Promise<QueryResultDto> {
    return this.queriesService.executeQuery(executeQueryDto, user.organizationId);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Get query history',
    description: 'Retrieve recent query execution history',
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of queries to return',
    required: false,
    example: 50,
  })
  @ApiQuery({
    name: 'offset',
    description: 'Number of queries to skip',
    required: false,
    example: 0,
  })
  @ApiResponse({
    status: 200,
    description: 'Query history',
    type: [QueryHistory],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getHistory(
    @CurrentUser() user: User,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<QueryHistory[]> {
    return this.queriesService.getQueryHistory(user.organizationId, limit, offset);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get query by ID',
    description: 'Retrieve details of a specific query execution',
  })
  @ApiParam({
    name: 'id',
    description: 'Query ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Query details',
    type: QueryHistory,
  })
  @ApiResponse({
    status: 404,
    description: 'Query not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getQuery(@Param('id') id: string, @CurrentUser() user: User): Promise<QueryHistory> {
    return this.queriesService.getQueryById(id, user.organizationId);
  }

  @Get(':id/results')
  @ApiOperation({
    summary: 'Get cached query results',
    description: 'Retrieve cached results for a previously executed query',
  })
  @ApiParam({
    name: 'id',
    description: 'Query ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Cached results',
  })
  @ApiResponse({
    status: 404,
    description: 'Cached results not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getCachedResults(@Param('id') id: string, @CurrentUser() user: User): Promise<any> {
    return this.queriesService.getCachedResults(id, user.organizationId);
  }
}
