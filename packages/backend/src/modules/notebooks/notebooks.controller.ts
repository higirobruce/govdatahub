import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '../../database/entities';
import { NotebooksService } from './notebooks.service';
import { CreateNotebookDto } from './dto/create-notebook.dto';
import { UpdateNotebookDto } from './dto/update-notebook.dto';
import { ExecuteCellDto } from './dto/execute-cell.dto';
import { SaveAsTransformationDto } from './dto/save-as-transformation.dto';

@ApiTags('notebooks')
@ApiBearerAuth()
@Controller('notebooks')
@UseGuards(JwtAuthGuard)
export class NotebooksController {
  constructor(private readonly notebooksService: NotebooksService) {}

  @Get()
  @ApiOperation({ summary: 'List all notebooks (metadata only, no cells)' })
  findAll(@CurrentUser() user: User) {
    return this.notebooksService.findAll(user.organizationId);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Create a new empty notebook' })
  create(@Body() dto: CreateNotebookDto, @CurrentUser() user: User) {
    return this.notebooksService.create(dto, user.organizationId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a notebook with all cells' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.notebooksService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Update notebook name, description, or cells' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNotebookDto,
    @CurrentUser() user: User,
  ) {
    return this.notebooksService.update(id, dto, user.organizationId);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a notebook' })
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.notebooksService.remove(id, user.organizationId);
  }

  @Post(':id/cells/:cellId/execute')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Execute a SQL cell against a connection' })
  executeCell(
    @Param('id') notebookId: string,
    @Param('cellId') cellId: string,
    @Body() dto: ExecuteCellDto,
    @CurrentUser() user: User,
  ) {
    return this.notebooksService.executeCell(
      notebookId,
      cellId,
      dto,
      user.organizationId,
    );
  }

  @Post(':id/save-as-transformation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Save selected SQL cells as a reusable Transformation' })
  saveAsTransformation(
    @Param('id') id: string,
    @Body() dto: SaveAsTransformationDto,
    @CurrentUser() user: User,
  ) {
    return this.notebooksService.saveAsTransformation(
      id,
      dto,
      user.organizationId,
    );
  }
}
