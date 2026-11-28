import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { OrganizationSettings } from '../../database/entities/organization-settings.entity';

const BATCH_SIZE = 32;

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly model = process.env.EMBEDDINGS_MODEL || 'bge-m3';
  private readonly timeoutMs = parseInt(process.env.AI_TIMEOUT_MS || '120000', 10);

  async embed(texts: string[], settings: OrganizationSettings): Promise<number[][]> {
    const endpoint = settings.aiApiEndpoint || 'http://localhost:11434';
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const chunk = texts.slice(i, i + BATCH_SIZE);
      try {
        const response = await axios.post(
          `${endpoint}/api/embed`,
          { model: this.model, input: chunk },
          { timeout: this.timeoutMs },
        );
        out.push(...response.data.embeddings);
      } catch (error) {
        this.logger.error(`Embedding request failed: ${(error as Error).message}`);
        throw error;
      }
    }
    return out;
  }

  /** pgvector text literal: '[0.1,0.2,...]' */
  toVectorLiteral(v: number[]): string {
    return `[${v.join(',')}]`;
  }
}
