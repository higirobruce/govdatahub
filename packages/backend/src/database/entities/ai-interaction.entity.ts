import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('ai_interactions')
export class AiInteraction {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('text', { name: 'user_id', nullable: true })
  userId: string | null;

  @Column('text')
  feature: string;

  @Column('text', { nullable: true })
  model: string | null;

  @Column('integer', { name: 'prompt_chars' })
  promptChars: number;

  @Column('integer', { name: 'response_chars' })
  responseChars: number;

  @Column('integer', { name: 'latency_ms' })
  latencyMs: number;

  @Column('boolean')
  success: boolean;

  @Column('text', { name: 'error_message', nullable: true })
  errorMessage: string | null;

  @Column('text', { name: 'generated_sql', nullable: true })
  generatedSql: string | null;

  @Column('boolean', { default: false })
  executed: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
