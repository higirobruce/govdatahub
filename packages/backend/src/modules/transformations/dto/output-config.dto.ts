import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn, IsOptional, IsInt, Min, Max } from 'class-validator';

export class OutputConfigDto {
  @ApiProperty({ example: 'cache', description: 'Output mode' })
  @IsString()
  @IsIn(['cache'])
  mode: 'cache';

  @ApiProperty({
    example: 10000,
    description: 'Maximum rows to cache',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxRows?: number;
}
