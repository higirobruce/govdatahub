import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User, Organization, UserRole } from '../../database/entities';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Organization)
    private organizationsRepository: Repository<Organization>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    // Check if user already exists
    const existingUser = await this.usersRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // If no organizationId provided, check if we need to create first super_admin
    let organizationId = registerDto.organizationId;
    let role = registerDto.role || UserRole.VIEWER;

    if (!organizationId) {
      // Check if there are any users in the system
      const userCount = await this.usersRepository.count();

      if (userCount === 0) {
        // First user ever - create default organization and make them super_admin
        const defaultOrg = this.organizationsRepository.create({
          id: uuidv4(),
          name: 'Default Organization',
          subdomain: 'default',
          isActive: true,
        });
        const savedOrg = await this.organizationsRepository.save(defaultOrg);
        organizationId = savedOrg.id;
        role = UserRole.SUPER_ADMIN;
      } else {
        throw new BadRequestException('Organization ID is required');
      }
    }

    // Verify organization exists
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new BadRequestException('Organization not found');
    }

    if (!organization.isActive) {
      throw new BadRequestException('Organization is inactive');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(registerDto.password, this.saltRounds);

    // Create user
    const user = this.usersRepository.create({
      id: uuidv4(),
      email: registerDto.email,
      passwordHash,
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      organizationId,
      role,
      isActive: true,
    });

    const savedUser = await this.usersRepository.save(user);

    // Generate JWT token
    return this.generateAuthResponse(savedUser);
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    // Find user by email
    const user = await this.usersRepository.findOne({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify organization is active
    const organization = await this.organizationsRepository.findOne({
      where: { id: user.organizationId },
    });

    if (!organization || !organization.isActive) {
      throw new UnauthorizedException('Organization is inactive');
    }

    // Update last login time
    await this.usersRepository.update(user.id, {
      lastLoginAt: new Date(),
    });

    // Generate JWT token
    return this.generateAuthResponse(user);
  }

  private generateAuthResponse(user: User): AuthResponseDto {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role as UserRole,
    };

    const accessToken = this.jwtService.sign(payload);

    // Remove password hash from user object
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      accessToken,
      user: userWithoutPassword,
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id: userId, isActive: true },
    });
  }
}
