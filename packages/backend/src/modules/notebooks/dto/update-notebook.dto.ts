import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PersistedCellDto {
  @IsString()
  id: string;

  @IsIn(['sql', 'markdown'])
  type: 'sql' | 'markdown';

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  connectionId?: string;

  @IsInt()
  @Min(0)
  order: number;
}

export class UpdateNotebookDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, type: [PersistedCellDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersistedCellDto)
  cells?: PersistedCellDto[];
}
