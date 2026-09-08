import { IsString, IsNotEmpty, IsOptional, IsArray, MaxLength } from 'class-validator';

export class DiagnoseSqlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(65536)
  sql: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  errorMessage: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  connectionIds?: string[];
}
