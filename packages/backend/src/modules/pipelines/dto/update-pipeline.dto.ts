import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdatePipelineDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  schedule?: string | null;

  @IsBoolean()
  @IsOptional()
  stopOnError?: boolean;

  @IsIn(['active', 'paused'])
  @IsOptional()
  status?: 'active' | 'paused';

  @IsOptional()
  definition?: {
    steps: Array<{
      id: string;
      type: 'ingest' | 'transform' | 'cross-query' | 'export';
      label: string;
      config: Record<string, any>;
      position: { x: number; y: number };
    }>;
    edges: Array<{ id: string; source: string; target: string }>;
  };
}
