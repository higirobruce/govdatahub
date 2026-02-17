import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('cached_results')
export class CachedResult {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { nullable: true })
  queryId: string;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('text')
  results: string; // JSON string

  @CreateDateColumn({ name: 'cached_at' })
  cachedAt: Date;
}
