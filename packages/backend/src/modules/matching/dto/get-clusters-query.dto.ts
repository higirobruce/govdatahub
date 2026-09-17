import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params for `GET runs/:runId/clusters`. One row per cluster over a
 * national registry is plausibly millions; this caps a single request the
 * same way `GetCandidatesQueryDto` caps the review queue.
 */
export class GetClustersQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}
