import { Controller, Get, Query, Req, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LineageBuilderService } from './lineage-builder.service';
import { LineageQueryDto } from './dto/lineage-query.dto';
import { LineageGraphDto } from './dto/lineage-graph.dto';

@ApiTags('lineage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/lineage')
export class LineageController {
  constructor(private lineageBuilder: LineageBuilderService) {}

  @Get('graph')
  @ApiOperation({ summary: 'Get data lineage graph for organization' })
  @ApiResponse({ status: 200, description: 'Lineage graph retrieved successfully', type: LineageGraphDto })
  async getLineageGraph(@Req() req, @Query() query: LineageQueryDto) {
    const organizationId = req.user.organizationId;
    return this.lineageBuilder.buildLineageGraph(organizationId, query);
  }

  @Get('dataset/:id')
  @ApiOperation({ summary: 'Get lineage for specific dataset' })
  @ApiResponse({ status: 200, description: 'Dataset lineage retrieved successfully', type: LineageGraphDto })
  async getDatasetLineage(
    @Req() req,
    @Param('id') datasetId: string,
    @Query('direction') direction: 'upstream' | 'downstream' | 'both' = 'both',
    @Query('maxDepth') maxDepth: string = '3',
  ) {
    const organizationId = req.user.organizationId;
    return this.lineageBuilder.buildLineageGraph(organizationId, {
      datasetId,
      direction,
      maxDepth: parseInt(maxDepth, 10),
    });
  }
}
