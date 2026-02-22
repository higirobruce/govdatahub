import { ApiProperty } from '@nestjs/swagger';

export class DatasetCatalogItemDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Customer Data' })
  name: string;

  @ApiProperty({ example: 'Customer information from CRM' })
  description: string;

  @ApiProperty({ example: 'staged', enum: ['staged', 'connection', 'transformation', 'cross-query'] })
  type: 'staged' | 'connection' | 'transformation' | 'cross-query';

  @ApiProperty({ example: 'customers' })
  tableName: string;

  @ApiProperty({ example: 15000 })
  rowCount: number;

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  lastUpdated: string;

  @ApiProperty({ example: 'PostgreSQL Production' })
  source: string;

  @ApiProperty({ example: false })
  isShared: boolean;

  @ApiProperty({ example: 'private', enum: ['public', 'organization', 'private'] })
  accessLevel: string;

  @ApiProperty({ example: 'uuid' })
  shareId?: string;
}
