# Phase 2 AI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AI foundation on real hardware — a hardened local-LLM provider, pgvector embeddings + semantic catalog search, an AI audit trail, an enriched schema context (foreign keys + sample rows), and the first three user-facing AI features (semantic search, error doctor, suggested quality checks) — then deploy DataGate to the RISA VM so the features run against the GPU box.

**Architecture:** Backend work in `packages/backend` (NestJS 11): the existing `ai`/`nl2sql` modules gain JSON-mode + retry; a new `catalog-search` module owns embeddings (raw parameterized SQL against a pgvector column — no TypeORM entity); a new `ai_interactions` audit table logs every AI call. Frontend adds three surfaces. Deployment: app on the jump host (nginx :80 → Next :3000 + Nest :3001), Postgres 16 + pgvector local to the VM, all inference on the GPU box over the Nebula overlay.

**Tech Stack:** NestJS 11 + Jest, Next.js 14, PostgreSQL + pgvector, Ollama 0.32 (`/api/generate` with `format: "json"`, `/api/embed`).

**Spec:** `docs/improvement-review.html` — "AI, everywhere" section (AI-1 foundation steps 1–5; AI-2 features: semantic catalog search, error doctor, suggested quality checks).

## Global Constraints

- Branch `ft-phase2-ai-foundation` off `ft-phase1-unblock`.
- Backend commands from `packages/backend`; frontend from `packages/frontend`; tests via `pnpm test -- --runTestsByPath <spec>`.
- Gates: backend full `pnpm test` + `npx tsc --noEmit` clean; frontend `pnpm build` exit 0 + `npx next lint` 0 errors.
- **Verified environment facts (do not re-derive):** GPU box `http://192.168.100.2:11434` (reachable only from the VM) runs Ollama 0.32.9 with models `qwen3-30b-16k` (chat/SQL), `qwen3-4b-fast` (cheap), `bge-m3` (embeddings, 1024 dims, 8192 ctx). Local dev Postgres is Homebrew 15.14 with the `vector` extension AVAILABLE (`CREATE EXTENSION` works). Deploy host `risa1@10.10.94.154` (Ubuntu 20.04, Node 22, sudo via password) — reachable passwordless with `ssh -i ~/.ssh/datagate_vm -o IdentitiesOnly=yes risa1@10.10.94.154`.
- Embeddings config: endpoint = the org's `aiApiEndpoint` (same Ollama host); model = env `EMBEDDINGS_MODEL` (default `bge-m3`); dimension fixed at 1024.
- All AI endpoints require auth; mutating/reindex endpoints carry `@Roles` per the Phase-0 policy (EDITORS for content actions).
- Never log or store prompts containing decrypted credentials; audit rows store prompt/response SIZES and metadata, plus generated SQL (SQL is already stored in query_history — acceptable).
- Migration numbering continues at `1711000000008`.
- Commits per task: brief's message + blank line + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Do not push.

---

### Task 0: Branch

- [ ] **Step 1:**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git checkout ft-phase1-unblock && git checkout -b ft-phase2-ai-foundation
```

---

### Task 1: Harden the local provider — JSON mode, retry, configurable timeout

**Files:**
- Modify: `packages/backend/src/modules/ai/providers/local-provider.service.ts`
- Modify: `packages/backend/src/modules/ai/providers/base-provider.interface.ts`
- Modify: `packages/backend/src/modules/ai/providers/custom-provider.service.ts` (signature only)
- Test: extend `packages/backend/src/modules/ai/providers/local-provider.service.spec.ts`

**Interfaces:**
- Produces: `IAiProvider.generateJson(prompt: string, settings: OrganizationSettings): Promise<any>` — sends one prompt, requests strict JSON (Ollama `format: 'json'`; OpenAI-compatible `response_format: { type: 'json_object' }`), parses the response with `JSON.parse`, retries ONCE on transient failure (network error or unparseable JSON), then throws. Timeout from env `AI_TIMEOUT_MS` (default 120000). Custom provider implements it as a thrown `BadRequestException('Custom provider does not support structured output')`.

- [ ] **Step 1: Write the failing tests** (append to the existing spec)

```typescript
describe('LocalProviderService.generateJson', () => {
  it('requests Ollama JSON format and parses the result', async () => {
    mockedAxios.post.mockResolvedValue({ data: { response: '{"a":1}' } });
    const out = await provider.generateJson('give me json', {
      aiApiEndpoint: 'http://gpu:11434',
      aiModel: 'qwen3-30b-16k',
    } as any);
    expect(out).toEqual({ a: 1 });
    const [, body] = mockedAxios.post.mock.calls[0];
    expect((body as any).format).toBe('json');
    expect((body as any).model).toBe('qwen3-30b-16k');
  });

  it('retries once on unparseable output, then succeeds', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { response: 'not json' } })
      .mockResolvedValueOnce({ data: { response: '{"ok":true}' } });
    const out = await provider.generateJson('x', {
      aiApiEndpoint: 'http://gpu:11434',
      aiModel: 'qwen3-4b-fast',
    } as any);
    expect(out).toEqual({ ok: true });
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('throws after the second failure', async () => {
    mockedAxios.post.mockResolvedValue({ data: { response: 'still not json' } });
    await expect(
      provider.generateJson('x', { aiApiEndpoint: 'http://gpu:11434', aiModel: 'm' } as any),
    ).rejects.toThrow();
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** (`generateJson` undefined).

- [ ] **Step 3: Implement**

In `base-provider.interface.ts` add to `IAiProvider`:

```typescript
  /** One-shot structured-output call. Throws if the provider cannot return valid JSON after one retry. */
  generateJson(prompt: string, settings: OrganizationSettings): Promise<any>;
```

In `local-provider.service.ts` add (reusing the class's endpoint/model/isOllama conventions):

```typescript
  private readonly aiTimeoutMs = parseInt(process.env.AI_TIMEOUT_MS || '120000', 10);

  async generateJson(prompt: string, settings: OrganizationSettings): Promise<any> {
    const endpoint = settings.aiApiEndpoint || this.DEFAULT_OLLAMA_ENDPOINT;
    const model = settings.aiModel || 'codellama';
    const isOllama = endpoint.includes('11434') || !endpoint.includes('/v1');

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let raw: string;
        if (isOllama) {
          const response = await axios.post(
            `${endpoint}/api/generate`,
            { model, prompt, stream: false, format: 'json' },
            { timeout: this.aiTimeoutMs },
          );
          raw = response.data.response;
        } else {
          const response = await axios.post(
            `${endpoint}/chat/completions`,
            {
              model,
              messages: [{ role: 'user', content: prompt }],
              response_format: { type: 'json_object' },
            },
            {
              timeout: this.aiTimeoutMs,
              headers: settings.aiApiKey
                ? { Authorization: `Bearer ${settings.aiApiKey}` }
                : undefined,
            },
          );
          raw = response.data.choices[0].message.content;
        }
        return JSON.parse(raw);
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`generateJson attempt ${attempt + 1} failed: ${lastError.message}`);
      }
    }
    throw lastError;
  }
```

Also switch the existing hardcoded `timeout: 30000` in `explainSql` and any `120000` literals in this file to `this.aiTimeoutMs`. In `custom-provider.service.ts` implement the interface member:

```typescript
  async generateJson(prompt: string, settings: OrganizationSettings): Promise<any> {
    throw new BadRequestException('Custom provider does not support structured output');
  }
```

(import `BadRequestException` if missing).

- [ ] **Step 4: Green + gates**: targeted spec, then full `pnpm test` + `tsc --noEmit`.

- [ ] **Step 5: Add `AI_TIMEOUT_MS=120000` and `EMBEDDINGS_MODEL=bge-m3`** (used by Task 2) to BOTH `.env.example` files (root and packages/backend), under the AI section with a one-line comment each.

- [ ] **Step 6: Commit** — `feat(ai): generateJson structured-output with retry + configurable AI timeout`

---

### Task 2: pgvector migration + EmbeddingsService

**Files:**
- Create: `packages/backend/src/database/migrations/1711000000008-AddCatalogEmbeddings.ts`
- Create: `packages/backend/src/modules/catalog-search/embeddings.service.ts`
- Create: `packages/backend/src/modules/catalog-search/catalog-search.module.ts` (service registrations grow in Task 3)
- Test: `packages/backend/src/modules/catalog-search/embeddings.service.spec.ts`
- Modify: `packages/backend/src/app.module.ts` (import the new module)

**Interfaces:**
- Produces: table `catalog_embeddings(id text PK, organization_id text NOT NULL, object_type text NOT NULL, object_key text NOT NULL, content text NOT NULL, embedding vector(1024) NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id, object_type, object_key))` + ivfflat index. `EmbeddingsService.embed(texts: string[], settings: OrganizationSettings): Promise<number[][]>` — POSTs `{ model: process.env.EMBEDDINGS_MODEL || 'bge-m3', input: texts }` to `${settings.aiApiEndpoint || 'http://localhost:11434'}/api/embed`, returns `response.data.embeddings`; batches input in chunks of 32; throws on failure. `EmbeddingsService.toVectorLiteral(v: number[]): string` returns `[0.1,0.2,...]` (pgvector text format).

- [ ] **Step 1: Migration**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCatalogEmbeddings1711000000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(`
      CREATE TABLE "catalog_embeddings" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "object_type" text NOT NULL,
        "object_key" text NOT NULL,
        "content" text NOT NULL,
        "embedding" vector(1024) NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_catalog_embeddings_org_obj" UNIQUE ("organization_id", "object_type", "object_key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_catalog_embeddings_org" ON "catalog_embeddings" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_catalog_embeddings_vec" ON "catalog_embeddings" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "catalog_embeddings"`);
  }
}
```

- [ ] **Step 2: Failing spec for the service**

```typescript
import axios from 'axios';
import { EmbeddingsService } from './embeddings.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmbeddingsService();
  });

  it('embeds a batch via the org-configured Ollama endpoint', async () => {
    mockedAxios.post.mockResolvedValue({ data: { embeddings: [[0.1, 0.2], [0.3, 0.4]] } });
    const out = await service.embed(['a', 'b'], { aiApiEndpoint: 'http://gpu:11434' } as any);
    expect(out).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('http://gpu:11434/api/embed');
    expect((body as any).model).toBe('bge-m3');
    expect((body as any).input).toEqual(['a', 'b']);
  });

  it('chunks batches of more than 32 inputs', async () => {
    mockedAxios.post.mockResolvedValue({ data: { embeddings: Array(32).fill([0]) } });
    await service.embed(Array(40).fill('x'), { aiApiEndpoint: 'http://gpu:11434' } as any);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('formats pgvector literals', () => {
    expect(service.toVectorLiteral([0.1, -0.2, 3])).toBe('[0.1,-0.2,3]');
  });
});
```

- [ ] **Step 3: Implement `embeddings.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { OrganizationSettings } from '../../database/entities/organization-settings.entity';

const BATCH_SIZE = 32;

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly model = process.env.EMBEDDINGS_MODEL || 'bge-m3';
  private readonly timeoutMs = parseInt(process.env.AI_TIMEOUT_MS || '120000', 10);

  async embed(texts: string[], settings: OrganizationSettings): Promise<number[][]> {
    const endpoint = settings.aiApiEndpoint || 'http://localhost:11434';
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const chunk = texts.slice(i, i + BATCH_SIZE);
      const response = await axios.post(
        `${endpoint}/api/embed`,
        { model: this.model, input: chunk },
        { timeout: this.timeoutMs },
      );
      out.push(...response.data.embeddings);
    }
    return out;
  }

  /** pgvector text literal: '[0.1,0.2,...]' */
  toVectorLiteral(v: number[]): string {
    return `[${v.join(',')}]`;
  }
}
```

Create `catalog-search.module.ts` (providers/exports: `EmbeddingsService`; Task 3 adds the rest) and import it in `app.module.ts`.

- [ ] **Step 4: Run migration locally + gates**

```bash
cd packages/backend && pnpm run migration:run && pnpm test && npx tsc --noEmit -p tsconfig.json
```

Expected: `AddCatalogEmbeddings1711000000008` executes (local PG 15 has the extension available — verified).

- [ ] **Step 5: Commit** — `feat(ai): pgvector catalog_embeddings table + Ollama embeddings service`

---

### Task 3: Catalog indexer + semantic search API

**Files:**
- Create: `packages/backend/src/modules/catalog-search/catalog-search.service.ts`
- Create: `packages/backend/src/modules/catalog-search/catalog-search.controller.ts`
- Modify: `packages/backend/src/modules/catalog-search/catalog-search.module.ts`
- Test: `packages/backend/src/modules/catalog-search/catalog-search.service.spec.ts`

**Interfaces:**
- Consumes: `EmbeddingsService` (Task 2), `SettingsService.getOrganizationSettings(orgId)` (import SettingsModule), `ConnectionsService.findAll(orgId)` + `SchemaService.getTables/getColumns` (import their modules), `StagedData` repository, `DataSource` for raw SQL.
- Produces:
  - `CatalogSearchService.reindex(organizationId): Promise<{ indexed: number }>` — builds one document per table (`content` = `"<connection name> <schema>.<table> — columns: col1 (type), col2 (type), …"`, capped at 50 tables/connection and 40 columns/table) and one per staged dataset (name + column names), embeds them, upserts via `INSERT ... ON CONFLICT ("organization_id","object_type","object_key") DO UPDATE SET content=EXCLUDED.content, embedding=EXCLUDED.embedding, updated_at=now()` with `$n::vector` params; `object_key` = `<connectionId>:<schema>.<table>` or `staged:<id>`; failures on individual connections are warn-logged and skipped.
  - `CatalogSearchService.search(organizationId, query, limit=20)` — embeds the query, runs `SELECT object_type, object_key, content, 1 - (embedding <=> $1::vector) AS score FROM catalog_embeddings WHERE organization_id = $2 ORDER BY embedding <=> $1::vector LIMIT $3`, returns rows.
  - Controller: `POST /api/catalog-search/reindex` (`@Roles` EDITORS) and `GET /api/catalog-search?q=...` (any authenticated), both org-scoped from `@CurrentUser`.

- [ ] **Step 1: Failing spec** — mock `EmbeddingsService`, `SettingsService`, `ConnectionsService`, `SchemaService`, `getRepositoryToken(StagedData)`, and `DataSource` (`{ query: jest.fn() }`). Assert:
  - `search('org-1', 'health facilities')` calls `dataSource.query` with SQL containing `embedding <=>` and params `[expect.stringMatching(/^\[.*\]$/), 'org-1', 20]`, and returns the mocked rows.
  - `reindex('org-1')` with one mocked connection (one table, two columns) and one staged dataset embeds 2 documents and issues 2 upserts whose SQL contains `ON CONFLICT`.

- [ ] **Step 2: FAIL, Step 3: implement per the Interfaces block** (DTO for the reindex body not needed — no body; the search query param must be validated: reject empty/`length > 500` with BadRequestException). Wire the module: imports `SettingsModule`, `ConnectionsModule`, `SchemaModule`, `TypeOrmModule.forFeature([StagedData])`; controller + both services registered; export nothing extra.

- [ ] **Step 4: gates** (targeted spec → full suite → tsc).

- [ ] **Step 5: Commit** — `feat(ai): semantic catalog search — reindex + vector search endpoints`

---

### Task 4: AI audit trail

**Files:**
- Create: `packages/backend/src/database/migrations/1711000000009-AddAiInteractions.ts` (table `ai_interactions`: id text PK, organization_id text, user_id text NULL, feature text, model text NULL, prompt_chars int, response_chars int, latency_ms int, success boolean, error_message text NULL, generated_sql text NULL, executed boolean DEFAULT false, created_at timestamptz DEFAULT now(); index on (organization_id, created_at))
- Create: `packages/backend/src/database/entities/ai-interaction.entity.ts` (+ export in `entities/index.ts`, + register in `app.module.ts` entities array)
- Create: `packages/backend/src/modules/ai/ai-audit.service.ts` — `log(entry: {...}): Promise<void>` that NEVER throws (catch + logger.warn) and an `list(organizationId, limit=100)` query; registered + exported from `AiModule`
- Create: `GET /api/ai/audit` endpoint (`@Roles` SUPER_ADMIN/ORG_ADMIN) — add a small `ai.controller.ts` to AiModule
- Modify: `packages/backend/src/modules/nl2sql/nl2sql.service.ts` — wrap `generateSql` and `explainSql` provider calls with timing + `aiAudit.log({ feature: 'nl2sql_generate' | 'nl2sql_explain', ... })` on both success and failure (Nl2sqlModule imports AiModule already or add it)
- Test: `packages/backend/src/modules/ai/ai-audit.service.spec.ts` — log() persists via mocked repo; log() swallows repo errors; list() org-scopes.

Follow the entity conventions from memory: `@PrimaryColumn('text')` + uuidv4, `@CreateDateColumn`. TDD as in prior tasks; gates; commit — `feat(ai): ai_interactions audit trail wired into NL2SQL generate/explain`

---

### Task 5: Enrich schema context — foreign keys + sample rows

**Files:**
- Modify: `packages/backend/src/modules/nl2sql/schema-context-builder.service.ts`
- Test: extend `packages/backend/src/modules/nl2sql/schema-context-builder.service.spec.ts`

**Interfaces:**
- Produces: when building a connection's context, (a) for `postgresql`/`mysql` connections, populate `relationships: RelationshipSchema[]` by querying `information_schema` referential constraints through the connection's driver (`connectionsService`/driver access already used in this module's neighborhood — obtain a driver via the same path `SchemaService` uses, or add a `getRelationships` helper that opens the driver, runs the query below, disconnects in `finally`); (b) when `options.includeSampleData`, fetch up to 3 rows per table (`SELECT * FROM "schema"."table" LIMIT 3`, identifier-quoted with the same `/^[A-Za-z_][A-Za-z0-9_]*$/` validation used in Phase 0 — skip the table with a warn if the name fails) into `TableSchema.sampleData`. All enrichment failures are warn-logged and non-fatal; caps: relationships ≤ 100/connection, sample rows only for the first 10 tables.

Postgres FK query:

```sql
SELECT tc.table_schema, tc.table_name, kcu.column_name,
       ccu.table_schema AS foreign_table_schema, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' LIMIT 100
```

MySQL variant uses `information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_NAME IS NOT NULL LIMIT 100`. Map to whatever field names `RelationshipSchema` declares (open `base-provider.interface.ts` and match exactly). Check how the prompt builder consumes relationships/sampleData (`buildPrompt` in local-provider) — if it ignores them entirely, extend the prompt to include a `Relationships:` section and up to 3 sample rows per table (compact, one line per row). Spec: with a mocked driver returning one FK row and one sample row, assert the context carries them and (if you extended buildPrompt) the prompt mentions the FK. Gates; commit — `feat(nl2sql): schema context includes foreign keys and sample rows`

---

### Task 6: Error doctor endpoint

**Files:**
- Create: `packages/backend/src/modules/nl2sql/dto/diagnose-sql.dto.ts` (`@IsString @IsNotEmpty @MaxLength(65536) sql`; `@IsString @IsNotEmpty @MaxLength(4000) errorMessage`; `@IsOptional @IsArray @IsString({each:true}) connectionIds?`)
- Modify: `packages/backend/src/modules/nl2sql/nl2sql.service.ts` (+controller): `POST /api/nl2sql/diagnose`
- Test: extend nl2sql specs (create `nl2sql.service.spec.ts` if none exists — mock settings/context-builder/aiService/validator/audit)

**Interfaces:**
- Produces: `diagnoseSql(organizationId, dto): Promise<{ diagnosis: string; suggestedSql: string | null; validationWarnings: string[] }>` — builds schema context (no sample data), prompts via `provider.generateJson` with: the failing SQL, the database error message, the schema summary, and the instruction `Respond as JSON: {"diagnosis": "...", "suggestedSql": "..." }` (suggestedSql null when no fix is confident); runs the existing `sqlValidator.validate` on any suggestedSql and surfaces warnings WITHOUT blocking; audits as feature `error_doctor`. Spec asserts: generateJson called with a prompt containing both the SQL and the error message; a suggestion failing validation still returns with `validationWarnings` non-empty; audit log called.

Gates; commit — `feat(ai): error doctor — diagnose failing SQL with suggested fix (audited)`

---

### Task 7: Suggested quality checks endpoint

**Files:**
- Create: `packages/backend/src/modules/data-quality/dto/suggest-checks.dto.ts` (`connectionId`, `schemaName`, `tableName` — same validation shape as ProfileTableDto)
- Modify: `packages/backend/src/modules/data-quality/quality-checks.service.ts` + `data-quality.controller.ts`: `POST /api/data-quality/suggest` (`@Roles` EDITORS)
- Test: extend `packages/backend/src/modules/data-quality/quality-check-dto.spec.ts` or new spec

**Interfaces:**
- Produces: `suggestChecks(organizationId, dto): Promise<Array<{ checkType; columnName?; config; rationale }>>` — loads the latest `TableProfile` via `ProfilingService.getLatestProfile` (400 if none: "Profile the table first"); prompts `generateJson` with the per-column stats and the instruction to return `{"suggestions": [{"checkType": one of not_null|unique|min_rows|max_rows|freshness, "columnName": ..., "config": {...}, "rationale": ...}]}` (NEVER custom_sql); filters the response to the 5 allowed checkTypes and known column names; audits as feature `quality_suggest`. Spec: mocked profile (one column 99.9% non-null) + mocked generateJson returning one valid and one bogus checkType → service returns only the valid one; 400 when no profile.

Gates; commit — `feat(ai): AI-suggested quality checks from table profiles`

---

### Task 8: Frontend — semantic search, error doctor, suggested checks

**Files:**
- Modify: `packages/frontend/lib/api.ts` — add namespaces: `catalogSearch.search(q)` → `GET /catalog-search?q=`, `catalogSearch.reindex()` → POST; `nl2sql.diagnose({sql, errorMessage, connectionIds})`; `dataQuality.suggestChecks({connectionId, schemaName, tableName})`; typed response interfaces for each.
- Modify: `packages/frontend/app/catalog/page.tsx` — semantic search box above the tree: input + Search button + "Reindex" (small, secondary); results list (score, content, object_key) with loading/empty states; errors→toast. OPEN THE FILE FIRST and integrate with its existing layout/styles.
- Modify: `packages/frontend/app/query/page.tsx` — inside the existing error display block, when `settings?.aiProvider` is configured, a "Fix with AI" button → calls `api.nl2sql.diagnose({ sql, errorMessage: error, connectionIds })` → renders a diagnosis panel (reuse the AI Explanation panel styling) with the diagnosis text, any validationWarnings, and — when suggestedSql present — an "Apply suggested SQL" button that `setSql(suggestedSql)` and clears the panel+error.
- Modify: `packages/frontend/app/quality/page.tsx` (or the table profile panel component — find where a profiled table is displayed) — "Suggest checks (AI)" button → renders returned suggestions as cards with rationale + an "Add" button each that calls the existing `api.dataQuality.createCheck` with the suggested fields, toasts, and refreshes the checks list. OPEN THE FILES FIRST; follow existing patterns.

Gate after all three: `pnpm build` exit 0 + `npx next lint` 0 errors (paste tails). Commit — `feat(ai): semantic catalog search, SQL error doctor, and suggested-checks UI`

---

### Task 9: Deploy to the RISA VM (controller-led ops)

**Files:** Create: `scripts/deploy-vm.sh` (documented, idempotent steps actually used) — committed for repeatability.

Steps (executed over `ssh -i ~/.ssh/datagate_vm -o IdentitiesOnly=yes risa1@10.10.94.154`; sudo uses the session password):

1. Provision: `corepack enable && corepack prepare pnpm@latest --activate` (Node 22 present); apt: `postgresql-16 postgresql-16-pgvector nginx` via pgdg repo (Ubuntu 20.04); `npm i -g pm2`.
2. DB: create role `datagate` (strong generated password) + db `datagate`; `CREATE EXTENSION vector` as postgres; also create a `demo` schema in the same DB with 2–3 small tables (e.g. `districts`, `health_facilities`, `enrollments`) + a few dozen rows for AI testing.
3. Code: `rsync` the repo (exclude node_modules/.next/dist/.git) to `~/datagate`; `pnpm install`; backend `.env` (NODE_ENV=production, real ENCRYPTION_KEY/JWT_SECRET via openssl, DB creds, CORS_ORIGIN=http://10.10.94.154, EMBEDDINGS_MODEL=bge-m3); build backend (`pnpm --filter backend build`), run migrations + seed; frontend build with `NEXT_PUBLIC_API_URL=http://10.10.94.154/api`.
4. Run: pm2 for `node dist/main.js` (backend :3001) and `next start -p 3000`; `pm2 save` + startup unit.
5. nginx site on :80 — `location /api { proxy_pass http://127.0.0.1:3001; }` and `location / { proxy_pass http://127.0.0.1:3000; }`.
6. Configure org AI settings (SQL or API): aiProvider local, endpoint `http://192.168.100.2:11434`, model `qwen3-30b-16k`, nl2sqlEnabled=true; register a connection to the local `demo` data; run profile + reindex.
7. Verify from the controller's browser: login at http://10.10.94.154/, run an NL2SQL generation, Explain, semantic search, error doctor, suggested checks.

---

### Task 10: Final verification & review

- Whole-branch review (most capable model) over `ft-phase1-unblock..HEAD`.
- Live AI smoke on http://10.10.94.154/ with screenshots.

## Out of scope (deliberate)

- vLLM migration, streaming responses, ask-a-question dashboards, PII classification, column-level lineage (AI-3 tier).
- Dockerfiles/CI (Phase 3) — pm2+nginx is the pragmatic bridge.
- Anthropic/OpenAI remote providers (still stubs; local-first by design).
