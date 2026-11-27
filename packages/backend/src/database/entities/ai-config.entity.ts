import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type AiProvider = 'anthropic' | 'openai' | 'ollama';

@Entity('ai_configs')
export class AiConfig {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'organization_id', unique: true })
  organizationId: string;

  @Column('text')
  provider: AiProvider;

  @Column('text', { name: 'encrypted_api_key', nullable: true })
  encryptedApiKey: string | null;

  @Column('text', { nullable: true })
  model: string | null;

  @Column('text', { name: 'ollama_url', nullable: true })
  ollamaUrl: string | null;

  @Column('text', { name: 'ollama_model', nullable: true })
  ollamaModel: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
