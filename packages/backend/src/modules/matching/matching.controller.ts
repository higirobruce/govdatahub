import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../../database/entities';
import {
  AddGoldPairDto,
  CreateMatchProjectDto,
  GetCandidatesQueryDto,
  GetClustersQueryDto,
  RetractDecisionQueryDto,
  SubmitDecisionDto,
  UpdateMatchProjectDto,
} from './dto';
import { MatchingService } from './matching.service';

/**
 * Every organization member may read; only an editor, org admin or super
 * admin may create, change or run something. Applied per mutating handler
 * below -- `RolesGuard` returns `true` for a handler with no `@Roles` at
 * all, so a route missing this decorator is not "denied", it is "open to
 * any authenticated role", which is why every mutating route below must
 * carry it explicitly.
 */
const EDITOR_ROLES = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR];

/**
 * The entity-matching feature's only HTTP surface, and therefore its
 * security boundary: everything behind `MatchingService` assumes the
 * caller is authenticated, authorised, and scoped to one organization,
 * and nothing behind it re-checks. `RolesGuard` guards zero endpoints
 * elsewhere in this codebase today (a dead-code finding from a repository
 * audit); this controller does not extend that pattern.
 *
 * No handler accepts an organization id from the request -- every one
 * takes `@CurrentUser() user: User` and forwards `user.organizationId`.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('matching')
export class MatchingController {
  constructor(private readonly service: MatchingService) {}

  @Post('projects')
  @Roles(...EDITOR_ROLES)
  createProject(@Body() dto: CreateMatchProjectDto, @CurrentUser() user: User) {
    return this.service.createProject(dto, user.organizationId);
  }

  @Get('projects')
  listProjects(@CurrentUser() user: User) {
    return this.service.listProjects(user.organizationId);
  }

  @Get('projects/:id')
  getProject(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.findProject(id, user.organizationId);
  }

  @Patch('projects/:id')
  @Roles(...EDITOR_ROLES)
  updateProject(@Param('id') id: string, @Body() dto: UpdateMatchProjectDto, @CurrentUser() user: User) {
    return this.service.updateProject(id, dto, user.organizationId);
  }

  @Delete('projects/:id')
  @Roles(...EDITOR_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProject(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.deleteProject(id, user.organizationId);
  }

  @Post('projects/:id/estimate')
  @Roles(...EDITOR_ROLES)
  @HttpCode(HttpStatus.OK)
  estimate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.estimate(id, user.organizationId);
  }

  @Post('projects/:id/runs')
  @Roles(...EDITOR_ROLES)
  startRun(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.startRun(id, user.organizationId);
  }

  @Get('projects/:id/runs')
  listRuns(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.listRuns(id, user.organizationId);
  }

  @Get('runs/:runId')
  getRun(@Param('runId') runId: string, @CurrentUser() user: User) {
    return this.service.findRun(runId, user.organizationId);
  }

  /**
   * Ruling R54: mark a run stranded in a non-terminal status as failed,
   * so "Run now" is not disabled forever. Refused with a 409 unless the
   * project's advisory lock is free -- see `MatchRunService.abandon`.
   */
  @Post('runs/:runId/abandon')
  @Roles(...EDITOR_ROLES)
  @HttpCode(HttpStatus.OK)
  abandonRun(@Param('runId') runId: string, @CurrentUser() user: User) {
    return this.service.abandonRun(runId, user.organizationId);
  }

  @Get('runs/:runId/candidates')
  getCandidates(
    @Param('runId') runId: string,
    @Query() query: GetCandidatesQueryDto,
    @CurrentUser() user: User,
  ) {
    return this.service.listCandidates(runId, user.organizationId, query);
  }

  @Post('projects/:id/decisions')
  @Roles(...EDITOR_ROLES)
  submitDecision(@Param('id') id: string, @Body() dto: SubmitDecisionDto, @CurrentUser() user: User) {
    return this.service.recordDecision(id, dto, user.organizationId, user.id);
  }

  /**
   * Ruling R43 (part 2): retracts a verdict -- it does not assert the
   * opposite one. Query params (not a route segment) because the pair is
   * identified by two key values, not a single resource id; NestJS's
   * ValidationPipe still validates `RetractDecisionQueryDto` the same way
   * it validates `GetCandidatesQueryDto` elsewhere in this controller.
   */
  @Delete('projects/:id/decisions')
  @Roles(...EDITOR_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  retractDecision(@Param('id') id: string, @Query() query: RetractDecisionQueryDto, @CurrentUser() user: User) {
    return this.service.retractDecision(id, query, user.organizationId);
  }

  @Get('runs/:runId/clusters')
  getClusters(
    @Param('runId') runId: string,
    @Query() query: GetClustersQueryDto,
    @CurrentUser() user: User,
  ) {
    return this.service.listClusters(runId, user.organizationId, query);
  }

  @Get('runs/:runId/evaluate')
  getEvaluate(@Param('runId') runId: string, @CurrentUser() user: User) {
    return this.service.evaluate(runId, user.organizationId);
  }

  @Post('projects/:id/gold-pairs')
  @Roles(...EDITOR_ROLES)
  addGoldPair(@Param('id') id: string, @Body() dto: AddGoldPairDto, @CurrentUser() user: User) {
    return this.service.addGoldPair(id, dto, user.organizationId, user.id);
  }
}
