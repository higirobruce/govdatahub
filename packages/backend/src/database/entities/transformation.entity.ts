import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Connection } from './connection.entity';
import { Organization } from './organization.entity';

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

  @ManyToOne(() => Connection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_connection_id' })
  sourceConnection: Connection;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column('text', { name: 'sql_query' })
  sqlQuery: string;

  @Column('text', { name: 'output_config' })
  outputConfig: string; // Encrypted JSON: { mode: 'cache', maxRows: 10000 }

  @Column('text', { default: 'active' })
  status: 'active' | 'paused';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column('timestamp', { nullable: true, name: 'last_run_at' })
  lastRunAt: Date | null;
}
