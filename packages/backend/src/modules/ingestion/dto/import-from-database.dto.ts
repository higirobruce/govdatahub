import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsArray, IsInt, Min, Max } from 'class-validator';

export class ImportFromDatabaseDto {
  @ApiProperty({
    description: 'Connection ID',
    example: 'uuid-of-connection',
  })
  @IsUUID()
  connectionId: string;

  @ApiProperty({
    description: 'Schema name',
    example: 'public',
  })
  @IsString()
  schema: string;

  @ApiProperty({
    description: 'Table name',
    example: 'users',
  })
  @IsString()
  table: string;

  @ApiPropertyOptional({
    description: 'Specific columns to import (optional, imports all if not specified)',
    example: ['id', 'name', 'email', 'created_at'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columns?: string[];

  @ApiPropertyOptional({
    description: 'WHERE clause to filter rows (optional)',
    example: "status = 'active' AND created_at > '2024-01-01'",
  })
  @IsOptional()
  @IsString()
  whereClause?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of rows to import (optional)',
    example: 10000,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  rowLimit?: number;

  @ApiPropertyOptional({
    description: 'Target staging table name (optional, will use schema_table if not specified)',
    example: 'active_users',
  })
  @IsOptional()
  @IsString()
  targetTable?: string;
}
