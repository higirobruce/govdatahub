import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsSafeSql } from '../../queries/validators/safe-sql.validator';
import { OutputConfigDto } from './output-config.dto';

export class CreateTransformationDto {
  @ApiProperty({
    example: 'Daily User Stats',
    description: 'Transformation name',
  })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'Aggregates user activity for analytics',
    description: 'Transformation description',
  })
  @IsString()
  description: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Source connection ID',
  })
  @IsString()
  @IsUUID()
  sourceConnectionId: string;

  @ApiProperty({
    example: 'SELECT user_id, COUNT(*) as count FROM events GROUP BY user_id',
    description: 'SQL query to execute',
  })
  @IsString()
  @IsSafeSql()
  sqlQuery: string;

  @ApiProperty({
    example: { mode: 'cache', maxRows: 10000 },
    description: 'Output configuration',
    required: false,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OutputConfigDto)
  outputConfig?: OutputConfigDto;
}
