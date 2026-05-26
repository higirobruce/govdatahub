import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SavedDashboardsService } from './saved-dashboards.service';
import { CreateSavedDashboardDto } from './dto/create-saved-dashboard.dto';
import { UpdateSavedDashboardDto } from './dto/update-saved-dashboard.dto';

@ApiTags('saved-dashboards')
@Controller('saved-dashboards')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SavedDashboardsController {
  constructor(
    private readonly service: SavedDashboardsService,
    private readonly jwtService: JwtService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all saved dashboards for the organization' })
  findAll(@Request() req: any) {
    return this.service.findAll(req.user.organizationId, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new saved dashboard' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSavedDashboardDto, @Request() req: any) {
    return this.service.create(dto, req.user.id, req.user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a saved dashboard by ID' })
  @ApiParam({ name: 'id', description: 'Dashboard ID' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.service.findOne(id, req.user.organizationId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a saved dashboard' })
  @ApiParam({ name: 'id', description: 'Dashboard ID' })
  update(@Param('id') id: string, @Body() dto: UpdateSavedDashboardDto, @Request() req: any) {
    return this.service.update(id, dto, req.user.organizationId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a saved dashboard' })
  @ApiParam({ name: 'id', description: 'Dashboard ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.service.remove(id, req.user.organizationId);
  }

  @Post(':id/share')
  @ApiOperation({ summary: 'Generate a public share token for a dashboard' })
  @ApiParam({ name: 'id', description: 'Dashboard ID' })
  async share(@Param('id') id: string, @Request() req: any) {
    const { token, expiresAt } = await this.service.generateShareToken(id, req.user.organizationId, this.jwtService);
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
    return {
      token,
      expiresAt,
      shareUrl: `${frontendUrl}/dashboards/view/${token}`,
      embedCode: `<iframe src="${frontendUrl}/dashboards/view/${token}" width="100%" height="600" frameborder="0" style="border:none;border-radius:8px;"></iframe>`,
    };
  }
}
