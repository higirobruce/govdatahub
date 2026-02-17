import { UserRole } from '../../../database/entities';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  organizationId: string;
  role: UserRole;
}
