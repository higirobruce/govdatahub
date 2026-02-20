import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';

export class CreateShareDto {
  @ApiProperty({ example: 'Customer Analytics Dataset' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Curated customer data for analytics' })
  @IsString()
  description: string;

  @ApiProperty({ example: 'staged', enum: ['staged', 'connection', 'transformation'] })
  @IsEnum(['staged', 'connection', 'transformation'])
  datasetType: 'staged' | 'connection' | 'transformation';

  @ApiProperty({ example: 'uuid-of-dataset' })
  @IsString()
  datasetId: string;

  @ApiProperty({ example: 'customers', required: false })
  @IsOptional()
  @IsString()
  tableName?: string;

  @ApiProperty({ example: 'organization', enum: ['public', 'organization', 'private'] })
  @IsEnum(['public', 'organization', 'private'])
  accessLevel: 'public' | 'organization' | 'private';

  @ApiProperty({ example: true, description: 'Generate API key for programmatic access' })
  @IsOptional()
  @IsBoolean()
  generateApiKey?: boolean;

  @ApiProperty({ example: true, description: 'Generate shareable link token' })
  @IsOptional()
  @IsBoolean()
  generateShareToken?: boolean;
}
