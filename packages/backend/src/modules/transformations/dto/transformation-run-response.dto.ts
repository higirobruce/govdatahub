import { ApiProperty } from '@nestjs/swagger';

export class TransformationRunResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  transformationId: string;

  @ApiProperty({
    example: 'Daily User Stats',
    description: 'Name of the transformation',
  })
  transformationName?: string;

  @ApiProperty({ example: 'manual', enum: ['manual', 'scheduled'] })
  triggerType: string;

  @ApiProperty({ example: '2024-02-16T14:30:00Z' })
  startedAt: Date;

  @ApiProperty({
    example: '2024-02-16T14:35:00Z',
    required: false,
    nullable: true,
  })
  completedAt: Date | null;

  @ApiProperty({ example: 5234, required: false, nullable: true })
  executionTimeMs: number | null;

  @ApiProperty({ example: 1250, required: false, nullable: true })
  rowsProcessed: number | null;

  @ApiProperty({
    example: 'success',
    enum: ['running', 'success', 'failed', 'timeout'],
  })
  status: string;

  @ApiProperty({
    example: null,
    required: false,
    nullable: true,
  })
  errorMessage: string | null;
}
