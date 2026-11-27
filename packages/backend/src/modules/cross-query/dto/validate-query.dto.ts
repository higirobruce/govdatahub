import { IsDefined, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { QueryDefinitionDto } from './query-definition.dto';

export class ValidateQueryDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => QueryDefinitionDto)
  queryDefinition: QueryDefinitionDto;
}
