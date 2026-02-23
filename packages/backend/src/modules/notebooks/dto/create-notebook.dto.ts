import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateNotebookDto {
  @ApiProperty({ example: 'Customer Analysis' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Exploratory analysis of customer data', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
