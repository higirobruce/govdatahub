import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../../database/entities';
import { ProfilingService } from './profiling.service';
import { QualityChecksService, CreateQualityCheckDto, UpdateQualityCheckDto } from './quality-checks.service';

@UseGuards(JwtAuthGuard)
@Controller('data-quality')
export class DataQualityController {
  constructor(
    private readonly profilingService: ProfilingService,
    private readonly qualityChecksService: QualityChecksService,
  ) {}

  // ─── Column profiling ────────────────────────────────────────────────────

  @Get('profiles')
  getProfile(
    @CurrentUser() user: User,
    @Query('connectionId') connectionId: string,
    @Query('schemaName') schemaName: string,
    @Query('tableName') tableName: string,
  ) {
    return this.profilingService.getLatestProfile(
      connectionId,
      user.organizationId,
      schemaName,
      tableName,
    );
  }

  @Post('profiles')
  @HttpCode(HttpStatus.OK)
  profileTable(
    @CurrentUser() user: User,
    @Body() body: { connectionId: string; schemaName: string; tableName: string },
  ) {
    return this.profilingService.profileTable(
      body.connectionId,
      user.organizationId,
      body.schemaName,
      body.tableName,
    );
  }

  // ─── Quality checks ──────────────────────────────────────────────────────

  @Get('checks')
  listChecks(
    @CurrentUser() user: User,
    @Query('connectionId') connectionId?: string,
    @Query('schemaName') schemaName?: string,
    @Query('tableName') tableName?: string,
  ) {
    return this.qualityChecksService.findAll(user.organizationId, {
      connectionId,
      schemaName,
      tableName,
    });
  }

  @Post('checks')
  createCheck(@CurrentUser() user: User, @Body() dto: CreateQualityCheckDto) {
    return this.qualityChecksService.create(dto, user.organizationId);
  }

  @Get('checks/:id')
  getCheck(@CurrentUser() user: User, @Param('id') id: string) {
    return this.qualityChecksService.findOne(id, user.organizationId);
  }

  @Patch('checks/:id')
  updateCheck(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateQualityCheckDto,
  ) {
    return this.qualityChecksService.update(id, dto, user.organizationId);
  }

  @Delete('checks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCheck(@CurrentUser() user: User, @Param('id') id: string) {
    return this.qualityChecksService.remove(id, user.organizationId);
  }

  @Post('checks/:id/run')
  @HttpCode(HttpStatus.OK)
  runCheck(@CurrentUser() user: User, @Param('id') id: string) {
    return this.qualityChecksService.runCheck(id, user.organizationId);
  }

  @Get('checks/:id/runs')
  getRunHistory(@CurrentUser() user: User, @Param('id') id: string) {
    return this.qualityChecksService.getRunHistory(id, user.organizationId);
  }
}
