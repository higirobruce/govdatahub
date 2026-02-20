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
  @ApiOperation({ summary: 'Regenerate API key for share' })
  @ApiParam({ name: 'id', description: 'Share ID' })
  async regenerateApiKey(@Param('id') id: string, @Request() req: any) {
    return await this.sharingService.regenerateApiKey(
      id,
      req.user.organizationId,
    );
  }

  @Post('shares/:id/regenerate-token')
  @ApiOperation({ summary: 'Regenerate share token' })
  @ApiParam({ name: 'id', description: 'Share ID' })
  async regenerateShareToken(@Param('id') id: string, @Request() req: any) {
    return await this.sharingService.regenerateShareToken(
      id,
      req.user.organizationId,
    );
  }

  @Delete('shares/:id')
  @ApiOperation({ summary: 'Delete a share' })
  @ApiParam({ name: 'id', description: 'Share ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteShare(@Param('id') id: string, @Request() req: any) {
    await this.sharingService.deleteShare(id, req.user.organizationId);
  }
}
