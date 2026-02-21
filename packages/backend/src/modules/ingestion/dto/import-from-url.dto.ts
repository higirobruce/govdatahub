import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUrl, IsOptional, IsObject, IsIn } from 'class-validator';
import { ImportTargetType } from '../../../database/entities';

export class ImportFromUrlDto {
  @ApiProperty({
    description: 'URL to the file (CSV, JSON, or Excel)',
    example: 'https://data.gov/api/views/abcd-1234/rows.csv',
  })
  @IsUrl()
  url: string;

  @ApiPropertyOptional({
    description: 'Target type for import',
    enum: ['staging', 'database'],
    default: 'staging',
  })
  @IsOptional()
  @IsIn(['staging', 'database'])
  targetType?: ImportTargetType;

  @ApiPropertyOptional({
    description: 'Target table name (optional, will use filename if not provided)',
  })
  @IsOptional()
  @IsString()
  targetTable?: string;

  @ApiPropertyOptional({
    description: 'Connection ID (required if targetType is "database")',
  })
  @IsOptional()
  @IsString()
  connectionId?: string;

  @ApiPropertyOptional({
    description: 'Authentication configuration',
    example: {
      type: 'bearer',
      token: 'your-bearer-token',
    },
  })
  @IsOptional()
  @IsObject()
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'api_key';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    apiKeyHeader?: string;
  };

  @ApiPropertyOptional({
    description: 'Custom HTTP headers',
    example: {
      'User-Agent': 'DataGate/1.0',
    },
  })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'File parsing configuration',
    example: {
      delimiter: ',',
      hasHeader: true,
      skipEmptyRows: true,
    },
  })
  @IsOptional()
  @IsObject()
  config?: {
    delimiter?: string;
    hasHeader?: boolean;
    sheetName?: string;
    skipEmptyRows?: boolean;
    trimWhitespace?: boolean;
  };
}
