import { ApiProperty } from '@nestjs/swagger';

export class QueryResultDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Query execution ID',
  })
  id: string;

  @ApiProperty({
    example: [
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
    ],
    description: 'Query result rows',
  })
  rows: any[];

  @ApiProperty({
    example: 2,
    description: 'Number of rows returned',
  })
  rowCount: number;

  @ApiProperty({
    example: [
      { name: 'id', type: 'integer' },
      { name: 'name', type: 'varchar' },
      { name: 'email', type: 'varchar' },
    ],
    description: 'Column information',
  })
  fields: Array<{ name: string; type: string }>;

  @ApiProperty({
    example: 125,
    description: 'Query execution time in milliseconds',
  })
  executionTimeMs: number;

  @ApiProperty({
    example: 'success',
    description: 'Query execution status',
  })
  status: string;
}
