import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AiConfig } from '../../database/entities/ai-config.entity';
import { EncryptionService } from '../encryption/encryption.service';
import { UpsertAiConfigDto, AiConfigResponseDto } from './dto/ai-config.dto';

@Injectable()
export class AiConfigService {
  constructor(
    @InjectRepository(AiConfig)
    private readonly repo: Repository<AiConfig>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getConfig(organizationId: string): Promise<AiConfigResponseDto> {
    const cfg = await this.repo.findOne({ where: { organizationId } });
    if (!cfg) {
      return { provider: 'anthropic', hasApiKey: false, model: null, ollamaUrl: null, ollamaModel: null };
    }
    return {
      provider: cfg.provider,
      hasApiKey: !!cfg.encryptedApiKey,
      model: cfg.model,
      ollamaUrl: cfg.ollamaUrl,
      ollamaModel: cfg.ollamaModel,
    };
  }

  async upsertConfig(organizationId: string, dto: UpsertAiConfigDto): Promise<AiConfigResponseDto> {
    let cfg = await this.repo.findOne({ where: { organizationId } });

    if (!cfg) {
      cfg = this.repo.create({ id: uuidv4(), organizationId });
    }

    cfg.provider = dto.provider;
    if (dto.apiKey) {
      cfg.encryptedApiKey = this.encryptionService.encrypt(dto.apiKey);
    }
    cfg.model = dto.model ?? cfg.model ?? null;
    cfg.ollamaUrl = dto.ollamaUrl ?? null;
    cfg.ollamaModel = dto.ollamaModel ?? null;

    await this.repo.save(cfg);

    return {
      provider: cfg.provider,
      hasApiKey: !!cfg.encryptedApiKey,
      model: cfg.model,
      ollamaUrl: cfg.ollamaUrl,
      ollamaModel: cfg.ollamaModel,
    };
  }

  async deleteConfig(organizationId: string): Promise<void> {
    await this.repo.delete({ organizationId });
  }

  async getDecryptedApiKey(organizationId: string): Promise<string | null> {
    const cfg = await this.repo.findOne({ where: { organizationId } });
    if (!cfg?.encryptedApiKey) return null;
    return this.encryptionService.decrypt(cfg.encryptedApiKey);
  }

  async getFullConfig(organizationId: string): Promise<AiConfig | null> {
    return this.repo.findOne({ where: { organizationId } });
  }
}
