import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Notebook } from '../../database/entities/notebook.entity';
import { QueriesService } from '../queries/queries.service';
import { TransformationsService } from '../transformations/transformations.service';
import { CreateNotebookDto } from './dto/create-notebook.dto';
import { UpdateNotebookDto } from './dto/update-notebook.dto';
import { ExecuteCellDto } from './dto/execute-cell.dto';
import { SaveAsTransformationDto } from './dto/save-as-transformation.dto';

@Injectable()
export class NotebooksService {
  constructor(
    @InjectRepository(Notebook)
    private notebooksRepository: Repository<Notebook>,
    private queriesService: QueriesService,
    private transformationsService: TransformationsService,
  ) {}

  async create(
    dto: CreateNotebookDto,
    organizationId: string,
    userId: string,
  ): Promise<Notebook> {
    const notebook = this.notebooksRepository.create({
      id: uuidv4(),
      name: dto.name,
      description: dto.description ?? '',
      organizationId,
      createdBy: userId,
      cells: [],
    });
    return this.notebooksRepository.save(notebook);
  }

  async findAll(organizationId: string): Promise<Partial<Notebook>[]> {
    return this.notebooksRepository
      .createQueryBuilder('n')
      .select(['n.id', 'n.name', 'n.description', 'n.organizationId', 'n.createdBy', 'n.createdAt', 'n.updatedAt'])
      .where('n.organizationId = :organizationId', { organizationId })
      .orderBy('n.updatedAt', 'DESC')
      .getMany();
  }

  async findOne(id: string, organizationId: string): Promise<Notebook> {
    const notebook = await this.notebooksRepository.findOne({
      where: { id, organizationId },
    });
    if (!notebook) {
      throw new NotFoundException(`Notebook ${id} not found`);
    }
    return notebook;
  }

  async update(
    id: string,
    dto: UpdateNotebookDto,
    organizationId: string,
  ): Promise<Notebook> {
    const notebook = await this.findOne(id, organizationId);
    if (dto.name !== undefined) notebook.name = dto.name;
    if (dto.description !== undefined) notebook.description = dto.description;
    if (dto.cells !== undefined) notebook.cells = dto.cells;
    return this.notebooksRepository.save(notebook);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const notebook = await this.findOne(id, organizationId);
    await this.notebooksRepository.remove(notebook);
  }

  async executeCell(
    notebookId: string,
    _cellId: string,
    dto: ExecuteCellDto,
    organizationId: string,
  ) {
    // Verify notebook belongs to the org before executing
    await this.findOne(notebookId, organizationId);

    return this.queriesService.executeQuery(
      { connectionId: dto.connectionId, sql: dto.sql, cacheResults: false },
      organizationId,
    );
  }

  async saveAsTransformation(
    notebookId: string,
    dto: SaveAsTransformationDto,
    organizationId: string,
  ) {
    // Verify notebook belongs to the org
    await this.findOne(notebookId, organizationId);

    return this.transformationsService.create(
      {
        name: dto.name,
        description: dto.description,
        sourceConnectionId: dto.sourceConnectionId,
        sqlQuery: dto.combinedSql,
      },
      organizationId,
    );
  }
}
