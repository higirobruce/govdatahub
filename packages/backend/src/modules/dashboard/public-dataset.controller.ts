import {
  Controller,
  Get,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { DatasetSharingService } from './dataset-sharing.service';

@ApiTags('public')
@Controller('public')
export class PublicDatasetController {
  constructor(private readonly sharingService: DatasetSharingService) {}

  @Get('datasets/:apiKey')
  @ApiOperation({ summary: 'Access dataset via API key' })
  @ApiParam({ name: 'apiKey', description: 'API key for dataset access' })
  async getDataByApiKey(@Param('apiKey') apiKey: string) {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    return await this.sharingService.getDataByApiKey(apiKey);
  }

  @Get('shared/:shareToken')
  @ApiOperation({ summary: 'Access dataset via share token' })
  @ApiParam({ name: 'shareToken', description: 'Share token' })
  async getDataByShareToken(@Param('shareToken') shareToken: string) {
    return await this.sharingService.getDataByShareToken(shareToken);
  }
}
