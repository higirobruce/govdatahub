import { ApiProperty } from '@nestjs/swagger';

export class ImportJobResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'citizens.csv' })
  fileName: string;

  @ApiProperty({ example: 1048576 })
  fileSize: number;

  @ApiProperty({ example: 'csv' })
  sourceType: string;

  @ApiProperty({ example: 'staging' })
  targetType: string;

  @ApiProperty({ example: 'users', required: false })
  targetTable?: string;

  @ApiProperty({ example: 'uuid', required: false })
  connectionId?: string;

  @ApiProperty({ example: 'processing' })
  status: string;

  @ApiProperty({ example: 5000 })
  rowsProcessed: number;

  @ApiProperty({ example: 4950 })
  rowsSucceeded: number;

  @ApiProperty({ example: 50 })
  rowsFailed: number;

  @ApiProperty({
    example: [{
      row: 10,
      column: 'age',
      value: 'invalid',
      error: 'Invalid number format',
      type: 'VALIDATION_ERROR',
      severity: 'error'
    }],
    required: false
  })
  errors?: any[];

  @ApiProperty({ example: { delimiter: ',', hasHeader: true }, required: false })
  config?: Record<string, any>;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:05:00.000Z', required: false })
  completedAt?: Date;
}
