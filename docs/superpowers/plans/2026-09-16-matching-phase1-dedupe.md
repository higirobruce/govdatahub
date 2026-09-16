# Entity Matching Phase 1 — Deduplicate One Match Source

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working deduplication engine — pick one table or staged dataset, find the records that describe the same entity, review the uncertain pairs by hand, and publish a stable `entity_key` Crosswalk.

**Architecture:** A new `matching` backend module copies a Match Project's allow-listed columns into per-project tables in DataGate's own PostgreSQL (schema `matching`), then runs every stage there in SQL: blocking by indexed generated columns, scoring by trigram/edit-distance/date comparators, clustering by union-find. Rejected pairs are never stored. **Phase 1 makes zero model calls** — the field map is entered by hand, and every governance control is built and tested before any model exists.

**Tech Stack:** NestJS 11 + TypeORM + Jest, PostgreSQL with `pg_trgm` and `fuzzystrmatch`, Next.js 14 App Router.

**Spec:** `docs/superpowers/specs/2026-09-16-entity-matching-design.md`. Related decisions: `docs/adr/0001-crosswalk-not-master-data-management.md`, `docs/adr/0002-materialized-match-workspace.md`. Vocabulary: `CONTEXT.md` (use its terms in all identifiers, comments and UI copy).

## Global Constraints

Every task's requirements implicitly include this section.

- Branch `ft-matching-phase1` off `ft-phase2-ai-foundation`.
- Backend commands run from `packages/backend`; frontend from `packages/frontend`.
- Targeted test: `pnpm test -- --runTestsByPath <spec>`. Gates per task: targeted spec green, then full `pnpm test`, then `npx tsc --noEmit` clean. Frontend gates: `pnpm build` exit 0 and `npx next lint` with zero errors.
- Migration numbering continues at `1711000000010`. One migration for this whole plan.
- **Zero model calls in phase 1.** No `AiService`, no `IAiProvider`, no `EmbeddingsService` anywhere in this plan. `match_norm_cache` and `match_value_vectors` belong to phase 2 and are NOT created here.
- **Never store a rejected pair.** Every scoring statement is `INSERT ... SELECT ... WHERE score >= rejectAt`. Rejects are counted into `MatchRun.counters` and discarded in the same statement.
- **Column allow-list.** The materializer is the only code that reads source columns, and it reads only `MatchProject.columnAllowlist`. Any other column name must never reach a generated SQL string.
- **Local-only AI provider.** Creating or running a Match Project throws when the Organization's `aiProvider` is `OPENAI`, `ANTHROPIC` or `AZURE` — enforced in phase 1 even though phase 1 calls no model, so the rule is never retrofitted.
- **Organization isolation.** Every query filters by `organizationId`. Every controller uses `JwtAuthGuard` + `@CurrentUser() user: User`.
- **RBAC.** Mutating endpoints carry `@Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)`. Submitting a Decision requires the same. Read endpoints require auth only.
- **Every task that creates a service registers it as a provider in `matching.module.ts` within that same task.** Nest fails at boot on a missing provider, and the first place that surfaces is Task 15, many tasks later.
- Identifier interpolated into SQL must be validated against `/^[A-Za-z0-9_]+$/` before interpolation, or quoted with the existing `quoteId` helper style from `data-quality/profiling.service.ts`.
- Golden Record population is **phase 3**. The `golden` column is created here and left as `{}`.
- Commits: the message given in each task's commit step, a blank line, then `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Do not push.
- **Never `git commit --amend`, and never rebase or reset.** A fix round always adds a NEW commit. Amending destroys the artifact a reviewer verdicted, and `HEAD` is not necessarily your own commit — the controller commits to this branch too, so an amend can silently absorb someone else's work into a commit message that does not describe it. If your last commit needs changing, add another one.
- **Encryption at rest is deployment, not code.** Spec section 9 rule 6 requires it, and no task in this plan can satisfy it — it is a property of the PostgreSQL volume on the deploy host. It is listed here so it is not mistaken for something the code handles: raise it with the deploy owner before a Match Project runs against real citizen data. Do not close phase 1 as "governance complete" without it.

## File Structure

**Backend — created:**

| File | Responsibility |
|---|---|
| `src/database/migrations/1711000000010-AddEntityMatching.ts` | Extensions, `matching` schema, all phase-1 tables |
| `src/database/entities/match-project.entity.ts` | Match Project configuration |
| `src/database/entities/match-run.entity.ts` | One execution and its counters |
| `src/database/entities/match-entity.entity.ts` | One Cluster |
| `src/database/entities/match-decision.entity.ts` | A person's permanent verdict |
| `src/modules/matching/normalization.service.ts` | Deterministic value normalization — pure functions |
| `src/modules/matching/blocking-sql.ts` | Blocking key and comparator SQL expression builders — pure |
| `src/modules/matching/sources/source-reader.service.ts` | Uniform paged read over Connection or Staged Data |
| `src/modules/matching/materialize.service.ts` | Workspace table creation and population |
| `src/modules/matching/blocking.service.ts` | Key histogram, pair estimate, degenerate-key exclusion, pass execution |
| `src/modules/matching/scoring.service.ts` | Comparator SQL, weighted score, threshold split |
| `src/modules/matching/clustering.service.ts` | Union-find, over-merge guard, stable entity key |
| `src/modules/matching/crosswalk.service.ts` | Publishes the Crosswalk |
| `src/modules/matching/eval.service.ts` | Precision, recall, F1 and threshold sweep against the Gold Set |
| `src/modules/matching/match-run.service.ts` | Orchestrator and status machine |
| `src/modules/matching/matching-governance.ts` | The provider refusal and identifier validation, in one place |
| `src/modules/matching/matching-cleanup.service.ts` | Daily retention sweep |
| `src/modules/matching/matching.controller.ts` | HTTP surface |
| `src/modules/matching/matching.module.ts` | Wiring |
| `src/modules/matching/dto/*.ts` | Request DTOs, class-validator decorated |

**Backend — modified:** `src/database/entities/index.ts`, `src/app.module.ts`, `src/database/entities/quality-check.entity.ts`, `src/modules/data-quality/quality-checks.service.ts`, both `.env.example` files.

**Frontend — created:** `app/matching/page.tsx`, `app/matching/new/page.tsx`, `app/matching/[id]/page.tsx`, `app/matching/[id]/runs/[runId]/page.tsx`, `app/matching/[id]/review/page.tsx`, `app/matching/[id]/clusters/page.tsx`, `components/Matching/RecordDiff.tsx`.

**Frontend — modified:** `lib/api.ts`, `components/Sidebar.tsx`.

---

### Task 0: Branch

- [ ] **Step 1:**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git checkout ft-phase2-ai-foundation && git checkout -b ft-matching-phase1
```

---

### Task 1: Migration, entities, module skeleton

**Files:**
- Create: `src/database/migrations/1711000000010-AddEntityMatching.ts`
- Create: `src/database/entities/match-project.entity.ts`, `match-run.entity.ts`, `match-entity.entity.ts`, `match-decision.entity.ts`
- Create: `src/modules/matching/matching.module.ts`
- Modify: `src/database/entities/index.ts`, `src/app.module.ts`

**Interfaces:**
- Produces: the four entity classes; the exported types below, which every later task imports from `'../../database/entities'`.

```typescript
export type MatchMode = 'dedupe' | 'link';
export type FieldRole = 'person_name' | 'org_name' | 'date' | 'phone' | 'identifier' | 'address' | 'text';
export type BlockingKind = 'equi' | 'trigram';   // 'vector' is phase 2
export type MatchRunStatus =
  | 'pending' | 'materializing' | 'normalizing' | 'blocking'
  | 'scoring' | 'clustering' | 'completed' | 'failed';
export type CandidateDecision = 'auto_match' | 'grey' | 'confirmed' | 'rejected';

export interface MatchMember { sourceRef: string; sourceKey: string; }

export interface MatchSourceRef {
  kind: 'connection' | 'staged';
  connectionId?: string;
  schemaName?: string;
  tableName?: string;
  stagedDataId?: string;
  primaryKey: string;
}
export interface FieldMapping {
  left: string;
  right: string;
  role: FieldRole;
  weight: number;
  comparator: string;
}
export interface BlockingPass { name: string; kind: BlockingKind; keyExpr: string; threshold?: number; }
export interface MatchThresholds { matchAt: number; rejectAt: number; }
export interface MatchRunCounters {
  leftRows: number; rightRows: number; candidatePairs: number;
  autoMatch: number; grey: number; autoReject: number;
  clusters: number; flaggedClusters: number;
}
```

- [ ] **Step 1: Write the migration**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEntityMatching1711000000010 implements MigrationInterface {
  name = 'AddEntityMatching1711000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS fuzzystrmatch`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS matching`);

    await queryRunner.query(`
      CREATE TABLE "match_projects" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "name" text NOT NULL,
        "description" text NULL,
        "mode" text NOT NULL,
        "left_source" jsonb NOT NULL,
        "right_source" jsonb NULL,
        "field_map" jsonb NOT NULL DEFAULT '[]',
        "blocking_passes" jsonb NOT NULL DEFAULT '[]',
        "thresholds" jsonb NOT NULL DEFAULT '{"matchAt":0.9,"rejectAt":0.55}',
        "column_allowlist" text[] NOT NULL DEFAULT '{}',
        "lawful_basis" text NOT NULL,
        "data_owner" text NOT NULL,
        "retention_days" integer NOT NULL DEFAULT 30,
        "status" text NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_match_projects_org" ON "match_projects" ("organization_id", "created_at")`);

    await queryRunner.query(`
      CREATE TABLE "match_runs" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "project_id" text NOT NULL,
        "status" text NOT NULL,
        "counters" jsonb NOT NULL DEFAULT '{}',
        "watermarks" jsonb NOT NULL DEFAULT '{}',
        "dropped_keys" jsonb NOT NULL DEFAULT '[]',
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz NULL,
        "duration_ms" integer NULL,
        "error_message" text NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_match_runs_project" ON "match_runs" ("organization_id", "project_id", "started_at")`);

    await queryRunner.query(`
      CREATE TABLE "match_entities" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "project_id" text NOT NULL,
        "run_id" text NOT NULL,
        "entity_key" text NOT NULL,
        "members" jsonb NOT NULL DEFAULT '[]',
        "golden" jsonb NOT NULL DEFAULT '{}',
        "size" integer NOT NULL,
        "flagged" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_match_entities_run" ON "match_entities" ("organization_id", "run_id", "flagged")`);
    await queryRunner.query(
      `CREATE INDEX "idx_match_entities_key" ON "match_entities" ("organization_id", "project_id", "entity_key")`);

    await queryRunner.query(`
      CREATE TABLE "match_decisions" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "project_id" text NOT NULL,
        "left_source_ref" text NOT NULL,
        "left_key" text NOT NULL,
        "right_source_ref" text NOT NULL,
        "right_key" text NOT NULL,
        "decision" text NOT NULL,
        "user_id" text NULL,
        "prior_score" double precision NULL,
        "prior_llm_verdict" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_match_decisions_pair" UNIQUE
          ("organization_id", "project_id", "left_source_ref", "left_key", "right_source_ref", "right_key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "match_candidates" (
        "id" bigserial PRIMARY KEY,
        "organization_id" text NOT NULL,
        "run_id" text NOT NULL,
        "left_key" text NOT NULL,
        "right_key" text NOT NULL,
        "blocking_pass" text NOT NULL,
        "features" jsonb NOT NULL DEFAULT '{}',
        "score" double precision NOT NULL,
        "decision" text NOT NULL,
        "llm_verdict" jsonb NULL,
        "reviewed_by" text NULL,
        "reviewed_at" timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_match_candidates_queue" ON "match_candidates" ("run_id", "decision", "score" DESC)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_match_candidates_pair" ON "match_candidates" ("run_id", "left_key", "right_key")`);

    await queryRunner.query(`
      CREATE TABLE "match_crosswalk" (
        "organization_id" text NOT NULL,
        "project_id" text NOT NULL,
        "source_ref" text NOT NULL,
        "source_key" text NOT NULL,
        "entity_key" text NOT NULL,
        "confidence" double precision NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_match_crosswalk" PRIMARY KEY
          ("organization_id", "project_id", "source_ref", "source_key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_match_crosswalk_entity" ON "match_crosswalk" ("organization_id", "project_id", "entity_key")`);

    await queryRunner.query(`
      CREATE TABLE "match_gold_pairs" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "project_id" text NOT NULL,
        "left_key" text NOT NULL,
        "right_key" text NOT NULL,
        "is_match" boolean NOT NULL,
        "labelled_by" text NULL,
        "labelled_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_match_gold_pair" UNIQUE ("organization_id", "project_id", "left_key", "right_key")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "match_gold_pairs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_crosswalk"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_candidates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_decisions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_entities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_projects"`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS matching CASCADE`);
  }
}
```

- [ ] **Step 2: Write the entities**

Follow the repository convention exactly — `@PrimaryColumn('text')`, snake_case `name:` on every column, `@ManyToOne(() => Organization, { onDelete: 'CASCADE' })` with `@JoinColumn({ name: 'organization_id' })`. Example for the first one; the other three follow the same shape against the DDL above.

```typescript
import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Organization } from './organization.entity';

export type MatchMode = 'dedupe' | 'link';
export type FieldRole = 'person_name' | 'org_name' | 'date' | 'phone' | 'identifier' | 'address' | 'text';
export type BlockingKind = 'equi' | 'trigram';

export interface MatchSourceRef {
  kind: 'connection' | 'staged';
  connectionId?: string;
  schemaName?: string;
  tableName?: string;
  stagedDataId?: string;
  primaryKey: string;
}
export interface FieldMapping { left: string; right: string; role: FieldRole; weight: number; comparator: string; }
export interface BlockingPass { name: string; kind: BlockingKind; keyExpr: string; threshold?: number; }
export interface MatchThresholds { matchAt: number; rejectAt: number; }

@Entity('match_projects')
@Index(['organizationId'])
export class MatchProject {
  @PrimaryColumn('text') id: string;
  @Column('text', { name: 'organization_id' }) organizationId: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
  @Column('text') name: string;
  @Column('text', { nullable: true }) description: string | null;
  @Column('text') mode: MatchMode;
  @Column('jsonb', { name: 'left_source' }) leftSource: MatchSourceRef;
  @Column('jsonb', { name: 'right_source', nullable: true }) rightSource: MatchSourceRef | null;
  @Column('jsonb', { name: 'field_map', default: () => "'[]'" }) fieldMap: FieldMapping[];
  @Column('jsonb', { name: 'blocking_passes', default: () => "'[]'" }) blockingPasses: BlockingPass[];
  @Column('jsonb') thresholds: MatchThresholds;
  @Column('text', { name: 'column_allowlist', array: true }) columnAllowlist: string[];
  @Column('text', { name: 'lawful_basis' }) lawfulBasis: string;
  @Column('text', { name: 'data_owner' }) dataOwner: string;
  @Column('int', { name: 'retention_days', default: 30 }) retentionDays: number;
  @Column('text', { default: 'active' }) status: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
```

- [ ] **Step 3: Export and wire**

Append to `src/database/entities/index.ts`, following the existing value/type split:

```typescript
export { MatchProject } from './match-project.entity';
export type { MatchMode, FieldRole, BlockingKind, MatchSourceRef, FieldMapping, BlockingPass, MatchThresholds } from './match-project.entity';
export { MatchRun } from './match-run.entity';
export type { MatchRunStatus, MatchRunCounters } from './match-run.entity';
export { MatchEntity } from './match-entity.entity';
export type { MatchMember } from './match-entity.entity';
export { MatchDecision } from './match-decision.entity';
export type { CandidateDecision } from './match-decision.entity';
```

Add the four classes to the `entities:` array in `src/app.module.ts:74-97`, and add `MatchingModule` to the `imports:` array. `matching.module.ts` at this point registers `TypeOrmModule.forFeature([MatchProject, MatchRun, MatchEntity, MatchDecision])` and nothing else.

- [ ] **Step 4: Run the migration and the gates**

```bash
cd packages/backend && pnpm run migration:run && npx tsc --noEmit && pnpm test
```

Expected: migration applies, tsc clean, existing suite still green.

- [ ] **Step 5: Verify the down migration**

```bash
pnpm run migration:revert && pnpm run migration:run
```

Expected: both succeed. A `down` that fails here is a blocker, not a warning.

- [ ] **Step 6: Commit** — `feat(matching): entity matching schema, entities and module skeleton`

---

### Task 2: Deterministic normalization

**Files:**
- Create: `src/modules/matching/normalization.service.ts`
- Test: `src/modules/matching/normalization.service.spec.ts`

**Interfaces:**
- Produces:

```typescript
normalizeText(raw: string | null | undefined): string
normalizePersonName(raw: string | null | undefined): string   // normalizeText + tokens sorted
normalizePhone(raw: string | null | undefined): string         // last 9 digits, '' if fewer
normalizeDate(raw: string | Date | null | undefined): string   // 'YYYY-MM-DD' or ''
normalizeByRole(role: FieldRole, raw: unknown): string
```

All are pure, synchronous, and total — they return `''` rather than throwing on any input.

- [ ] **Step 1: Write the failing tests**

```typescript
import { NormalizationService } from './normalization.service';

describe('NormalizationService', () => {
  const s = new NormalizationService();

  describe('normalizeText', () => {
    it('lower-cases, strips accents, collapses whitespace and punctuation', () => {
      expect(s.normalizeText('  MUKAMANA,  Joséphine!! ')).toBe('mukamana josephine');
    });
    it('returns empty string for null, undefined and blank', () => {
      expect(s.normalizeText(null)).toBe('');
      expect(s.normalizeText(undefined)).toBe('');
      expect(s.normalizeText('   ')).toBe('');
    });
  });

  describe('normalizePersonName', () => {
    it('sorts tokens so a swapped name order normalizes identically', () => {
      expect(s.normalizePersonName('Josephine Mukamana'))
        .toBe(s.normalizePersonName('Mukamana Josephine'));
    });
    it('keeps duplicate tokens rather than collapsing them', () => {
      expect(s.normalizePersonName('Jean Jean Bosco')).toBe('bosco jean jean');
    });
  });

  describe('normalizePhone', () => {
    it('keeps the last nine digits and drops all other characters', () => {
      expect(s.normalizePhone('+250 788 123 456')).toBe('788123456');
      expect(s.normalizePhone('0788-123-456')).toBe('788123456');
    });
    it('returns empty string when fewer than nine digits are present', () => {
      expect(s.normalizePhone('1234')).toBe('');
    });
  });

  describe('normalizeDate', () => {
    it('accepts ISO and slash forms and emits YYYY-MM-DD', () => {
      expect(s.normalizeDate('1988-04-07')).toBe('1988-04-07');
      expect(s.normalizeDate('1988/04/07')).toBe('1988-04-07');
      expect(s.normalizeDate(new Date('1988-04-07T10:00:00Z'))).toBe('1988-04-07');
    });
    it('returns empty string for an unparseable value', () => {
      expect(s.normalizeDate('not a date')).toBe('');
    });
  });

  describe('normalizeByRole', () => {
    it('routes each role to its normalizer', () => {
      expect(s.normalizeByRole('person_name', 'Mukamana Josephine')).toBe('josephine mukamana');
      expect(s.normalizeByRole('phone', '+250788123456')).toBe('788123456');
      expect(s.normalizeByRole('date', '1988/04/07')).toBe('1988-04-07');
      expect(s.normalizeByRole('identifier', ' 1198880012345678 ')).toBe('1198880012345678');
    });
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `pnpm test -- --runTestsByPath src/modules/matching/normalization.service.spec.ts`
Expected: FAIL — cannot find module `./normalization.service`.

- [ ] **Step 3: Implement**

```typescript
import { Injectable } from '@nestjs/common';
import { FieldRole } from '../../database/entities';

@Injectable()
export class NormalizationService {
  normalizeText(raw: string | null | undefined): string {
    if (raw === null || raw === undefined) return '';
    return String(raw)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')   // combining marks, escaped deliberately
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizePersonName(raw: string | null | undefined): string {
    const text = this.normalizeText(raw);
    if (!text) return '';
    return text.split(' ').sort().join(' ');
  }

  normalizePhone(raw: string | null | undefined): string {
    if (raw === null || raw === undefined) return '';
    const digits = String(raw).replace(/\D/g, '');
    return digits.length >= 9 ? digits.slice(-9) : '';
  }

  normalizeDate(raw: string | Date | null | undefined): string {
    if (raw === null || raw === undefined || raw === '') return '';
    const value = raw instanceof Date ? raw : new Date(String(raw).replace(/\//g, '-'));
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }

  normalizeByRole(role: FieldRole, raw: unknown): string {
    switch (role) {
      case 'person_name': return this.normalizePersonName(raw as string);
      case 'phone':       return this.normalizePhone(raw as string);
      case 'date':        return this.normalizeDate(raw as string);
      case 'org_name':
      case 'address':
      case 'identifier':
      case 'text':
      default:            return this.normalizeText(raw as string);
    }
  }
}
```

Register `NormalizationService` as a provider in `matching.module.ts`.

- [ ] **Step 4: Run to verify PASS, then the gates**

Run the targeted spec, then `pnpm test`, then `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(matching): deterministic value normalization`

---

### Task 3: Blocking and comparator SQL builders

**Files:**
- Create: `src/modules/matching/blocking-sql.ts`
- Test: `src/modules/matching/blocking-sql.spec.ts`

**Interfaces:**
- Produces:

```typescript
export const IDENT = /^[A-Za-z0-9_]+$/;
export function assertIdent(name: string, what: string): string;   // returns name, throws BadRequestException
export function blockingKeyExpr(pass: BlockingPass, fieldMap: FieldMapping[]): string;
export function comparatorExprs(role: FieldRole, left: string, right: string): Array<{ name: string; sql: string }>;
export function weightedScoreExpr(fieldMap: FieldMapping[]): string;
```

`blockingKeyExpr` supports two `keyExpr` forms and nothing else, so no user text ever reaches SQL:
`"dmetaphone(<field>)"`, `"dmetaphone(<field>)|year(<field>)"`, `"last9(<field>)"`, `"<field>"`, and `"<field>|<field>"` combinations joined by `|`. Every `<field>` must appear as a `left` value in `fieldMap` and must pass `IDENT`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { BadRequestException } from '@nestjs/common';
import { assertIdent, blockingKeyExpr, comparatorExprs, weightedScoreExpr } from './blocking-sql';
import type { BlockingPass, FieldMapping } from '../../database/entities';

const fieldMap: FieldMapping[] = [
  { left: 'surname', right: 'surname', role: 'person_name', weight: 0.5, comparator: 'default' },
  { left: 'dob',     right: 'dob',     role: 'date',        weight: 0.3, comparator: 'default' },
  { left: 'phone',   right: 'phone',   role: 'phone',       weight: 0.2, comparator: 'default' },
];

describe('assertIdent', () => {
  it('accepts a plain identifier', () => expect(assertIdent('surname', 'field')).toBe('surname'));
  it('rejects anything with SQL punctuation', () => {
    expect(() => assertIdent('a"; DROP TABLE x; --', 'field')).toThrow(BadRequestException);
    expect(() => assertIdent('a.b', 'field')).toThrow(BadRequestException);
  });
});

describe('blockingKeyExpr', () => {
  it('builds a phonetic plus birth-year key', () => {
    const pass: BlockingPass = { name: 'name_dob', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(dob)' };
    expect(blockingKeyExpr(pass, fieldMap))
      .toBe(`dmetaphone("surname") || '|' || substring("dob" from 1 for 4)`);
  });

  it('builds a last-nine-digits key', () => {
    const pass: BlockingPass = { name: 'phone', kind: 'equi', keyExpr: 'last9(phone)' };
    expect(blockingKeyExpr(pass, fieldMap)).toBe(`right(regexp_replace("phone", '\\D', '', 'g'), 9)`);
  });

  it('refuses a field that is not in the field map', () => {
    const pass: BlockingPass = { name: 'bad', kind: 'equi', keyExpr: 'dmetaphone(secret_salary)' };
    expect(() => blockingKeyExpr(pass, fieldMap)).toThrow(BadRequestException);
  });

  it('refuses an unknown function', () => {
    const pass: BlockingPass = { name: 'bad', kind: 'equi', keyExpr: 'pg_read_file(surname)' };
    expect(() => blockingKeyExpr(pass, fieldMap)).toThrow(BadRequestException);
  });
});

describe('comparatorExprs', () => {
  it('gives names a trigram score, a bounded edit distance and a token-set equality', () => {
    const exprs = comparatorExprs('person_name', 'l."surname"', 'r."surname"');
    expect(exprs.map((e) => e.name)).toEqual(['trgm', 'lev', 'tokenset']);
    expect(exprs[0].sql).toContain('similarity(');
    expect(exprs[1].sql).toContain('levenshtein_less_equal(');
  });

  it('gives dates a day difference', () => {
    const exprs = comparatorExprs('date', 'l."dob"', 'r."dob"');
    expect(exprs.map((e) => e.name)).toEqual(['daydiff']);
  });

  it('gives phones exact-or-one-edit', () => {
    const exprs = comparatorExprs('phone', 'l."phone"', 'r."phone"');
    expect(exprs.map((e) => e.name)).toEqual(['exact', 'lev1']);
  });
});

describe('weightedScoreExpr', () => {
  it('normalizes by the total weight so the score lands in 0..1', () => {
    const sql = weightedScoreExpr(fieldMap);
    expect(sql).toContain('/ 1');       // 0.5 + 0.3 + 0.2
    expect(sql).toContain('0.5 *');
  });

  it('refuses a field map whose weights sum to zero', () => {
    expect(() => weightedScoreExpr([{ ...fieldMap[0], weight: 0 }])).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.** Expected: cannot find module `./blocking-sql`.

- [ ] **Step 3: Implement per the Interfaces block.**

Notes that matter for correctness:
- `year(<field>)` compiles to `substring("<field>" from 1 for 4)` because dates are stored in the workspace as normalized `YYYY-MM-DD` **text**, not as `date`. Do not emit `extract(year from ...)`.
- The only permitted functions are `dmetaphone`, `year` and `last9`. Anything else throws.
- `comparatorExprs` returns per-field feature expressions; the caller aliases them into the `features` JSONB and into `weightedScoreExpr`.
- `weightedScoreExpr` emits `(0.5 * <person_name score> + 0.3 * <date score> + ...) / <sum of weights>` and throws when the sum is zero.

- [ ] **Step 4: Run to verify PASS, then the gates.**

- [ ] **Step 5: Commit** — `feat(matching): blocking key and comparator SQL builders with identifier validation`

---

### Task 4: Governance guard

**Files:**
- Create: `src/modules/matching/matching-governance.ts`
- Test: `src/modules/matching/matching-governance.spec.ts`

**Interfaces:**
- Produces:

```typescript
export function assertLocalProvider(settings: OrganizationSettings): void;
export function assertColumnAllowed(column: string, allowlist: string[]): string;
```

`assertLocalProvider` throws `BadRequestException` for `OPENAI`, `ANTHROPIC` and `AZURE`, and returns for `LOCAL` and `CUSTOM`. `assertColumnAllowed` throws unless the column is in the allow-list **and** passes `IDENT`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { BadRequestException } from '@nestjs/common';
import { AiProvider } from '../../database/entities';
import { assertLocalProvider, assertColumnAllowed } from './matching-governance';

describe('assertLocalProvider', () => {
  it.each([AiProvider.OPENAI, AiProvider.ANTHROPIC, AiProvider.AZURE])(
    'refuses %s because personal data must never leave the server', (provider) => {
      expect(() => assertLocalProvider({ aiProvider: provider } as any)).toThrow(BadRequestException);
    });

  it.each([AiProvider.LOCAL, AiProvider.CUSTOM])('allows %s', (provider) => {
    expect(() => assertLocalProvider({ aiProvider: provider } as any)).not.toThrow();
  });
});

describe('assertColumnAllowed', () => {
  it('returns a column that is on the allow-list', () => {
    expect(assertColumnAllowed('surname', ['surname', 'dob'])).toBe('surname');
  });
  it('refuses a column that is not on the allow-list', () => {
    expect(() => assertColumnAllowed('salary', ['surname', 'dob'])).toThrow(BadRequestException);
  });
  it('refuses an allow-listed column that is not a plain identifier', () => {
    expect(() => assertColumnAllowed('a"; --', ['a"; --'])).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement per the Interfaces block**, reusing `IDENT` from `blocking-sql.ts` rather than re-declaring it. Error messages must name the rule, e.g. `'Matching projects require a local AI provider — personal data must not leave the server'`.

- [ ] **Step 4: PASS, then the gates.**

- [ ] **Step 5: Commit** — `feat(matching): governance guard — local-only provider and column allow-list`

---

### Task 5: Source reader

**Files:**
- Create: `src/modules/matching/sources/source-reader.service.ts`
- Test: `src/modules/matching/sources/source-reader.service.spec.ts`

**Interfaces:**
- Consumes: `assertColumnAllowed` (Task 4); `ConnectionsService.getDriver`, `getConnectionConfig`.
- Produces:

```typescript
export interface SourcePage { rows: Record<string, unknown>[]; lastKey: string | null; }

class SourceReaderService {
  countRows(source: MatchSourceRef, allowlist: string[], organizationId: string): Promise<number>;
  readPage(source: MatchSourceRef, allowlist: string[], organizationId: string,
           afterKey: string | null, limit: number): Promise<SourcePage>;
}
```

`readPage` returns at most `limit` rows ordered by the source's primary key, and `lastKey` is the primary key of the final row, or `null` when the page came back empty. Each row contains **only** the primary key and the allow-listed columns.

- [ ] **Step 1: Write the failing tests**

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SourceReaderService } from './source-reader.service';
import { ConnectionsService } from '../../connections/connections.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StagedData } from '../../../database/entities';

describe('SourceReaderService', () => {
  let service: SourceReaderService;
  const query = jest.fn();
  const connections = {
    getDriver: jest.fn().mockResolvedValue({ query }),
    getConnectionConfig: jest.fn().mockResolvedValue({ connection: { type: 'postgres' } }),
  };
  const stagedRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        SourceReaderService,
        { provide: ConnectionsService, useValue: connections },
        { provide: getRepositoryToken(StagedData), useValue: stagedRepo },
      ],
    }).compile();
    service = mod.get(SourceReaderService);
  });

  const source = {
    kind: 'connection' as const,
    connectionId: 'c1', schemaName: 'public', tableName: 'citizens', primaryKey: 'id',
  };

  it('selects only the primary key and allow-listed columns', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await service.readPage(source, ['id', 'surname', 'dob'], 'org1', null, 100);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('"id"');
    expect(sql).toContain('"surname"');
    expect(sql).toContain('"dob"');
    expect(sql).not.toContain('salary');
  });

  it('pages by keyset rather than offset', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await service.readPage(source, ['id', 'surname'], 'org1', 'abc', 100);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/WHERE "id" > /);
    expect(sql).toContain('ORDER BY "id"');
    expect(sql).toContain('LIMIT 100');
    expect(sql).not.toMatch(/OFFSET/i);
  });

  it('reports the last key of the page so the caller can continue', async () => {
    query.mockResolvedValue({
      rows: [{ id: 'k1', surname: 'a' }, { id: 'k2', surname: 'b' }], rowCount: 2, fields: [],
    });
    const page = await service.readPage(source, ['id', 'surname'], 'org1', null, 100);
    expect(page.lastKey).toBe('k2');
  });

  it('returns a null last key for an empty page', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    const page = await service.readPage(source, ['id', 'surname'], 'org1', null, 100);
    expect(page.lastKey).toBeNull();
  });

  it('refuses to read a column that is not on the allow-list', async () => {
    await expect(
      service.readPage({ ...source, primaryKey: 'salary' }, ['surname'], 'org1', null, 100),
    ).rejects.toThrow(BadRequestException);
  });

  it('reads a staged source from its JSONB rows', async () => {
    stagedRepo.findOne.mockResolvedValue({
      id: 's1', organizationId: 'org1',
      schema: [{ name: 'id', type: 'text' }, { name: 'surname', type: 'text' }],
      data: [{ id: 'k1', surname: 'a' }, { id: 'k2', surname: 'b' }],
    });
    const page = await service.readPage(
      { kind: 'staged', stagedDataId: 's1', primaryKey: 'id' }, ['id', 'surname'], 'org1', 'k1', 100);
    expect(page.rows).toEqual([{ id: 'k2', surname: 'b' }]);
    expect(page.lastKey).toBe('k2');
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement per the Interfaces block.**

Notes that matter:
- **The primary key must itself be on the column allow-list**, checked with the same `assertColumnAllowed(source.primaryKey, allowlist)`. One rule with no exceptions is what makes the allow-list auditable: everything the materializer reads is allow-listed, including the key. The wizard (Task 16) is responsible for adding the chosen primary key to the allow-list it derives, so this costs the user nothing.
- Consequently every happy-path test above passes the primary key inside its allow-list, and the refusal test passes a `primaryKey` that is genuinely absent from it. An earlier draft of this task had the happy paths omitting the key, which made the task unimplementable — no function can distinguish `assertColumnAllowed('id', ['surname'])` from `assertColumnAllowed('salary', ['surname'])`.
- **De-duplicate the SELECT list.** Because the key is now normally present in the allow-list, build the projection as the key followed by the allow-listed columns *excluding* the key, so the emitted SQL says `SELECT "id", "surname"` rather than `SELECT "id", "id", "surname"`.
- `afterKey` is passed as a bound parameter (`driver.query(sql, [afterKey])`), never interpolated.
- Quote identifiers with the dialect-aware helper pattern from `data-quality/profiling.service.ts` (`quoteId(dbType, name)`), so MySQL backticks work.
- The staged path filters the JSONB array by `String(row[pk]) > afterKey`, sorts by the same key, and slices to `limit`. Staged datasets are bounded by what already fits in a JSONB column, so no paging beyond that is needed.

- [ ] **Step 4: PASS, then the gates.**

- [ ] **Step 5: Commit** — `feat(matching): paged source reader for connections and staged data`

---

### Task 6: Materializer

**Files:**
- Create: `src/modules/matching/materialize.service.ts`
- Test: `src/modules/matching/materialize.service.spec.ts`

**Interfaces:**
- Consumes: `SourceReaderService` (Task 5), `NormalizationService` (Task 2), `blockingKeyExpr`/`assertIdent` (Task 3).
- Produces:

```typescript
class MaterializeService {
  workspaceTable(projectId: string, side: 'left' | 'right'): string;   // 'matching.p_<sanitized>_left'
  materialize(project: MatchProject, side: 'left' | 'right', runId: string): Promise<{ rows: number; lastKey: string | null }>;
}
```

`materialize` drops and recreates the workspace table, then loops `readPage` until a page comes back empty, writing normalized values. Blocking key columns are added as generated columns after load, with an index per pass.

- [ ] **Step 1: Write the failing tests**

```typescript
describe('MaterializeService', () => {
  // dataSource.query mocked; SourceReaderService mocked to return two pages then an empty page.

  it('names the workspace table from the project id with dashes replaced', () => {
    expect(service.workspaceTable('a1b2-c3d4', 'left')).toBe('matching.p_a1b2_c3d4_left');
  });

  it('creates one text column per mapped field and no others', async () => {
    await service.materialize(project, 'left', 'run1');
    const create = dataSource.query.mock.calls.map((c) => c[0] as string)
      .find((s) => s.includes('CREATE TABLE'))!;
    expect(create).toContain('"src_key" text PRIMARY KEY');
    expect(create).toContain('"surname" text');
    expect(create).toContain('"dob" text');
    expect(create).not.toContain('salary');
  });

  it('loops pages until an empty page and reports the total row count', async () => {
    const result = await service.materialize(project, 'left', 'run1');
    expect(result.rows).toBe(3);
    expect(reader.readPage).toHaveBeenCalledTimes(3);
  });

  it('passes the previous page last key as the next afterKey', async () => {
    await service.materialize(project, 'left', 'run1');
    expect(reader.readPage.mock.calls[0][3]).toBeNull();
    expect(reader.readPage.mock.calls[1][3]).toBe('k2');
  });

  it('writes normalized values, not raw ones', async () => {
    await service.materialize(project, 'left', 'run1');
    const insert = dataSource.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO matching.'))!;
    expect(insert[1]).toContain('josephine mukamana');
    expect(insert[1]).not.toContain('MUKAMANA, Joséphine');
  });

  it('adds a generated blocking key column and an index for each pass', async () => {
    await service.materialize(project, 'left', 'run1');
    const sqls = dataSource.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('ADD COLUMN "bk_name_dob"') && s.includes('GENERATED ALWAYS AS'))).toBe(true);
    expect(sqls.some((s) => s.includes('CREATE INDEX') && s.includes('bk_name_dob'))).toBe(true);
  });

  it('creates a GIN trigram index for a trigram pass', async () => {
    await service.materialize({ ...project, blockingPasses: [
      { name: 'near_name', kind: 'trigram', keyExpr: 'surname', threshold: 0.4 }] } as any, 'left', 'run1');
    const sqls = dataSource.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('USING gin') && s.includes('gin_trgm_ops'))).toBe(true);
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement per the Interfaces block.**

Notes that matter:
- Insert rows in batches with a multi-row parameterized `INSERT`, sized from `MATCHING_BATCH_ROWS`. `COPY` is a later optimization; a parameterized multi-row insert is correct and testable now, and the plan does not pretend otherwise.
- Every column name written into DDL comes from `project.fieldMap[].left` and goes through `assertColumnAllowed` first.
- Generated column name is `bk_<pass.name>` with `pass.name` run through `assertIdent`.
- **Declare the generated columns in the `CREATE TABLE`, not with `ALTER TABLE ... ADD COLUMN` after the load.** Adding a `STORED` generated column to a populated table forces a full heap rewrite under `ACCESS EXCLUSIVE` — three passes over a 10M-row workspace is three sequential rewrites of a table just written. PostgreSQL computes `STORED` columns server-side during the `INSERT`s at no extra cost, so declaring them up front is strictly cheaper. Indexes still come **after** the load, where deferring them is genuinely faster.
- **Index names must fit PostgreSQL's 63-byte `NAMEDATALEN` limit.** `assertIdent` checks the character class only, never length, and PostgreSQL *truncates* an over-long identifier with a notice rather than erroring — so two passes sharing a long prefix silently collide on one index name and the second `CREATE INDEX` fails mid-run, after the table has already been dropped and reloaded. Compose index names from a short project prefix rather than the full UUID-derived table segment, and assert the composed name is within 63 bytes, throwing a message that names the offending pass if not.
- **Reject a duplicated `fieldMap[].left`** with a `BadRequestException` naming the repeated column. Two mappings on one source column yield `CREATE TABLE (… "surname" text, "surname" text)`, which PostgreSQL refuses outright. `fieldMap` is JSONB, so the shape is not guaranteed at runtime — the same reasoning that already governs weights in `blocking-sql.ts`. Throwing beats silently de-duplicating, because two mappings on one column with different roles is a configuration mistake the user needs told about.
- Store the per-side row count and last key so Task 13 can record them on the run.

- [ ] **Step 4: PASS, then the gates.**

- [ ] **Step 5: Commit** — `feat(matching): materialize allow-listed columns into a per-project workspace`

---

### Task 7: Blocking — estimate, degenerate keys, pass execution

**Files:**
- Create: `src/modules/matching/blocking.service.ts`
- Test: `src/modules/matching/blocking.service.spec.ts`

**Interfaces:**
- Consumes: `MaterializeService.workspaceTable`, `blockingKeyExpr`, `assertIdent`.
- Produces:

```typescript
export interface PassEstimate { pass: string; distinctKeys: number; estimatedPairs: number; droppedKeys: string[]; }
export interface BlockingEstimate { perPass: PassEstimate[]; totalEstimatedPairs: number; exceedsCap: boolean; refused: boolean; }

class BlockingService {
  estimate(project: MatchProject): Promise<BlockingEstimate>;
  candidatePairsSql(project: MatchProject, pass: BlockingPass, droppedKeys: string[]): string;
}
```

`estimate` runs **one** query per pass — the key-frequency histogram — and derives everything from it: the row total is `sum(n)`, the projected pairs are `sum(n*(n-1)/2)` over the kept keys for a dedupe self-join, and any key value covering more than 0.5% of the total is listed as dropped and excluded from the projection. Do not issue a separate `count(*)` query; the histogram already carries the total, and one round trip per pass is the point. `exceedsCap` is true above `MATCHING_MAX_CANDIDATE_PAIRS`; `refused` is true above twice it.

- [ ] **Step 1: Write the failing tests**

```typescript
describe('BlockingService', () => {
  it('projects self-join pairs as n*(n-1)/2 summed per key', async () => {
    dataSource.query.mockResolvedValue([
      { key: 'MKMN|1988', n: '3' },   // 3 pairs
      { key: 'NKRB|1990', n: '2' },   // 1 pair
    ]);
    const est = await service.estimate(project);
    expect(est.perPass[0].estimatedPairs).toBe(4);
  });

  it('drops a key value covering more than 0.5% of rows and excludes its pairs', async () => {
    // 10,000 rows total, all of it from this histogram; the empty-surname key
    // covers 200 of them (2%), which is above the 0.5% degenerate threshold.
    const rest = Array.from({ length: 98 }, (_, i) => ({ key: `K${i}`, n: '100' }));
    dataSource.query.mockResolvedValue([
      { key: '|1988', n: '200' }, { key: 'MKMN|1988', n: '3' }, ...rest,
    ]);
    const est = await service.estimate(project);
    expect(est.perPass[0].droppedKeys).toContain('|1988');
    expect(est.perPass[0].estimatedPairs).toBe(3);
  });

  it('flags exceedsCap above the configured cap and refused above twice it', async () => {
    process.env.MATCHING_MAX_CANDIDATE_PAIRS = '100';
    dataSource.query.mockResolvedValue([{ key: 'k', n: '30' }]);   // 435 pairs
    const est = await service.estimate(project);
    expect(est.exceedsCap).toBe(true);
    expect(est.refused).toBe(true);
  });

  it('builds a dedupe self-join guarded so each pair appears once', () => {
    const sql = service.candidatePairsSql(project,
      { name: 'name_dob', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(dob)' }, []);
    expect(sql).toContain('l."bk_name_dob" = r."bk_name_dob"');
    expect(sql).toContain('l."src_key" < r."src_key"');
  });

  it('excludes dropped keys from the join', () => {
    const sql = service.candidatePairsSql(project,
      { name: 'name_dob', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(dob)' }, ['|1988']);
    expect(sql).toContain('NOT IN');
  });

  it('uses a similarity threshold for a trigram pass', () => {
    const sql = service.candidatePairsSql(project,
      { name: 'near_name', kind: 'trigram', keyExpr: 'surname', threshold: 0.4 }, []);
    expect(sql).toContain('similarity(');
    expect(sql).toContain('0.4');
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement per the Interfaces block.**

Notes that matter:
- `l."src_key" < r."src_key"` is what makes a dedupe self-join produce each Candidate Pair once and never pair a record with itself. Without it every pair appears twice and every record matches itself.
- Dropped keys are passed as bound parameters into a `NOT IN` list, not interpolated.
- Counts come back from PostgreSQL as strings; parse them with `Number(...)` before arithmetic or the estimate silently concatenates.

- [ ] **Step 4: PASS, then the gates.**

- [ ] **Step 5: Commit** — `feat(matching): blocking estimate, degenerate-key exclusion and pass SQL`

---

### Task 8: Scoring

**Files:**
- Create: `src/modules/matching/scoring.service.ts`
- Test: `src/modules/matching/scoring.service.spec.ts`

**Interfaces:**
- Consumes: `BlockingService.candidatePairsSql`, `comparatorExprs`, `weightedScoreExpr`.
- Produces:

```typescript
export interface ScoreResult { inserted: number; autoMatch: number; grey: number; autoReject: number; }
class ScoringService {
  scorePass(project: MatchProject, run: MatchRun, pass: BlockingPass, droppedKeys: string[]): Promise<ScoreResult>;
}
```

- [ ] **Step 1: Write the failing tests**

```typescript
describe('ScoringService', () => {
  it('inserts only pairs at or above the reject threshold', async () => {
    await service.scorePass(project, run, pass, []);
    const sql = String(dataSource.query.mock.calls[0][0]);
    expect(sql).toMatch(/INSERT INTO "match_candidates"/);
    expect(sql).toContain('WHERE score >= ');
    expect(sql).not.toMatch(/'auto_reject'/);
  });

  it('labels each inserted pair auto_match or grey from the thresholds', async () => {
    await service.scorePass(project, run, pass, []);
    const sql = String(dataSource.query.mock.calls[0][0]);
    expect(sql).toContain(`'auto_match'`);
    expect(sql).toContain(`'grey'`);
  });

  it('counts rejected pairs without storing them', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ total: '1000' }])            // candidate pairs seen
      .mockResolvedValueOnce([{ inserted: '40', auto_match: '10', grey: '30' }]);
    const result = await service.scorePass(project, run, pass, []);
    expect(result.autoReject).toBe(960);
    expect(result.inserted).toBe(40);
  });

  it('honours an existing Decision instead of re-scoring the pair', async () => {
    await service.scorePass(project, run, pass, []);
    const sql = String(dataSource.query.mock.calls.find((c) => String(c[0]).includes('match_decisions'))![0]);
    expect(sql).toContain('match_decisions');
    expect(sql).toContain(`'confirmed'`);
    expect(sql).toContain(`'rejected'`);
  });

  it('writes per-field feature scores into the features column', async () => {
    const sql = String(dataSource.query.mock.calls[0][0]);
    expect(sql).toContain('jsonb_build_object');
  });

  it('is idempotent for a re-run of the same pass', async () => {
    const sql = String(dataSource.query.mock.calls[0][0]);
    expect(sql).toContain('ON CONFLICT ("run_id", "left_key", "right_key") DO NOTHING');
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement per the Interfaces block.**

Notes that matter:
- One statement per pass, shaped as: candidate pairs from `candidatePairsSql` in a CTE, comparator expressions in a second CTE, then `INSERT INTO match_candidates ... SELECT ... WHERE score >= :rejectAt`.
- `decision` is `CASE WHEN score >= :matchAt THEN 'auto_match' ELSE 'grey' END`.
- Pairs present in `match_decisions` for this project are inserted with `decision` taken from the human verdict (`'confirmed'` or `'rejected'`) and are excluded from the threshold CASE. Use a `LEFT JOIN match_decisions`.
- Exactly two statements per pass, in this order, because the tests mock two calls: (1) `SELECT count(*) AS total` over the candidate-pair CTE, (2) the `INSERT ... SELECT ... RETURNING`-counted insert. `autoReject` is statement 1's total minus statement 2's inserted count. Never `SELECT` the rejected rows themselves to count them.
- `ON CONFLICT ... DO NOTHING` against `uq_match_candidates_pair` makes a re-run safe, since two passes can propose the same pair.

- [ ] **Step 4: PASS, then the gates.**

- [ ] **Step 5: Commit** — `feat(matching): score candidate pairs in SQL, never storing a rejected pair`

---

### Task 9: Clustering

**Files:**
- Create: `src/modules/matching/clustering.service.ts`
- Test: `src/modules/matching/clustering.service.spec.ts`

**Interfaces:**
- Produces:

```typescript
export interface ClusterResult { clusters: number; flagged: number; }
export function unionFind(pairs: Array<[string, string]>): Map<string, string[]>;   // exported for direct testing
class ClusteringService {
  cluster(project: MatchProject, run: MatchRun): Promise<ClusterResult>;
}
```

- [ ] **Step 1: Write the failing tests**

```typescript
import { unionFind } from './clustering.service';

describe('unionFind', () => {
  it('groups transitively connected keys into one cluster', () => {
    const out = unionFind([['a', 'b'], ['b', 'c'], ['x', 'y']]);
    const groups = [...out.values()].map((g) => g.sort().join(',')).sort();
    expect(groups).toEqual(['a,b,c', 'x,y']);
  });

  it('leaves an unpaired key out entirely', () => {
    const out = unionFind([['a', 'b']]);
    expect([...out.values()].flat()).not.toContain('z');
  });
});

describe('ClusteringService', () => {
  it('flags a cluster containing an internal pair below the reject threshold', async () => {
    // a~b at 0.95 and b~c at 0.95 put a, b, c in one cluster,
    // but a~c scores 0.20, which is below rejectAt 0.55.
    const result = await service.cluster(project, run);
    expect(result.flagged).toBe(1);
    const saved = entityRepo.save.mock.calls[0][0];
    expect(saved.flagged).toBe(true);
  });

  it('does not flag a cluster whose internal pairs all clear the reject threshold', async () => {
    const result = await service.cluster(project, run);
    expect(result.flagged).toBe(0);
  });

  it('reuses the entity key held by the majority of a cluster previous members', async () => {
    crosswalkRows = [{ source_key: 'a', entity_key: 'E1' }, { source_key: 'b', entity_key: 'E1' },
                     { source_key: 'c', entity_key: 'E2' }];
    await service.cluster(project, run);
    expect(entityRepo.save.mock.calls[0][0].entityKey).toBe('E1');
  });

  it('mints a fresh entity key for a cluster with no previous members', async () => {
    crosswalkRows = [];
    await service.cluster(project, run);
    expect(entityRepo.save.mock.calls[0][0].entityKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('leaves the golden record empty because survivorship is phase 3', async () => {
    await service.cluster(project, run);
    expect(entityRepo.save.mock.calls[0][0].golden).toEqual({});
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement per the Interfaces block.**

Notes that matter:
- Build the cluster set in Node from `auto_match` plus `confirmed` candidates only. That set is small — it is the survivors of scoring, not the candidate pairs.
- The over-merge guard needs the score of every internal pair. Query `match_candidates` for all pairs whose both keys are in the cluster; any pair missing from the table scored below `rejectAt` and was discarded, so **a missing pair also flags the cluster**. Assert this in the first test — it is the subtle case.
- Majority entity key: read existing `match_crosswalk` rows for the cluster's members, take the most frequent `entity_key`, break a tie by the lexicographically smallest key so the result is deterministic. Mint `uuidv4()` when there are none.
- Scope that crosswalk read by `organization_id` and `project_id` **only** — do not filter by `source_ref`. A dedupe project has exactly one Match Source, so project scoping is sufficient, and this keeps Task 9 independent of `CrosswalkService.sourceRef()`, which Task 10 has not produced yet. Phase 3 revisits this when a right Match Source exists.
- `members` entries are `MatchMember` — `{ sourceRef, sourceKey }`. Build `sourceRef` inline here as `'connection:<connectionId>:<schema>.<table>'` or `'staged:<stagedDataId>'`; Task 10 extracts the same rule into `sourceRef()` and both must agree.
- A flagged cluster is saved to `match_entities` but contributes nothing to the Crosswalk — Task 10 filters on `flagged = false`.

- [ ] **Step 4: PASS, then the gates.**

- [ ] **Step 5: Commit** — `feat(matching): union-find clustering with over-merge guard and stable entity keys`

---

### Task 10: Crosswalk writer

**Files:**
- Create: `src/modules/matching/crosswalk.service.ts`
- Test: `src/modules/matching/crosswalk.service.spec.ts`

**Interfaces:**
- Produces:

```typescript
class CrosswalkService {
  publish(project: MatchProject, run: MatchRun): Promise<{ written: number }>;
  sourceRef(source: MatchSourceRef): string;   // stable string form used as the crosswalk key
}
```

- [ ] **Step 1: Write the failing tests**

```typescript
describe('CrosswalkService', () => {
  it('builds a stable source ref for a connection source', () => {
    expect(service.sourceRef({ kind: 'connection', connectionId: 'c1',
      schemaName: 'public', tableName: 'citizens', primaryKey: 'id' }))
      .toBe('connection:c1:public.citizens');
  });

  it('builds a stable source ref for a staged source', () => {
    expect(service.sourceRef({ kind: 'staged', stagedDataId: 's1', primaryKey: 'id' }))
      .toBe('staged:s1');
  });

  it('writes one crosswalk row per cluster member', async () => {
    entityRepo.find.mockResolvedValue([
      { entityKey: 'E1', flagged: false, size: 2, members: [{ sourceKey: 'a' }, { sourceKey: 'b' }] },
    ]);
    const out = await service.publish(project, run);
    expect(out.written).toBe(2);
  });

  it('never writes a flagged cluster to the crosswalk', async () => {
    entityRepo.find.mockResolvedValue([
      { entityKey: 'E1', flagged: true, size: 2, members: [{ sourceKey: 'a' }, { sourceKey: 'b' }] },
    ]);
    const out = await service.publish(project, run);
    expect(out.written).toBe(0);
  });

  it('upserts so a re-run updates rather than duplicating', async () => {
    await service.publish(project, run);
    const sql = String(dataSource.query.mock.calls[0][0]);
    expect(sql).toContain('ON CONFLICT ("organization_id", "project_id", "source_ref", "source_key")');
    expect(sql).toContain('DO UPDATE SET');
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement per the Interfaces block.**

- [ ] **Step 4: PASS, then the gates.**

- [ ] **Step 5: Commit** — `feat(matching): publish the entity key crosswalk`

---

### Task 11: Evaluation

**Files:**
- Create: `src/modules/matching/eval.service.ts`
- Test: `src/modules/matching/eval.service.spec.ts`

**Interfaces:**
- Produces:

```typescript
export interface EvalMetrics { truePositives: number; falsePositives: number; falseNegatives: number;
  precision: number; recall: number; f1: number; }
export interface SweepPoint { matchAt: number; metrics: EvalMetrics; }
class EvalService {
  evaluate(project: MatchProject, runId: string, matchAt: number): Promise<EvalMetrics>;
  sweep(project: MatchProject, runId: string): Promise<SweepPoint[]>;   // matchAt 0.50..0.99 step 0.01
}
```

- [ ] **Step 1: Write the failing tests**

```typescript
describe('EvalService', () => {
  // Gold set: (a,b) match, (c,d) match, (e,f) not a match.
  // Scores: (a,b)=0.95, (c,d)=0.60, (e,f)=0.92.

  it('computes precision, recall and F1 at a threshold', async () => {
    const m = await service.evaluate(project, 'run1', 0.9);
    // Predicted matches at 0.9: (a,b) and (e,f). TP=1, FP=1, FN=1.
    expect(m.truePositives).toBe(1);
    expect(m.falsePositives).toBe(1);
    expect(m.falseNegatives).toBe(1);
    expect(m.precision).toBeCloseTo(0.5);
    expect(m.recall).toBeCloseTo(0.5);
    expect(m.f1).toBeCloseTo(0.5);
  });

  it('counts a gold match that blocking never proposed as a false negative', async () => {
    // Gold says (g,h) match, but no Blocking Pass proposed the pair, so it is
    // absent from match_candidates entirely. A missing pair is a miss, not a pass.
    goldRepo.find.mockResolvedValue([{ leftKey: 'g', rightKey: 'h', isMatch: true }]);
    dataSource.query.mockResolvedValue([]);   // no candidates at all
    const m = await service.evaluate(project, 'run1', 0.5);
    expect(m.truePositives).toBe(0);
    expect(m.falseNegatives).toBe(1);
    expect(m.recall).toBe(0);
  });

  it('returns zeroes rather than NaN when nothing is predicted', async () => {
    const m = await service.evaluate(project, 'run1', 0.999);
    expect(m.precision).toBe(0);
    expect(m.f1).toBe(0);
    expect(Number.isNaN(m.f1)).toBe(false);
  });

  it('throws when the gold set is empty, rather than reporting a perfect score', async () => {
    goldRepo.find.mockResolvedValue([]);
    await expect(service.evaluate(project, 'run1', 0.9)).rejects.toThrow(/gold set/i);
  });

  it('sweeps thresholds in ascending order', async () => {
    const points = await service.sweep(project, 'run1');
    expect(points[0].matchAt).toBeCloseTo(0.5);
    expect(points[points.length - 1].matchAt).toBeCloseTo(0.99);
    expect(points.length).toBe(50);
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement per the Interfaces block.**

Notes that matter:
- Guard both divisions. `precision` is 0 when nothing is predicted; `recall` is 0 when the gold set has no positives; `f1` is 0 when precision and recall are both 0. Returning `NaN` here would silently poison the wizard's sliders.
- An empty Gold Set throws — a project with no labels has no measurable quality, and reporting 1.0 would be a lie.
- `sweep` loads the candidates and the gold set **once** and evaluates in memory across 50 thresholds. Fifty round trips would make the wizard unusable.

- [ ] **Step 4: PASS, then the gates.**

- [ ] **Step 5: Commit** — `feat(matching): precision, recall and threshold sweep against the gold set`

---

### Task 12: Retention sweep

**Files:**
- Create: `src/modules/matching/matching-cleanup.service.ts`
- Test: `src/modules/matching/matching-cleanup.service.spec.ts`

**Interfaces:**
- Produces: `MatchingCleanupService.cleanupExpiredWorkspaces(): Promise<{ projectsSwept: number }>`, decorated `@Cron('0 3 * * *')`.

- [ ] **Step 1: Write the failing tests**

```typescript
describe('MatchingCleanupService', () => {
  it('drops workspace tables and candidates for a project past its retention', async () => {
    projectRepo.find.mockResolvedValue([{ id: 'p1', retentionDays: 30, organizationId: 'org1' }]);
    runRepo.find.mockResolvedValue([{ id: 'r1', startedAt: new Date('2020-01-01') }]);
    await service.cleanupExpiredWorkspaces();
    const sqls = dataSource.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('DROP TABLE IF EXISTS matching.p_p1_left'))).toBe(true);
    expect(sqls.some((s) => s.includes('DELETE FROM "match_candidates"'))).toBe(true);
  });

  it('keeps decisions, entities, the crosswalk and the gold set', async () => {
    await service.cleanupExpiredWorkspaces();
    const sqls = dataSource.query.mock.calls.map((c) => String(c[0])).join(' ');
    expect(sqls).not.toContain('match_decisions');
    expect(sqls).not.toContain('match_crosswalk');
    expect(sqls).not.toContain('match_gold_pairs');
    expect(sqls).not.toContain('match_entities');
  });

  it('leaves a project inside its retention window alone', async () => {
    runRepo.find.mockResolvedValue([{ id: 'r1', startedAt: new Date() }]);
    await service.cleanupExpiredWorkspaces();
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('never throws, and keeps sweeping after one project fails', async () => {
    projectRepo.find.mockResolvedValue([
      { id: 'p1', retentionDays: 1, organizationId: 'org1' },
      { id: 'p2', retentionDays: 1, organizationId: 'org1' },
    ]);
    dataSource.query
      .mockRejectedValueOnce(new Error('boom'))     // p1 fails
      .mockResolvedValue([]);                       // p2 succeeds
    const out = await service.cleanupExpiredWorkspaces();
    expect(out.projectsSwept).toBe(1);
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement**, following `transformations-cleanup.service.ts` for the cron and `ConfigService` shape, reading `MATCHING_RETENTION_DAYS` with a default of 30. Catch per project and log a warning, matching the audit service's never-throw discipline.

- [ ] **Step 4: PASS, then the gates.**

- [ ] **Step 5: Commit** — `feat(matching): daily retention sweep for workspaces and candidates`

---

### Task 13: Run orchestrator

**Files:**
- Create: `src/modules/matching/match-run.service.ts`
- Test: `src/modules/matching/match-run.service.spec.ts`

**Interfaces:**
- Consumes: Tasks 4, 6, 7, 8, 9, 10.
- Produces:

```typescript
class MatchRunService {
  start(projectId: string, organizationId: string): Promise<MatchRun>;   // returns immediately, runs in background
  execute(runId: string, organizationId: string): Promise<void>;         // the staged pipeline, awaited in tests
}
```

- [ ] **Step 1: Write the failing tests**

```typescript
describe('MatchRunService', () => {
  it('refuses to start when the organization uses a hosted AI provider', async () => {
    settings.getOrganizationSettings.mockResolvedValue({ aiProvider: AiProvider.OPENAI });
    await expect(service.start('p1', 'org1')).rejects.toThrow(BadRequestException);
  });

  it('refuses to start when the blocking estimate is above twice the cap', async () => {
    blocking.estimate.mockResolvedValue({ perPass: [], totalEstimatedPairs: 9e9, exceedsCap: true, refused: true });
    await expect(service.execute('r1', 'org1')).rejects.toThrow(/estimate/i);
    const saved = runRepo.save.mock.calls.pop()![0];
    expect(saved.status).toBe('failed');
  });

  it('moves through the statuses in order', async () => {
    await service.execute('r1', 'org1');
    const statuses = runRepo.save.mock.calls.map((c) => c[0].status);
    expect(statuses).toEqual(expect.arrayContaining([
      'materializing', 'blocking', 'scoring', 'clustering', 'completed']));
    expect(statuses[statuses.length - 1]).toBe('completed');
  });

  it('accumulates counters across every blocking pass', async () => {
    scoring.scorePass
      .mockResolvedValueOnce({ inserted: 10, autoMatch: 4, grey: 6, autoReject: 90 })
      .mockResolvedValueOnce({ inserted: 5,  autoMatch: 1, grey: 4, autoReject: 45 });
    await service.execute('r1', 'org1');
    const saved = runRepo.save.mock.calls.pop()![0];
    expect(saved.counters.autoMatch).toBe(5);
    expect(saved.counters.grey).toBe(10);
    expect(saved.counters.autoReject).toBe(135);
  });

  it('records the dropped keys the estimate found', async () => {
    blocking.estimate.mockResolvedValue({
      perPass: [{ pass: 'name_dob', distinctKeys: 2, estimatedPairs: 3, droppedKeys: ['|1988'] }],
      totalEstimatedPairs: 3, exceedsCap: false, refused: false,
    });
    await service.execute('r1', 'org1');
    expect(runRepo.save.mock.calls.pop()![0].droppedKeys).toEqual([{ pass: 'name_dob', keys: ['|1988'] }]);
  });

  it('marks the run failed with the error message when a stage throws', async () => {
    materialize.materialize.mockRejectedValue(new Error('source unreachable'));
    await expect(service.execute('r1', 'org1')).rejects.toThrow('source unreachable');
    const saved = runRepo.save.mock.calls.pop()![0];
    expect(saved.status).toBe('failed');
    expect(saved.errorMessage).toContain('source unreachable');
    expect(saved.finishedAt).toBeInstanceOf(Date);
  });

  it('materializes only the left side for a dedupe project', async () => {
    await service.execute('r1', 'org1');
    expect(materialize.materialize).toHaveBeenCalledTimes(1);
    expect(materialize.materialize.mock.calls[0][1]).toBe('left');
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement per the Interfaces block.**

Notes that matter:
- `start` validates the provider and the project, creates a `pending` run, then invokes `execute` inside `setImmediate` with a `.catch` that logs — the HTTP request must not wait on a two-hour run.
- Stage order: materialize left → estimate → refuse if `refused` → score each pass → cluster → publish crosswalk → `completed`.
- `duration_ms` is `finishedAt - startedAt`, set on both the success and the failure path.
- A dedupe project materializes `'left'` only. Materializing a right side that equals the left would double the work and break the self-join guard.

- [ ] **Step 4: PASS, then the gates.**

- [ ] **Step 5: Commit** — `feat(matching): run orchestrator with staged status, counters and failure capture`

---

### Task 14: HTTP surface

**Files:**
- Create: `src/modules/matching/matching.controller.ts`, `src/modules/matching/dto/create-match-project.dto.ts`, `dto/update-match-project.dto.ts`, `dto/submit-decision.dto.ts`, `dto/add-gold-pair.dto.ts`, `dto/index.ts`
- Test: `src/modules/matching/matching.controller.spec.ts`
- Modify: `src/modules/matching/matching.module.ts`

**Interfaces:**
- Produces these routes, all under `@Controller('api/matching')` with `@UseGuards(JwtAuthGuard, RolesGuard)`:

| Method | Path | Roles | Returns |
|---|---|---|---|
| POST | `projects` | editor+ | the created project |
| GET | `projects` | any | projects for the organization |
| GET | `projects/:id` | any | one project |
| PATCH | `projects/:id` | editor+ | the updated project |
| DELETE | `projects/:id` | editor+ | 204 |
| POST | `projects/:id/estimate` | editor+ | `BlockingEstimate` |
| POST | `projects/:id/runs` | editor+ | the created run |
| GET | `projects/:id/runs` | any | runs, newest first |
| GET | `runs/:runId` | any | one run with counters |
| GET | `runs/:runId/candidates` | any | the review queue page |
| POST | `projects/:id/decisions` | editor+ | the stored decision |
| GET | `runs/:runId/clusters` | any | clusters, flagged first |
| GET | `runs/:runId/evaluate` | any | `EvalMetrics` and the sweep |
| POST | `projects/:id/gold-pairs` | editor+ | the stored gold pair |

- [ ] **Step 1: Write the failing tests**

The DTO tests call class-validator directly rather than going through the HTTP
layer, so import it at the top of the spec: `import { validate } from 'class-validator';`

```typescript
describe('MatchingController', () => {
  const user = { id: 'u1', organizationId: 'org1' } as any;

  it('creates a project scoped to the caller organization', async () => {
    await controller.createProject(dto, user);
    expect(service.createProject).toHaveBeenCalledWith(dto, 'org1');
  });

  it('rejects a create whose lawful basis is empty', async () => {
    const errors = await validate(Object.assign(new CreateMatchProjectDto(), { ...dto, lawfulBasis: '' }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a create whose data owner is missing', async () => {
    const errors = await validate(Object.assign(new CreateMatchProjectDto(), { ...dto, dataOwner: undefined }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a create whose column allow-list is empty', async () => {
    const errors = await validate(Object.assign(new CreateMatchProjectDto(), { ...dto, columnAllowlist: [] }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects thresholds where rejectAt is above matchAt', async () => {
    const errors = await validate(Object.assign(new CreateMatchProjectDto(), {
      ...dto, thresholds: { matchAt: 0.5, rejectAt: 0.9 } }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes the organization id to every read so another tenant project is never returned', async () => {
    await controller.getProject('p1', user);
    expect(service.findProject).toHaveBeenCalledWith('p1', 'org1');
  });

  it('records the reviewing user on a decision', async () => {
    await controller.submitDecision('p1', { leftKey: 'a', rightKey: 'b', decision: 'match' } as any, user);
    expect(service.recordDecision).toHaveBeenCalledWith('p1', expect.anything(), 'org1', 'u1');
  });

  it('serves the review queue grey band first, ordered by score descending', async () => {
    await controller.getCandidates('r1', { decision: 'grey', limit: 50 } as any, user);
    expect(service.listCandidates).toHaveBeenCalledWith('r1', 'org1',
      expect.objectContaining({ decision: 'grey' }));
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement.**

DTO rules, all with class-validator decorators (an undecorated DTO silently accepts anything, which is the bug the repository audit found in `data-quality`):
- `name`: `@IsString() @IsNotEmpty() @MaxLength(200)`
- `mode`: `@IsIn(['dedupe', 'link'])`
- `lawfulBasis`, `dataOwner`: `@IsString() @IsNotEmpty()`
- `columnAllowlist`: `@IsArray() @ArrayNotEmpty() @IsString({ each: true }) @Matches(/^[A-Za-z0-9_]+$/, { each: true })`
- `thresholds`: nested validated object with `@IsNumber() @Min(0) @Max(1)` on both, plus a custom validator asserting `rejectAt <= matchAt`
- `retentionDays`: `@IsInt() @Min(1) @Max(365)`
- `fieldMap`, `blockingPasses`: `@ValidateNested({ each: true }) @Type(() => ...)`

Every handler takes `@CurrentUser() user: User` and passes `user.organizationId` into the service. No handler accepts an organization id from the request.

- [ ] **Step 4: PASS, then the gates.**

- [ ] **Step 5: Add the env vars** to BOTH `.env.example` files, under a `# Entity matching` heading with a one-line comment each:

```
MATCHING_RETENTION_DAYS=30
MATCHING_MAX_CANDIDATE_PAIRS=250000000
MATCHING_BATCH_ROWS=50000
```

- [ ] **Step 6: Commit** — `feat(matching): HTTP surface with validated DTOs, RBAC and organization isolation`

---

### Task 15: Engine integration test

**Files:**
- Create: `test/matching-engine.e2e-spec.ts`
- Create: `test/fixtures/matching-duplicates.sql`

**Interfaces:**
- Consumes: the whole engine. Produces: nothing other than confidence.

This is the task that proves the plan. The unit tests all mock the database, so nothing so far has executed a single line of the generated SQL.

- [ ] **Step 1: Write the fixture**

A `matching_fixture.citizens` table with 10,000 rows, of which 300 are deliberate duplicates: 100 pairs with a swapped name order, 100 with a one-character surname typo, 100 with a transposed birth-date digit. Include 50 rows with an empty surname to exercise the degenerate-key guard. Record the 300 true pairs in `matching_fixture.truth`.

- [ ] **Step 2: Write the failing test**

The suite needs one helper, defined at the top of the file — the run is
started in the background by `MatchRunService.start`, so the test has to wait
for a terminal status rather than awaiting the call:

```typescript
async function waitForStatus(runId: string, want: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await runRepo.findOne({ where: { id: runId } });
    if (run?.status === want) return;
    if (run?.status === 'failed') throw new Error(`run failed: ${run.errorMessage}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`run ${runId} did not reach ${want} within ${timeoutMs}ms`);
}
```

```typescript
describe('matching engine (integration)', () => {
  it('runs end to end against real PostgreSQL and reaches completed', async () => {
    const run = await runService.start(projectId, orgId);
    await waitForStatus(run.id, 'completed', 120_000);
    const finished = await runRepo.findOne({ where: { id: run.id } });
    expect(finished!.status).toBe('completed');
    expect(finished!.counters.leftRows).toBe(10_000);
  });

  it('excludes the empty-surname key as degenerate', async () => {
    const finished = await runRepo.findOne({ where: { id: run.id } });
    expect(JSON.stringify(finished!.droppedKeys)).toContain('|');
  });

  it('stores far fewer candidates than it saw, because rejects are never stored', async () => {
    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM match_candidates WHERE run_id = $1`, [run.id]);
    const finished = await runRepo.findOne({ where: { id: run.id } });
    expect(count).toBeLessThan(finished!.counters.candidatePairs);
    expect(count).toBe(finished!.counters.autoMatch + finished!.counters.grey);
  });

  it('recovers at least 80 percent of the known duplicate pairs', async () => {
    const metrics = await evalService.evaluate(project, run.id, project.thresholds.matchAt);
    expect(metrics.recall).toBeGreaterThan(0.8);
    expect(metrics.precision).toBeGreaterThan(0.9);
  });

  it('publishes a crosswalk row for every clustered, unflagged member', async () => {
    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM match_crosswalk WHERE project_id = $1`, [projectId]);
    expect(count).toBeGreaterThan(0);
  });

  it('keeps the entity key stable across a second run', async () => {
    const before = await dataSource.query(
      `SELECT source_key, entity_key FROM match_crosswalk WHERE project_id = $1 ORDER BY source_key`, [projectId]);
    const second = await runService.start(projectId, orgId);
    await waitForStatus(second.id, 'completed', 120_000);
    const after = await dataSource.query(
      `SELECT source_key, entity_key FROM match_crosswalk WHERE project_id = $1 ORDER BY source_key`, [projectId]);
    expect(after).toEqual(before);
  });
});
```

- [ ] **Step 3: Run it and fix what it finds**

Run: `pnpm test:e2e -- --runTestsByPath test/matching-engine.e2e-spec.ts`

Expect real failures here, in the generated SQL, not in the test. Fix them in the services and re-run. Requires `docker compose up -d`.

- [ ] **Step 4: Record the measured numbers**

Append a short "Measured on 10k rows" note to the spec's section 7.5 with the actual stage timings, replacing the estimate language for this scale. Do not claim the 10M numbers are verified — they are not.

- [ ] **Step 5: Commit** — `test(matching): end-to-end engine test against seeded PostgreSQL fixture`

---

### Task 16: Frontend — API client, project list, wizard

**Files:**
- Modify: `packages/frontend/lib/api.ts`, `packages/frontend/components/Sidebar.tsx`
- Create: `app/matching/page.tsx`, `app/matching/new/page.tsx`

**Interfaces:**
- Produces the `api.matching` namespace, appended before the closing brace of the `api` object:

```typescript
matching: {
  listProjects: () => apiFetch<MatchProjectDto[]>('/api/matching/projects'),
  getProject: (id: string) => apiFetch<MatchProjectDto>(`/api/matching/projects/${id}`),
  createProject: (body: CreateMatchProjectBody) =>
    apiFetch<MatchProjectDto>('/api/matching/projects', { method: 'POST', body: JSON.stringify(body) }),
  updateProject: (id: string, body: Partial<CreateMatchProjectBody>) =>
    apiFetch<MatchProjectDto>(`/api/matching/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteProject: (id: string) =>
    apiFetch<void>(`/api/matching/projects/${id}`, { method: 'DELETE' }),
  estimate: (id: string) => apiFetch<BlockingEstimate>(`/api/matching/projects/${id}/estimate`, { method: 'POST' }),
  startRun: (id: string) => apiFetch<MatchRunDto>(`/api/matching/projects/${id}/runs`, { method: 'POST' }),
  listRuns: (id: string) => apiFetch<MatchRunDto[]>(`/api/matching/projects/${id}/runs`),
  getRun: (runId: string) => apiFetch<MatchRunDto>(`/api/matching/runs/${runId}`),
  listCandidates: (runId: string, decision: string, limit = 50) =>
    apiFetch<MatchCandidateDto[]>(`/api/matching/runs/${runId}/candidates?decision=${decision}&limit=${limit}`),
  submitDecision: (projectId: string, body: SubmitDecisionBody) =>
    apiFetch<void>(`/api/matching/projects/${projectId}/decisions`, { method: 'POST', body: JSON.stringify(body) }),
  listClusters: (runId: string) => apiFetch<MatchClusterDto[]>(`/api/matching/runs/${runId}/clusters`),
  evaluate: (runId: string) => apiFetch<{ metrics: EvalMetrics; sweep: SweepPoint[] }>(`/api/matching/runs/${runId}/evaluate`),
  addGoldPair: (projectId: string, body: AddGoldPairBody) =>
    apiFetch<void>(`/api/matching/projects/${projectId}/gold-pairs`, { method: 'POST', body: JSON.stringify(body) }),
},
```

Exported interfaces for every DTO above go at the end of `lib/api.ts`, beside `SuggestedCheck`. Types must be explicit — the repository has a `pnpm build` gate that fails on implicit `any` at fetch boundaries.

- [ ] **Step 1: Add the namespace and the types.** Follow the existing namespaces for `apiFetch` usage; do not introduce a second fetch helper.

- [ ] **Step 2: Build the project list page.** A table of projects with name, mode, last run status, a "New project" button, and a per-row delete action calling `api.matching.deleteProject` behind an inline confirm (not `window.confirm` — a browser modal blocks the page). Empty state explains what a Match Project is in the vocabulary from `CONTEXT.md`. The PATCH and DELETE endpoints from Task 14 must both have a caller by the end of this task; an endpoint with no caller is dead code a reviewer will rightly flag.

- [ ] **Step 3: Build the wizard**, four steps in one client component with local step state:

1. **Match Source** — pick a Connection and table, or a Staged dataset. Pick the primary key.
2. **Field map** — choose columns and assign a role and weight to each. **Entered by hand; phase 1 makes no model call here.** The column allow-list is derived from the chosen columns **plus the primary key picked in step 1** — Task 5 requires the key to be allow-listed like any other column, so omitting it makes every run fail at materialization.
3. **Blocking** — add passes, then "Estimate" calls `api.matching.estimate` and renders the projected pair count per pass and the total. Show the dropped degenerate keys. Disable "Create and run" when the response says `refused`.
4. **Thresholds and authority** — two sliders, plus the required lawful basis and data owner fields. The step cannot be completed with either left blank.

- [ ] **Step 4: Add the sidebar entry** to the `DATA OPERATIONS` section of `components/Sidebar.tsx`, after Data Quality: `{ id: 'matching', label: 'Entity Matching', href: '/matching', icon: <Users /> }`. Import `Users` from `lucide-react` alongside the existing icons.

- [ ] **Step 5: Gates**

```bash
cd packages/frontend && pnpm build && npx next lint
```

Expected: build exit 0, lint zero errors. Note the pre-existing `react/no-unescaped-entities` errors in `DataIngestion/ColumnMapping.tsx` — do not fix them here and do not let them be attributed to this task; confirm they are the only failures and that none are in `app/matching/`.

- [ ] **Step 6: Commit** — `feat(matching): matching API client, project list and setup wizard`

---

### Task 17: Frontend — review queue, run summary, clusters

**Files:**
- Create: `app/matching/[id]/page.tsx`, `app/matching/[id]/runs/[runId]/page.tsx`, `app/matching/[id]/review/page.tsx`, `app/matching/[id]/clusters/page.tsx`, `components/Matching/RecordDiff.tsx`

- [ ] **Step 1: Build `RecordDiff`.** Given two records and the field map, render one row per field: the field name, the two values with differing characters wrapped in a highlight span, and a similarity bar driven by that field's score from `features`. Pure presentational component, no fetching.

- [ ] **Step 2: Build the project detail page.** Project summary plus run history, each row linking to its run summary. A "Run now" button calling `api.matching.startRun`, and links to Review and Clusters for the latest completed run.

- [ ] **Step 3: Build the run summary page.** The counters as stat tiles — rows, candidate pairs, auto-matched, grey band, rejected, clusters, flagged. A cluster-size histogram. A list of flagged clusters with a note that a flagged cluster is held back from the Crosswalk until someone resolves it.

- [ ] **Step 4: Build the review queue.** This is the screen the feature succeeds or fails on.

- Fetch the grey band via `api.matching.listCandidates(runId, 'grey')`, ordered by score descending.
- Render the current pair with `RecordDiff`, plus the overall score and which Blocking Pass proposed it.
- Keyboard: `m` match, `n` no match, `s` skip, `u` undo, `j`/`k` to move. Bind on `window` in a `useEffect` and clean up on unmount. Ignore the handler while an input is focused.
- Each verdict calls `api.matching.submitDecision` and advances. `u` re-submits the opposite decision for the previous pair and steps back.
- Progress line: "142 of 3,480 reviewed".
- Use `useToast()` → `showToast(message, type)` for failures. The `toast({title, description})` pattern does not exist in this codebase.
- **There is no model-written reason in phase 1.** Leave the space for it out entirely rather than shipping an empty panel; phase 2 adds it.

- [ ] **Step 5: Build the clusters page.** One card per cluster: entity key, size, members, flagged badge. The golden record section is phase 3 — omit it, do not render an empty one.

- [ ] **Step 6: Gates.** `pnpm build` exit 0, `npx next lint` zero errors, same pre-existing-failures caveat as Task 16.

- [ ] **Step 7: Commit** — `feat(matching): review queue, run summary and cluster pages`

---

### Task 18: The `no_duplicates` quality check

**Files:**
- Modify: `src/database/entities/quality-check.entity.ts:13`, `src/modules/data-quality/quality-checks.service.ts:322` and `:375`
- Test: extend `src/modules/data-quality/quality-checks.service.spec.ts`

**Interfaces:**
- Consumes: the `MatchProject`, `MatchRun` and `MatchEntity` repositories, read-only. **Not `MatchRunService`** — the check reads a completed run and must never be able to start one, so it has no reason to hold the service that can.
- Produces: `CheckType` gains `'no_duplicates'`. Its `config` is `{ matchProjectId: string; maxDuplicateClusters: number }`.

- [ ] **Step 1: Write the failing tests**

```typescript
describe('no_duplicates check', () => {
  it('passes when the duplicate cluster count is at or below the limit', async () => {
    entityRepo.count.mockResolvedValue(2);
    const result = await service.runCheck({ checkType: 'no_duplicates',
      config: { matchProjectId: 'p1', maxDuplicateClusters: 5 } } as any, 'org1');
    expect(result.status).toBe('pass');
    expect(result.actualValue).toBe(2);
  });

  it('fails when the duplicate cluster count is above the limit', async () => {
    entityRepo.count.mockResolvedValue(9);
    const result = await service.runCheck({ checkType: 'no_duplicates',
      config: { matchProjectId: 'p1', maxDuplicateClusters: 5 } } as any, 'org1');
    expect(result.status).toBe('fail');
  });

  it('errors when the referenced match project belongs to another organization', async () => {
    projectRepo.findOne.mockResolvedValue(null);
    const result = await service.runCheck({ checkType: 'no_duplicates',
      config: { matchProjectId: 'p-other', maxDuplicateClusters: 5 } } as any, 'org1');
    expect(result.status).toBe('error');
  });

  it('errors when the match project has never completed a run', async () => {
    runRepo.findOne.mockResolvedValue(null);
    const result = await service.runCheck({ checkType: 'no_duplicates',
      config: { matchProjectId: 'p1', maxDuplicateClusters: 5 } } as any, 'org1');
    expect(result.status).toBe('error');
  });

  it('is never produced by AI suggestion, because it needs a match project', () => {
    expect(ALLOWED_SUGGESTION_CHECK_TYPES.has('no_duplicates')).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement.**

- Add `'no_duplicates'` to the `CheckType` union at `quality-check.entity.ts:13`.
- Add a `case 'no_duplicates'` to the execution switch at `quality-checks.service.ts:322` and to the comparison switch at `:375`. The check counts `match_entities` rows with `size > 1` for the project's latest completed run, filtered by `organizationId`.
- Do **not** add it to `ALLOWED_SUGGESTION_CHECK_TYPES` — it needs a Match Project id that no suggestion can invent.
- The check reads an existing run; it never starts one. A quality check must not launch a two-hour job.
- `DataQualityModule` imports `MatchingModule`; `MatchingModule` exports only the three repositories via `TypeOrmModule`, never `MatchRunService`. If that creates a circular graph, use the `ModuleRef` lazy-get pattern documented in `CLAUDE.md` rather than restructuring either module.

- [ ] **Step 4: PASS, then the gates.**

- [ ] **Step 5: Commit** — `feat(quality): no_duplicates check backed by a match project`

---

## Final verification

- [ ] `cd packages/backend && pnpm test` — full suite green
- [ ] `cd packages/backend && npx tsc --noEmit` — clean
- [ ] `cd packages/backend && pnpm test:e2e -- --runTestsByPath test/matching-engine.e2e-spec.ts` — green against docker-compose PostgreSQL
- [ ] `cd packages/frontend && pnpm build` — exit 0
- [ ] `cd packages/frontend && npx next lint` — zero errors outside the pre-existing `DataIngestion` failures
- [ ] `pnpm run migration:revert && pnpm run migration:run` — both succeed
- [ ] Manual pass: create a dedupe project against a seeded table, estimate, run, review five pairs by keyboard, confirm the Crosswalk has rows and a second run leaves the entity keys unchanged

## Out of scope (deliberate)

These belong to later phases and must not appear in this plan's commits:

- Any model call — adjudication, model normalization, model-suggested field mapping (phase 2)
- `match_norm_cache` and `match_value_vectors` tables, and the `vector` blocking pass (phase 2)
- `aiSmallModel` on organization settings and `AI_SMALL_MODEL` (phase 2)
- A right Match Source, cross-source clusters, Golden Record survivorship, Cross-Query crosswalk integration, lineage edges (phase 3)
- The cross-encoder reranker, Fellegi–Sunter weight estimation, incremental re-match, the `match` pipeline step (phase 4)
- `COPY`-based bulk load in place of multi-row inserts — a measured optimization, not a phase-1 requirement
