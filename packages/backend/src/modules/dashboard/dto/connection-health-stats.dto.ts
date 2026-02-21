import { ApiProperty } from '@nestjs/swagger';

export class ConnectionStatusDto {
  @ApiProperty({ example: 'uuid-1234' })
  id: string;

  @ApiProperty({ example: 'PostgreSQL Production' })
  name: string;

  @ApiProperty({ example: 'postgresql' })
  type: string;

  @ApiProperty({ example: 'online' })
  status: 'online' | 'offline' | 'error' | 'untested';

  @ApiProperty({ example: 156 })
  queryCount: number;

  @ApiProperty({ example: '2026-02-21T14:30:00Z' })
  lastUsedAt: string;

  @ApiProperty({ example: 0 })
  recentErrors: number;
}

export class ConnectionHealthStatsDto {
  @ApiProperty({ example: 8 })
  totalConnections: number;

  @ApiProperty({ example: 6 })
  onlineConnections: number;

  @ApiProperty({ example: 1 })
  offlineConnections: number;

  @ApiProperty({ example: 1 })
  errorConnections: number;

  @ApiProperty({ example: 2 })
  idleConnections: number; // Never queried

  @ApiProperty({ type: [ConnectionStatusDto] })
  connections: ConnectionStatusDto[];

  @ApiProperty({ example: { postgresql: 5, mysql: 3 } })
  connectionsByType: Record<string, number>;
}
