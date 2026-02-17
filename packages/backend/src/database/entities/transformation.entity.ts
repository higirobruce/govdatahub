import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('transformations')
export class Transformation {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  description: string;

  @Column('text', { name: 'source_connection_id' })
  sourceConnectionId: string;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('text', { name: 'sql_query' })
  sqlQuery: string;

  @Column('text', { name: 'output_config' })
  outputConfig: string; // Encrypted JSON

  @Column('text', { default: 'active' })
  status: string; // 'active' | 'paused'

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column('timestamp', { nullable: true, name: 'last_run_at' })
  lastRunAt: Date;
}
