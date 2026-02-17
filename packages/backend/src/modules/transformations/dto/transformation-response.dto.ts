import { ApiProperty } from '@nestjs/swagger';
import { OutputConfigDto } from './output-config.dto';

export class TransformationResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Daily User Stats' })
  name: string;

  @ApiProperty({ example: 'Aggregates user activity for analytics' })
  description: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  sourceConnectionId: string;

  @ApiProperty({
    example: 'SELECT user_id, COUNT(*) as count FROM events GROUP BY user_id',
  })
  sqlQuery: string;

  @ApiProperty({
    example: { mode: 'cache', maxRows: 10000 },
    type: OutputConfigDto,
  })
  outputConfig: OutputConfigDto;

  @ApiProperty({ example: 'active', enum: ['active', 'paused'] })
  status: string;

  @ApiProperty({ example: '2024-02-16T10:00:00Z' })
  createdAt: Date;

  @ApiProperty({
    example: '2024-02-16T14:30:00Z',
    required: false,
    nullable: true,
  })
  lastRunAt: Date | null;
}
