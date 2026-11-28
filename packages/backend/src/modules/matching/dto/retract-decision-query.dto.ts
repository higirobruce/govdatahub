import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Ruling R43 (part 2): identifies the pair to retract a verdict for.
 * Deliberately narrower than `SubmitDecisionDto` -- no `decision`, no
 * source refs. Retracting removes whatever decision row(s) exist for this
 * key pair (matched in either order -- see `MatchingService.retractDecision`),
 * it does not assert a new verdict, so there is nothing else to validate.
 */
export class RetractDecisionQueryDto {
  @IsString() @IsNotEmpty() leftKey: string;
  @IsString() @IsNotEmpty() rightKey: string;
}
