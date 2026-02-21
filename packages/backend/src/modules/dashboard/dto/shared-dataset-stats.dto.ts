import { ApiProperty } from '@nestjs/swagger';

export class MostAccessedDatasetDto {
  @ApiProperty({ example: 'uuid-1234' })
  id: string;

  @ApiProperty({ example: 'Customer Analytics Dataset' })
  name: string;

  @ApiProperty({ example: 'connection' })
  datasetType: string;

  @ApiProperty({ example: 1250 })
  accessCount: number;

  @ApiProperty({ example: '2026-02-21T14:30:00Z' })
  lastAccessedAt: string;

  @ApiProperty({ example: 'gd_abc123...' })
  apiKey: string;
}

export class SharedDatasetStatsDto {
  @ApiProperty({ example: 12 })
  totalSharedDatasets: number;

  @ApiProperty({ example: 8 })
  publicShares: number;

  @ApiProperty({ example: 3 })
  organizationShares: number;

  @ApiProperty({ example: 1 })
  privateShares: number;

  @ApiProperty({ example: 3456 })
  totalApiCalls: number;

  @ApiProperty({ example: 234 })
  apiCallsToday: number;

  @ApiProperty({ type: [MostAccessedDatasetDto] })
  mostAccessedDatasets: MostAccessedDatasetDto[];

  @ApiProperty({ example: { '2026-02-20': 198, '2026-02-21': 234 } })
  apiCallsByDay: Record<string, number>;
}
