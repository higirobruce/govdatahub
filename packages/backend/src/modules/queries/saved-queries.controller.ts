import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SavedQueriesService } from './saved-queries.service';
import {
  CreateSavedQueryDto,
  ExecuteSavedQueryDto,
  UpdateSavedQueryDto,
} from './dto/saved-query.dto';
import { QueryResultDto } from './dto/query-result.dto';
import { SavedQuery, User } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('saved-queries')
@Controller('saved-queries')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SavedQueriesController {
  constructor(private readonly savedQueriesService: SavedQueriesService) {}

  @Get()
  @ApiOperation({ summary: 'List saved queries for the org' })
  @ApiResponse({ status: 200, type: [SavedQuery] })
  list(@CurrentUser() user: User): Promise<SavedQuery[]> {
    return this.savedQueriesService.list(user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a saved query by id' })
  @ApiResponse({ status: 200, type: SavedQuery })
  @ApiResponse({ status: 404, description: 'Not found' })
  get(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<SavedQuery> {
    return this.savedQueriesService.getById(id, user.organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a saved query' })
  @ApiResponse({ status: 201, type: SavedQuery })
  create(
    @Body() dto: CreateSavedQueryDto,
    @CurrentUser() user: User,
  ): Promise<SavedQuery> {
    return this.savedQueriesService.create(dto, user.organizationId, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a saved query' })
  @ApiResponse({ status: 200, type: SavedQuery })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSavedQueryDto,
    @CurrentUser() user: User,
  ): Promise<SavedQuery> {
    return this.savedQueriesService.update(id, dto, user.organizationId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a saved query' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.savedQueriesService.remove(id, user.organizationId);
  }

  @Post(':id/execute')
  // Higher limit than ad-hoc /api/query (10/min) because saved queries are
  // pre-validated SQL with pre-typed parameters — lower per-call risk and
  // they back dashboards (a 12-widget dashboard refreshing every 30s emits
  // 24 reqs/min on its own).
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiOperation({
    summary: 'Execute a saved query',
    description:
      'Renders the saved SQL via the template engine using the provided parameter values, then runs it on the bound connection.',
  })
  @ApiResponse({ status: 200, type: QueryResultDto })
  @ApiResponse({ status: 400, description: 'Bad parameter values' })
  execute(
    @Param('id') id: string,
    @Body() dto: ExecuteSavedQueryDto,
    @CurrentUser() user: User,
  ): Promise<QueryResultDto> {
    return this.savedQueriesService.execute(
      id,
      dto.parameters ?? {},
      user.organizationId,
    );
  }
}
