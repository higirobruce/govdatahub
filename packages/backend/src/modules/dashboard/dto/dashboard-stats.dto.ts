import { ApiProperty } from '@nestjs/swagger';

export class DashboardStatsDto {
  @ApiProperty({ example: 25, description: 'Total queryable datasets' })
  totalDatasets: number;

  @ApiProperty({ example: 5, description: 'Active database connections' })
  activeConnections: number;

  @ApiProperty({ example: 142, description: 'Queries executed today' })
  queriesToday: number;

  @ApiProperty({ example: 8, description: 'Active API endpoints' })
  activeApiEndpoints: number;

  @ApiProperty({ example: 3, description: 'Failed jobs requiring attention' })
  failedJobs: number;

  @ApiProperty({ example: 12, description: 'Transformations' })
  totalTransformations: number;
}
