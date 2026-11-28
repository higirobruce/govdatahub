import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Nl2sqlService } from './nl2sql.service';
import { GenerateSqlDto, ExplainSqlDto } from './dto/nl2sql-request.dto';
import { DiagnoseSqlDto } from './dto/diagnose-sql.dto';
import {
  GenerateSqlResponseDto,
  ExplainSqlResponseDto,
  DiagnoseSqlResponseDto,
} from './dto/nl2sql-response.dto';

/**
 * NL2SQL Controller
 *
 * Provides API endpoints for:
 * - Converting natural language to SQL
 * - Explaining SQL queries in natural language
 * - Testing AI provider connections
 */
@ApiTags('NL2SQL')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('nl2sql')
export class Nl2sqlController {
  constructor(private readonly nl2sqlService: Nl2sqlService) {}

  /**
   * Generate SQL from natural language query
   */
  @Post('generate')
  @ApiOperation({
    summary: 'Generate SQL from natural language',
    description: 'Converts a natural language query to SQL using AI. Optionally executes the generated query.',
  })
  @ApiResponse({
    status: 201,
    description: 'SQL generated successfully',
    type: GenerateSqlResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation failed or NL2SQL disabled',
  })
  async generateSql(
    @Req() req,
    @Body() dto: GenerateSqlDto
  ): Promise<GenerateSqlResponseDto> {
    const organizationId = req.user.organizationId;
    const userId = req.user.id;

    return this.nl2sqlService.generateSql(organizationId, userId, dto);
  }

  /**
   * Explain SQL query in natural language
   */
  @Post('explain')
  @ApiOperation({
    summary: 'Explain SQL query',
    description: 'Explains a SQL query in natural language using AI',
  })
  @ApiResponse({
    status: 201,
    description: 'SQL explained successfully',
    type: ExplainSqlResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid SQL or AI provider error',
  })
  async explainSql(
    @Req() req,
    @Body() dto: ExplainSqlDto
  ): Promise<ExplainSqlResponseDto> {
    const organizationId = req.user.organizationId;
    const userId = req.user.id;

    return this.nl2sqlService.explainSql(
      organizationId,
      dto.sql,
      dto.connectionIds,
      userId
    );
  }

  /**
   * Diagnose a failing SQL query and suggest a fix (error doctor)
   */
  @Post('diagnose')
  @ApiOperation({
    summary: 'Diagnose failing SQL',
    description: 'Diagnoses why a SQL query failed and, if confident, suggests a corrected version.',
  })
  @ApiResponse({
    status: 201,
    description: 'SQL diagnosed successfully',
    type: DiagnoseSqlResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - AI provider error',
  })
  async diagnoseSql(
    @Req() req,
    @Body() dto: DiagnoseSqlDto
  ): Promise<DiagnoseSqlResponseDto> {
    const organizationId = req.user.organizationId;
    const userId = req.user.id;

    return this.nl2sqlService.diagnoseSql(organizationId, dto, userId);
  }
}
