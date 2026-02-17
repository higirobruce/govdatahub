import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('connections')
export class Connection {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  type: string; // 'postgresql' | 'mysql'

  @Column('text')
  config: string; // Encrypted JSON containing host, port, username, password, database, ssl

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
