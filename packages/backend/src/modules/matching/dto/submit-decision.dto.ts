import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { MatchVerdict } from '../../../database/entities';

const MATCH_VERDICTS: MatchVerdict[] = ['match', 'no_match'];

/**
 * Ruling R25: `decision` is a `MatchVerdict` -- the only vocabulary a
 * human reviewer can produce -- and never a `CandidateDecision`
 * (`'auto_match' | 'grey' | 'confirmed' | 'rejected'`), which describes a
 * pair's state within a run and is something the pipeline computes, not
 * something a person submits. Conflating the two was a real four-task
 * defect: every human verdict became invisible to the scoring join, with
 * no error anywhere. `@IsIn` here accepts `'match'`/`'no_match'` and
 * nothing else, including candidate-state values.
 */
export class SubmitDecisionDto {
  @IsString() @IsNotEmpty() leftSourceRef: string;
  @IsString() @IsNotEmpty() leftKey: string;
  @IsString() @IsNotEmpty() rightSourceRef: string;
  @IsString() @IsNotEmpty() rightKey: string;

  @IsIn(MATCH_VERDICTS) decision: MatchVerdict;
}
