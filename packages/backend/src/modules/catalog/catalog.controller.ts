import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../../database/entities';
import { CatalogService } from './catalog.service';

@UseGuards(JwtAuthGuard)
@Controller('api/catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('status')
  getStatus(@CurrentUser() user: User) {
    return this.catalogService.getStatus(user.organizationId);
  }

  @Post('test-connection')
  testConnection(@CurrentUser() user: User) {
    return this.catalogService.testConnection(user.organizationId);
  }

  @Post('sync')
  sync(@CurrentUser() user: User) {
    return this.catalogService.syncAll(user.organizationId);
  }
}
