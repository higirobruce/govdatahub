import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePipelineDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  schedule?: string;

  @IsBoolean()
  @IsOptional()
  stopOnError?: boolean;
}
