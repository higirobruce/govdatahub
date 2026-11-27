import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { SavedDashboardsService } from './saved-dashboards.service';

@ApiTags('public')
@Controller('public/dashboards')
export class PublicDashboardsController {
  constructor(
    private readonly service: SavedDashboardsService,
    private readonly jwtService: JwtService,
  ) {}

  @Get(':token')
  @ApiOperation({ summary: 'Fetch a publicly shared dashboard by token (no auth required)' })
  @ApiParam({ name: 'token', description: 'Share token from /share endpoint' })
  getPublicDashboard(@Param('token') token: string) {
    return this.service.findByShareToken(token, this.jwtService);
  }
}
