import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AiInteraction } from '../../database/entities';

/**
 * Generic log entry for any AI-backed feature (nl2sql_generate, nl2sql_explain,
 * and future features like error_doctor / quality_suggest).
 */
export interface AiAuditLogEntry {
  organizationId: string;
  userId?: string | null;
  feature: string;
  model?: string | null;
  promptChars: number;
  responseChars: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
  generatedSql?: string | null;
  executed?: boolean;
}

/**
 * AI Audit Service - Persists a record of every AI-backed request.
 *
 * `log()` must NEVER throw: an audit failure must never break an AI request,
 * so any repository error is caught and logged as a warning instead.
 */
@Injectable()
export class AiAuditService {
  private readonly logger = new Logger(AiAuditService.name);

  constructor(
    @InjectRepository(AiInteraction)
    private readonly repo: Repository<AiInteraction>,
  ) {}

  async log(entry: AiAuditLogEntry): Promise<void> {
    try {
      const record = this.repo.create({
        id: uuidv4(),
        organizationId: entry.organizationId,
        userId: entry.userId ?? null,
        feature: entry.feature,
        model: entry.model ?? null,
        promptChars: entry.promptChars,
        responseChars: entry.responseChars,
        latencyMs: entry.latencyMs,
        success: entry.success,
        errorMessage: entry.errorMessage ?? null,
        generatedSql: entry.generatedSql ?? null,
        executed: entry.executed ?? false,
      });
      await this.repo.save(record);
    } catch (error) {
      this.logger.warn(`Failed to persist AI audit log: ${(error as Error).message}`);
    }
  }

  async list(organizationId: string, limit = 100): Promise<AiInteraction[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
