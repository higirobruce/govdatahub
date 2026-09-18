/**
 * Ruling R59: pins a NON-UTC timezone for every jest run, unit and e2e.
 *
 * `NormalizationService.normalizeDate` used to call `toISOString()` on the
 * local-midnight `Date` node-postgres builds for a PostgreSQL `date`
 * column, which moves the value back a calendar day in every zone east of
 * Greenwich. Under `TZ=UTC` local midnight *is* UTC midnight, so the
 * buggy implementation returns the correct day and EVERY assertion
 * written to catch it passes. The re-review measured exactly that:
 * `TZ=UTC` -> 0 failures with the bug restored, `TZ=Africa/Kigali` -> 7,
 * `TZ=Asia/Tokyo` -> 14.
 *
 * Nothing pinned the zone before this file existed -- not the jest
 * blocks, not `process.env.TZ`, not a CI workflow -- so both gates
 * silently became no-ops in any UTC container, which is the single most
 * likely CI zone. The zone is therefore part of the test configuration,
 * not a property of whoever's laptop happens to run it.
 *
 * `Africa/Kigali` (UTC+2, no DST) is the deployment zone, so the gates
 * run in the zone the defect was reported from. A fixed offset with no
 * daylight saving also keeps every date assertion reproducible in
 * January and in July.
 *
 * Used as BOTH `globalSetup` and `setupFiles`:
 *  - as `globalSetup` the assignment happens in the parent process before
 *    any worker is forked, so each worker inherits the zone from birth;
 *  - as `setupFiles` it runs inside every worker as well, which covers
 *    `--runInBand` and any runner that does not fork. Node re-reads
 *    `process.env.TZ` on assignment (verified on this runtime), so the
 *    later write is effective rather than decorative.
 *
 * `normalization.service.spec.ts` asserts the offset is non-zero, so if
 * this file is ever dropped from a config the suite says so instead of
 * quietly passing.
 */
const PINNED_TZ = 'Africa/Kigali';

process.env.TZ = PINNED_TZ;

module.exports = function pinTimezone() {
  process.env.TZ = PINNED_TZ;
};

module.exports.PINNED_TZ = PINNED_TZ;
