import {
  Controller, Get, Post, Patch,
  Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../database/entities';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  // ── Platform stats ────────────────────────────────────────────────────────────
  @Get('stats')
  platformStats() {
    return this.svc.platformStats();
  }

  // ── Organizations ─────────────────────────────────────────────────────────────
  @Get('organizations')
  listOrganizations() {
    return this.svc.listOrganizations();
  }

  @Get('organizations/:id')
  getOrganization(@Param('id') id: string) {
    return this.svc.getOrganization(id);
  }

  @Post('organizations')
  createOrganization(@Body() body: { name: string; subdomain: string }) {
    return this.svc.createOrganization(body.name, body.subdomain);
  }

  @Patch('organizations/:id')
  updateOrganization(
    @Param('id') id: string,
    @Body() body: { name?: string; isActive?: boolean },
  ) {
    return this.svc.updateOrganization(id, body);
  }

  // ── Users in a specific org ───────────────────────────────────────────────────
  @Get('organizations/:id/users')
  listUsersInOrg(@Param('id') id: string) {
    return this.svc.listUsersInOrg(id);
  }
}
