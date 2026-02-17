import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsEnum,
  IsOptional,
  IsNumber,
  IsUUID,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TableReferenceDto {
  @ApiProperty({ example: 'uuid-conn-a' })
  @IsString()
  @IsUUID()
  connectionId: string;

  @ApiProperty({ example: 'public' })
  @IsString()
  schemaName: string;

  @ApiProperty({ example: 'users' })
  @IsString()
  tableName: string;

  @ApiProperty({ example: 'users' })
  @IsString()
  alias: string;
}

export enum JoinType {
  INNER = 'INNER',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  FULL = 'FULL',
}

export enum JoinOperator {
  EQUALS = '=',
  NOT_EQUALS = '!=',
  GREATER_THAN = '>',
  LESS_THAN = '<',
  GREATER_THAN_OR_EQUAL = '>=',
  LESS_THAN_OR_EQUAL = '<=',
}

export class JoinConditionDto {
  @ApiProperty({ example: 'id' })
  @IsString()
  leftColumn: string;

  @ApiProperty({ enum: JoinOperator, example: '=' })
  @IsEnum(JoinOperator)
  operator: JoinOperator;

  @ApiProperty({ example: 'user_id' })
  @IsString()
  rightColumn: string;
}

export class JoinDefinitionDto {
  @ApiProperty({ enum: JoinType, example: JoinType.INNER })
  @IsEnum(JoinType)
  type: JoinType;

  @ApiProperty({ example: 'users' })
  @IsString()
  leftTable: string;

  @ApiProperty({ example: 'orders' })
  @IsString()
  rightTable: string;

  @ApiProperty({ type: [JoinConditionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JoinConditionDto)
  conditions: JoinConditionDto[];
}

export class ColumnSelectionDto {
  @ApiProperty({ example: 'users' })
  @IsString()
  table: string;

  @ApiProperty({ example: 'name' })
  @IsString()
  column: string;

  @ApiProperty({ example: 'user_name', required: false })
  @IsOptional()
  @IsString()
  alias?: string;
}

export enum FilterOperator {
  EQUALS = '=',
  NOT_EQUALS = '!=',
  GREATER_THAN = '>',
  LESS_THAN = '<',
  LIKE = 'LIKE',
  IN = 'IN',
  IS_NULL = 'IS NULL',
  IS_NOT_NULL = 'IS NOT NULL',
}

export class FilterConditionDto {
  @ApiProperty({ example: 'orders' })
  @IsString()
  table: string;

  @ApiProperty({ example: 'created_at' })
  @IsString()
  column: string;

  @ApiProperty({ enum: FilterOperator, example: FilterOperator.GREATER_THAN })
  @IsEnum(FilterOperator)
  operator: FilterOperator;

  @ApiProperty({ example: '2024-01-01', required: false })
  @IsOptional()
  value?: any;
}

export enum OrderDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class OrderByClauseDto {
  @ApiProperty({ example: 'orders' })
  @IsString()
  table: string;

  @ApiProperty({ example: 'created_at' })
  @IsString()
  column: string;

  @ApiProperty({ enum: OrderDirection, example: OrderDirection.DESC })
  @IsEnum(OrderDirection)
  direction: OrderDirection;
}

export class QueryDefinitionDto {
  @ApiProperty({ type: [TableReferenceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TableReferenceDto)
  tables: TableReferenceDto[];

  @ApiProperty({ type: [JoinDefinitionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JoinDefinitionDto)
  joins: JoinDefinitionDto[];

  @ApiProperty({ type: [ColumnSelectionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnSelectionDto)
  columns: ColumnSelectionDto[];

  @ApiProperty({ type: [FilterConditionDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterConditionDto)
  filters?: FilterConditionDto[];

  @ApiProperty({ type: [OrderByClauseDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderByClauseDto)
  orderBy?: OrderByClauseDto[];

  @ApiProperty({ example: 100, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50000)
  limit?: number;
}
