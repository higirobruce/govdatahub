import { Controller, Get, Put, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationSettings } from '../../database/entities/organization-settings.entity';
import { AiProviderInfo } from './dto/ai-provider-config.dto';

@ApiTags('settings')
@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get organization settings' })
  @ApiResponse({ status: 200, description: 'Settings retrieved successfully' })
  async getSettings(@Req() req): Promise<OrganizationSettings> {
    const organizationId = req.user.organizationId;
    return this.settingsService.getOrganizationSettings(organizationId);
  }

  @Put()
  @ApiOperation({ summary: 'Update organization settings' })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  async updateSettings(
    @Req() req,
    @Body() dto: UpdateSettingsDto
  ): Promise<OrganizationSettings> {
    const organizationId = req.user.organizationId;
    const userId = req.user.id;
    return this.settingsService.updateSettings(organizationId, userId, dto);
  }

  @Get('ai-providers')
  @ApiOperation({ summary: 'Get available AI providers' })
  @ApiResponse({ status: 200, description: 'AI providers retrieved successfully' })
  getAiProviders(): AiProviderInfo[] {
    return this.settingsService.getAvailableProviders();
  }
}
