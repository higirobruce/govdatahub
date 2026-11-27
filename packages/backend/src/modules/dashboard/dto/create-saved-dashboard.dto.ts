import { IsString, IsOptional, IsArray, IsIn } from 'class-validator';

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

  @IsString()
  @IsOptional()
  @IsIn(['private', 'org'])
  visibility?: 'private' | 'org';
}
