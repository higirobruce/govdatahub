import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../../database/entities';
import { DataProductsService } from './data-products.service';
import type { ProductStatus } from '../../database/entities';

@UseGuards(JwtAuthGuard)
@Controller('data-products')
export class DataProductsController {
  constructor(private readonly svc: DataProductsService) {}

  // ── Products ────────────────────────────────────────────────────────────────

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
  create(@Body() body: any, @CurrentUser() user: User) {
    return this.svc.create(body, user.organizationId, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: User) {
    return this.svc.update(id, body, user.organizationId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.remove(id, user.organizationId);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  @Post(':id/transition')
  transition(
    @Param('id') id: string,
    @Body('status') status: ProductStatus,
    @CurrentUser() user: User,
  ) {
    return this.svc.transition(id, status, user.organizationId);
  }

  // ── Ports ───────────────────────────────────────────────────────────────────

  @Get(':id/ports')
  listPorts(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.listPorts(id, user.organizationId);
  }

  @Post(':id/ports')
  addPort(@Param('id') id: string, @Body() body: any, @CurrentUser() user: User) {
    return this.svc.addPort(id, body, user.organizationId);
  }

  @Patch(':id/ports/:portId')
  updatePort(
    @Param('id') id: string,
    @Param('portId') portId: string,
    @Body() body: any,
    @CurrentUser() user: User,
  ) {
    return this.svc.updatePort(id, portId, body, user.organizationId);
  }

  @Delete(':id/ports/:portId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePort(
    @Param('id') id: string,
    @Param('portId') portId: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.removePort(id, portId, user.organizationId);
  }
}
