import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class OpenMetadataClientService {
  private readonly logger = new Logger(OpenMetadataClientService.name);
  private client: AxiosInstance | null = null;

  configure(host: string, jwtToken: string): void {
    this.client = axios.create({
      baseURL: host.replace(/\/$/, ''),
      timeout: 10_000,
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async testConnectivity(): Promise<boolean> {
    this.assertConfigured();
    await this.client!.get('/api/v1/system/config');
    return true;
  }

  /** Upsert a DatabaseService by FQN */
  async upsertDatabaseService(fqn: string, payload: object): Promise<void> {
    this.assertConfigured();
    await this.withRetry(() =>
      this.client!.put(`/api/v1/services/databaseServices`, payload),
    );
  }

  /** Upsert a Database by FQN */
  async upsertDatabase(payload: object): Promise<void> {
    this.assertConfigured();
    await this.withRetry(() =>
      this.client!.put(`/api/v1/databases`, payload),
    );
  }

  /** Upsert a Table (columns included in payload) by FQN */
  async upsertTable(payload: object): Promise<void> {
    this.assertConfigured();
    await this.withRetry(() =>
      this.client!.put(`/api/v1/tables`, payload),
    );
  }

  /** Upsert a PipelineService */
  async upsertPipelineService(payload: object): Promise<void> {
    this.assertConfigured();
    await this.withRetry(() =>
      this.client!.put(`/api/v1/services/pipelineServices`, payload),
    );
  }

  /** Upsert a Pipeline */
  async upsertPipeline(payload: object): Promise<void> {
    this.assertConfigured();
    await this.withRetry(() =>
      this.client!.put(`/api/v1/pipelines`, payload),
    );
  }

  /** Add a lineage edge */
  async putLineage(payload: object): Promise<void> {
    this.assertConfigured();
    await this.withRetry(() =>
      this.client!.put(`/api/v1/lineage`, payload),
    );
  }

  /** Post a query history record */
  async postQueryHistory(payload: object): Promise<void> {
    this.assertConfigured();
    await this.withRetry(() =>
      this.client!.put(`/api/v1/queries`, payload),
    );
  }

  private assertConfigured(): void {
    if (!this.client) {
      throw new Error('OpenMetadataClientService is not configured. Call configure() first.');
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status && status >= 500) {
        this.logger.warn(`OM API returned ${status}, retrying once…`);
        return fn();
      }
      throw err;
    }
  }
}
