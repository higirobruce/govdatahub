import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { QueryDefinitionDto } from './query-definition.dto';

export class ExecuteCrossQueryDto {
  @ApiProperty({ type: QueryDefinitionDto })
  @IsObject()
  @ValidateNested()
  @Type(() => QueryDefinitionDto)
  queryDefinition: QueryDefinitionDto;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  cacheResults?: boolean;
}
