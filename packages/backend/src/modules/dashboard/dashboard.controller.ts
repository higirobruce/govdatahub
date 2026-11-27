import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../database/entities';
import { DatasetCatalogService } from './dataset-catalog.service';
import { DatasetSharingService } from './dataset-sharing.service';
import { CreateShareDto } from './dto/create-share.dto';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(
    private readonly catalogService: DatasetCatalogService,
    private readonly sharingService: DatasetSharingService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getStats(@Request() req: any) {
    return await this.catalogService.getStats(req.user.organizationId);
  }

  @Get('catalog')
  @ApiOperation({ summary: 'Get dataset catalog' })
  async getCatalog(@Request() req: any) {
    return await this.catalogService.getCatalog(req.user.organizationId);
  }

  @Get('shares')
  @ApiOperation({ summary: 'Get all dataset shares' })
  async getShares(@Request() req: any) {
    return await this.sharingService.getShares(req.user.organizationId);
  }

  @Post('shares')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Create a new dataset share' })
  async createShare(@Body() dto: CreateShareDto, @Request() req: any) {
    return await this.sharingService.createShare(
      dto,
      req.user.organizationId,
      req.user.id,
    );
  }

  @Get('shares/:id')
  @ApiOperation({ summary: 'Get share details' })
  @ApiParam({ name: 'id', description: 'Share ID' })
  async getShare(@Param('id') id: string, @Request() req: any) {
    return await this.sharingService.getShare(id, req.user.organizationId);
  }

  @Post('shares/:id/regenerate-api-key')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Regenerate API key for share' })
  @ApiParam({ name: 'id', description: 'Share ID' })
  async regenerateApiKey(@Param('id') id: string, @Request() req: any) {
    return await this.sharingService.regenerateApiKey(
      id,
      req.user.organizationId,
    );
  }

  @Post('shares/:id/regenerate-token')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Regenerate share token' })
  @ApiParam({ name: 'id', description: 'Share ID' })
  async regenerateShareToken(@Param('id') id: string, @Request() req: any) {
    return await this.sharingService.regenerateShareToken(
      id,
      req.user.organizationId,
    );
  }

  @Delete('shares/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Delete a share' })
  @ApiParam({ name: 'id', description: 'Share ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteShare(@Param('id') id: string, @Request() req: any) {
    await this.sharingService.deleteShare(id, req.user.organizationId);
  }

  @Get('analytics/query-performance')
  @ApiOperation({
    summary: 'Get query performance analytics',
    description: 'Returns query execution statistics, failure rates, slowest queries, and trends over the specified time period',
  })
  async getQueryPerformanceStats(@Request() req: any) {
    return await this.catalogService.getQueryPerformanceStats(req.user.organizationId, 7);
  }

  @Get('analytics/shared-datasets')
  @ApiOperation({
    summary: 'Get shared dataset analytics',
    description: 'Returns statistics about shared datasets, API usage, and access patterns',
  })
  async getSharedDatasetStats(@Request() req: any) {
    return await this.catalogService.getSharedDatasetStats(req.user.organizationId, 7);
  }

  @Get('analytics/data-freshness')
  @ApiOperation({
    summary: 'Get data freshness and quality stats',
    description: 'Returns information about stale datasets, failed transformations, and data quality metrics',
  })
  async getDataFreshnessStats(@Request() req: any) {
    return await this.catalogService.getDataFreshnessStats(req.user.organizationId);
  }

  @Get('analytics/connection-health')
  @ApiOperation({
    summary: 'Get connection health status',
    description: 'Returns connection status, query counts, error rates, and health metrics for all connections',
  })
  async getConnectionHealthStats(@Request() req: any) {
    return await this.catalogService.getConnectionHealthStats(req.user.organizationId);
  }
}
