import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateSavedDashboardDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  widgets: any[];

  @IsArray()
  layout: any[];
}
