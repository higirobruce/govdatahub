import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

const FILTER_TYPES = [
  'date_range',
  'date',
  'select',
  'multi_select',
  'text',
  'number',
] as const;

export type DashboardFilterTypeDto = (typeof FILTER_TYPES)[number];

export class DashboardFilterDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: FILTER_TYPES })
  @IsIn(FILTER_TYPES as unknown as string[])
  type: DashboardFilterTypeDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  default?: unknown;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Allowed values for select / multi_select filters',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  options?: string[];
}

export class DashboardLayoutItemDto {
  @ApiProperty()
  @IsString()
  i: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  x: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  y: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  w: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  h: number;
}

export class DashboardWidgetDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty({ example: 'bar' })
  @IsString()
  type: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  savedQueryId?: string;

  @ApiProperty({
    required: false,
    description: 'Map of saved-query parameter name → dashboard filter name',
  })
  @IsOptional()
  @IsObject()
  parameterBindings?: Record<string, string>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class CreateDashboardDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [DashboardWidgetDto], required: false, default: [] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => DashboardWidgetDto)
  widgets?: DashboardWidgetDto[];

  @ApiProperty({ type: [DashboardLayoutItemDto], required: false, default: [] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => DashboardLayoutItemDto)
  layout?: DashboardLayoutItemDto[];

  @ApiProperty({ type: [DashboardFilterDto], required: false, default: [] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => DashboardFilterDto)
  filters?: DashboardFilterDto[];
}

export class UpdateDashboardDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [DashboardWidgetDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => DashboardWidgetDto)
  widgets?: DashboardWidgetDto[];

  @ApiProperty({ type: [DashboardLayoutItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => DashboardLayoutItemDto)
  layout?: DashboardLayoutItemDto[];

  @ApiProperty({ type: [DashboardFilterDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => DashboardFilterDto)
  filters?: DashboardFilterDto[];
}
