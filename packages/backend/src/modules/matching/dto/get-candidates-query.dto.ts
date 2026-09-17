import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { CandidateDecision } from '../../../database/entities';

const CANDIDATE_DECISIONS: CandidateDecision[] = ['auto_match', 'grey', 'confirmed', 'rejected'];

/** Query params for the review queue page (`GET runs/:runId/candidates`). */
export class GetCandidatesQueryDto {
  @IsOptional() @IsIn(CANDIDATE_DECISIONS) decision?: CandidateDecision;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}
