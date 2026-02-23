import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface PersistedCell {
  id: string;
  type: 'sql' | 'markdown';
  content: string;
  connectionId?: string;
  order: number;
}

@Entity('notebooks')
export class Notebook {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { default: '' })
  description: string;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('text', { name: 'created_by' })
  createdBy: string;

  @Column('jsonb', { default: [] })
  cells: PersistedCell[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
