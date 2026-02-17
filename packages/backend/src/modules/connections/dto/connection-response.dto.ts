import { ApiProperty } from '@nestjs/swagger';

export class ConnectionResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Unique connection identifier',
  })
  id: string;

  @ApiProperty({
    example: 'Finance DB',
    description: 'Display name for the connection',
  })
  name: string;

  @ApiProperty({
    example: 'postgresql',
    description: 'Database type',
  })
  type: string;

  @ApiProperty({
    example: 'localhost',
    description: 'Database host',
  })
  host: string;

  @ApiProperty({
    example: 5432,
    description: 'Database port',
  })
  port: number;

  @ApiProperty({
    example: 'finance_db',
    description: 'Database name',
  })
  database: string;

  @ApiProperty({
    example: false,
    description: 'SSL enabled',
  })
  ssl: boolean;

  @ApiProperty({
    example: '2024-02-16T10:30:00.000Z',
    description: 'Connection creation timestamp',
  })
  createdAt: Date;
}
