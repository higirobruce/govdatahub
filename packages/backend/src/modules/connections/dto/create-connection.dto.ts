import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsBoolean, IsOptional, IsIn, Min, Max, ValidateIf } from 'class-validator';

const SUPPORTED_TYPES = [
  'postgresql',
  'mysql',
  'redshift',
  'snowflake',
  'bigquery',
  'mongodb',
  'sqlserver',
  'clickhouse',
  'sqlite',
];

/** Types that don't use a host/port/credential model */
const NO_HOST_TYPES = ['bigquery', 'sqlite'];
const NO_PORT_TYPES = ['bigquery', 'snowflake', 'sqlite'];
const NO_CREDS_TYPES = ['bigquery', 'sqlite'];

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
    description: 'Database host, Snowflake account identifier, or MongoDB connection URI',
    required: false,
  })
  @ValidateIf((o) => !NO_HOST_TYPES.includes(o.type))
  @IsString()
  host?: string;

  @ApiProperty({
    example: 5432,
    description: 'Database port (not required for Snowflake, BigQuery, or SQLite)',
    required: false,
  })
  @ValidateIf((o) => !NO_PORT_TYPES.includes(o.type))
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiProperty({
    example: 'admin',
    description: 'Database username (not required for BigQuery or SQLite)',
    required: false,
  })
  @ValidateIf((o) => !NO_CREDS_TYPES.includes(o.type))
  @IsString()
  username?: string;

  @ApiProperty({
    example: 'password123',
    description: 'Database password (not required for BigQuery or SQLite)',
    required: false,
  })
  @ValidateIf((o) => !NO_CREDS_TYPES.includes(o.type))
  @IsString()
  password?: string;

  @ApiProperty({
    example: 'finance_db',
    description: 'Database name, BigQuery project ID, or SQLite file path',
  })
  @IsString()
  database: string;

  @ApiProperty({
    example: false,
    description: 'Enable SSL/TLS connection',
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
