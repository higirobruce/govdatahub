import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  Dashboard,
  DashboardFilterDef,
  DashboardLayoutItem,
  DashboardWidgetConfig,
} from '../../database/entities';
import {
  CreateDashboardDto,
  UpdateDashboardDto,
} from './dto/dashboard.dto';

const FILTER_NAME_RX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const REQUIRES_OPTIONS = new Set(['select', 'multi_select']);

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
    const filters = (dto.filters ?? []) as DashboardFilterDef[];
    this.assertFilterDefs(filters);

    const entity = this.repo.create({
      id: uuidv4(),
      organizationId,
      createdBy: userId,
      name: dto.name,
      description: dto.description ?? null,
      widgets: (dto.widgets ?? []) as DashboardWidgetConfig[],
      layout: (dto.layout ?? []) as DashboardLayoutItem[],
      filters,
    });
    return this.repo.save(entity);
  }

  async update(
    id: string,
    dto: UpdateDashboardDto,
    organizationId: string,
  ): Promise<Dashboard> {
    const d = await this.getById(id, organizationId);

    if (dto.filters !== undefined) {
      this.assertFilterDefs(dto.filters as DashboardFilterDef[]);
      d.filters = dto.filters as DashboardFilterDef[];
    }
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

  private assertFilterDefs(defs: DashboardFilterDef[]): void {
    const seen = new Set<string>();
    for (const f of defs) {
      if (!f || typeof f.name !== 'string' || !FILTER_NAME_RX.test(f.name)) {
        throw new BadRequestException(
          `Invalid filter name "${f?.name}"; must match [a-zA-Z_][a-zA-Z0-9_]*`,
        );
      }
      if (seen.has(f.name)) {
        throw new BadRequestException(`Duplicate filter "${f.name}"`);
      }
      seen.add(f.name);
      if (REQUIRES_OPTIONS.has(f.type)) {
        if (!Array.isArray(f.options) || f.options.length === 0) {
          throw new BadRequestException(
            `Filter "${f.name}" of type "${f.type}" requires a non-empty options array`,
          );
        }
      }
      if (f.default !== undefined && f.default !== null) {
        this.assertFilterDefault(f);
      }
    }
  }

  /**
   * Validates a filter's `default` against its declared type — same intent
   * as `QueryTemplateService.validateValue` but with filter-type semantics
   * (filter `text` ↔ string, no `boolean` filter, etc.). Kept inline so the
   * dashboard module doesn't take a dependency on the queries module.
   */
  private assertFilterDefault(def: DashboardFilterDef): void {
    const value = def.default;
    const fail = (expected: string) => {
      throw new BadRequestException(
        `Filter "${def.name}" default expected ${expected}, got ${
          Array.isArray(value) ? 'array' : typeof value
        }`,
      );
    };
    switch (def.type) {
      case 'text':
        if (typeof value !== 'string') fail('string');
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          fail('finite number');
        }
        break;
      case 'date':
        if (typeof value !== 'string' && !(value instanceof Date)) {
          fail('date string or Date');
        }
        break;
      case 'date_range':
        if (
          typeof value !== 'object' ||
          value === null ||
          !('start' in (value as object)) ||
          !('end' in (value as object))
        ) {
          fail('object with start and end fields');
        }
        break;
      case 'select':
        if (typeof value !== 'string') {
          fail('string');
          return;
        }
        if (def.options && !def.options.includes(value)) {
          throw new BadRequestException(
            `Filter "${def.name}" default "${value}" is not in options [${def.options.join(', ')}]`,
          );
        }
        break;
      case 'multi_select':
        if (
          !Array.isArray(value) ||
          value.some((v) => typeof v !== 'string')
        ) {
          fail('string array');
          return;
        }
        if (def.options) {
          const optionSet = new Set(def.options);
          const invalid = (value as string[]).filter(
            (v) => !optionSet.has(v),
          );
          if (invalid.length > 0) {
            throw new BadRequestException(
              `Filter "${def.name}" default values [${invalid.join(', ')}] not in options [${def.options.join(', ')}]`,
            );
          }
        }
        break;
    }
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const d = await this.getById(id, organizationId);
    await this.repo.remove(d);
  }
}
