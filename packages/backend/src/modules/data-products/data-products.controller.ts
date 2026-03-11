import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';
import { DataProductsService } from './data-products.service';
import type { ProductStatus } from '../../database/entities';

// Steward-and-above: the roles that can approve/publish/deprecate
const GOVERNANCE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.DATA_STEWARD];

// Editor-and-above: can read, create, and submit for validation
const EDITOR_ROLES = [...GOVERNANCE_ROLES, UserRole.EDITOR];

@UseGuards(JwtAuthGuard)
@Controller('data-products')
export class DataProductsController {
  constructor(private readonly svc: DataProductsService) {}

  // ── Products ─────────────────────────────────────────────────────────────────
  // All authenticated users can read products (including viewer)

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('domain') domain?: string,
  ) {
    return this.svc.list(user.organizationId, { status, domain });
  }

  @Get('stats')
  stats(@CurrentUser() user: User) {
    return this.svc.stats(user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.findOne(id, user.organizationId);
  }

  @Post()
  @Roles(...EDITOR_ROLES)
  create(@Body() body: any, @CurrentUser() user: User) {
    return this.svc.create(body, user.organizationId, user.id);
  }

  @Patch(':id')
  @Roles(...EDITOR_ROLES)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: User) {
    return this.svc.update(id, body, user.organizationId, user.role as UserRole);
  }

  @Delete(':id')
  @Roles(...EDITOR_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.remove(id, user.organizationId, user.id, user.role as UserRole);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  // Transitions to validated/draft: editor+
  // Transitions to active/deprecated/decommissioned: steward+ only (enforced in service)

  @Post(':id/transition')
  @Roles(...EDITOR_ROLES)
  transition(
    @Param('id') id: string,
    @Body('status') status: ProductStatus,
    @CurrentUser() user: User,
  ) {
    return this.svc.transition(id, status, user.organizationId, user.role as UserRole);
  }

  // ── Ports ─────────────────────────────────────────────────────────────────────

  @Get(':id/ports')
  listPorts(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.listPorts(id, user.organizationId);
  }

  @Post(':id/ports')
  @Roles(...EDITOR_ROLES)
  addPort(@Param('id') id: string, @Body() body: any, @CurrentUser() user: User) {
    return this.svc.addPort(id, body, user.organizationId);
  }

  @Patch(':id/ports/:portId')
  @Roles(...EDITOR_ROLES)
  updatePort(
    @Param('id') id: string,
    @Param('portId') portId: string,
    @Body() body: any,
    @CurrentUser() user: User,
  ) {
    return this.svc.updatePort(id, portId, body, user.organizationId);
  }

  @Delete(':id/ports/:portId')
  @Roles(...EDITOR_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  removePort(
    @Param('id') id: string,
    @Param('portId') portId: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.removePort(id, portId, user.organizationId);
  }
}
