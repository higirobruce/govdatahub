import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  Dashboard,
  DashboardLayoutItem,
  DashboardWidgetConfig,
} from '../../database/entities';
import {
  CreateDashboardDto,
  UpdateDashboardDto,
} from './dto/dashboard.dto';

@Injectable()
export class DashboardsService {
  constructor(
    @InjectRepository(Dashboard)
    private readonly repo: Repository<Dashboard>,
  ) {}

  async list(organizationId: string): Promise<Dashboard[]> {
    return this.repo.find({
      where: { organizationId },
      order: { updatedAt: 'DESC' },
    });
  }

  async getById(id: string, organizationId: string): Promise<Dashboard> {
    const d = await this.repo.findOne({ where: { id, organizationId } });
    if (!d) {
      throw new NotFoundException(`Dashboard ${id} not found`);
    }
    return d;
  }

  async create(
    dto: CreateDashboardDto,
    organizationId: string,
    userId: string,
  ): Promise<Dashboard> {
    const entity = this.repo.create({
      id: uuidv4(),
      organizationId,
      createdBy: userId,
      name: dto.name,
      description: dto.description ?? null,
      widgets: (dto.widgets ?? []) as DashboardWidgetConfig[],
      layout: (dto.layout ?? []) as DashboardLayoutItem[],
    });
    return this.repo.save(entity);
  }

  async update(
    id: string,
    dto: UpdateDashboardDto,
    organizationId: string,
  ): Promise<Dashboard> {
    const d = await this.getById(id, organizationId);

    if (dto.name !== undefined) d.name = dto.name;
    if (dto.description !== undefined) d.description = dto.description;
    if (dto.widgets !== undefined) {
      d.widgets = dto.widgets as DashboardWidgetConfig[];
    }
    if (dto.layout !== undefined) {
      d.layout = dto.layout as DashboardLayoutItem[];
    }

    return this.repo.save(d);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const d = await this.getById(id, organizationId);
    await this.repo.remove(d);
  }
}
