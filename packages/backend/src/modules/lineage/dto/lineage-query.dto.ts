import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsArray,
  IsString,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NodeType } from '../types/lineage.types';

export class LineageQueryDto {
  @ApiProperty({ required: false, enum: NodeType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(NodeType, { each: true })
  nodeTypes?: NodeType[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  datasetId?: string;

  @ApiProperty({ required: false, enum: ['upstream', 'downstream', 'both'] })
  @IsOptional()
  @IsEnum(['upstream', 'downstream', 'both'])
  direction?: 'upstream' | 'downstream' | 'both';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false, example: 3, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  maxDepth?: number;
}
