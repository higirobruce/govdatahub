-- ---------------------------------------------------------------------------
-- Entity-matching integration fixture (Task 15).
--
-- Builds `matching_fixture.citizens` -- 10,000 rows of synthetic civil-registry
-- data -- and `matching_fixture.truth`, the labelled pair set the run is
-- measured against.
--
-- Everything here is DETERMINISTIC: every value is a pure function of the row
-- index, with no random(), no now() and no sequence. Re-running this file
-- produces byte-identical data, which is what makes a recall/precision number
-- measured against it reproducible rather than a one-off observation.
--
-- Population (10,000 rows):
--   * 9,700 base people, indices 0..9699, ids 'P000000'..'P009699'.
--   * 300 duplicates, ids 'D000000'..'D000299', one per source person at
--     index 1000 + 10*k.
--
-- The 300 duplicates are three equal cohorts of 100, each modelling a real
-- registry defect:
--   * k in   0.. 99  'swap' -- given name and surname exchanged between the
--                    two columns. `full_name` therefore carries the same two
--                    tokens in the other order, which the person_name
--                    normalizer (which sorts tokens) collapses to an exact
--                    match -- while the `surname` column does NOT match, and
--                    neither does the `surname|year` blocking key. This cohort
--                    is reachable through the trigram pass alone.
--   * k in 100..199  'typo' -- one character of the surname substituted (4th
--                    character, advanced one letter). This is the hard cohort:
--                    trigram similarity on the full name lands around
--                    0.62-0.70 and on the surname around 0.45-0.57, so its
--                    score is the lowest of the three.
--   * k in 200..299  'dob'  -- the two digits of the day of birth transposed
--                    (12 <-> 21, always a valid day in every month), names
--                    untouched. Nine days apart, so the date comparator's
--                    365-day decay gives ~0.975 rather than 0.
--
-- 40 of the 'swap'/'dob' duplicates (k % 5 = 0) carry a NULL phone, which is
-- what makes `guarded()` in blocking-sql.ts score a missing value as 0 instead
-- of erroring or poisoning the sum. The 'typo' cohort keeps its phone: it is
-- already the weakest cohort and removing a second signal would test the
-- fixture's difficulty rather than the engine.
--
-- Three further cohorts exist to exercise specific engine rules:
--
--   * indices 0..59 -- 60 people with an EMPTY surname, all born in 1985.
--     Their `surname|year(birth_date)` blocking key is therefore the single
--     value '|1985' shared by 60 rows. Ruling R19's degenerate cutoff is
--     GREATEST(50, 0.5% * 10000) = 50 and the test is `n > cutoff`, so a key
--     must be held by at least 51 rows to be dropped. 50 rows -- the number
--     named in the task brief -- sits exactly ON the floor and is deliberately
--     KEPT by R19 (see blocking.service.ts's DEGENERATE_KEY_FLOOR comment,
--     which justifies the floor precisely by the harmlessness of a 50-row
--     key). 60 clears it with margin.
--
--   * indices 4000..4199 -- 100 HARD NEGATIVE pairs (4000+2k, 4001+2k): two
--     different people sharing a surname and a birth year, born 60..159 days
--     apart, with different given names and different phones. They are
--     proposed by the `surname_year` pass and score ~0.6 -- above rejectAt so
--     they are really stored and really scored, below matchAt so a correct
--     engine must not merge them. They are labelled is_match = false in
--     `truth`, which is what gives the precision number teeth: with positive
--     labels only, precision is 1.0 by construction and measures nothing.
--
--   * indices 4200..4239 -- 20 LOW-SCORE BLOCKED pairs (4200+2k, 4201+2k):
--     same surname, same birth year, 300 days apart. They score ~0.38, below
--     rejectAt, so a run with no human decision must NOT store them. They are
--     the pairs the R23 test uses: a human verdict on one of them must pull it
--     into `match_candidates` despite its score.
--
--   * indices 4240..4279 -- 20 MISSING-DATE pairs (4240+2k, 4241+2k): the odd
--     member copies the even member's given name and surname, so the two are
--     always proposed by the trigram pass and their comparators are therefore
--     always evaluated. Their birth dates are absent -- NULL on the odd
--     member of every pair, and for k < 10 on BOTH sides rather than one.
--     The odd members also carry the unparseable string 'not recorded' in
--     `birth_date_text` (Ruling R59c), so both ways a date can be missing
--     are exercised. `NormalizationService.normalizeDate` turns every one
--     of those into the empty string, which is precisely the value
--     that makes `''::date` raise `invalid input syntax for type date: ""` --
--     an error that aborts the whole scoring statement, not one pair. Nothing
--     else in this fixture produces a missing date, so without this cohort the
--     date comparator's presence guard is never actually executed.
--     These 40 rows also carry a >255-byte address, which is what forces
--     `left(x, 255)` in the `lev` comparator: `levenshtein_less_equal` raises
--     `argument exceeds the maximum length of 255 characters` above that, and
--     `features` materialises every comparator of every mapped role whether or
--     not it carries any weight.
-- ---------------------------------------------------------------------------

DROP SCHEMA IF EXISTS matching_fixture CASCADE;
CREATE SCHEMA matching_fixture;

-- ---------------------------------------------------------------------------
-- Name generation.
--
-- given  = giv1[(i % 143) % 13] || giv2[(i % 143) / 13]          -> 143 names
-- surname= sur1[(i % 7429) % 17] || sur2[...% 19] || sur3[...]   -> 7429 names
--
-- 143 = 11*13 and 7429 = 17*19*23 are coprime, so by the Chinese remainder
-- theorem the pair (i % 143, i % 7429) is unique for every i below 1,062,347.
-- All 9,700 base people therefore carry a distinct (given, surname) pair, and
-- accidental exact-name collisions -- which would look like duplicates the
-- truth set does not know about and would corrupt the precision number -- do
-- not occur at all rather than merely being unlikely.
-- ---------------------------------------------------------------------------

CREATE FUNCTION matching_fixture.given_for(n int) RETURNS text AS $$
  SELECT (ARRAY['je','ma','pi','cl','em','al','fa','th','gr','be','ch','di','so'])[((n % 143) % 13) + 1]
      || (ARRAY['an','rie','erre','aude','ile','ice','ustin','eo','ace','rnard','ana'])[((n % 143) / 13) + 1];
$$ LANGUAGE sql IMMUTABLE;

CREATE FUNCTION matching_fixture.surname_for(n int) RETURNS text AS $$
  SELECT (ARRAY['nk','mu','ha','ga','bi','uw','nt','ru','ka','ny','se','tu','ma','ni','ba','ci','za'])[((n % 7429) % 17) + 1]
      || (ARRAY['ura','ama','abi','imi','uru','ere','oni','iya','aka','emu','uba','ito','anz','esh','ung','irw','oma','uka','eza'])[(((n % 7429) / 17) % 19) + 1]
      || (ARRAY['na','ra','ma','za','ka','ga','nda','nga','mba','nza','ta','sa','be','re','ne','se','we','ye','da','la','va','ha','fa'])[(((n % 7429) / 323) % 23) + 1];
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE matching_fixture.citizens (
  id          text PRIMARY KEY,
  given_name  text NOT NULL,
  surname     text NOT NULL,
  full_name   text NOT NULL,
  -- A REAL `date` column, not text (Ruling R50). node-postgres materializes
  -- a `date` as a JavaScript `Date` at LOCAL midnight, and the old
  -- `toISOString()` in `NormalizationService.normalizeDate` then moved it
  -- back a calendar day in every zone east of Greenwich -- changing the
  -- year, and with it the `year(birth_date)` blocking key. While this
  -- column was `text` the driver handed the normalizer a string and the
  -- hazard was never reachable from any gate: the suite passed by
  -- sidestepping the defect. It is a `date` from now on so that the
  -- round trip through the real driver is what the run exercises.
  --
  -- Still nullable: a civil register with no absent date of birth in it is
  -- not a civil register. A `date` column cannot hold an unparseable
  -- string -- PostgreSQL rejects it at INSERT -- so the missing-date
  -- cohort is NULL here and carries its malformed shapes in
  -- `birth_date_text` below instead.
  birth_date  date NULL,
  -- Ruling R59c: the SAME calendar day as `birth_date`, stored as TEXT
  -- carrying a time.
  --
  -- Making `birth_date` a real `date` fixed one blind spot and opened its
  -- mirror image: the run then exercised only `normalizeDate`'s `Date`
  -- branch, and nothing end to end touched the string branch -- which is
  -- exactly where the unfixed residue of Ruling R50 was still living
  -- (R59b). A bare 'YYYY-MM-DD' parses as UTC midnight and round-trips
  -- unchanged, so only a string carrying a TIME can catch it: under the
  -- ECMAScript grammar that switches the parse to LOCAL, and
  -- `toISOString()` then moved it back a day in every zone east of
  -- Greenwich.
  --
  -- The shapes below are the ones a real register produces:
  --   * 'YYYY-MM-DD HH:MM:SS' at midnight -- SQLite's canonical date
  --     storage, returned verbatim by better-sqlite3 (SQLite is one of the
  --     five connection types phase 1 supports), and the ordinary shape of
  --     a CSV-imported date on PostgreSQL and MySQL too. Midnight is the
  --     value that shifts BACKWARD east of Greenwich.
  --   * 'YYYY-MM-DDTHH:MM:SS' -- the same hazard, T-separated.
  --   * a late-evening time, which shifts FORWARD in western zones, so the
  --     fixture is not only sensitive to the deployment zone's direction.
  --   * the unparseable string 'not recorded', restoring the coverage the
  --     `date` column could not keep: it must normalize to '' exactly as a
  --     NULL does, which is what makes `''::date` reachable.
  --
  -- Mapped at weight 0 in the e2e project, like `address`: its comparators
  -- are evaluated and its normalized value lands in the workspace, without
  -- disturbing a score model calibrated on the other four fields.
  birth_date_text text NULL,
  phone       text NULL,
  address     text NULL,
  district    text NOT NULL
);

CREATE TABLE matching_fixture.truth (
  left_key  text    NOT NULL,
  right_key text    NOT NULL,
  is_match  boolean NOT NULL,
  kind      text    NOT NULL,
  PRIMARY KEY (left_key, right_key)
);

-- --------------------------------------------------------------------------
-- 9,700 base people.
-- --------------------------------------------------------------------------
INSERT INTO matching_fixture.citizens
  (id, given_name, surname, full_name, birth_date, birth_date_text, phone, address, district)
SELECT
  'P' || lpad(i::text, 6, '0'),
  gn,
  sn,
  btrim(gn || ' ' || sn),
  bd,
  -- Ruling R59c: the same day as `bd`, as text with a time. Three
  -- shapes plus the unparseable one, chosen by row index so the file
  -- stays deterministic.
  CASE
    -- The missing-date cohort's odd members: NULL in `birth_date`,
    -- unparseable here. Both must normalize to ''.
    WHEN i >= 4240 AND i < 4280 AND i % 2 = 1 THEN 'not recorded'
    WHEN bd IS NULL THEN NULL
    -- Midnight, space-separated: SQLite's canonical storage, and the
    -- value that moves back a day east of Greenwich.
    WHEN i % 4 = 0 THEN to_char(bd, 'YYYY-MM-DD HH24:MI:SS')
    -- Midnight, T-separated: the same hazard, ISO-8601 shape.
    WHEN i % 4 = 1 THEN to_char(bd, 'YYYY-MM-DD"T"HH24:MI:SS')
    -- Late evening: moves FORWARD a day in western zones.
    WHEN i % 4 = 2 THEN to_char(bd, 'YYYY-MM-DD 23:30:00')
    -- Bare date-only: the one shape that never shifted, kept so the
    -- easy case stays covered alongside the hard ones.
    ELSE to_char(bd, 'YYYY-MM-DD')
  END,
  CASE WHEN i >= 4241 AND i < 4280 AND i % 2 = 1 THEN NULL
       ELSE '078' || lpad((((i * 37) + 11) % 10000000)::text, 7, '0') END,
  CASE
    -- the missing-date cohort also carries an address past the 255-byte
    -- ceiling of levenshtein_less_equal.
    WHEN i >= 4240 AND i < 4280
      THEN 'plot ' || i || ' ' || repeat('umudugudu wa nyakabanda kwa rwesero avenue ', 8)
    ELSE 'kk ' || (i % 500) || ' st, '
      || (ARRAY['gasabo','kicukiro','nyarugenge','musanze','huye','rubavu','rwamagana','muhanga'])[(i % 8) + 1]
      || ', kigali'
  END,
  (ARRAY['gasabo','kicukiro','nyarugenge','musanze','huye','rubavu','rwamagana','muhanga'])[(i % 8) + 1]
FROM (
  SELECT
    i,
    CASE
      -- missing-date cohort: the odd member copies the even member's given
      -- name, so the pair's full names are identical and the trigram pass is
      -- guaranteed to propose them.
      WHEN i >= 4241 AND i < 4280 AND i % 2 = 1 THEN matching_fixture.given_for(i - 1)
      ELSE matching_fixture.given_for(i)
    END AS gn,
    CASE
      -- empty-surname cohort
      WHEN i < 60 THEN ''
      -- hard-negative, low-score and missing-date cohorts: the odd member of
      -- each pair borrows the even member's surname, so the pair shares a
      -- blocking key (and, in the missing-date cohort, a whole name).
      WHEN i >= 4000 AND i < 4280 AND i % 2 = 1 THEN matching_fixture.surname_for(i - 1)
      ELSE matching_fixture.surname_for(i)
    END AS sn,
    CASE
      -- missing-date cohort: NULL on both sides of the pair for k < 10, and
      -- on the odd member alone for the rest. NULL reaches the workspace as
      -- '' (see normalizeDate), which is the value that makes `''::date`
      -- raise rather than evaluate.
      WHEN i >= 4240 AND i < 4280 AND i % 2 = 1 THEN NULL
      WHEN i >= 4240 AND i < 4280 AND i % 2 = 0 AND ((i - 4240) / 2) < 10 THEN NULL
      -- empty-surname cohort: every one of them born in 1985, so all 60 share
      -- the single blocking key '|1985'.
      WHEN i < 60 THEN DATE '1985-01-01' + ((i * 5) % 364)
      -- hard negatives: even member born 10 January, odd member 60..159 days
      -- later -- far enough to be a real non-match, near enough to stay inside
      -- the same calendar year and therefore inside the same blocking key.
      WHEN i >= 4000 AND i < 4200 AND i % 2 = 0
        THEN make_date(1950 + (((i - 4000) / 2) % 50), 1, 10)
      WHEN i >= 4000 AND i < 4200 AND i % 2 = 1
        THEN make_date(1950 + (((i - 4001) / 2) % 50), 1, 10) + (60 + ((i - 4001) / 2))
      -- low-score blocked pairs: same surname and year, 300 days apart.
      WHEN i >= 4200 AND i < 4240 AND i % 2 = 0
        THEN make_date(1960 + ((i - 4200) / 2), 1, 5)
      WHEN i >= 4200 AND i < 4240 AND i % 2 = 1
        THEN make_date(1960 + ((i - 4201) / 2), 1, 5) + 300
      -- 'dob' duplicate sources: forced onto day 12 or 21 so that transposing
      -- the two day digits always yields a valid date in any month.
      WHEN i >= 3000 AND i <= 3990 AND (i - 1000) % 10 = 0
        THEN make_date(1950 + (((i - 1000) / 10) % 60),
                       1 + (((i - 1000) / 10) % 12),
                       CASE WHEN ((i - 1000) / 10) % 2 = 0 THEN 12 ELSE 21 END)
      ELSE DATE '1940-01-01' + ((i * 7) % 25550)
    END AS bd
  FROM generate_series(0, 9699) AS i
) AS base;

-- --------------------------------------------------------------------------
-- 300 duplicates.
-- --------------------------------------------------------------------------
INSERT INTO matching_fixture.citizens
  (id, given_name, surname, full_name, birth_date, birth_date_text, phone, address, district)
SELECT
  d.dup_id,
  d.given_name,
  d.surname,
  btrim(d.given_name || ' ' || d.surname),
  d.birth_date,
  -- Ruling R59c: the duplicate's OWN day, as a midnight timestamp. The
  -- 'dob' cohort transposed its day digits, so this must be rendered from
  -- the duplicate's date and never copied from the source's text.
  CASE
    WHEN d.birth_date IS NULL THEN NULL
    WHEN d.k % 2 = 0 THEN to_char(d.birth_date, 'YYYY-MM-DD HH24:MI:SS')
    ELSE to_char(d.birth_date, 'YYYY-MM-DD"T"HH24:MI:SS')
  END,
  d.phone,
  d.address,
  d.district
FROM (
  SELECT
    k,
    'D' || lpad(k::text, 6, '0') AS dup_id,
    CASE WHEN k < 100 THEN c.surname ELSE c.given_name END AS given_name,
    CASE
      WHEN k < 100 THEN c.given_name
      -- one-character substitution at the 4th character, advanced one letter
      -- ('a'->'b', 'z'->'a'): always exactly one character, always a change.
      WHEN k < 200 THEN overlay(c.surname
                                placing chr((((ascii(substr(c.surname, 4, 1)) - 97) + 1) % 26) + 97)
                                from 4 for 1)
      ELSE c.surname
    END AS surname,
    CASE
      WHEN k < 200 THEN c.birth_date
      -- transpose the two digits of the day: '...-12' <-> '...-21'. Done
      -- through the text form and cast straight back, now that the column
      -- is a real `date`.
      ELSE (substr(to_char(c.birth_date, 'YYYY-MM-DD'), 1, 8)
            || reverse(substr(to_char(c.birth_date, 'YYYY-MM-DD'), 9, 2)))::date
    END AS birth_date,
    CASE WHEN k % 5 = 0 AND (k < 100 OR k >= 200) THEN NULL ELSE c.phone END AS phone,
    c.address,
    c.district
  FROM generate_series(0, 299) AS k
  JOIN matching_fixture.citizens c ON c.id = 'P' || lpad((1000 + 10 * k)::text, 6, '0')
) AS d;

-- --------------------------------------------------------------------------
-- The labelled pair set.
--
-- 300 positives (the duplicates) and 100 hard negatives. `left_key`/`right_key`
-- are recorded source-first / duplicate-second, i.e. NOT in the
-- `left_key < right_key` order `match_candidates` stores -- deliberately, so
-- that the order-normalization in EvalService.normalizedKey is actually
-- exercised rather than accidentally satisfied.
-- --------------------------------------------------------------------------
INSERT INTO matching_fixture.truth (left_key, right_key, is_match, kind)
SELECT
  'P' || lpad((1000 + 10 * k)::text, 6, '0'),
  'D' || lpad(k::text, 6, '0'),
  true,
  CASE WHEN k < 100 THEN 'swap' WHEN k < 200 THEN 'typo' ELSE 'dob' END
FROM generate_series(0, 299) AS k;

INSERT INTO matching_fixture.truth (left_key, right_key, is_match, kind)
SELECT
  'P' || lpad((4000 + 2 * k)::text, 6, '0'),
  'P' || lpad((4001 + 2 * k)::text, 6, '0'),
  false,
  'hard_negative'
FROM generate_series(0, 99) AS k;
