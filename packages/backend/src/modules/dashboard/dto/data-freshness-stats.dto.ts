import { ApiProperty } from '@nestjs/swagger';

export class StaleDatasetDto {
  @ApiProperty({ example: 'uuid-1234' })
  id: string;

  @ApiProperty({ example: 'Old Customer Data' })
  name: string;

  @ApiProperty({ example: 'staged' })
  type: string;

  @ApiProperty({ example: 45 })
  daysSinceLastAccess: number;

  @ApiProperty({ example: '2026-01-05T10:00:00Z' })
  lastAccessedAt: string;
}

export class FailedTransformationDto {
  @ApiProperty({ example: 'uuid-1234' })
  id: string;

  @ApiProperty({ example: 'Daily User Analytics' })
  name: string;

  @ApiProperty({ example: '2026-02-21T02:00:00Z' })
  lastRunAt: string;

  @ApiProperty({ example: 'Connection timeout' })
  errorMessage: string;

  @ApiProperty({ example: 3 })
  consecutiveFailures: number;
}

export class DataFreshnessStatsDto {
  @ApiProperty({ example: 5 })
  staleDatasets: number;

  @ApiProperty({ example: 2 })
  failedTransformations: number;

  @ApiProperty({ example: 15 })
  totalTransformations: number;

  @ApiProperty({ example: 86.7 })
  transformationSuccessRate: number;

  @ApiProperty({ type: [StaleDatasetDto] })
  staleDatasetsList: StaleDatasetDto[];

  @ApiProperty({ type: [FailedTransformationDto] })
  failedTransformationsList: FailedTransformationDto[];
}
