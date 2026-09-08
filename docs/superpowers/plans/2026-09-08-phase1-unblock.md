# Phase 1 Unblock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make everything that already exists reachable and functional: un-blind NL2SQL (COR-01), make Explain-SQL honor org settings and ship its UI (COR-06, PROD-09), make the disabled AI tab self-explanatory (PROD-08), surface the API-backed dashboards (PROD-01), fix the dead/orphaned navigation (PROD-05/06), and clear the hygiene debt that blocks `pnpm build` as a verification gate (OPS-13, HYG-03/04/05, COR-05).

**Architecture:** Two small backend fixes in `packages/backend` (argument order in the NL2SQL schema-context builder; provider `explainSql` signature threading settings). Everything else is `packages/frontend` (Next.js 14 App Router): a hygiene/lint task first so `pnpm build` turns green and gates the UI tasks that follow.

**Tech Stack:** NestJS 11 + Jest (backend), Next.js 14 + SWR + Tailwind + lucide-react (frontend), pnpm workspaces.

**Spec:** `docs/improvement-review.html` — gap register items COR-01, COR-05, COR-06, PROD-01, PROD-05, PROD-06, PROD-08, PROD-09, HYG-03/04/05, OPS-13.

## Global Constraints

- All work on branch `ft-phase1-unblock` (created off `ft-phase0-security`).
- Backend commands run from `/Users/brucehigiro/Documents/development/govdatahub/packages/backend`; frontend commands from `/Users/brucehigiro/Documents/development/govdatahub/packages/frontend`.
- Backend tests: `pnpm test -- --runTestsByPath <spec path>`; backend gate: full `pnpm test` + `npx tsc --noEmit -p tsconfig.json`.
- Frontend gate (available from Task 3 onward): `pnpm build` must pass and `npx next lint` must report zero errors.
- Frontend style: this codebase uses hex-literal Tailwind classes (`text-[#1a1a1a]`, `border-[#e8e8e8]`) on the older pages — match the file you are editing; do not introduce new design tokens.
- The dashboards feature has TWO `Dashboard` types: `components/DashboardBuilder/types.ts` (localStorage shape) and `lib/api.ts` (server shape). Never mix them; alias the api one on import (`type Dashboard as SavedDashboard`).
- Commit after every task with the message given in the task's final step + blank line + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Do not push.

---

### Task 0: Branch

**Files:** none

- [ ] **Step 1: Create the branch**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git checkout ft-phase0-security && git checkout -b ft-phase1-unblock
```

---

### Task 1: Un-blind NL2SQL — fix the getColumns argument order (COR-01)

**Files:**
- Modify: `packages/backend/src/modules/nl2sql/schema-context-builder.service.ts:111-115, 170-174`
- Test: `packages/backend/src/modules/nl2sql/schema-context-builder.service.spec.ts` (create)

**Interfaces:**
- Consumes: `SchemaService.getColumns(connectionId: string, organizationId: string, table: string, schema?: string)` (`src/modules/schema/schema.service.ts:33`).
- Produces: schema contexts whose tables carry real columns; the AI provider stops receiving empty schemas.

- [ ] **Step 1: Write the failing test**

Open `schema-context-builder.service.ts` and note its constructor dependencies (it injects at least `SchemaService` and `ConnectionsService` — mirror whatever the real list is). Also open `src/modules/schema/schema.service.ts` and check the exact RETURN SHAPES of `getTables` and `getColumns` (array vs `{ tables }` / `{ columns }` wrapper) so the mocks below return the real shape. Then create `schema-context-builder.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { SchemaContextBuilderService } from './schema-context-builder.service';
import { SchemaService } from '../schema/schema.service';
import { ConnectionsService } from '../connections/connections.service';

describe('SchemaContextBuilderService (COR-01)', () => {
  let service: SchemaContextBuilderService;
  const schemaService = {
    getSchemas: jest.fn(),
    getTables: jest.fn(),
    getColumns: jest.fn(),
  };
  const connectionsService = { findAll: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SchemaContextBuilderService,
        { provide: SchemaService, useValue: schemaService },
        { provide: ConnectionsService, useValue: connectionsService },
        // add any further constructor deps the real class declares, stubbed
      ],
    }).compile();
    service = module.get(SchemaContextBuilderService);
  });

  it('passes organizationId (not the schema name) to getColumns and populates columns', async () => {
    connectionsService.findAll.mockResolvedValue([
      { id: 'conn-1', name: 'main-db', type: 'postgresql' },
    ]);
    // Use the REAL return shapes observed in schema.service.ts:
    schemaService.getTables.mockResolvedValue(/* e.g. */ [
      { name: 'users', schema: 'public' },
    ] as any);
    schemaService.getColumns.mockResolvedValue(/* e.g. */ [
      { name: 'id', type: 'uuid', nullable: false },
      { name: 'email', type: 'text', nullable: false },
    ] as any);

    const ctx = await service.buildContext('org-1', undefined, {
      includeSampleData: false,
      maxTablesPerConnection: 20,
      maxColumnsPerTable: 50,
    });

    expect(schemaService.getColumns).toHaveBeenCalledWith(
      'conn-1',
      'org-1',
      'users',
      'public',
    );
    const table = ctx.connections[0].tables[0];
    expect(table.columns.length).toBeGreaterThan(0);
  });
});
```

Adapt mock shapes/option names to the real code (the file is the authority) but keep the two assertions exactly: the four-argument order `('conn-1', 'org-1', 'users', 'public')`, and non-empty `columns`.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/nl2sql/schema-context-builder.service.spec.ts
```

Expected: FAIL — `getColumns` was called with `('conn-1', 'public', 'users')` (schema in the org slot), and/or columns are empty because the swallowed error path ran.

- [ ] **Step 3: Fix both call sites**

At lines ~111–115:

```typescript
        const columnsResponse = await this.schemaService.getColumns(
          connection.id,
          organizationId,
          table.name,
          table.schema
        );
```

At lines ~170–174 (same fix; the surrounding method has `organizationId` in scope — if it doesn't, thread it through from the caller, matching how the first site's enclosing method receives it):

```typescript
      const columnsResponse = await this.schemaService.getColumns(
        connectionId,
        organizationId,
        table.name,
        table.schema
      );
```

Also: the `catch` at ~line 130 currently swallows these failures silently — add a `this.logger.warn(\`Failed to load columns for ${table.schema}.${table.name}: ${error.message}\`)` inside it so this class of bug can never hide again. Do not otherwise change the catch behavior.

- [ ] **Step 4: Run test to verify it passes, then the backend gate**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/nl2sql/schema-context-builder.service.spec.ts && pnpm test && npx tsc --noEmit -p tsconfig.json
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/modules/nl2sql/
git commit -m "fix(nl2sql): pass organizationId to getColumns — schema context no longer empty (COR-01)"
```

---

### Task 2: explainSql honors the configured provider settings (COR-06)

**Files:**
- Modify: `packages/backend/src/modules/ai/providers/base-provider.interface.ts:82`
- Modify: `packages/backend/src/modules/ai/providers/local-provider.service.ts:66-87`
- Modify: `packages/backend/src/modules/ai/providers/custom-provider.service.ts:78-80`
- Modify: `packages/backend/src/modules/nl2sql/nl2sql.service.ts:200`
- Test: `packages/backend/src/modules/ai/providers/local-provider.service.spec.ts` (create)

**Interfaces:**
- Produces: `IAiProvider.explainSql(sql: string, schemaContext: SchemaContext, settings: OrganizationSettings): Promise<string>` — third parameter required. Local provider uses `settings.aiApiEndpoint`/`settings.aiModel` (same defaults and Ollama-vs-OpenAI branch as `generateSql`) and PROPAGATES errors (no more canned `'Unable to explain SQL at this time.'` — the service's existing catch at `nl2sql.service.ts:201-206` turns failures into a `BadRequestException`).

- [ ] **Step 1: Write the failing test**

Open `local-provider.service.ts` first and check what `callOllamaApi(endpoint, model, prompt, settings)` returns (raw text vs response object) — the new `explainSql` should reuse those private helpers if their return is directly usable, otherwise make the axios call inline as below. Create `local-provider.service.spec.ts`:

```typescript
import axios from 'axios';
import { LocalProviderService } from './local-provider.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LocalProviderService.explainSql (COR-06)', () => {
  let provider: LocalProviderService;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LocalProviderService();
  });

  it('uses the org-configured endpoint and model, not hardcoded defaults', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { response: 'This query selects all users.' },
    });

    const settings = {
      aiApiEndpoint: 'http://gpu-box:11434',
      aiModel: 'qwen2.5-coder',
    } as any;

    const result = await provider.explainSql(
      'SELECT * FROM users',
      { connections: [] } as any,
      settings,
    );

    expect(result).toBe('This query selects all users.');
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toContain('http://gpu-box:11434');
    expect((body as any).model).toBe('qwen2.5-coder');
  });

  it('propagates provider errors instead of returning a canned string', async () => {
    mockedAxios.post.mockRejectedValue(new Error('connection refused'));
    await expect(
      provider.explainSql('SELECT 1', { connections: [] } as any, {
        aiApiEndpoint: 'http://gpu-box:11434',
        aiModel: 'qwen2.5-coder',
      } as any),
    ).rejects.toThrow('connection refused');
  });
});
```

(If `LocalProviderService`'s constructor takes dependencies, stub them; adapt the mocked response shape to whatever the Ollama call path actually reads — the first `it` may need `data.response` vs `data.choices[0]...` depending on the branch taken by the endpoint heuristic. `http://gpu-box:11434` contains `11434` so it takes the Ollama branch.)

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/ai/providers/local-provider.service.spec.ts
```

Expected: FAIL — current `explainSql(sql, schemaContext)` takes 2 params, hits `DEFAULT_OLLAMA_ENDPOINT` with model `'llama2'`, and swallows errors.

- [ ] **Step 3: Implement**

`base-provider.interface.ts:82`:

```typescript
  explainSql(sql: string, schemaContext: SchemaContext, settings: OrganizationSettings): Promise<string>;
```

(add the `OrganizationSettings` import if not present — `generateSql`'s `NL2SqlRequest` already references it in this file).

`local-provider.service.ts` — replace the whole `explainSql` method:

```typescript
  async explainSql(
    sql: string,
    schemaContext: SchemaContext,
    settings: OrganizationSettings,
  ): Promise<string> {
    const endpoint = settings.aiApiEndpoint || this.DEFAULT_OLLAMA_ENDPOINT;
    const model = settings.aiModel || 'codellama';
    const prompt = `Explain what this SQL query does in simple terms:\n\n${sql}`;

    this.logger.log(`Explaining SQL with local model: ${model} at ${endpoint}`);

    const isOllama = endpoint.includes('11434') || !endpoint.includes('/v1');
    if (isOllama) {
      const response = await axios.post(
        `${endpoint}/api/generate`,
        { model, prompt, stream: false },
        { timeout: 30000 },
      );
      return response.data.response;
    }
    const response = await axios.post(
      `${endpoint}/chat/completions`,
      { model, messages: [{ role: 'user', content: prompt }] },
      { timeout: 30000, headers: settings.aiApiKey ? { Authorization: `Bearer ${settings.aiApiKey}` } : undefined },
    );
    return response.data.choices[0].message.content;
  }
```

Before writing the OpenAI-compatible branch, compare with the file's existing `callOpenAICompatibleApi` — reuse its exact URL path and payload shape if they differ from the above (the file is the authority; the non-negotiables are: configured endpoint+model used, errors propagate, no canned fallback string).

`custom-provider.service.ts:78` — update the signature only, keep the honest stub body:

```typescript
  async explainSql(sql: string, schemaContext: SchemaContext, settings: OrganizationSettings): Promise<string> {
    return `Custom provider does not support SQL explanations. Query: ${sql.substring(0, 50)}...`;
  }
```

(add the `OrganizationSettings` import if missing).

`nl2sql.service.ts:200`:

```typescript
      explanation = await provider.explainSql(sql, schemaContext, settings);
```

- [ ] **Step 4: Run tests + backend gate**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/ai/providers/local-provider.service.spec.ts && pnpm test && npx tsc --noEmit -p tsconfig.json
```

Expected: all green (tsc will surface any provider implementing the old 2-arg signature — fix each).

- [ ] **Step 5: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/modules/ai/ packages/backend/src/modules/nl2sql/nl2sql.service.ts
git commit -m "fix(ai): explainSql uses configured endpoint/model and propagates errors (COR-06)"
```

---

### Task 3: Frontend hygiene — make `pnpm build` a usable gate (OPS-13, HYG-03/04/05, COR-05)

**Files (all under `packages/frontend`):**
- Delete: `app/temp.html`, `app/ingestion/page-mockup.tsx`, `package-lock.json` (all three are git-tracked), plus untracked `tsconfig.tsbuildinfo` from disk
- Modify: `app/dashboards/[id]/page.tsx:8` and `components/DashboardBuilder/DashboardGrid.tsx:8` (remove the `react-resizable/css/styles.css` imports — the package is not installed anywhere on disk, and `app/globals.css:126-140` already defines the `.react-resizable-handle*` styles)
- Modify: `lib/api.ts:221-225` (delete the dead `getTablesMetadata` method — zero callers, and its backend route does not exist)
- Modify (escape fixes, `react/no-unescaped-entities`): `app/ingestion/page.tsx:381`, `app/login/page.tsx:129`, `components/DashboardBuilder/SavedQueryWidget.tsx:112`, `components/DataIngestion/ColumnMapping.tsx:176`, `components/dashboard/CatalogIntegrationTab.tsx:246`, `components/quality/CheckRunHistory.tsx:46`

**Interfaces:**
- Produces: `pnpm build` passes and `npx next lint` reports zero errors — the gate every later frontend task relies on.

- [ ] **Step 1: Delete dead files**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub/packages/frontend
git rm app/temp.html app/ingestion/page-mockup.tsx package-lock.json
rm -f tsconfig.tsbuildinfo
```

- [ ] **Step 2: Remove the phantom CSS imports**

In `app/dashboards/[id]/page.tsx` and `components/DashboardBuilder/DashboardGrid.tsx`, delete the line:

```tsx
import 'react-resizable/css/styles.css';
```

(keep the `react-grid-layout/css/styles.css` import — that package is installed).

- [ ] **Step 3: Delete the dead API method**

In `lib/api.ts`, remove the `getTablesMetadata` entry (lines ~221–225) from the `crossQuery` namespace, including its comma. Verify no callers:

```bash
grep -rn "getTablesMetadata" app components lib
```

Expected: zero hits after the edit.

- [ ] **Step 4: Fix the six unescaped-entity errors**

Replace the literal quotes/apostrophes inside JSX text with entities (only inside JSX text nodes — not in attributes or JS strings):

- `app/ingestion/page.tsx:381`: `doesn't` → `doesn&apos;t`
- `app/login/page.tsx:129`: `Don't` → `Don&apos;t`
- `components/DashboardBuilder/SavedQueryWidget.tsx:112`: `Chart type "{type}" is not yet supported` → `Chart type &quot;{type}&quot; is not yet supported`
- `components/DataIngestion/ColumnMapping.tsx:176`: `Use "Auto Map" to` → `Use &quot;Auto Map&quot; to`
- `components/dashboard/CatalogIntegrationTab.tsx:246`: `What's pushed` → `What&apos;s pushed`
- `components/quality/CheckRunHistory.tsx:46`: `click "Run" to execute` → `click &quot;Run&quot; to execute`

- [ ] **Step 5: Verify the gate turns green**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub/packages/frontend
npx next lint 2>&1 | tail -5
pnpm build 2>&1 | tail -15
```

Expected: lint reports **0 errors** (warnings acceptable); build completes successfully. If build surfaces further pre-existing errors, fix only what blocks the build and list each in your report.

- [ ] **Step 6: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add -A packages/frontend
git commit -m "chore(frontend): delete dead files, phantom imports, dead API method; fix lint errors — pnpm build green (OPS-13, HYG-03/04/05, COR-05)"
```

---

### Task 4: Explain-SQL button + discoverable AI tab (PROD-09, PROD-08)

**Files:**
- Modify: `packages/frontend/app/query/page.tsx`
- Modify: `packages/frontend/lib/api.ts:468` (type the explain response)

**Interfaces:**
- Consumes: `api.nl2sql.explainSql({ sql, connectionIds })` → `{ explanation: string; tables: string[]; operations: string[] }` (backend `ExplainSqlResponseDto`).
- Produces: an "Explain" button in the SQL toolbar; an explanation panel under the editor; a visible "Enable AI in Settings →" link next to the disabled Natural Language tab.

- [ ] **Step 1: Type the API response**

In `lib/api.ts`, change the `explainSql` signature (line ~468):

```typescript
    explainSql: (data: { sql: string; connectionIds?: string[] }): Promise<ExplainSqlResponse> =>
```

and add next to the other exported types (in the types section at the bottom):

```typescript
export interface ExplainSqlResponse {
  explanation: string;
  tables: string[];
  operations: string[];
}
```

- [ ] **Step 2: Add state + handler in `app/query/page.tsx`**

Next to the existing NL2SQL state block (~line 49):

```tsx
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
```

Add the handler after `handleGenerateSql` (~line 242):

```tsx
  const handleExplainSql = async () => {
    if (!sql.trim()) return;
    setIsExplaining(true);
    setExplanation(null);
    try {
      const connectionIds =
        dataSource === 'connections' && selectedConnectionId
          ? [selectedConnectionId]
          : undefined;
      const result = await api.nl2sql.explainSql({ sql, connectionIds });
      setExplanation(result.explanation);
    } catch (err: any) {
      showToast(`Explain failed: ${err.message || 'AI provider error'}`, 'error');
    } finally {
      setIsExplaining(false);
    }
  };
```

- [ ] **Step 3: Add the Explain button to the toolbar**

In the toolbar (~line 442), the right side currently holds the single Run/Generate `<Button>`. Wrap it so the SQL mode gets a second, secondary button BEFORE the primary one:

```tsx
              <div className="flex items-center gap-2">
                {editorMode === 'sql' && (
                  <Button
                    onClick={handleExplainSql}
                    disabled={isExplaining || !sql.trim() || isMongoDB}
                    variant="outline"
                    className="gap-2"
                    title={isMongoDB ? 'Explain is not available for MongoDB queries' : 'Explain this query with AI'}
                  >
                    <Sparkles className="h-4 w-4" />
                    {isExplaining ? 'Explaining…' : 'Explain'}
                  </Button>
                )}
                <Button
                  onClick={editorMode === 'sql' ? handleExecute : handleGenerateSql}
                  ...existing props unchanged...
                </Button>
              </div>
```

(`Sparkles` is already imported; `isMongoDB` already exists in the component — verify its name by searching the file, it is referenced at line ~482.)

- [ ] **Step 4: Render the explanation panel**

Inside the SQL editor branch (after the Tip callout `</div>` at ~line 494, still inside the `<>...</>` fragment):

```tsx
                  {explanation && (
                    <div className="mt-4 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-[#1e40af]">AI Explanation</p>
                        <button
                          onClick={() => setExplanation(null)}
                          className="text-xs text-[#1e40af] underline underline-offset-2"
                        >
                          Dismiss
                        </button>
                      </div>
                      <p className="text-xs text-[#1e40af] whitespace-pre-wrap">{explanation}</p>
                    </div>
                  )}
```

- [ ] **Step 5: Make the disabled NL tab actionable**

In the tab nav (after the Natural Language `</button>`, ~line 424), add:

```tsx
              {!settings?.nl2sqlEnabled && (
                <Link
                  href="/settings"
                  className="flex items-center px-3 py-3 text-xs text-[#2563eb] underline underline-offset-2"
                >
                  Enable AI in Settings →
                </Link>
              )}
```

Add `import Link from 'next/link';` to the imports.

- [ ] **Step 6: Verify**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub/packages/frontend && pnpm build 2>&1 | tail -5 && npx next lint 2>&1 | tail -3
```

Expected: build passes, 0 lint errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/frontend/app/query/page.tsx packages/frontend/lib/api.ts
git commit -m "feat(query): Explain-SQL button + explanation panel; link disabled AI tab to settings (PROD-08, PROD-09)"
```

---

### Task 5: Surface the API-backed dashboards (PROD-01)

**Files:**
- Modify: `packages/frontend/app/dashboards/page.tsx`
- Modify: `packages/frontend/app/dashboards/[id]/page.tsx`

**Interfaces:**
- Consumes: `api.dashboards.list(): Promise<Dashboard[]>` (server shape, `lib/api.ts:657`), `CardSkeleton` from `components/ui/skeleton.tsx`.
- Produces: a "Saved Dashboards" section on `/dashboards` linking each server dashboard to `/dashboards/[id]`; a back-link from the viewer. (Full builder/viewer reconciliation is PROD-02 — out of scope.)

- [ ] **Step 1: Add the saved-dashboards section to `app/dashboards/page.tsx`**

Add imports:

```tsx
import useSWR from 'swr';
import Link from 'next/link';
import { api, type Dashboard as SavedDashboard } from '@/lib/api';
import { CardSkeleton } from '@/components/ui/skeleton';
```

Inside the component, next to the other state (~line 26):

```tsx
  const { data: savedDashboards, isLoading: savedLoading } = useSWR<SavedDashboard[]>(
    'saved-dashboards',
    () => api.dashboards.list(),
  );
```

Between `<PageHeader ... />` (~line 168) and the `{/* Toolbar */}` div, insert:

```tsx
      {/* Saved dashboards (server-side, filterable) */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#1a1a1a]">Saved Dashboards</h2>
          <span className="text-xs text-[#aaaaaa]">
            {savedDashboards?.length ?? 0} on server
          </span>
        </div>
        {savedLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : !savedDashboards || savedDashboards.length === 0 ? (
          <p className="text-sm text-[#aaaaaa]">
            No saved dashboards yet. Dashboards saved to the server appear here with live data and filters.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {savedDashboards.map((d) => (
              <Link
                key={d.id}
                href={`/dashboards/${d.id}`}
                className="block bg-white rounded-xl border border-[#e8e8e8] shadow-card p-4 hover:border-[#60a5fa] transition-colors"
              >
                <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-1">{d.name}</h3>
                {d.description && (
                  <p className="text-xs text-[#aaaaaa] line-clamp-2 mb-2">{d.description}</p>
                )}
                <p className="text-xs text-[#aaaaaa]">
                  {d.widgets?.length ?? 0} widgets · {d.filters?.length ?? 0} filters
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
```

Note: this page already imports a `Dashboard` type from `@/components/DashboardBuilder/types` — that import stays; the alias avoids the collision (Global Constraints).

- [ ] **Step 2: Add a back-link to the viewer**

In `app/dashboards/[id]/page.tsx`, inside `DashboardView`'s outer `<div className="p-6">`, add as the first child (above `<header>`):

```tsx
      <Link
        href="/dashboards"
        className="inline-block mb-3 text-xs text-muted-foreground underline underline-offset-2"
      >
        ← All dashboards
      </Link>
```

with `import Link from 'next/link';` added to the imports. (This file uses semantic tokens — `text-muted-foreground` is correct here, per the file-local style rule.)

- [ ] **Step 3: Verify**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub/packages/frontend && pnpm build 2>&1 | tail -5
```

Expected: build passes.

- [ ] **Step 4: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/frontend/app/dashboards/
git commit -m "feat(dashboards): surface server-saved dashboards with links to the filterable viewer (PROD-01)"
```

---

### Task 6: Fix navigation — catalog, analytics, support (PROD-05, PROD-06)

**Files:**
- Modify: `packages/frontend/components/Sidebar.tsx`
- Create: `packages/frontend/app/support/page.tsx`

**Interfaces:**
- Produces: `/catalog` and `/dashboard-analytics` reachable from the sidebar; `/support` is a real page instead of a 404.

- [ ] **Step 1: Add the two orphaned routes to `navSections`**

In `components/Sidebar.tsx`: add `Library` to the lucide-react import list, then:

DATA SOURCES section — append after the ingestion item:

```tsx
        { id: 'catalog', label: 'Data Catalog', href: '/catalog', icon: <Library /> },
```

ANALYTICS section — append after the dashboards item (this also gives the already-imported-but-unused `BarChart3` a purpose):

```tsx
        { id: 'dashboard-analytics', label: 'Usage Analytics', href: '/dashboard-analytics', icon: <BarChart3 /> },
```

(Leave the commented-out `/charts` item as-is.)

- [ ] **Step 2: Create `app/support/page.tsx`**

```tsx
'use client';

import { PageHeader } from '@/components/ui/page-header';
import { HelpCircle, BookOpen, FileCode2, Bug } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const resources = [
  {
    icon: FileCode2,
    title: 'API Documentation',
    description: 'Interactive Swagger reference for every DataGate API endpoint.',
    href: `${API_BASE}/api/docs`,
    external: true,
  },
  {
    icon: BookOpen,
    title: 'Product Guides',
    description: 'Reference docs for dashboards, charts, and the visualization roadmap (docs/ in the repository).',
    href: 'https://github.com/higirobruce/govdatahub/tree/main/docs',
    external: true,
  },
  {
    icon: Bug,
    title: 'Report an Issue',
    description: 'Found a bug or have a feature request? Open an issue on the repository.',
    href: 'https://github.com/higirobruce/govdatahub/issues',
    external: true,
  },
];

export default function SupportPage() {
  return (
    <div className="w-full max-w-4xl">
      <PageHeader
        title="Support"
        subtitle="Documentation and help resources for DataGate"
        icon={HelpCircle}
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {resources.map(({ icon: Icon, title, description, href, external }) => (
          <a
            key={title}
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className="block bg-white rounded-xl border border-[#e8e8e8] shadow-card p-5 hover:border-[#60a5fa] transition-colors"
          >
            <div className="w-10 h-10 bg-[#eff6ff] rounded-lg flex items-center justify-center mb-3">
              <Icon className="w-5 h-5 text-[#60a5fa]" />
            </div>
            <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-1">{title}</h3>
            <p className="text-xs text-[#aaaaaa]">{description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub/packages/frontend && pnpm build 2>&1 | tail -5 && npx next lint 2>&1 | tail -3
```

Expected: build passes, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/frontend/components/Sidebar.tsx packages/frontend/app/support/
git commit -m "feat(nav): surface catalog + usage analytics in sidebar; real /support page (PROD-05, PROD-06)"
```

---

### Task 7: Final verification (controller-run)

**Files:** none

- [ ] **Step 1: Full gates**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub/packages/backend && pnpm test && npx tsc --noEmit -p tsconfig.json
cd ../frontend && pnpm build && npx next lint
```

Expected: everything green, 0 lint errors.

- [ ] **Step 2: Live smoke (controller, with both dev servers running)**

Boot backend+frontend, then verify in a browser: sidebar shows Data Catalog + Usage Analytics; `/support` renders; `/dashboards` shows the Saved Dashboards section; the query page shows the Explain button and the "Enable AI in Settings →" link when NL2SQL is off. Screenshot each.

---

## Out of scope for Phase 1 (deliberate)

- PROD-02 (full reconciliation of the two dashboard implementations) — the localStorage builder stays; this phase only surfaces the API dashboards beside it.
- M1-04…08 widgets, schema-aware autocomplete, semantic search — Phase 2 (AI foundation) per the Improvement Review roadmap.
- The shares-list `hasApiKey` frontend follow-up from Phase 0.
