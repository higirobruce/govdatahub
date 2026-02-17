import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SchemaService } from './schema.service';
import { SchemaInfo, TableInfo, ColumnInfo } from '../connections/drivers/database-driver.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../../database/entities';

@ApiTags('schema')
@Controller('connections/:connectionId/schema')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@ApiBearerAuth()
export class SchemaController {
  constructor(private readonly schemaService: SchemaService) {}

  @Get('schemas')
  @ApiOperation({
    summary: 'List schemas/databases',
    description: 'Retrieve all schemas or databases available in the connection',
  })
  @ApiParam({
    name: 'connectionId',
    description: 'Connection ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'List of schemas',
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getSchemas(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: User,
  ): Promise<SchemaInfo[]> {
    return this.schemaService.getSchemas(connectionId, user.organizationId);
  }

  @Get('tables')
  @ApiOperation({
    summary: 'List tables',
    description: 'Retrieve all tables in the specified schema/database',
  })
  @ApiParam({
    name: 'connectionId',
    description: 'Connection ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiQuery({
    name: 'schema',
    description: 'Schema name (optional, defaults to public/current database)',
    required: false,
    example: 'public',
  })
  @ApiResponse({
    status: 200,
    description: 'List of tables',
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getTables(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: User,
    @Query('schema') schema?: string,
  ): Promise<TableInfo[]> {
    return this.schemaService.getTables(connectionId, user.organizationId, schema);
  }

  @Get('tables/:table/columns')
  @ApiOperation({
    summary: 'Get table columns',
    description: 'Retrieve column metadata for a specific table',
  })
  @ApiParam({
    name: 'connectionId',
    description: 'Connection ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'table',
    description: 'Table name',
    example: 'users',
  })
  @ApiQuery({
    name: 'schema',
    description: 'Schema name (optional, defaults to public/current database)',
    required: false,
    example: 'public',
  })
  @ApiResponse({
    status: 200,
    description: 'List of columns',
  })
  @ApiResponse({
    status: 404,
    description: 'Connection or table not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getColumns(
    @Param('connectionId') connectionId: string,
    @Param('table') table: string,
    @CurrentUser() user: User,
    @Query('schema') schema?: string,
  ): Promise<ColumnInfo[]> {
    return this.schemaService.getColumns(connectionId, user.organizationId, table, schema);
  }
}
