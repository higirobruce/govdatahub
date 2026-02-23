import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OrganizationSettings,
  AiProvider,
} from '../../database/entities/organization-settings.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { AiProviderInfo } from './dto/ai-provider-config.dto';
import { EncryptionService } from '../encryption/encryption.service';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(OrganizationSettings)
    private settingsRepository: Repository<OrganizationSettings>,
    private encryptionService: EncryptionService
  ) {}

  /**
   * Get organization settings, create with defaults if not exists
   */
  async getOrganizationSettings(organizationId: string): Promise<OrganizationSettings> {
    let settings = await this.settingsRepository.findOne({
      where: { organizationId },
    });

    if (!settings) {
      // Create default settings
      settings = this.settingsRepository.create({
        organizationId,
        aiProvider: AiProvider.OPENAI,
        aiTemperature: 0.1,
        aiMaxTokens: 2000,
        nl2sqlEnabled: true,
        nl2sqlIncludeSchemaContext: true,
        nl2sqlMaxQueryLength: 1000,
        nl2sqlAutoExecute: false,
        nl2sqlShowReasoning: true,
        sqlValidationEnabled: true,
        allowedSqlOperations: ['SELECT'],
        maxRowsLimit: 10000,
        queryTimeoutSeconds: 30,
        enableQueryHistory: true,
        enableQuerySharing: true,
      });
      settings = await this.settingsRepository.save(settings);
    }

    // Don't return encrypted API key in response
    return this.sanitizeSettings(settings);
  }

  /**
   * Update organization settings
   */
  async updateSettings(
    organizationId: string,
    userId: string,
    dto: UpdateSettingsDto
  ): Promise<OrganizationSettings> {
    let settings = await this.settingsRepository.findOne({
      where: { organizationId },
    });

    if (!settings) {
      settings = this.settingsRepository.create({
        organizationId,
        createdBy: userId,
      });
    }

    // Update fields
    Object.assign(settings, dto);
    settings.updatedBy = userId;

    // Encrypt API key if provided
    if (dto.aiApiKey) {
      settings.aiApiKey = await this.encryptionService.encrypt(dto.aiApiKey);
    }

    settings = await this.settingsRepository.save(settings);

    return this.sanitizeSettings(settings);
  }

  /**
   * Get decrypted API key (for internal use only)
   */
  async getDecryptedApiKey(organizationId: string): Promise<string | null> {
    const settings = await this.settingsRepository.findOne({
      where: { organizationId },
    });

    if (!settings || !settings.aiApiKey) {
      return null;
    }

    try {
      return await this.encryptionService.decrypt(settings.aiApiKey);
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
      return null;
    }
  }

  /**
   * Get available AI providers
   */
  getAvailableProviders(): AiProviderInfo[] {
    return [
      {
        id: AiProvider.OPENAI,
        name: 'OpenAI',
        models: [
          {
            id: 'gpt-4-turbo-preview',
            name: 'GPT-4 Turbo',
            description: 'Most capable model, best for complex queries',
          },
          {
            id: 'gpt-4',
            name: 'GPT-4',
            description: 'High quality, suitable for most use cases',
          },
          {
            id: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            description: 'Fast and cost-effective',
          },
        ],
        requiresApiKey: true,
        requiresEndpoint: false,
      },
      {
        id: AiProvider.ANTHROPIC,
        name: 'Anthropic Claude',
        models: [
          {
            id: 'claude-3-opus-20240229',
            name: 'Claude 3 Opus',
            description: 'Most capable, best for complex schemas',
          },
          {
            id: 'claude-3-sonnet-20240229',
            name: 'Claude 3 Sonnet',
            description: 'Balanced performance and cost',
          },
          {
            id: 'claude-3-haiku-20240307',
            name: 'Claude 3 Haiku',
            description: 'Fastest and most cost-effective',
          },
        ],
        requiresApiKey: true,
        requiresEndpoint: false,
      },
      {
        id: AiProvider.AZURE,
        name: 'Azure OpenAI',
        models: [
          {
            id: 'gpt-4',
            name: 'GPT-4',
            description: 'Azure-hosted GPT-4',
          },
          {
            id: 'gpt-35-turbo',
            name: 'GPT-3.5 Turbo',
            description: 'Azure-hosted GPT-3.5',
          },
        ],
        requiresApiKey: true,
        requiresEndpoint: true,
      },
      {
        id: AiProvider.LOCAL,
        name: 'Local (Ollama/LM Studio)',
        models: [
          {
            id: 'codellama',
            name: 'Code Llama',
            description: 'Meta\'s code-specialized model',
          },
          {
            id: 'mistral',
            name: 'Mistral',
            description: 'Open-source model from Mistral AI',
          },
          {
            id: 'llama2',
            name: 'Llama 2',
            description: 'Meta\'s general-purpose model',
          },
        ],
        requiresApiKey: false,
        requiresEndpoint: true,
      },
      {
        id: AiProvider.CUSTOM,
        name: 'Custom API',
        models: [
          {
            id: 'custom',
            name: 'Custom Model',
            description: 'Use your own API endpoint',
          },
        ],
        requiresApiKey: false,
        requiresEndpoint: true,
      },
    ];
  }

  /**
   * Remove sensitive data from settings before sending to client
   */
  private sanitizeSettings(settings: OrganizationSettings): OrganizationSettings {
    const sanitized = { ...settings };

    // Replace encrypted API key with masked version
    if (sanitized.aiApiKey) {
      sanitized.aiApiKey = '••••••••';
    }

    return sanitized;
  }
}
