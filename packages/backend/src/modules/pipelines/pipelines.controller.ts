import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../../database/entities';
import { PipelinesService } from './pipelines.service';
import { PipelinesExecutorService } from './pipelines-executor.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';

@UseGuards(JwtAuthGuard)
@Controller('pipelines')
export class PipelinesController {
  constructor(
    private readonly pipelinesService: PipelinesService,
    private readonly pipelinesExecutorService: PipelinesExecutorService,
  ) {}

  @Post()
  create(@Body() dto: CreatePipelineDto, @CurrentUser() user: User) {
    return this.pipelinesService.create(dto, user.organizationId, user.id);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.pipelinesService.findAll(user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.pipelinesService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePipelineDto,
    @CurrentUser() user: User,
  ) {
    return this.pipelinesService.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.pipelinesService.remove(id, user.organizationId);
  }

  @Post(':id/run')
  triggerRun(@Param('id') id: string, @CurrentUser() user: User) {
    return this.pipelinesExecutorService.run(id, user.organizationId, 'manual');
  }

  @Get(':id/runs')
  getRuns(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
  ) {
    return this.pipelinesService.getRuns(
      id,
      user.organizationId,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id/runs/:runId')
  getRun(
    @Param('id') id: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
  ) {
    return this.pipelinesService.getRun(id, runId, user.organizationId);
  }
}
