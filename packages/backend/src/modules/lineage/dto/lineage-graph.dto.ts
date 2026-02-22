import { ApiProperty } from '@nestjs/swagger';
import { LineageNodeDto } from './lineage-node.dto';
import { LineageEdgeDto } from './lineage-edge.dto';

export class LineageGraphMetadataDto {
  @ApiProperty()
  totalNodes: number;

  @ApiProperty()
  totalEdges: number;

  @ApiProperty()
  generatedAt: Date;
}

export class LineageGraphDto {
  @ApiProperty({ type: [LineageNodeDto] })
  nodes: LineageNodeDto[];

  @ApiProperty({ type: [LineageEdgeDto] })
  edges: LineageEdgeDto[];

  @ApiProperty({ type: LineageGraphMetadataDto })
  metadata: LineageGraphMetadataDto;
}
