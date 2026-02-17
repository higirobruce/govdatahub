import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('organizations')
export class Organization {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { unique: true })
  subdomain: string;

  @Column('text', { nullable: true })
  settings: string; // Encrypted JSON for organization-specific settings

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
