import { IsString, IsEnum, IsOptional } from 'class-validator';
import { AiProvider } from '../../../database/entities/organization-settings.entity';

export class TestAiConnectionDto {
  @IsEnum(AiProvider)
  provider: AiProvider;

  @IsOptional()
  @IsString()
  model?: string;

  @IsString()
  apiKey: string;

  @IsOptional()
  @IsString()
  apiEndpoint?: string;
}

export interface AiProviderInfo {
  id: AiProvider;
  name: string;
  models: {
    id: string;
    name: string;
    description: string;
  }[];
  requiresApiKey: boolean;
  requiresEndpoint: boolean;
}
