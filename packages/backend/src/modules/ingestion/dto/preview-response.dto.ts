import { ApiProperty } from '@nestjs/swagger';

export class PreviewResponseDto {
  @ApiProperty({
    example: [
      { id: 1, name: 'John Doe', age: 30 },
      { id: 2, name: 'Jane Smith', age: 25 }
    ],
    description: 'First 100 rows of data'
  })
  rows: Record<string, any>[];

  @ApiProperty({
    example: [
      { name: 'id', type: 'integer', sample: '1' },
      { name: 'name', type: 'text', sample: 'John Doe' },
      { name: 'age', type: 'integer', sample: '30' }
    ],
    description: 'Detected column schema'
  })
  schema: Array<{
    name: string;
    type: string;
    sample: any;
  }>;

  @ApiProperty({ example: 1000, description: 'Total row count in file' })
  totalRows: number;

  @ApiProperty({
    example: [
      { row: 10, column: 'age', value: 'invalid', error: 'Invalid number', type: 'VALIDATION_ERROR', severity: 'error' }
    ],
    description: 'Errors found during preview',
    required: false
  })
  errors?: any[];
}
