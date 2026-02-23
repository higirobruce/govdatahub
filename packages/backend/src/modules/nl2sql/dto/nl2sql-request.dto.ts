import { IsString, IsBoolean, IsOptional, IsArray, MinLength, MaxLength } from 'class-validator';

export class GenerateSqlDto {
  @IsString()
  @MinLength(3, { message: 'Query must be at least 3 characters' })
  @MaxLength(1000, { message: 'Query must not exceed 1000 characters' })
  query: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  connectionIds?: string[];

  @IsOptional()
  @IsBoolean()
  autoExecute?: boolean;

  @IsOptional()
  @IsArray()
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export class ExplainSqlDto {
  @IsString()
  @MinLength(5, { message: 'SQL query must be at least 5 characters' })
  sql: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  connectionIds?: string[];
}
