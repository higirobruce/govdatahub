import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsUUID, IsEnum } from 'class-validator';
import { UserRole } from '../../../database/entities';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePassword123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'uuid-of-organization', required: false })
  @IsUUID()
  organizationId?: string;

  @ApiProperty({ enum: UserRole, example: UserRole.VIEWER, required: false })
  @IsEnum(UserRole)
  role?: UserRole;
}
