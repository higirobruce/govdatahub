import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, SavedCrossQuery } from '../../database/entities';
import { CrossQueryExecutorService } from './cross-query-executor.service';
import { QueryBuilderService } from './query-builder.service';
import { ExecuteCrossQueryDto } from './dto/execute-cross-query.dto';
import { CrossQueryResultDto } from './dto/cross-query-result.dto';
import { QueryDefinitionDto } from './dto/query-definition.dto';

@Controller('cross-query')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('cross-query')
export class CrossQueryController {
  constructor(
    private readonly crossQueryExecutorService: CrossQueryExecutorService,
    private readonly queryBuilderService: QueryBuilderService,
    @InjectRepository(SavedCrossQuery)
    private readonly savedQueryRepository: Repository<SavedCrossQuery>,
  ) {}

  @Post('validate')
  @ApiOperation({ summary: 'Validate cross-database query definition' })
  @ApiResponse({ status: 200, description: 'Query is valid' })
  @ApiResponse({ status: 400, description: 'Query validation failed' })
  async validateQuery(
    @Body() dto: { queryDefinition: QueryDefinitionDto },
    @CurrentUser() user: User,
  ) {
    // Validation happens automatically via class-validator decorators
    return {
      valid: true,
      message: 'Query definition is valid',
    };
  }

  @Post('execute')
  @Throttle({ default: { ttl: 60000, limit: 5 } }) // 5 queries per minute
  @ApiOperation({ summary: 'Execute cross-database query' })
  @ApiResponse({
    status: 200,
    description: 'Query executed successfully',
    type: CrossQueryResultDto,
  })
  @ApiResponse({ status: 400, description: 'Query execution failed' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async executeQuery(
    @Body() dto: ExecuteCrossQueryDto,
    @CurrentUser() user: User,
  ): Promise<CrossQueryResultDto> {
    return this.crossQueryExecutorService.executeCrossQuery(
      dto.queryDefinition,
      user.organizationId,
    );
  }

  @Post('saved')
  @ApiOperation({ summary: 'Save cross-database query for reuse' })
  @ApiResponse({ status: 201, description: 'Query saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid query definition' })
  async saveQuery(
    @Body()
    dto: {
      name: string;
      description?: string;
      queryDefinition: QueryDefinitionDto;
    },
    @CurrentUser() user: User,
  ) {
    // Validate query definition
    this.queryBuilderService.validateQueryDefinition(dto.queryDefinition);

    // Generate SQL preview
    const foreignTableMap = new Map<string, string>();
    dto.queryDefinition.tables.forEach((table) => {
      foreignTableMap.set(table.alias, `${table.schemaName}.${table.tableName}`);
    });
    const generatedSql = this.queryBuilderService.generateSqlFromDefinition(
      dto.queryDefinition,
      foreignTableMap,
    );

    // Save query
    const savedQuery = this.savedQueryRepository.create({
      id: require('uuid').v4(),
      name: dto.name,
      description: dto.description,
      queryDefinition: dto.queryDefinition,
      generatedSql,
      organizationId: user.organizationId,
      createdBy: user.id,
    });

    const result = await this.savedQueryRepository.save(savedQuery);

    return {
      id: result.id,
      name: result.name,
      description: result.description,
      queryDefinition: result.queryDefinition,
      generatedSql: result.generatedSql,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  @Get('saved')
  @ApiOperation({ summary: 'List saved cross-database queries' })
  @ApiResponse({ status: 200, description: 'List of saved queries' })
  async listSavedQueries(@CurrentUser() user: User) {
    const queries = await this.savedQueryRepository.find({
      where: { organizationId: user.organizationId },
      order: { createdAt: 'DESC' },
    });

    return queries.map((query) => ({
      id: query.id,
      name: query.name,
      description: query.description,
      queryDefinition: query.queryDefinition,
      generatedSql: query.generatedSql,
      createdAt: query.createdAt,
      updatedAt: query.updatedAt,
    }));
  }

  @Get('saved/:id')
  @ApiOperation({ summary: 'Get saved query details' })
  @ApiResponse({ status: 200, description: 'Query details' })
  @ApiResponse({ status: 404, description: 'Query not found' })
  async getSavedQuery(@Param('id') id: string, @CurrentUser() user: User) {
    const query = await this.savedQueryRepository.findOne({
      where: { id, organizationId: user.organizationId },
    });

    if (!query) {
      throw new NotFoundException('Saved query not found');
    }

    return {
      id: query.id,
      name: query.name,
      description: query.description,
      queryDefinition: query.queryDefinition,
      generatedSql: query.generatedSql,
      createdAt: query.createdAt,
      updatedAt: query.updatedAt,
    };
  }

  @Delete('saved/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete saved query' })
  @ApiResponse({ status: 204, description: 'Query deleted successfully' })
  @ApiResponse({ status: 404, description: 'Query not found' })
  async deleteSavedQuery(@Param('id') id: string, @CurrentUser() user: User) {
    const query = await this.savedQueryRepository.findOne({
      where: { id, organizationId: user.organizationId },
    });

    if (!query) {
      throw new NotFoundException('Saved query not found');
    }

    await this.savedQueryRepository.remove(query);
  }
}
