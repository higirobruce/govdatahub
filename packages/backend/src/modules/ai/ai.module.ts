import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { LocalProviderService } from './providers/local-provider.service';
import { CustomProviderService } from './providers/custom-provider.service';

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
  providers: [
    AiService,
    LocalProviderService,
    CustomProviderService,
  ],
  exports: [AiService],
})
export class AiModule {}
