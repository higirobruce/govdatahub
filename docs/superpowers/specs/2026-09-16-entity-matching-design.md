# Entity Matching, Fuzzy Matching, Deduplication and Record Linkage — Design

**Date:** 2026-09-16
**Status:** Approved design. Implementation plan not yet written.
**Branch context:** designed on `ft-phase2-ai-foundation`; implementation gets its own branch.

## 1. Goal

Give DataGate one engine that finds records referring to the same real-world
entity — a person, a business, an institution — and publishes a durable
`entity_key` for each entity. The engine serves two entry points:

- **Deduplication:** duplicates inside a single dataset.
- **Record linkage:** the same entity across two datasets from different
  sources.

Small language models run on a 16 GB CPU-only server and do the parts they are
genuinely good at. They do not sit in the hot path.

## 2. Why this reverses an earlier decision

`docs/improvement-review.html` parked master data management as out of scope:
"leave it to the Hub, consume golden records via API". This design partly
reverses that, deliberately and narrowly.

The reason is Cross-Query. Cross-database joins are DataGate's strongest
feature, and on government data they are close to unusable, because no two
agencies share a join key. A crosswalk table — `(source, source_key) →
entity_key` — is the missing key. That is much narrower than full MDM: no
stewardship-of-record, no golden-source arbitration across the whole of
government. It is the crosswalk the analytics layer needs in order to work.

## 3. Constraints

| Constraint | Value | Source |
|---|---|---|
| Scope | One engine, two entry points. Deduplication ships first. | decided 2026-09-16 |
| Sources | Live `Connection` tables **and** `StagedData`, behind one interface. | decided 2026-09-16 |
| Scale target | 10M+ rows per side. | decided 2026-09-16 |
| Hardware | 16 GB RAM, CPU only, no GPU. GPU later behind the `IAiProvider` seam; no GPU-specific code paths in v1. | decided 2026-09-16 |
| Data class | Citizen and business personal data. Rwanda Law No. 058/2021 on personal data protection applies. | — |

### 3.1 The hard arithmetic

10M x 10M is 10^14 pairs. A 1.7B instruct model on CPU takes 4–6 seconds per
pair. No model can read those pairs. Blocking reduces 10^14 to roughly 2x10^8
candidate pairs, which is still far beyond any model. Therefore:

- Everything up to and including scoring is SQL. No model, no per-pair Node work.
- The instruct model runs only on pairs a human opens, one at a time.
- Nothing in the design may assume the model sees a whole run's pairs.

## 4. Architecture

### 4.1 Chosen approach: materialized match workspace

One source abstraction reads either a live `Connection` or `StagedData` and
copies **only the project's allow-listed columns** into per-project tables in a
`matching` schema in DataGate's own PostgreSQL. Every stage after that runs
there, in one dialect, with full extension access.

Rejected alternatives:

- **Push blocking SQL down into each source database.** Needs per-dialect
  blocking SQL across nine drivers, and MySQL has no trigram index. It also
  asks an agency's production database to run a 200M-pair join, which is a
  political problem as much as a technical one.
- **Do the work in Node with an on-disk key index.** One implementation for all
  sources, and the comparators would be pure and easily tested — but 200M pairs
  through Node is hours where PostgreSQL is minutes, and it adds a storage
  dependency while reimplementing what PostgreSQL already does well.

The workspace approach wins on three counts: the blocking and scoring SQL is
written once; `Connection` and `StagedData` become interchangeable to the
engine; and source databases only ever serve simple ordered reads.

Its cost is real: it copies personal data into DataGate's database. Section 9
states the controls that make that acceptable, and they are requirements, not
recommendations.

### 4.2 Reading from a source

`DatabaseDriver.query()` returns every row in a single in-memory array
(`QueryResult.rows: any[]`, `drivers/database-driver.interface.ts:38`). There is
no cursor or stream, and there are nine drivers. Adding streaming to all nine is
out of scope.

So the materializer pages with **keyset pagination**:

```sql
SELECT <allow-listed columns>
FROM <schema>.<table>
WHERE <pk> > $last
ORDER BY <pk>
LIMIT 50000
```

10M rows is 200 round trips. Each batch is written to the workspace with
`COPY`. No driver change is required. A watermark on the run makes the next run
incremental.

`StagedData` rows are JSONB blobs holding a whole dataset; that path reads the
blob and inserts. Staged datasets cap out far below 10M rows, and the wizard
says so.

## 5. Data model

One migration: `1711000000010-AddEntityMatching.ts`. It adds `pg_trgm` and
`fuzzystrmatch` in the same style as the existing `vector` and `postgres_fdw`
migrations, and creates the `matching` schema.

### 5.1 TypeORM entities

All follow repository convention: `@PrimaryColumn('text')` with `uuidv4`,
JSONB for structured fields, `@CreateDateColumn`/`@UpdateDateColumn`,
`organization_id` on every row. All are exported from
`src/database/entities/index.ts`.

**`MatchProject`** — the configuration.

| Column | Type | Notes |
|---|---|---|
| `id` | text | uuid |
| `organizationId` | text | tenant isolation |
| `name`, `description` | text | |
| `mode` | text | `'dedupe'` or `'link'` |
| `leftSource` | jsonb | `{ kind: 'connection'\|'staged', connectionId?, schemaName?, tableName?, stagedDataId?, primaryKey }` |
| `rightSource` | jsonb null | null when `mode = 'dedupe'` |
| `fieldMap` | jsonb | `[{ left, right, role, weight, comparator }]`; `role` is one of `person_name`, `org_name`, `date`, `phone`, `identifier`, `address`, `text` |
| `blockingPasses` | jsonb | `[{ name, kind: 'equi'\|'trigram'\|'vector', keyExpr, threshold? }]` |
| `thresholds` | jsonb | `{ matchAt, rejectAt }` |
| `columnAllowlist` | text[] | the only columns the materializer may read |
| `lawfulBasis` | text | required, non-empty |
| `dataOwner` | text | required, non-empty |
| `retentionDays` | int | default from `MATCHING_RETENTION_DAYS`, 30 |
| `status` | text | `'active'` or `'inactive'` |

**`MatchRun`** — one execution. Mirrors `PipelineRun`.

`id`, `organizationId`, `projectId`, `status` (`pending`, `materializing`,
`normalizing`, `blocking`, `scoring`, `clustering`, `completed`, `failed`),
`counters` jsonb (`leftRows`, `rightRows`, `candidatePairs`, `autoMatch`,
`grey`, `autoReject`, `clusters`, `flaggedClusters`), `watermarks` jsonb,
`startedAt`, `finishedAt`, `durationMs`, `errorMessage`.

**`MatchEntity`** — one cluster.

`id`, `organizationId`, `projectId`, `runId`, `entityKey` (text, stable across
runs), `members` jsonb (`[{ sourceRef, sourceKey }]`), `golden` jsonb
(`{ field: { value, fromSourceRef, fromSourceKey, rule } }`), `size` int,
`flagged` boolean, `createdAt`.

**`MatchDecision`** — a person's verdict. Permanent; outlives runs.

`id`, `organizationId`, `projectId`, `leftSourceRef`, `leftKey`,
`rightSourceRef`, `rightKey`, `decision` (`'match'` or `'no_match'`), `userId`,
`priorScore` double, `priorLlmVerdict` jsonb null, `createdAt`. Unique on
`(organizationId, projectId, leftSourceRef, leftKey, rightSourceRef, rightKey)`.

This table is deliberately separate from `match_candidates`. Candidates belong
to a run and expire. A human verdict is permanent, and it does three jobs: it
is the audit trail, the next run reuses it instead of asking again, and the
accumulated verdicts are the labelled set that Section 8 and phase 4 need.

### 5.2 Plain tables, written by SQL

These follow the `catalog_embeddings` precedent — raw parameterized SQL, no
TypeORM entity — because they are written in bulk by set-based statements.

**`match_candidates`** — the pair table. `id bigserial` rather than uuid,
because there are millions of rows. Columns: `run_id`, `organization_id`,
`left_key`, `right_key`, `blocking_pass`, `features jsonb`, `score double
precision`, `decision text`, `llm_verdict jsonb`, `reviewed_by`, `reviewed_at`.
Indexed on `(run_id, decision, score DESC)` for the review queue.

`decision` takes exactly four values: `auto_match`, `grey`, `confirmed`,
`rejected`. There is no `auto_reject` — as below, rejected pairs are never
written.

**Rejected pairs are never stored.** One `INSERT ... SELECT` per blocking pass
computes the score and writes only rows at or above `rejectAt`. Rejects are
counted into `MatchRun.counters` and discarded in the same statement. At 200M
candidate pairs and ~200 bytes a row, storing everything would be a 40 GB
table; storing only the survivors keeps it in the low millions.

**`match_crosswalk`** — the product other features consume. Columns:
`organization_id`, `project_id`, `source_ref`, `source_key`, `entity_key`,
`confidence`, `updated_at`. Unique on
`(organization_id, project_id, source_ref, source_key)`.

**Ruling R27 — `confidence` is nullable and phase 1 writes NULL.**
The column was listed in this table without ever defining its semantics or its
producer. Phase 1 has no calibrated number to put in it: the weight model is
explicitly *weights the user tunes against a gold set*, not a probability, and
clustering carries forward only a cluster-level `flagged` boolean, not a
per-member score.
Writing a constant `1.0` was the obvious alternative and is the wrong one. It
asserts certainty the system has not computed — a cluster whose weakest internal
pair scored 0.56 against a 0.55 reject threshold would publish as fully
confident, indistinguishable from one whose every pair scored 0.99. That is the
same failure as fabricating a verdict: the system stating something it never
derived. A consumer filtering `confidence > 0.9` would then pass every row.
`NULL` means "not computed". The same filter returns nothing instead of
everything, which fails closed — the correct direction for a register of people.
Phase 4's Fellegi–Sunter weights are what produce a calibrated value; this column
waits for them.

**`match_norm_cache`** — normalized values. Primary key
`(organization_id, role, raw_value)`, plus `normalized jsonb`, `model`,
`updated_at`. This is what keeps model-based normalization affordable.

**`match_value_vectors`** — the distinct-value embedding dictionary that backs
the `vector` blocking pass (Section 7.3). Primary key
`(organization_id, role, normalized_value)`, plus `embedding vector(384)`,
`model`, `updated_at`, and an HNSW index on `embedding`. It holds only the
`org_name` and `address` roles, and only distinct values — never one row per
record. Dimension is 384 because the CPU-profile embedding model is a small
multilingual encoder, not the 1024-dimension `bge-m3` used by
`catalog_embeddings`; the two tables are deliberately independent.

**Ruling R28 — `match_gold_pairs` DOES get a TypeORM entity**, unlike its
neighbours in this list. Grouping it with the bulk tables was a
mis-classification: `match_candidates` and `match_crosswalk` are written
millions of rows at a time by set-based statements, which is why they are raw
SQL. The gold set is small, read wholesale by the evaluator, and written one
row at a time by a controller endpoint — precisely the access pattern an
entity serves. The entity maps the existing DDL; no migration changes.

**`match_gold_pairs`** — the evaluation set. `id`, `organization_id`,
`project_id`, `left_key`, `right_key`, `is_match boolean`, `labelled_by`,
`labelled_at`, unique on `(organization_id, project_id, left_key, right_key)`.
There are **no** source-ref columns: an earlier draft of this paragraph listed
`left_source_ref` and `right_source_ref`, the migration never created them, and
Task 14 builds its `addGoldPair` DTO from this list — a stale column here is
exactly how a four-task type conflict happened elsewhere in this plan.

### 5.3 Workspace tables

Per project, in schema `matching`:

- `matching.p_<project_id>_left`, and `_right` when `mode = 'link'`.
- `src_key text primary key`, one column per mapped field holding the
  normalized value, plus one generated column per blocking pass.
- A GIN trigram index for every `trigram` pass; a btree index for every `equi`
  pass.
- Dropped by retention (Section 7.6).

## 6. The engine

New module `packages/backend/src/modules/matching/`:

```
matching/
  sources/source-reader.service.ts   # uniform read over Connection | StagedData
  materialize.service.ts
  normalization.service.ts
  blocking.service.ts
  scoring.service.ts
  clustering.service.ts
  adjudication.service.ts
  crosswalk.service.ts
  eval.service.ts
  match-run.service.ts               # orchestrator
  matching-cleanup.service.ts
  matching.controller.ts
  dto/
```

### 6.1 Stage 1 — Materialize

Read via `connectionsService.getDriver()` or from `StagedData`. Keyset
pagination at 50,000 rows a batch. `COPY` into the workspace table. Read only
`columnAllowlist` columns — this is the single place the rule is enforced.
Record the watermark on the run.

### 6.2 Stage 2 — Normalize

Deterministic first, as pure functions: lower case, strip accents, collapse
whitespace, strip punctuation, parse dates to ISO, reduce phone numbers to
their last nine digits. No model.

Model normalization is limited to the `org_name` and `address` roles. Person
names do not need it — a token sort plus a phonetic key handles name-order
variation and spelling drift, and a national register holds on the order of a
million distinct person names, far beyond a CPU model's budget. Organization
names and addresses have thousands of distinct values, benefit greatly from
parsing ("Ltd" / "Limited" / "SARL"; house-number/street/sector/district), and
are cached in `match_norm_cache` forever. Each run has a normalization call
budget; values beyond it keep their deterministic form and the run records how
many were skipped.

### 6.3 Stage 3 — Block

Each pass is one generated key column with an index behind it. Representative
passes:

| Pass | Kind | Key |
|---|---|---|
| name + birth year | equi | `dmetaphone(surname) \|\| '\|' \|\| extract(year from dob)` |
| phone | equi | last nine digits |
| name + district | equi | `dmetaphone(surname) \|\| '\|' \|\| district` |
| near name | trigram | `similarity()` join on the normalized full name |
| org name / address | vector | pgvector ANN over the distinct-value dictionary (Section 7.3) |

Passes are joined independently and `UNION`ed on `(left_key, right_key)`.

Two guards are part of the stage, not optional extras:

- **Estimate before running.** Sample the key columns, build a frequency
  histogram, and project the pair count for each pass. The wizard shows the
  projection per pass and the total. A projection above
  `MATCHING_MAX_CANDIDATE_PAIRS` warns, and above twice that refuses.
- **Drop degenerate keys.** Any key value covering more than 0.5% of rows makes
  its join quadratic — an empty surname does exactly this. Such values are
  detected from the same histogram and excluded from the pass, and the run
  records which values were dropped.

### 6.4 Stage 4 — Score

One `INSERT ... SELECT` per pass. Comparators in SQL, by role:

| Role | Comparators |
|---|---|
| `person_name`, `org_name` | `similarity()`, `levenshtein_less_equal()`, token-set equality (catches swapped name order) |
| `date` | absolute day difference; digit-transposition check |
| `phone`, `identifier` | exact on last nine digits; `levenshtein_less_equal(..., 1)` |
| `address` | `similarity()` on the normalized form; equality on parsed district/sector |
| `text` | `similarity()` |

Per-field scores go to `features`; the weighted sum goes to `score`. Pairs
already present in `MatchDecision` take the human answer and skip scoring.
Thresholds split the survivors into `auto_match` (>= `matchAt`) and `grey`
(between `rejectAt` and `matchAt`).

**Weight model.** Version 1 uses explicit per-field weights that the user tunes
against the gold set, with live precision and recall. Fellegi–Sunter with
EM-estimated `m` and `u` probabilities is the standard method for this work and
is phase 4 — its parameters cannot be estimated before labels exist, and
`MatchDecision` plus `match_gold_pairs` are how the labels arrive.

### 6.5 Stage 5 — Cluster

Union-find over pairs at or above `matchAt`, plus human-confirmed pairs. Three
rules matter more than the algorithm:

- **Over-merge guard.** After clustering, check every pair inside each cluster.
  If any internal pair scores below `rejectAt`, mark the cluster `flagged` and
  route it to review instead of publishing it. This stops the "A matches B, B
  matches C, A does not match C" chain.
- **Stable `entity_key`.** On a re-run, a cluster keeps the `entity_key` held by
  the majority of its previous members; a genuinely new cluster gets a fresh
  uuid. Without this rule the crosswalk churns on every run and every
  downstream join breaks.
- **Golden record.** Survivorship rules per field: `most_recent`,
  `most_complete`, `source_priority`, `most_frequent`. Each golden field records
  the source and key its value came from. The model may write a prose
  explanation on request; it never chooses the value.

The run then writes `match_crosswalk` and, for `flagged` clusters, writes
nothing to the crosswalk until a person resolves them.

## 7. Models, budgets and surface

### 7.1 Three tiers

| Tier | What runs | Pairs it sees | Speed |
|---|---|---|---|
| 1 | SQL string metrics | ~2x10^8 | minutes |
| 2 | Cross-encoder reranker (phase 4) | the grey band | ~100/sec |
| 3 | Small instruct model, writes the reason | only pairs a person opens | ~5 sec each |

### 7.2 Tier 3 — adjudication

Default model: Qwen3-1.7B at Q4 — about 1.1 GB resident, good JSON adherence,
multilingual. A verdict is roughly 120 output tokens, so 4 to 6 seconds on
eight cores. It is called through the existing
`IAiProvider.generateJson(prompt, settings)` and returns
`{ match: boolean, confidence: number, reason: string }`. The verdict is stored
on `match_candidates.llm_verdict` with the model name and timestamp.

The model's contribution is the `reason` field. A data steward can defend a
written reason in an audit; a similarity score is harder to defend. The model
does not decide: it never merges anything on its own, and a model failure
leaves the pair unannotated rather than failing the run.

**One settings change.** `generateJson()` reads `settings.aiModel`, which on the
RISA setup is the 30B chat model. Matching needs a small model. Add
`aiSmallModel` to `OrganizationSettings`, defaulting to the value of
`AI_SMALL_MODEL`. The error doctor and the check suggester can use it too.

### 7.3 Embeddings

Not per row. Ten million row vectors do not fit beside PostgreSQL in 16 GB.
Instead, embed the **distinct values** of the `org_name` and `address` roles —
thousands to low millions — into a dictionary table with a pgvector HNSW index,
and expose it as the `vector` blocking pass for those roles only. Person names
use trigram plus phonetic keys and need no vectors.

### 7.4 Tier 2 — the reranker, and why it waits

A cross-encoder reranker is the most specialized small model in this design and
the correct tool for the grey band: one forward pass, no generation, about 100
pairs a second, which turns a 200,000-pair grey band into something a person
can finish. But Ollama does not serve rerankers well, so it needs one new
container (Text Embeddings Inference, or a small Python service). It is
therefore phase 4. `adjudication.service.ts` is designed with a
`scorePairs(pairs) => scores` seam so the reranker slots in without a rewrite.
Version 1 adds zero new services.

### 7.5 Budget on a 16 GB CPU-only box

| Process | RAM |
|---|---|
| PostgreSQL | 5–6 GB |
| Node backend | 1–2 GB |
| Ollama with Qwen3-1.7B Q4 | ~1.5 GB |
| Embedding model | 0.3–1.2 GB |
| Next.js | ~0.5 GB |
| OS and headroom | ~2 GB |

It fits, tightly. The 30B chat model must not run on this box; it needs about
20 GB.

**Disk:** roughly 15 to 20 GB per large project — workspace columns, indexes
and surviving candidates. Retention must reclaim it.

**Estimated run time for 10M x 10M**, still unconfirmed: materialize 20–60
minutes, block and score 10–40 minutes, cluster a few minutes. One to two
hours, with no model in the hot path. Nothing below verifies these numbers —
they remain estimates, and the 10M-scale measurement is still outstanding.

**Measured on 10k rows** (Task 15, `test/matching-engine.e2e-spec.ts`, against
PostgreSQL 15 on a developer laptop; one dedupe project, 10,000 rows, four
blocking passes — one trigram, three exact — five mapped fields, 12,021
candidate pairs seen and 3,124 stored). A complete pipeline run takes **9 to
10 seconds end to end**, measured over the several full runs the suite
performs. By stage:

| Stage | Measured at 10k rows |
|---|---|
| materialize left (read 10k rows through the connection driver, one page, plus index build) | 0.3–0.4 s |
| blocking estimate (one histogram query per pass, 4 passes) | ~0.05 s |
| scoring (count + scored insert per pass, 4 passes) | 8–9 s |
| cluster + publish crosswalk (300 clusters, 600 crosswalk rows) | 0.6–1.3 s |

Scoring dominates, and within it the single trigram pass dominates: the three
exact passes are index-equality joins, while the trigram pass probes the GIN
index once per row. One outlier run measured 135 s of scoring while two other
runs were executing concurrently on the same laptop, which is machine
contention rather than a property of the workload — but it is worth recording
that this stage degrades sharply under CPU pressure.

These are 10k-row numbers on a laptop. They say nothing about the 10M-scale
estimates above: the costs that dominate at 10M — paging 200 batches through
the source driver, a candidate set three to four orders of magnitude larger,
and a workspace that no longer fits in cache — are all absent at this scale.
Do not extrapolate from this table.

### 7.6 Retention

`matching-cleanup.service.ts` copies the shape of
`transformations-cleanup.service.ts`: a daily `@Cron('0 3 * * *')` that, for
every project past `retentionDays`, drops the workspace tables and deletes that
project's `match_candidates` rows. `MatchDecision`, `MatchEntity`,
`match_crosswalk`, `match_gold_pairs` and `match_norm_cache` survive — they are
results and audit, not working data.

## 8. User surface

Pages under `packages/frontend/app/matching/`, an `api.matching` namespace
appended to `lib/api.ts`, and a sidebar entry labelled "Entity Matching" in the
`DATA OPERATIONS` section of `components/Sidebar.tsx`, after Data Quality.

- **`page.tsx`** — project list with last-run status.
- **`new/page.tsx`** — a four-step wizard. Sources; field map (model-suggested,
  user-editable); blocking, showing the projected pair count for each pass
  before anything runs; thresholds, with the evaluator running on the gold set
  so the sliders show real precision and recall rather than guesses.
- **`[id]/page.tsx`** — project detail and run history.
- **`[id]/runs/[runId]/page.tsx`** — counters, a cluster-size histogram, and the
  flagged clusters.
- **`[id]/review/page.tsx`** — the review queue. Two record cards side by side,
  aligned field by field, each field with a similarity bar and the differing
  characters marked. The overall score and the blocking pass that found the pair
  are shown. The model's reason loads when the pair opens. Keys: `m` match, `n`
  no match, `s` skip, `u` undo, `j`/`k` to move. The queue orders pairs by
  decision value — nearest the threshold first. Every keystroke writes a
  `MatchDecision`.
- **`[id]/clusters/page.tsx`** — clusters, each with its golden record and the
  source of every field.

**The Crosswalk is replaced by each run, not accumulated (Ruling R48).**
Everything upstream of publication is recomputed from scratch every run — the
workspace is dropped and reloaded in full, candidates and clusters are rebuilt.
Only the Crosswalk persisted across runs, and `resolveEntityKey` read that
accumulation as current truth. Two consequences followed, and both are defects.

A published merge could never be withdrawn. A steward records `no_match`, the
over-merge guard flags the cluster, publication correctly writes nothing for it
— and the rows from the earlier run still say those records are one person. The
verdict reaches scoring and never reaches the published product, which is the
one artefact other systems join against. The same held for a raised threshold,
a deleted source row, and a cluster that split back into singletons.

So publication replaces rather than accumulates: in one transaction, rows for
this project and source that the current run did not publish are deleted, then
the run's rows are upserted. This is sound precisely because every run sees the
complete source, so the latest run's conclusions are the complete current
picture. A flagged cluster is deliberately not published, and its earlier claim
is therefore withdrawn — the register stops asserting that two people are one
while a human decides, which is the safe direction. A run that publishes
nothing at all must still withdraw: "this run found no duplicates" is a
conclusion, not an absence of one.

**An entity key belongs to at most one cluster per run (Ruling R49).**
`resolveEntityKey` takes the majority key among its members' existing Crosswalk
rows, with no record of what the same run already assigned. Two clusters could
therefore claim the same key: if a steward splits a three-record entity, the
larger fragment keeps the key by majority and the smaller fragment can vote for
it too, republishing all of them under one key — more merged than before the
steward intervened, as a direct result of their correction. Keys are claimed
once per run; a cluster whose majority key is already taken mints a new one,
which is the correct identity for a fragment that has just been split off.

**The grey queue re-serves pairs that already carry a verdict (phase 2).**
Recording a decision does not change `match_candidates.decision`, so a pair a
steward already judged is served again on their next visit. It is not corrupting
— a second verdict upserts over the first — but it wastes review time and it
means the queue's position indicator must not be labelled as progress. Filtering
decided pairs out needs an honest denominator, and `counters.grey` is fixed at
run time, so it would require a count of undecided pairs the API does not expose.
Phase 2 adds that count and the filter together; until then the queue shows
position ("Pair X of Y"), plus a separate count of decisions made in this
session, and never claims a certified-progress figure it cannot substantiate.

**Undo retracts a verdict; it does not assert the opposite (Ruling R43).**
`match_decisions` carries a `UNIQUE` constraint on the pair, and a stored verdict
is honoured by scoring *regardless of score* — `'no_match'` becomes `'rejected'`
for that pair in every later run. Two consequences follow.

First, recording a verdict is an upsert, not an insert. A steward who reaches the
same pair twice — through undo, a reload, or a second review session — is
correcting their answer, and a correction must not be a constraint violation.
The latest verdict replaces the earlier one, with its author and timestamp.

Second, undo *removes* the verdict rather than submitting its opposite. These are
different claims: "I have no opinion on this pair" leaves it to be scored on its
merits, while "these are not the same person" suppresses it permanently. A
mis-keyed keystroke must never be recorded as a certification the steward never
made, so the queue's undo deletes the decision row and the pair returns to the
grey band it came from.

**What the review queue is served (Ruling R39).** A pair the queue shows must
arrive with the data a human needs to judge it, or the screen asks someone to
certify a match they cannot see. `GET /matching/runs/:runId/candidates`
therefore returns, per pair: the stored `features` (the per-field scores the
similarity bars are driven by) and `leftRecord` / `rightRecord`, the two rows
as JSON, read by joining the materialized workspace on `src_key`.

The disclosure is already bounded: only allow-listed columns are ever copied
into a workspace, so the allow-list recorded at project creation is exactly the
ceiling on what this endpoint can return. The generated blocking-key columns
travel with the row and are derived from those same values, so they widen
nothing; the client renders the Field Map's fields and ignores the rest.

The workspace outlives its run but not forever — the retention sweep drops it.
When it is gone the endpoint returns the pair with `leftRecord` and
`rightRecord` null, and the queue then shows why the records are unavailable
and collects no verdict. Refusing to take a verdict is the point: an unseen
pair must never be certifiable.

### 8.1 Integration points

| Place | Change |
|---|---|
| `app/staged/page.tsx`, catalog table view | A "Find duplicates" action that creates a `dedupe` project pre-filled from that table |
| `quality-check.entity.ts:13` | New `CheckType` `'no_duplicates'`, failing when duplicate clusters exceed a configured count |
| `pipeline.entity.ts:15` and `pipelines-executor.service.ts` | New step type `'match'` and its `case` branch |
| Cross-Query table browser | `match_crosswalk` becomes selectable, so A joins crosswalk joins B on `entity_key` |
| Lineage | Each completed run emits edges from the source tables to the crosswalk |

**Ruling R31 — deleting a Match Project is a soft delete.**
`DELETE /api/matching/projects/:id` sets `status = 'inactive'`; it does not remove the
row. The list endpoint excludes inactive projects by default.

The reason is the audit trail's direction. The project row carries `lawfulBasis` and
`dataOwner` — the recorded justification for copying citizen data and the person
accountable for it. Every `match_decision`, `match_entity`, `match_crosswalk` row and
gold pair is deliberately kept forever by retention as results and audit. No foreign key
constrains any of them, so a hard delete does not fail; it silently orphans all of them
and destroys the one row explaining under whose authority they were produced. Keeping the
acts and deleting the authority is exactly backwards.

Orphaned crosswalk rows are the sharper problem: the Crosswalk is a published interface
other features join against, so those rows stay live and joinable while pointing at a
project that no longer exists.

Phase 1 therefore has no hard delete. A genuine purge of a project and everything
produced under it is a deliberate, separately audited operation — not something a `DELETE`
verb should do by accident.

**Ruling R32 — an inactive project refuses mutation; reads stay open.**
R31 defined what a soft delete *stores* and never defined what it *prevents*. As written,
a deleted project is fully operable: `POST projects/:id/runs` still starts a run, so a
"deleted" project can materialize fresh citizen data into a workspace table, and `PATCH`,
`POST decisions`, `POST gold-pairs` and `POST estimate` all keep working. The only
observable effect of `DELETE` was that the project left a list.
So every mutating route refuses `status = 'inactive'` with a 409 naming the reason, and
every read route continues to serve it — an auditor reconstructing a decision must still
reach the lawful basis it was made under.

**Ruling R33 — a project's recorded authority is immutable once it has run.**
`PATCH` currently overwrites `lawfulBasis`, `dataOwner` and `columnAllowlist` in place
with no history. R31's whole rationale is that the row carrying the recorded authority
must not be destroyed while the acts performed under it are kept forever — and a PATCH
destroys it exactly as completely as the hard delete R31 forbade. Widening
`columnAllowlist` after runs exist is worse than losing history: it retroactively changes
the legal boundary of what the feature was permitted to copy, with nothing recording that
the boundary moved.
Therefore: before a project's first run these three fields are freely editable, because
the project is still configuration. From its first run onward they are **immutable**, and
`PATCH` rejects a change to any of them with a 409 directing the operator to create a new
project. Everything else on the project stays editable.
A full field-level history table is the better long-term answer and is phase-4 work; this
is the cheap rule that closes the hole now.

**Ruling R36 — the estimate endpoint re-estimates an existing workspace; it is not a pre-flight check.**
`BlockingService.estimate` reads the materialized workspace table, which only
`MaterializeService.materialize` creates, and materialization happens inside a run. So
`POST projects/:id/estimate` cannot work before a project's first run — the plan
specified a wizard step that was structurally impossible.

The fix is not to have the estimate materialize on demand, and the reason is governance
rather than cost. **Materializing copies citizen data into DataGate**, and in the wizard
the lawful basis and data owner are recorded in step 4 — *after* the step-3 estimate.
Copying the data to answer "how big would this be?" would invert the order the whole
feature is built around: authority recorded first, data copied second.

So the estimate is a **tuning tool for a project that has already run** — change the
blocking passes, re-estimate against the workspace that exists, see the new projection.
Before the first run the wizard says so plainly and leaves "Create and run" enabled,
because the run pipeline's own `materialize → estimate → refuse` sequence is the real
gate. That gate is verified end to end: the integration test asserts a refused estimate
is recorded as a failed run with the advisory lock released.

The endpoint must return a clear 409 naming this when the workspace is absent, not a raw
`relation "matching.p_..._left" does not exist`.

## 9. Governance

These are requirements. The data is citizen and business personal data, and
Rwanda's Law No. 058/2021 and the National Data Sharing Policy (May 2025) both
bear on it.

1. The materializer reads only `columnAllowlist` columns. One rule, one place,
   covered by a test.
2. A matching project **refuses** any provider that is not known-local.
   `AiProvider.LOCAL`, or `CUSTOM` pointed at a private host, only. The check
   is an **allow-list, not a block-list**: the code throws unless the provider
   is exactly `LOCAL` or `CUSTOM`. This matters because `ai_provider` is an
   unconstrained `varchar` with no database enum or CHECK, so a typo, a
   hand-edited row, or a provider added to the enum later without revisiting
   this guard would otherwise **fail open** and be treated as local. Personal
   data never leaves the server.
3. `lawfulBasis` and `dataOwner` are required, non-empty fields on every
   project.
4. `@Roles` guards every mutating endpoint, and review is its own role. The
   repository audit found `@Roles` guarding zero endpoints today (SEC-10);
   matching must not repeat that.
5. `AiAuditService.log()` records every model call under the features
   `matching_align`, `matching_normalize` and `matching_adjudicate`. It stores
   sizes and metadata, never record values — matching the existing service's
   contract.
6. Workspace tables live in DataGate's PostgreSQL with encryption at rest, and
   retention deletes them.

## 10. Evaluation

Part of the feature, not an extra. `eval.service.ts` reads
`match_gold_pairs` — a hand-labelled sample per project — and reports
precision, recall and F1 at the current thresholds, plus a sweep across
thresholds so the user chooses the operating point deliberately. The wizard's
threshold step calls it. Confirmed and rejected pairs from the review queue can
be promoted into the gold set.

Without this, thresholds are a guess, and a guess cannot be defended in an
audit.

## 11. Order of work

| Phase | Content |
|---|---|
| 1 | Deduplicate one source. Materialize, deterministic normalize, block, score, cluster, review queue, crosswalk, evaluation, `no_duplicates` check. **Zero model calls** — the field map is entered by hand, and every governance control is in place before any model exists. |
| 2 | The models. Lazy adjudication with reasons; model normalization for `org_name` and `address`; the `vector` blocking pass and `match_value_vectors`; model-suggested field mapping in the wizard. |
| 3 | Linkage across two sources. Right source, cross-source clusters, golden record and survivorship, Cross-Query integration, lineage edges. |
| 4 | Quality. The reranker tier, Fellegi–Sunter weights from the collected labels, incremental re-match, the `match` pipeline step. |

Phase 1 is useful on its own and proves the engine before any model is trusted
with anything.

**The implementation plan that follows this spec covers phase 1 only.** Phases
2 to 4 each get their own plan, written after phase 1 has run on the target
hardware and Section 7.5's estimates have been replaced with measurements.

## 12. Testing

- **Pure functions** — comparators, normalizers, blocking-key builders,
  union-find, survivorship rules: unit tests. This is the repository's
  strongest existing test style.
- **Generated SQL** — snapshot tests per dialect for the materializer's paging
  query, and for the blocking and scoring statements.
- **Engine** — an integration test against the `docker-compose` PostgreSQL,
  seeded with a 10,000-row fixture containing known duplicates, asserting
  precision and recall against that fixture's ground truth.
- **Adjudication** — mocked `IAiProvider`: assert the JSON contract, and assert
  that a provider failure leaves the run intact and the pair unannotated.
- **Governance** — two tests: a remote provider is rejected; a column outside
  `columnAllowlist` is never read.
- **Gates** — backend `pnpm test` and `npx tsc --noEmit` clean; frontend
  `pnpm build` exit 0 and `npx next lint` with zero errors.

## 13. Configuration

New environment variables, added to both `.env.example` files:

| Variable | Default | Purpose |
|---|---|---|
| `AI_SMALL_MODEL` | `qwen3:1.7b` | Default for `OrganizationSettings.aiSmallModel` |
| `MATCHING_RETENTION_DAYS` | `30` | Workspace and candidate retention |
| `MATCHING_MAX_CANDIDATE_PAIRS` | `250000000` | Warn above this projection; refuse above twice it |
| `MATCHING_BATCH_ROWS` | `50000` | Keyset page size |
| `MATCHING_NORM_CALL_BUDGET` | `5000` | Model normalization calls per run |

## 13a. Known limitation — four drivers cannot page

`DatabaseDriver.query(sql, params?)` is the interface, but four of the nine
implementations do not honour the second argument. `snowflake.driver.ts`,
`bigquery.driver.ts` and `mongodb.driver.ts` declare `query(sql: string)` with
no `params` at all — which still satisfies the interface, because TypeScript
permits a narrower parameter list — and `clickhouse.driver.ts` accepts
`_params` and discards it. Only postgres, mysql, redshift, sql-server and
sqlite thread parameters through.

MongoDB is the worst of the four and not merely unbindable: its `query()`
calls `JSON.parse(sql)` and expects `{"collection":…,"filter":…}`. It does not
speak SQL at all, so a generated `SELECT` reaches it as malformed JSON and
raises a raw error about JSON syntax — nothing resembling a diagnosable
refusal. (`ProfilingService` already refuses MongoDB explicitly for the same
underlying reason, so this is an established pattern in the codebase rather
than a new exception.)

Keyset pagination binds `afterKey` as a parameter, so on those four connection
types the parameter is silently dropped and the emitted SQL retains a literal
`$1`. Matching therefore **refuses Snowflake, BigQuery, ClickHouse and MongoDB
sources in phase 1**, failing closed at the point of use with a message naming
the reason.

This is a pre-existing driver gap, not a matching defect, and fixing it means
threading each client's own binding API (BigQuery named parameters, Snowflake
`binds`) and testing against three hosted services — its own piece of work,
deliberately not bolted onto this feature. Phase 1 supports five of the nine
connection types plus staged data — postgres, mysql, redshift, sql-server and
sqlite (Ruling R58: the count said six while the list named five; five is the
number that matches the four refusals above).

## 14. Risks

| Risk | Mitigation |
|---|---|
| Copying personal data into DataGate's database | Column allow-list, required lawful basis and owner, encryption at rest, retention, local-only provider enforced in code |
| Model non-determinism in a decision with legal weight | The model explains and never merges; the deterministic score is the decision signal; every verdict stores its model and time; runs are repeatable |
| Name matching performs unevenly across spelling conventions | Report evaluation metrics per source and, where the data allows, per subgroup; the gold set must sample deliberately, not randomly |
| Grey band larger than a team can review | Pair-count estimate before the run, threshold sweep against the gold set, the reranker tier in phase 4, and a visible queue size |
| 10M-scale timings unverified | Phase 1 measures a real run on the target box and records the numbers against Section 7.5's estimates |

## 15. Glossary

The canonical glossary for the project is `CONTEXT.md` at the repository root.
This section repeats the matching terms for readers of this spec alone; where
the two differ, `CONTEXT.md` wins.

| Term | Meaning |
|---|---|
| **Match project** | The configuration: sources, field map, blocking passes, thresholds, allow-list, lawful basis |
| **Match run** | One execution of a match project |
| **Match source** | A live `Connection` table or a `StagedData` dataset. Always qualified — the bare word "source" collides with `Connection`. |
| **Workspace** | The per-project tables in schema `matching` holding the copied, normalized columns |
| **Blocking pass** | One indexed rule that proposes candidate pairs |
| **Candidate pair** | Two records a blocking pass proposed |
| **Grey band** | Candidate pairs scoring between `rejectAt` and `matchAt` |
| **Adjudication** | A small instruct model writing a reason for one pair |
| **Cluster** | A set of records the engine believes are one entity |
| **Entity key** | The stable identifier for a cluster, kept across runs |
| **Golden record** | One value per field chosen from a cluster by survivorship rules, with provenance |
| **Crosswalk** | The published table mapping `(source, source_key)` to `entity_key` |
| **Decision** | A person's permanent verdict on one pair |
| **Gold set** | Hand-labelled pairs used to measure precision and recall |

**The local-provider guard asserts at the model call site, not before it.**
Personal data must never reach a hosted model, and the check is an allow-list
so an unrecognised provider fails closed. But phase 1 asserted it at the start
of every run, and phase 1 makes no model calls — so it demanded a local model
for a feature that never used one, and refused every organization by default,
since `organization_settings.ai_provider` defaults to `openai`. It also
protected nothing: the check is satisfied by changing a dropdown, not by a
local model existing.

The guard therefore belongs immediately before each model call — adjudication,
normalization, embedding — where the condition it asserts is actually true and
where a second entry point cannot route around it. Asserted any earlier it is
a proxy for "a model may be called later", and a proxy drifts from the thing
it stands for. Phase 1 consequently calls it nowhere; the function and its
tests stay, because the allow-list shape is the load-bearing part and
re-deriving it later risks reintroducing a block-list that fails open.

---

## Appendix: carried out of phase 1

Recorded when phase 1 closed, so the next person does not rediscover them. Each
was found by a review, judged, and deliberately left — none is an unknown.

**Wanted before the feature is used in anger**

- **No evaluation surface.** The precision/recall sweep and the gold-pair API are
  built and tested with zero callers, because nothing manages a gold set. Until
  that exists, an operator cannot measure the thresholds they are asked to
  choose. This is the first phase-2 item.
- **No frontend test infrastructure exists in this repository** — no runner, no
  specs. The most serious review-queue defect found during phase 1 was exactly
  what such a test would pin, and nothing prevents its regression.
- **Four of the nine database drivers ignore bound parameters**, a pre-existing
  defect in shared code. Matching refuses those source types rather than
  interpolating values into SQL, so phase 1 supports five connection types plus
  staged data. Fixing the drivers means threading each vendor's binding API.

**Rules duplicated by hand, accurate today**

- The source-reference format appears in three places (clustering, crosswalk,
  and the review page). The comparator-ordering rule appears in three
  (`blocking-sql`, the wizard, `RecordDiff`). Both drift silently: nothing fails,
  the values simply stop agreeing. This is the same class as the verdict/state
  enum mismatch that survived four task reviews.

**Known and bounded**

- The grey queue re-serves pairs that already carry a verdict; a second verdict
  upserts over the first, so this wastes review time rather than corrupting
  anything. Filtering needs a count of undecided pairs the API does not expose.
- A displaced cluster mints a fresh entity key rather than taking an unclaimed
  runner-up it previously owned. Converges after one run; churn only.
- Between releasing the project lock and recording the final status there is a
  millisecond window in which the abandon endpoint could mark a completed run
  failed. An inaccurate audit row, no data effect.
- The over-merge guard and key resolution each make one database round trip per
  cluster, unbatched. Batching is a design change, not a fix.
- `@Index(['organizationId'])` on the five matching entities is inert metadata:
  `synchronize` is off and no migration creates those indexes.
- The reviewer role described in §9.4 is not implemented; review requires editor
  rights.
- Dropped degenerate blocking keys and the job-size warning are recorded on the
  run and surfaced nowhere a user can see.
- A project's source can still be repointed after runs exist, while entity-key
  resolution ignores the source reference.

**Environment**

- The working `.env` names a different database than `.env.example` and
  `docker-compose.yml`. Pre-existing, unrelated to matching, surfaced when the
  integration suite was first run.
