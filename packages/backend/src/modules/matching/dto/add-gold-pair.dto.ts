import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

/**
 * Ruling R28: `match_gold_pairs` has columns `id`, `organization_id`,
 * `project_id`, `left_key`, `right_key`, `is_match`, `labelled_by`,
 * `labelled_at` -- there are no source-ref columns. An earlier draft of
 * this spec listed `leftSourceRef`/`rightSourceRef`, but the migration
 * never created them; do not add them here even though `SubmitDecisionDto`
 * has their `match_decisions` equivalents. `labelledBy` comes from the
 * caller's identity, never from the request body.
 */
export class AddGoldPairDto {
  @IsString() @IsNotEmpty() leftKey: string;
  @IsString() @IsNotEmpty() rightKey: string;
  @IsBoolean() isMatch: boolean;
}
