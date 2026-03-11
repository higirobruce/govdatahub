import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import { UserRole } from './user-role.enum';

@Entity('user_invites')
export class UserInvite {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { unique: true })
  token: string;

  @Column('text')
  email: string;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('text')
  role: UserRole;

  @Column('text', { name: 'invited_by' })
  invitedBy: string; // userId of the inviter

  @Column('timestamp', { name: 'expires_at' })
  expiresAt: Date;

  @Column('timestamp', { name: 'accepted_at', nullable: true })
  acceptedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
