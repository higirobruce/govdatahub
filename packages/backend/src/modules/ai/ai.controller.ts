import { Controller, Get, Put, Delete, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiConfigService } from './ai-config.service';
import { AiService } from './ai.service';
import { UpsertAiConfigDto, Nl2SqlRequestDto } from './dto/ai-config.dto';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/ai')
export class AiController {
  constructor(
    private readonly aiConfigService: AiConfigService,
    private readonly aiService: AiService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Get AI configuration for the current organization' })
  getConfig(@Req() req: any) {
    return this.aiConfigService.getConfig(req.user.organizationId);
  }

  @Put('config')
  @ApiOperation({ summary: 'Create or update AI configuration' })
  upsertConfig(@Req() req: any, @Body() dto: UpsertAiConfigDto) {
    return this.aiConfigService.upsertConfig(req.user.organizationId, dto);
  }

  @Delete('config')
  @ApiOperation({ summary: 'Remove AI configuration' })
  deleteConfig(@Req() req: any) {
    return this.aiConfigService.deleteConfig(req.user.organizationId);
  }

  @Post('nl2sql')
  @ApiOperation({ summary: 'Convert natural language to SQL' })
  nl2sql(@Req() req: any, @Body() dto: Nl2SqlRequestDto) {
    return this.aiService.nl2sql(req.user.organizationId, dto);
  }
}
