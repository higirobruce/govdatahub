import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { QueryDefinitionDto } from './query-definition.dto';

export class SaveCrossQueryDto {
  @ApiProperty({ example: 'Monthly Sales Report' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Join sales data from multiple databases', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: QueryDefinitionDto })
  @IsObject()
  @ValidateNested()
  @Type(() => QueryDefinitionDto)
  queryDefinition: QueryDefinitionDto;
}
