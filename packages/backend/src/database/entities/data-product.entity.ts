import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export type ProductStatus =
  | 'draft'
  | 'validated'
  | 'active'
  | 'deprecated'
  | 'decommissioned';

export type PortType = 'outputport' | 'inputport' | 'controlport' | 'observabilityport';
export type PortTechnology = 'sql' | 'rest' | 'files' | 'stream';

export interface PortSchema {
  columns: Array<{ name: string; type: string; description?: string; nullable?: boolean }>;
}

@Entity('data_products')
export class DataProduct {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { nullable: true })
  domain: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('text', { default: 'draft' })
  status: ProductStatus;

  @Column('text', { default: '1.0.0' })
  version: string;

  @Column('jsonb', { nullable: true })
  descriptor: Record<string, any>;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('text', { name: 'owned_by', nullable: true })
  ownedBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany('DataProductPort', 'product', { cascade: true, eager: false })
  ports: any[];
}

@Entity('data_product_ports')
export class DataProductPort {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'product_id' })
  productId: string;

  @Column('text')
  name: string;

  @Column('text', { name: 'port_type', default: 'outputport' })
  portType: PortType;

  @Column('text', { default: 'sql' })
  technology: PortTechnology;

  @Column('text', { name: 'connection_id', nullable: true })
  connectionId: string;

  @Column('text', { name: 'transformation_id', nullable: true })
  transformationId: string;

  @Column('jsonb', { nullable: true })
  schema: PortSchema;

  @Column('text', { nullable: true })
  description: string;

  @ManyToOne(() => DataProduct, (p) => p.ports, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: DataProduct;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
