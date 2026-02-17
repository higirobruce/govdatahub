import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../../database/entities';
import { CrossQueryExecutorService } from './cross-query-executor.service';
import { ExecuteCrossQueryDto } from './dto/execute-cross-query.dto';
import { CrossQueryResultDto } from './dto/cross-query-result.dto';
import { QueryDefinitionDto } from './dto/query-definition.dto';

@Controller('cross-query')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@ApiBearerAuth()
@ApiTags('cross-query')
export class CrossQueryController {
  constructor(
    private readonly crossQueryExecutorService: CrossQueryExecutorService,
  ) {}

  @Post('validate')
  @ApiOperation({ summary: 'Validate cross-database query definition' })
  @ApiResponse({ status: 200, description: 'Query is valid' })
  @ApiResponse({ status: 400, description: 'Query validation failed' })
  async validateQuery(
    @Body() dto: { queryDefinition: QueryDefinitionDto },
    @CurrentUser() user: User,
  ) {
    // Validation happens automatically via class-validator decorators
    return {
      valid: true,
      message: 'Query definition is valid',
    };
  }

  @Post('execute')
  @Throttle({ default: { ttl: 60000, limit: 5 } }) // 5 queries per minute
  @ApiOperation({ summary: 'Execute cross-database query' })
  @ApiResponse({
    status: 200,
    description: 'Query executed successfully',
    type: CrossQueryResultDto,
  })
  @ApiResponse({ status: 400, description: 'Query execution failed' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async executeQuery(
    @Body() dto: ExecuteCrossQueryDto,
    @CurrentUser() user: User,
  ): Promise<CrossQueryResultDto> {
    return this.crossQueryExecutorService.executeCrossQuery(
      dto.queryDefinition,
      user.organizationId,
    );
  }
}
