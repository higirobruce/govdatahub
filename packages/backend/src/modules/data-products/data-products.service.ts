import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { DataProduct, DataProductPort, ProductStatus } from '../../database/entities';

// ── Valid lifecycle transitions ────────────────────────────────────────────────
const TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  draft:         ['validated'],
  validated:     ['active', 'draft'],
  active:        ['deprecated'],
  deprecated:    ['decommissioned'],
  decommissioned: [],
};

// ── DTOs ───────────────────────────────────────────────────────────────────────
export interface CreateDataProductDto {
  name: string;
  domain?: string;
  description?: string;
  version?: string;
  descriptor?: Record<string, any>;
}

export interface UpdateDataProductDto {
  name?: string;
  domain?: string;
  description?: string;
  version?: string;
  descriptor?: Record<string, any>;
}

export interface CreatePortDto {
  name: string;
  portType?: DataProductPort['portType'];
  technology?: DataProductPort['technology'];
  connectionId?: string;
  transformationId?: string;
  schema?: DataProductPort['schema'];
  description?: string;
}

export interface UpdatePortDto {
  name?: string;
  portType?: DataProductPort['portType'];
  technology?: DataProductPort['technology'];
  connectionId?: string;
  transformationId?: string;
  schema?: DataProductPort['schema'];
  description?: string;
}

@Injectable()
export class DataProductsService {
  constructor(
    @InjectRepository(DataProduct)
    private productRepo: Repository<DataProduct>,
    @InjectRepository(DataProductPort)
    private portRepo: Repository<DataProductPort>,
    private eventEmitter: EventEmitter2,
  ) {}

  // ── Products ────────────────────────────────────────────────────────────────

  async list(organizationId: string, filters?: { status?: string; domain?: string }) {
    const qb = this.productRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.ports', 'ports')
      .where('p.organization_id = :organizationId', { organizationId })
      .orderBy('p.updated_at', 'DESC');

    if (filters?.status) qb.andWhere('p.status = :status', { status: filters.status });
    if (filters?.domain) qb.andWhere('p.domain = :domain', { domain: filters.domain });

    return qb.getMany();
  }

  async findOne(id: string, organizationId: string) {
    const product = await this.productRepo.findOne({
      where: { id, organizationId },
      relations: ['ports'],
    });
    if (!product) throw new NotFoundException(`Data product ${id} not found`);
    return product;
  }

  async create(dto: CreateDataProductDto, organizationId: string, userId: string) {
    const product = this.productRepo.create({
      id: uuidv4(),
      ...dto,
      status: 'draft',
      version: dto.version ?? '1.0.0',
      organizationId,
      ownedBy: userId,
    });
    const saved = await this.productRepo.save(product);
    this.eventEmitter.emit('data-product.created', saved);
    return saved;
  }

  async update(id: string, dto: UpdateDataProductDto, organizationId: string) {
    const product = await this.findOne(id, organizationId);
    if (product.status === 'decommissioned') {
      throw new BadRequestException('Cannot edit a decommissioned data product');
    }
    Object.assign(product, dto);
    return this.productRepo.save(product);
  }

  async remove(id: string, organizationId: string) {
    const product = await this.findOne(id, organizationId);
    await this.productRepo.remove(product);
    this.eventEmitter.emit('data-product.deleted', { id, organizationId });
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async transition(id: string, toStatus: ProductStatus, organizationId: string) {
    const product = await this.findOne(id, organizationId);
    const allowed = TRANSITIONS[product.status];

    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${product.status}' to '${toStatus}'. ` +
        `Allowed: ${allowed.length ? allowed.join(', ') : 'none'}`,
      );
    }

    product.status = toStatus;
    const saved = await this.productRepo.save(product);
    this.eventEmitter.emit(`data-product.${toStatus}`, saved);
    return saved;
  }

  // ── Ports ───────────────────────────────────────────────────────────────────

  async listPorts(productId: string, organizationId: string) {
    await this.findOne(productId, organizationId); // validate ownership
    return this.portRepo.find({ where: { productId }, order: { createdAt: 'ASC' } });
  }

  async addPort(productId: string, dto: CreatePortDto, organizationId: string) {
    await this.findOne(productId, organizationId);
    const port = this.portRepo.create({
      id: uuidv4(),
      productId,
      portType: 'outputport',
      technology: 'sql',
      ...dto,
    });
    return this.portRepo.save(port);
  }

  async updatePort(productId: string, portId: string, dto: UpdatePortDto, organizationId: string) {
    await this.findOne(productId, organizationId);
    const port = await this.portRepo.findOne({ where: { id: portId, productId } });
    if (!port) throw new NotFoundException(`Port ${portId} not found`);
    Object.assign(port, dto);
    return this.portRepo.save(port);
  }

  async removePort(productId: string, portId: string, organizationId: string) {
    await this.findOne(productId, organizationId);
    const port = await this.portRepo.findOne({ where: { id: portId, productId } });
    if (!port) throw new NotFoundException(`Port ${portId} not found`);
    await this.portRepo.remove(port);
  }

  // ── Stats for dashboard ──────────────────────────────────────────────────────

  async stats(organizationId: string) {
    const rows = await this.productRepo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('p.organization_id = :organizationId', { organizationId })
      .groupBy('p.status')
      .getRawMany();

    return rows.reduce((acc, r) => ({ ...acc, [r.status]: parseInt(r.count) }), {
      draft: 0, validated: 0, active: 0, deprecated: 0, decommissioned: 0,
    });
  }
}
