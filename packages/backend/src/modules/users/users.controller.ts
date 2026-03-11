import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly svc: UsersService,
    private readonly authService: AuthService,
  ) {}

  // ── List users in my org (org_admin+) ────────────────────────────────────────
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  listUsers(@CurrentUser() user: User) {
    return this.svc.listByOrg(user.organizationId);
  }

  // ── List pending invites (org_admin+) ────────────────────────────────────────
  @Get('invites')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  listInvites(@CurrentUser() user: User) {
    return this.svc.getInvitesByOrg(user.organizationId);
  }

  // ── Send invite (org_admin+) ─────────────────────────────────────────────────
  // super_admin may pass organizationId to invite into any org
  @Post('invites')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  async createInvite(
    @CurrentUser() user: User,
    @Body() body: { email: string; role: UserRole; organizationId?: string },
  ) {
    const targetOrgId =
      user.role === UserRole.SUPER_ADMIN && body.organizationId
        ? body.organizationId
        : user.organizationId;

    const invite = await this.svc.createInvite(targetOrgId, user.id, body.email, body.role);
    return { id: invite.id, email: invite.email, role: invite.role, token: invite.token, expiresAt: invite.expiresAt };
  }

  // ── Revoke invite (org_admin+) ───────────────────────────────────────────────
  @Delete('invites/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvite(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.revokeInvite(id, user.organizationId);
  }

  // ── Validate invite token (PUBLIC) ───────────────────────────────────────────
  @Get('invites/validate/:token')
  @Public()
  validateInvite(@Param('token') token: string) {
    return this.svc.getInviteByToken(token);
  }

  // ── Accept invite — creates user + returns JWT for seamless login ─────────────
  @Post('invites/accept')
  @Public()
  async acceptInvite(
    @Body() body: { token: string; firstName: string; lastName: string; password: string },
  ) {
    const user = await this.svc.acceptInvite(body.token, body.firstName, body.lastName, body.password);
    // Auto-login: generate auth response so frontend can store token and redirect
    return this.authService.login({ email: user.email, password: body.password });
  }

  // ── Update user role / status (org_admin+) ───────────────────────────────────
  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  updateUser(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { role?: UserRole; isActive?: boolean },
  ) {
    return this.svc.updateUser(id, user.organizationId, body, user.role as UserRole);
  }

  // ── Remove user (org_admin+) ─────────────────────────────────────────────────
  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeUser(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.removeUser(id, user.organizationId, user.id);
  }
}
