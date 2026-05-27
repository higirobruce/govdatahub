import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { IsSafeSql } from '../validators/safe-sql.validator';

const PARAM_TYPES = [
  'string',
  'number',
  'boolean',
  'date',
  'date_range',
  'select',
  'multi_select',
] as const;

export type SavedQueryParamType = (typeof PARAM_TYPES)[number];

export class ParamDefDto {
  @ApiProperty({ example: 'since' })
  @IsString()
  name: string;

  @ApiProperty({ enum: PARAM_TYPES, example: 'date' })
  @IsIn(PARAM_TYPES as unknown as string[])
  type: SavedQueryParamType;

  @ApiProperty()
  @IsBoolean()
  required: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  default?: unknown;
}

export class CreateSavedQueryDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  @IsUUID()
  connectionId: string;

  @ApiProperty()
  @IsString()
  @IsSafeSql()
  sql: string;

  @ApiProperty({ type: [ParamDefDto], required: false, default: [] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => ParamDefDto)
  parameters?: ParamDefDto[];

  @ApiProperty({ required: false, default: 300, minimum: 0, maximum: 86400 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  cacheTtlSeconds?: number;
}

export class UpdateSavedQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsUUID()
  connectionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsSafeSql()
  sql?: string;

  @ApiProperty({ type: [ParamDefDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => ParamDefDto)
  parameters?: ParamDefDto[];

  @ApiProperty({ required: false, minimum: 0, maximum: 86400 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  cacheTtlSeconds?: number;
}

export class ExecuteSavedQueryDto {
  @ApiProperty({
    required: false,
    description: 'Parameter values keyed by name; types must match the saved schema',
    example: { since: '2026-01-01' },
  })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}
