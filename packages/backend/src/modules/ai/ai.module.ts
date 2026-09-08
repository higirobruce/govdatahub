import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiAuditService } from './ai-audit.service';
import { AiController } from './ai.controller';
import { LocalProviderService } from './providers/local-provider.service';
import { CustomProviderService } from './providers/custom-provider.service';
import { AiInteraction } from '../../database/entities';

/**
 * AI Module - Provides AI/NL2SQL functionality
 *
 * This module provides:
 * - AI provider abstraction (local, custom, etc.)
 * - Natural language to SQL conversion
 * - SQL explanation capabilities
 * - Provider connection testing
 *
 * Currently supported providers:
 * - LOCAL: Ollama, LM Studio (OpenAI-compatible APIs)
 * - CUSTOM: Any custom HTTP API endpoint
 *
 * Future providers:
 * - OPENAI: OpenAI GPT models
 * - ANTHROPIC: Anthropic Claude models
 * - AZURE: Azure OpenAI Service
 */
@Module({
  imports: [TypeOrmModule.forFeature([AiInteraction])],
  controllers: [AiController],
  providers: [
    AiService,
    AiAuditService,
    LocalProviderService,
    CustomProviderService,
  ],
  exports: [AiService, AiAuditService],
})
export class AiModule {}
