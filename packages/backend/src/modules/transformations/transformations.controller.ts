import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { TransformationsService } from './transformations.service';
import { TransformationsExecutorService } from './transformations-executor.service';
import { CreateTransformationDto } from './dto/create-transformation.dto';
import { UpdateTransformationDto } from './dto/update-transformation.dto';
import { TransformationResponseDto } from './dto/transformation-response.dto';
import { TransformationRunResponseDto } from './dto/transformation-run-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../../database/entities';

@ApiTags('transformations')
@Controller('transformations')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@ApiBearerAuth()
export class TransformationsController {
  constructor(
    private readonly transformationsService: TransformationsService,
    private readonly executorService: TransformationsExecutorService,
  ) {}

  @Post()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({
    summary: 'Create transformation',
    description: 'Create a new SQL-based transformation',
  })
  @ApiResponse({
    status: 201,
    description: 'Transformation created successfully',
    type: TransformationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or connection not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  create(
    @Body() createDto: CreateTransformationDto,
    @CurrentUser() user: User,
  ): Promise<TransformationResponseDto> {
    return this.transformationsService.create(createDto, user.organizationId);
  }

  @Get()
  @ApiOperation({
    summary: 'List transformations',
    description: 'Get all transformations with optional status filter',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'paused'],
    description: 'Filter by status',
  })
  @ApiResponse({
    status: 200,
    description: 'List of transformations',
    type: [TransformationResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  findAll(
    @CurrentUser() user: User,
    @Query('status') status?: string,
  ): Promise<TransformationResponseDto[]> {
    return this.transformationsService.findAll(user.organizationId, { status });
  }

  @Get(':id')
  @ApiParam({
    name: 'id',
    description: 'Transformation ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOperation({
    summary: 'Get transformation',
    description: 'Get a transformation by ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Transformation details',
    type: TransformationResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Transformation not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  findOne(@Param('id') id: string, @CurrentUser() user: User): Promise<TransformationResponseDto> {
    return this.transformationsService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @ApiParam({
    name: 'id',
    description: 'Transformation ID',
  })
  @ApiOperation({
    summary: 'Update transformation',
    description: 'Update a transformation',
  })
  @ApiResponse({
    status: 200,
    description: 'Transformation updated successfully',
    type: TransformationResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Transformation not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateTransformationDto,
    @CurrentUser() user: User,
  ): Promise<TransformationResponseDto> {
    return this.transformationsService.update(id, user.organizationId, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({
    name: 'id',
    description: 'Transformation ID',
  })
  @ApiOperation({
    summary: 'Delete transformation',
    description: 'Delete a transformation (cascades to runs and cached results)',
  })
  @ApiResponse({
    status: 204,
    description: 'Transformation deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Transformation not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  remove(@Param('id') id: string, @CurrentUser() user: User): Promise<void> {
    return this.transformationsService.remove(id, user.organizationId);
  }

  @Post(':id/execute')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiParam({
    name: 'id',
    description: 'Transformation ID',
  })
  @ApiOperation({
    summary: 'Execute transformation',
    description:
      'Execute transformation manually (rate limited to 5 requests per minute)',
  })
  @ApiResponse({
    status: 200,
    description: 'Transformation executed successfully',
    type: TransformationRunResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Execution failed or transformation is paused',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
  })
  executeNow(@Param('id') id: string): Promise<TransformationRunResponseDto> {
    return this.executorService.execute(id, 'manual');
  }

  @Post(':id/pause')
  @ApiParam({
    name: 'id',
    description: 'Transformation ID',
  })
  @ApiOperation({
    summary: 'Pause transformation',
    description: 'Set transformation status to paused',
  })
  @ApiResponse({
    status: 200,
    description: 'Transformation paused successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Transformation not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async pause(@Param('id') id: string, @CurrentUser() user: User): Promise<{ message: string }> {
    await this.transformationsService.pause(id, user.organizationId);
    return { message: 'Transformation paused successfully' };
  }

  @Post(':id/resume')
  @ApiParam({
    name: 'id',
    description: 'Transformation ID',
  })
  @ApiOperation({
    summary: 'Resume transformation',
    description: 'Set transformation status to active',
  })
  @ApiResponse({
    status: 200,
    description: 'Transformation resumed successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Transformation not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async resume(@Param('id') id: string, @CurrentUser() user: User): Promise<{ message: string }> {
    await this.transformationsService.resume(id, user.organizationId);
    return { message: 'Transformation resumed successfully' };
  }

  @Get(':id/runs')
  @ApiParam({
    name: 'id',
    description: 'Transformation ID',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of runs to return',
    example: 50,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of runs to skip',
    example: 0,
  })
  @ApiOperation({
    summary: 'Get transformation runs',
    description: 'Get execution history for a transformation',
  })
  @ApiResponse({
    status: 200,
    description: 'List of transformation runs',
    type: [TransformationRunResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getRuns(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<TransformationRunResponseDto[]> {
    return this.transformationsService.getRuns(id, user.organizationId, limit, offset);
  }

  @Get('runs/:runId')
  @ApiParam({
    name: 'runId',
    description: 'Run ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOperation({
    summary: 'Get run details',
    description: 'Get details of a specific transformation run',
  })
  @ApiResponse({
    status: 200,
    description: 'Run details',
    type: TransformationRunResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Run not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getRunDetails(
    @Param('runId') runId: string,
    @CurrentUser() user: User,
  ): Promise<TransformationRunResponseDto> {
    return this.transformationsService.getRunDetails(runId, user.organizationId);
  }

  @Get('runs/:runId/results')
  @ApiParam({
    name: 'runId',
    description: 'Run ID',
  })
  @ApiOperation({
    summary: 'Get run results',
    description: 'Get cached results for a transformation run',
  })
  @ApiResponse({
    status: 200,
    description: 'Cached results',
  })
  @ApiResponse({
    status: 404,
    description: 'No cached results found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getRunResults(@Param('runId') runId: string, @CurrentUser() user: User): Promise<any> {
    return this.transformationsService.getRunResults(runId, user.organizationId);
  }

  @Post('validate')
  @ApiOperation({
    summary: 'Validate SQL',
    description: 'Validate SQL query before creating transformation',
  })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
  })
  validateSql(
    @Body() dto: { sqlQuery: string },
  ): Promise<{ valid: boolean; error?: string }> {
    return this.transformationsService.validateSql(dto.sqlQuery);
  }
}
