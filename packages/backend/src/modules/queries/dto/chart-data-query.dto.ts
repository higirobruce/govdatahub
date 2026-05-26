import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChartDataQueryDto {
  @ApiProperty() @IsString() connectionId: string;
  @ApiProperty() @IsString() sql: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() xColumn?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() yColumn?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() groupBy?: string;
}
