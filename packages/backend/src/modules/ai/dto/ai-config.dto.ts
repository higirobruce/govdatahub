import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsUrl } from 'class-validator';

const PROVIDERS = ['anthropic', 'openai', 'ollama'];

export class UpsertAiConfigDto {
  @ApiProperty({ enum: PROVIDERS })
  @IsString()
  @IsIn(PROVIDERS)
  provider: 'anthropic' | 'openai' | 'ollama';

  @ApiProperty({ required: false, description: 'API key — omit to keep the existing key' })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ required: false, description: 'Ollama base URL' })
  @IsOptional()
  @IsString()
  ollamaUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ollamaModel?: string;
}

export class AiConfigResponseDto {
  provider: 'anthropic' | 'openai' | 'ollama';
  hasApiKey: boolean;
  model: string | null;
  ollamaUrl: string | null;
  ollamaModel: string | null;
}

export class Nl2SqlRequestDto {
  @ApiProperty({ description: 'Natural language question' })
  @IsString()
  question: string;

  @ApiProperty({ description: 'Database schema context (DDL or description)' })
  @IsString()
  schemaContext: string;

  @ApiProperty({ required: false, description: 'Target SQL dialect hint' })
  @IsOptional()
  @IsString()
  dialect?: string;
}

export class Nl2SqlResponseDto {
  sql: string;
  explanation: string;
}
