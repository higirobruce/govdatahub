import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('fdw_servers')
export class FdwServer {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'connection_id' })
  connectionId: string;

  @Column('text', { name: 'server_name', unique: true })
  serverName: string;

  @Column('text', { name: 'fdw_type' })
  fdwType: string; // 'postgres_fdw' | 'mysql_fdw'

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('boolean', { default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
