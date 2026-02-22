import { ApiProperty } from '@nestjs/swagger';
import { EdgeType } from '../types/lineage.types';

export class LineageEdgeMetadataDto {
  @ApiProperty({ required: false })
  rowsProcessed?: number;

  @ApiProperty({ required: false })
  executionTimeMs?: number;

  @ApiProperty({ required: false })
  lastExecutedAt?: Date;
}

export class LineageEdgeDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  source: string;

  @ApiProperty()
  target: string;

  @ApiProperty({ enum: EdgeType })
  type: EdgeType;

  @ApiProperty({ required: false })
  label?: string;

  @ApiProperty({ type: LineageEdgeMetadataDto, required: false })
  metadata?: LineageEdgeMetadataDto;
}
