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
import { DashboardsService } from './dashboards.service';
import {
  CreateDashboardDto,
  UpdateDashboardDto,
} from './dto/dashboard.dto';
import { Dashboard, User } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('dashboards')
@Controller('dashboards')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get()
  @ApiOperation({ summary: 'List dashboards for the org' })
  @ApiResponse({ status: 200, type: [Dashboard] })
  list(@CurrentUser() user: User): Promise<Dashboard[]> {
    return this.dashboardsService.list(user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a dashboard by id' })
  @ApiResponse({ status: 200, type: Dashboard })
  @ApiResponse({ status: 404, description: 'Not found' })
  get(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<Dashboard> {
    return this.dashboardsService.getById(id, user.organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a dashboard' })
  @ApiResponse({ status: 201, type: Dashboard })
  create(
    @Body() dto: CreateDashboardDto,
    @CurrentUser() user: User,
  ): Promise<Dashboard> {
    return this.dashboardsService.create(dto, user.organizationId, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a dashboard' })
  @ApiResponse({ status: 200, type: Dashboard })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDashboardDto,
    @CurrentUser() user: User,
  ): Promise<Dashboard> {
    return this.dashboardsService.update(id, dto, user.organizationId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a dashboard' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.dashboardsService.remove(id, user.organizationId);
  }
}
