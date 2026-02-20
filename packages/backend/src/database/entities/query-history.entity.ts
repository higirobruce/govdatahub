import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('query_history')
export class QueryHistory {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { nullable: true })
  connectionId: string | null;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('text')
  sqlQuery: string;

  @CreateDateColumn({ name: 'executed_at' })
  executedAt: Date;

  @Column('int', { nullable: true })
  executionTimeMs: number;

  @Column('int', { nullable: true })
  rowCount: number;

  @Column('text')
  status: string; // 'success' | 'error'

  @Column('text', { nullable: true })
  errorMessage: string;
}
