import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsBoolean, IsOptional, IsIn, Min, Max, ValidateIf } from 'class-validator';

const SUPPORTED_TYPES = ['postgresql', 'mysql', 'redshift', 'snowflake', 'bigquery'];

export class CreateConnectionDto {
  @ApiProperty({
    example: 'Finance DB',
    description: 'Display name for the connection',
  })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'postgresql',
    description: 'Database type',
    enum: SUPPORTED_TYPES,
  })
  @IsString()
  @IsIn(SUPPORTED_TYPES)
  type: string;

  @ApiProperty({
    example: 'localhost',
    description: 'Database host (for PostgreSQL/MySQL/Redshift) or Snowflake account identifier',
    required: false,
  })
  @ValidateIf((o) => o.type !== 'bigquery')
  @IsString()
  host?: string;

  @ApiProperty({
    example: 5432,
    description: 'Database port (not required for Snowflake or BigQuery)',
    required: false,
  })
  @ValidateIf((o) => o.type !== 'bigquery' && o.type !== 'snowflake')
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiProperty({
    example: 'admin',
    description: 'Database username (not required for BigQuery)',
    required: false,
  })
  @ValidateIf((o) => o.type !== 'bigquery')
  @IsString()
  username?: string;

  @ApiProperty({
    example: 'password123',
    description: 'Database password (not required for BigQuery)',
    required: false,
  })
  @ValidateIf((o) => o.type !== 'bigquery')
  @IsString()
  password?: string;

  @ApiProperty({
    example: 'finance_db',
    description: 'Database name (or BigQuery project ID)',
  })
  @IsString()
  database: string;

  @ApiProperty({
    example: false,
    description: 'Enable SSL connection',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  ssl?: boolean;

  @ApiProperty({
    example: 'MY_WAREHOUSE',
    description: 'Snowflake virtual warehouse (Snowflake only)',
    required: false,
  })
  @IsOptional()
  @IsString()
  warehouse?: string;

  @ApiProperty({
    example: '{"type":"service_account","project_id":"..."}',
    description: 'BigQuery service account key JSON string (BigQuery only)',
    required: false,
  })
  @ValidateIf((o) => o.type === 'bigquery')
  @IsString()
  keyFile?: string;
}
