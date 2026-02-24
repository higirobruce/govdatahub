import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { ConnectionResponseDto } from './dto/connection-response.dto';
import { TestConnectionResponseDto } from './dto/test-connection.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../../database/entities';

@ApiTags('connections')
@Controller('connections')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@ApiBearerAuth()
export class ConnectionsController {
  private readonly logger = new Logger(ConnectionsController.name);

  constructor(
    private readonly connectionsService: ConnectionsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Fire-and-forget catalog sync — errors are swallowed so they never block the request. */
  private triggerCatalogSync(organizationId: string, method: 'syncConnections') {
    setImmediate(async () => {
      try {
        const { CatalogService } = await import('../catalog/catalog.service.js');
        const catalogService = this.moduleRef.get(CatalogService, { strict: false });
        await catalogService[method](organizationId);
      } catch {
        // Catalog not configured or unavailable — ignore
      }
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new database connection',
    description: 'Add a new database connection with encrypted credentials',
  })
  @ApiResponse({
    status: 201,
    description: 'Connection created successfully',
    type: ConnectionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or connection test failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async create(
    @Body() createConnectionDto: CreateConnectionDto,
    @CurrentUser() user: User,
  ): Promise<ConnectionResponseDto> {
    const result = await this.connectionsService.create(createConnectionDto, user.organizationId);
    this.triggerCatalogSync(user.organizationId, 'syncConnections');
    return result;
  }

  @Get()
  @ApiOperation({
    summary: 'List all connections',
    description: 'Retrieve all configured database connections (credentials excluded)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of connections',
    type: [ConnectionResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  findAll(@CurrentUser() user: User): Promise<ConnectionResponseDto[]> {
    return this.connectionsService.findAll(user.organizationId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a connection by ID',
    description: 'Retrieve details of a specific connection (credentials excluded)',
  })
  @ApiParam({
    name: 'id',
    description: 'Connection ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection details',
    type: ConnectionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  findOne(@Param('id') id: string, @CurrentUser() user: User): Promise<ConnectionResponseDto> {
    return this.connectionsService.findOne(id, user.organizationId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a connection',
    description: 'Remove a database connection',
  })
  @ApiParam({
    name: 'id',
    description: 'Connection ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 204,
    description: 'Connection deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async remove(@Param('id') id: string, @CurrentUser() user: User): Promise<void> {
    await this.connectionsService.remove(id, user.organizationId);
    this.triggerCatalogSync(user.organizationId, 'syncConnections');
  }

  @Post(':id/test')
  @ApiOperation({
    summary: 'Test a connection',
    description: 'Test if a database connection is working',
  })
  @ApiParam({
    name: 'id',
    description: 'Connection ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection test result',
    type: TestConnectionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  testConnection(@Param('id') id: string, @CurrentUser() user: User): Promise<TestConnectionResponseDto> {
    return this.connectionsService.testConnection(id, user.organizationId);
  }
}
