import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChartDataQueryDto {
  @ApiProperty() @IsString() connectionId: string;
  @ApiProperty() @IsString() sql: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() xColumn?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() yColumn?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() groupBy?: string;
  @ApiProperty({ required: false, description: 'Key-value pairs to substitute {{key}} template variables in SQL' })
  @IsObject()
  @IsOptional()
  filters?: Record<string, string>;
}
