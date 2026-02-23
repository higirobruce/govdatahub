import { IsString, IsOptional, IsBoolean, IsNumber, IsEnum, IsArray, Min, Max } from 'class-validator';
import { AiProvider } from '../../../database/entities/organization-settings.entity';

export class UpdateSettingsDto {
  // AI Provider Configuration
  @IsOptional()
  @IsEnum(AiProvider)
  aiProvider?: AiProvider;

  @IsOptional()
  @IsString()
  aiModel?: string;

  @IsOptional()
  @IsString()
  aiApiKey?: string;

  @IsOptional()
  @IsString()
  aiApiEndpoint?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  aiTemperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100000)
  aiMaxTokens?: number;

  // NL2SQL Settings
  @IsOptional()
  @IsBoolean()
  nl2sqlEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  nl2sqlIncludeSchemaContext?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(10000)
  nl2sqlMaxQueryLength?: number;

  @IsOptional()
  @IsBoolean()
  nl2sqlAutoExecute?: boolean;

  @IsOptional()
  @IsBoolean()
  nl2sqlShowReasoning?: boolean;

  // Safety Settings
  @IsOptional()
  @IsBoolean()
  sqlValidationEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedSqlOperations?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000000)
  maxRowsLimit?: number;

  // General Settings
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(600)
  queryTimeoutSeconds?: number;

  @IsOptional()
  @IsBoolean()
  enableQueryHistory?: boolean;

  @IsOptional()
  @IsBoolean()
  enableQuerySharing?: boolean;
}
