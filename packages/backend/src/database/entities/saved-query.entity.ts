import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ParamDef } from '../../modules/queries/query-template.service';

@Entity('saved_queries')
export class SavedQuery {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { nullable: true })
  description: string | null;

  @Column('text', { name: 'connection_id' })
  connectionId: string;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('text', { name: 'created_by' })
  createdBy: string;

  @Column('text')
  sql: string;

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  parameters: ParamDef[];

  @Column('int', { name: 'cache_ttl_seconds', default: 300 })
  cacheTtlSeconds: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
