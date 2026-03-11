import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Organization, User } from '../../database/entities';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  // ── Organizations ─────────────────────────────────────────────────────────────

  async listOrganizations() {
    const orgs = await this.orgRepo.find({ order: { createdAt: 'DESC' } });
    // Attach user counts
    const counts = await this.userRepo
      .createQueryBuilder('u')
      .select('u.organization_id', 'orgId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('u.organization_id')
      .getRawMany();

    const countMap = Object.fromEntries(counts.map((r) => [r.orgId, parseInt(r.count, 10)]));
    return orgs.map((o) => ({ ...o, userCount: countMap[o.id] ?? 0 }));
  }

  async getOrganization(id: string) {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    const userCount = await this.userRepo.count({ where: { organizationId: id } });
    return { ...org, userCount };
  }

  async createOrganization(name: string, subdomain: string): Promise<Organization> {
    const existing = await this.orgRepo.findOne({ where: { subdomain } });
    if (existing) throw new ConflictException('Subdomain already taken');

    const org = this.orgRepo.create({ id: uuidv4(), name, subdomain, isActive: true });
    return this.orgRepo.save(org);
  }

  async updateOrganization(id: string, updates: { name?: string; isActive?: boolean }): Promise<Organization> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    if (updates.name !== undefined) org.name = updates.name;
    if (updates.isActive !== undefined) org.isActive = updates.isActive;
    return this.orgRepo.save(org);
  }

  // ── Platform stats ────────────────────────────────────────────────────────────

  async platformStats() {
    const [totalOrgs, activeOrgs, totalUsers] = await Promise.all([
      this.orgRepo.count(),
      this.orgRepo.count({ where: { isActive: true } }),
      this.userRepo.count(),
    ]);

    const usersByRole = await this.userRepo
      .createQueryBuilder('u')
      .select('u.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('u.role')
      .getRawMany();

    return {
      totalOrgs,
      activeOrgs,
      totalUsers,
      usersByRole: Object.fromEntries(usersByRole.map((r) => [r.role, parseInt(r.count, 10)])),
    };
  }

  // ── Users in any org (super_admin view) ───────────────────────────────────────

  async listUsersInOrg(orgId: string) {
    return this.userRepo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'lastLoginAt', 'createdAt'],
    });
  }
}
