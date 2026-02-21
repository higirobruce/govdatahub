import { ApiProperty } from '@nestjs/swagger';

export class SlowQueryDto {
  @ApiProperty({ example: 'uuid-1234' })
  id: string;

  @ApiProperty({ example: 'SELECT * FROM large_table WHERE...' })
  sqlQuery: string;

  @ApiProperty({ example: 5420 })
  executionTimeMs: number;

  @ApiProperty({ example: 'success' })
  status: string;

  @ApiProperty({ example: '2026-02-21T10:30:00Z' })
  executedAt: string;

  @ApiProperty({ example: 'PostgreSQL Connection' })
  connectionName?: string;
}

export class QueryPerformanceStatsDto {
  @ApiProperty({ example: 2350 })
  avgExecutionTimeMs: number;

  @ApiProperty({ example: 156 })
  totalQueries: number;

  @ApiProperty({ example: 8 })
  failedQueries: number;

  @ApiProperty({ example: 5.1 })
  failureRate: number; // Percentage

  @ApiProperty({ example: 3 })
  timeoutQueries: number;

  @ApiProperty({ type: [SlowQueryDto] })
  slowestQueries: SlowQueryDto[];

  @ApiProperty({ example: { '2026-02-20': 45, '2026-02-21': 52 } })
  queriesByDay: Record<string, number>;
}
