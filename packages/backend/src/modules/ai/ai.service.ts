import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { IAiProvider } from './providers/base-provider.interface';
import { LocalProviderService } from './providers/local-provider.service';
import { CustomProviderService } from './providers/custom-provider.service';
import { AiProvider } from '../../database/entities/organization-settings.entity';

/**
 * AI Service - Factory for AI providers
 *
 * This service acts as a facade, selecting and instantiating
 * the appropriate AI provider based on organization settings.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly localProvider: LocalProviderService,
    private readonly customProvider: CustomProviderService
  ) {}

  /**
   * Get the appropriate AI provider based on provider type
   */
  getProvider(providerType: AiProvider): IAiProvider {
    this.logger.log(`Getting AI provider: ${providerType}`);

    switch (providerType) {
      case AiProvider.LOCAL:
        return this.localProvider;

      case AiProvider.CUSTOM:
        return this.customProvider;

      case AiProvider.OPENAI:
      case AiProvider.ANTHROPIC:
      case AiProvider.AZURE:
        throw new BadRequestException(
          `Provider ${providerType} is not yet implemented. Please use LOCAL (Ollama/LM Studio) or CUSTOM provider.`
        );

      default:
        throw new BadRequestException(`Unknown AI provider: ${providerType}`);
    }
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(providerType: AiProvider): boolean {
    return providerType === AiProvider.LOCAL || providerType === AiProvider.CUSTOM;
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): AiProvider[] {
    return [AiProvider.LOCAL, AiProvider.CUSTOM];
  }
}
