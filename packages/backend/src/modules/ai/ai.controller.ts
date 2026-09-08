import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole, AiInteraction } from '../../database/entities';
import { AiAuditService } from './ai-audit.service';

/**
 * AI Controller
 *
 * Exposes the AI audit trail for org admins / super admins.
 */
@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiAuditService: AiAuditService) {}

  /**
   * List recent AI interactions for the caller's organization
   */
  @Get('audit')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'List recent AI interactions (audit trail)' })
  @ApiResponse({ status: 200, description: 'AI interactions retrieved successfully' })
  async getAudit(@CurrentUser() user: User): Promise<AiInteraction[]> {
    return this.aiAuditService.list(user.organizationId, 100);
  }
}
