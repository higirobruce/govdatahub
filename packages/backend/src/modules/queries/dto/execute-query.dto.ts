import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { IsSafeSql } from '../validators/safe-sql.validator';

export class ExecuteQueryDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Connection ID to execute query on',
  })
  @IsString()
  @IsUUID()
  connectionId: string;

  @ApiProperty({
    example: 'SELECT * FROM users LIMIT 10',
    description: 'SQL query to execute',
  })
  @IsString()
  @IsSafeSql()
  sql: string;

  @ApiProperty({
    example: true,
    description: 'Whether to cache the query results',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  cacheResults?: boolean;
}
