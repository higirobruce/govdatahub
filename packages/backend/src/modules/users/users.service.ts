import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { User, UserInvite, UserRole } from '../../database/entities';

// Roles an org_admin is allowed to assign (cannot escalate to super_admin)
const ASSIGNABLE_ROLES: UserRole[] = [
  UserRole.ORG_ADMIN,
  UserRole.DATA_STEWARD,
  UserRole.EDITOR,
  UserRole.VIEWER,
];

const INVITE_TTL_HOURS = 72;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(UserInvite)
    private inviteRepo: Repository<UserInvite>,
  ) {}

  // ── List users in org ────────────────────────────────────────────────────────

  async listByOrg(organizationId: string) {
    return this.userRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'lastLoginAt', 'createdAt'],
    });
  }

  // ── Invite ────────────────────────────────────────────────────────────────────

  async createInvite(
    organizationId: string,
    invitedBy: string,
    email: string,
    role: UserRole,
  ): Promise<UserInvite> {
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new BadRequestException(`Cannot assign role: ${role}`);
    }

    // Check no active user with this email in the org
    const existing = await this.userRepo.findOne({ where: { email, organizationId } });
    if (existing) throw new ConflictException('User with this email already exists in the organization');

    // Invalidate any pending invites for same email+org
    await this.inviteRepo
      .createQueryBuilder()
      .delete()
      .where('email = :email AND organization_id = :organizationId AND accepted_at IS NULL', { email, organizationId })
      .execute();

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

    const invite = this.inviteRepo.create({
      id: uuidv4(),
      token,
      email,
      organizationId,
      role,
      invitedBy,
      expiresAt,
      acceptedAt: null,
    });

    return this.inviteRepo.save(invite);
  }

  async getInvitesByOrg(organizationId: string): Promise<UserInvite[]> {
    return this.inviteRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async revokeInvite(id: string, organizationId: string): Promise<void> {
    const invite = await this.inviteRepo.findOne({ where: { id, organizationId } });
    if (!invite) throw new NotFoundException('Invite not found');
    await this.inviteRepo.delete(id);
  }

  // ── Accept invite (public — called from frontend token page) ─────────────────

  async acceptInvite(token: string, firstName: string, lastName: string, password: string): Promise<User> {
    const invite = await this.inviteRepo.findOne({ where: { token } });

    if (!invite) throw new BadRequestException('Invalid or expired invitation');
    if (invite.acceptedAt) throw new BadRequestException('Invitation has already been used');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invitation has expired');

    // Guard against duplicate email (race condition)
    const existing = await this.userRepo.findOne({ where: { email: invite.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await bcrypt.hash(password, 10);

    const user = this.userRepo.create({
      id: uuidv4(),
      email: invite.email,
      passwordHash,
      firstName,
      lastName,
      organizationId: invite.organizationId,
      role: invite.role,
      isActive: true,
    });

    await this.userRepo.save(user);

    // Mark invite consumed
    await this.inviteRepo.update(invite.id, { acceptedAt: new Date() });

    return user;
  }

  // ── Update user (role / active status) ───────────────────────────────────────

  async updateUser(
    id: string,
    organizationId: string,
    updates: { role?: UserRole; isActive?: boolean },
    requestorRole: UserRole,
  ): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found');

    // org_admin cannot change another org_admin unless they are super_admin
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot modify a super_admin account');
    }

    if (updates.role) {
      if (requestorRole !== UserRole.SUPER_ADMIN && !ASSIGNABLE_ROLES.includes(updates.role)) {
        throw new BadRequestException(`Cannot assign role: ${updates.role}`);
      }
      user.role = updates.role;
    }

    if (updates.isActive !== undefined) user.isActive = updates.isActive;

    return this.userRepo.save(user);
  }

  async removeUser(id: string, organizationId: string, requestorId: string): Promise<void> {
    if (id === requestorId) throw new BadRequestException('Cannot remove yourself');
    const user = await this.userRepo.findOne({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.SUPER_ADMIN) throw new ForbiddenException('Cannot remove a super_admin');
    await this.userRepo.delete(id);
  }

  // ── Validate invite token (used by frontend to pre-fill email) ───────────────

  async getInviteByToken(token: string): Promise<{ email: string; role: UserRole; organizationId: string }> {
    const invite = await this.inviteRepo.findOne({ where: { token } });
    if (!invite) throw new NotFoundException('Invalid invitation link');
    if (invite.acceptedAt) throw new BadRequestException('Invitation has already been used');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invitation has expired');
    return { email: invite.email, role: invite.role, organizationId: invite.organizationId };
  }
}
