import { Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '../../database/entities';
import { CatalogSearchService, CatalogSearchResult } from './catalog-search.service';

@UseGuards(JwtAuthGuard)
@Controller('catalog-search')
export class CatalogSearchController {
  constructor(private readonly catalogSearchService: CatalogSearchService) {}

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
  reindex(@CurrentUser() user: User): Promise<{ indexed: number }> {
    return this.catalogSearchService.reindex(user.organizationId);
  }

  @Get()
  search(
    @CurrentUser() user: User,
    @Query('q') q: string,
  ): Promise<CatalogSearchResult[]> {
    return this.catalogSearchService.search(user.organizationId, q);
  }
}
