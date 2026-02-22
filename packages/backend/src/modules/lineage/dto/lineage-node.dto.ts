import { ApiProperty } from '@nestjs/swagger';
import { NodeType } from '../types/lineage.types';

export class LineageNodeMetadataDto {
  @ApiProperty({ required: false })
  status?: 'active' | 'paused' | 'completed' | 'failed';

  @ApiProperty({ required: false })
  rowCount?: number;

  @ApiProperty({ required: false })
  lastRunAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ required: false })
  connectionType?: string;

  @ApiProperty({ required: false })
  sourceType?: string;

  @ApiProperty({ required: false })
  tableName?: string;

  @ApiProperty({ required: false })
  datasetType?: string;
}

export class LineageNodeDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: NodeType })
  type: NodeType;

  @ApiProperty()
  label: string;

  @ApiProperty({ type: LineageNodeMetadataDto })
  metadata: LineageNodeMetadataDto;
}
