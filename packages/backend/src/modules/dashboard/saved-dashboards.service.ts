import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { SavedDashboard } from '../../database/entities/saved-dashboard.entity';
import { CreateSavedDashboardDto } from './dto/create-saved-dashboard.dto';
import { UpdateSavedDashboardDto } from './dto/update-saved-dashboard.dto';

@Injectable()
export class SavedDashboardsService {
  constructor(
    @InjectRepository(SavedDashboard)
    private readonly repo: Repository<SavedDashboard>,
  ) {}

  findAll(organizationId: string): Promise<SavedDashboard[]> {
    return this.repo.find({
      where: { organizationId },
      order: { updatedAt: 'DESC' },
    });
  }

  async findOne(id: string, organizationId: string): Promise<SavedDashboard> {
    const dashboard = await this.repo.findOne({ where: { id, organizationId } });
    if (!dashboard) {
      throw new NotFoundException(`Dashboard ${id} not found`);
    }
    return dashboard;
  }

  async create(dto: CreateSavedDashboardDto, organizationId: string): Promise<SavedDashboard> {
    const dashboard = this.repo.create({
      id: uuidv4(),
      name: dto.name,
      description: dto.description ?? null,
      widgets: dto.widgets,
      layout: dto.layout,
      organizationId,
    });
    return this.repo.save(dashboard);
  }

  async update(id: string, dto: UpdateSavedDashboardDto, organizationId: string): Promise<SavedDashboard> {
    const dashboard = await this.findOne(id, organizationId);
    Object.assign(dashboard, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.widgets !== undefined && { widgets: dto.widgets }),
      ...(dto.layout !== undefined && { layout: dto.layout }),
    });
    return this.repo.save(dashboard);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const result = await this.repo.delete({ id, organizationId });
    if (!result.affected || result.affected === 0) {
      throw new NotFoundException(`Dashboard ${id} not found`);
    }
  }
}
