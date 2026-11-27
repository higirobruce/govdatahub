import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { JwtService } from '@nestjs/jwt';
import { SavedDashboard } from '../../database/entities/saved-dashboard.entity';
import { CreateSavedDashboardDto } from './dto/create-saved-dashboard.dto';
import { UpdateSavedDashboardDto } from './dto/update-saved-dashboard.dto';

@Injectable()
export class SavedDashboardsService {
  constructor(
    @InjectRepository(SavedDashboard)
    private readonly repo: Repository<SavedDashboard>,
  ) {}

  findAll(organizationId: string, userId: string): Promise<SavedDashboard[]> {
    return this.repo.find({
      where: [
        { organizationId, visibility: 'org' },
        { organizationId, createdBy: userId },
      ],
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

  async create(dto: CreateSavedDashboardDto, userId: string, organizationId: string): Promise<SavedDashboard> {
    const dashboard = this.repo.create({
      id: uuidv4(),
      name: dto.name,
      description: dto.description ?? null,
      widgets: dto.widgets,
      layout: dto.layout,
      visibility: dto.visibility ?? 'org',
      createdBy: userId,
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
      ...(dto.visibility !== undefined && { visibility: dto.visibility }),
    });
    return this.repo.save(dashboard);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const result = await this.repo.delete({ id, organizationId });
    if (!result.affected || result.affected === 0) {
      throw new NotFoundException(`Dashboard ${id} not found`);
    }
  }

  async generateShareToken(
    id: string,
    organizationId: string,
    jwtService: JwtService,
  ): Promise<{ token: string; expiresAt: Date }> {
    await this.findOne(id, organizationId); // throws NotFoundException if not found
    const expiresInSeconds = 30 * 24 * 60 * 60; // 30 days
    const token = jwtService.sign(
      { type: 'dashboard_share', dashboardId: id, organizationId },
      { expiresIn: expiresInSeconds },
    );
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    return { token, expiresAt };
  }

  async findByShareToken(token: string, jwtService: JwtService): Promise<Partial<SavedDashboard>> {
    let payload: any;
    try {
      payload = jwtService.verify(token);
    } catch {
      throw new NotFoundException('Invalid or expired share link');
    }
    if (payload.type !== 'dashboard_share') {
      throw new NotFoundException('Invalid share token type');
    }
    const dashboard = await this.repo.findOne({
      where: { id: payload.dashboardId, organizationId: payload.organizationId },
    });
    if (!dashboard) throw new NotFoundException('Dashboard not found');
    // Return only safe fields — no organizationId exposed
    return {
      id: dashboard.id,
      name: dashboard.name,
      description: dashboard.description,
      widgets: dashboard.widgets,
      layout: dashboard.layout,
      createdAt: dashboard.createdAt,
    };
  }
}
