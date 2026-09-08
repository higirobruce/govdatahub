# Phase 0 Security Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 13 critical/high security findings (SEC-01…13) and 2 validation-correctness findings (COR-03/04) from the Improvement Review so DataGate can safely face a shared network.

**Architecture:** NestJS 11 backend (`packages/backend`). Fixes fall into four groups: (1) authentication/authorization — global guards, real auth on ingestion, RBAC via the existing-but-unused `RolesGuard`; (2) injection/SSRF — URL guard, identifier validation, removing raw SQL interpolation; (3) secrets at rest — hash share tokens/API keys, stop persisting import auth secrets; (4) config/DTO hardening — helmet, prod fail-fast, class-validator on dead DTOs.

**Tech Stack:** NestJS 11, TypeORM 0.3, Jest (colocated `*.spec.ts`), class-validator, pnpm workspaces.

**Spec:** `docs/improvement-review.html` — section "Gap register" (SEC-01…SEC-13, COR-03, COR-04). Each task names the finding(s) it closes.

## Global Constraints

- All work on branch `ft-phase0-security` (created off `ft-m1-03-cross-filter-on-click`).
- Backend working dir for all commands: `/Users/brucehigiro/Documents/development/govdatahub/packages/backend`.
- Run tests with `pnpm test -- --runTestsByPath <spec path>` from `packages/backend`.
- Never log or return decrypted credentials or plaintext tokens except the single create/regenerate response (Task 9).
- `main.ts` global ValidationPipe uses `whitelist: true, forbidNonWhitelisted: true, transform: true` — every request DTO property MUST carry a class-validator decorator or requests 400.
- The JWT strategy returns the full `User` entity: use `user.id` / `user.organizationId` (never `user.userId`).
- Existing migration numbering: last is `1711000000006-AddDashboardFilters.ts`; new migrations continue from `1711000000007`.
- Commit after every task with the message given in the task's final step. Do not push.

---

### Task 0: Branch + install + baseline

**Files:** none created (environment setup)

- [ ] **Step 1: Create the branch**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git checkout -b ft-phase0-security
```

- [ ] **Step 2: Install dependencies (node_modules is currently absent)**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
pnpm install
```

Expected: completes without errors (lockfile is present; ignore warnings).

- [ ] **Step 3: Baseline test run**

```bash
cd packages/backend && pnpm test
```

Expected: existing suites pass (`app.controller.spec.ts`, `dashboards.service.spec.ts`, `query-template.service.spec.ts`, `saved-queries.service.spec.ts`). Record any pre-existing failure verbatim — do not fix it in this task, but note it so later tasks aren't blamed for it.

---

### Task 1: Global guards — JWT everywhere, throttling everywhere, roles where declared (SEC-07, foundation for SEC-01/SEC-10)

**Files:**
- Modify: `src/app.module.ts`
- Modify: `src/app.controller.ts`
- Modify: `src/modules/dashboard/public-dataset.controller.ts`
- Test: `src/app.guards.spec.ts` (create)

**Interfaces:**
- Consumes: `JwtAuthGuard` (`src/modules/auth/guards/jwt-auth.guard.ts` — already honors `@Public()` via `IS_PUBLIC_KEY`), `RolesGuard` (`src/modules/auth/guards/roles.guard.ts` — no-op when no `@Roles` metadata), `Public` decorator (`src/modules/auth/decorators/public.decorator.ts`).
- Produces: every route requires a JWT unless decorated `@Public()`; `@Roles(...)` is now enforced anywhere it appears (Task 11 adds the annotations); global throttling applies to all routes including `/api/public/*`.

- [ ] **Step 1: Write the failing test**

Create `src/app.guards.spec.ts`:

```typescript
import { APP_GUARD } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './modules/auth/decorators/public.decorator';
import { PublicDatasetController } from './modules/dashboard/public-dataset.controller';
import { AppController } from './app.controller';

describe('Global guard wiring', () => {
  it('app.module registers JwtAuthGuard, RolesGuard and ThrottlerGuard as APP_GUARDs', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AppModule } = require('./app.module');
    const providers = Reflect.getMetadata('providers', AppModule) ?? [];
    const appGuards = providers.filter(
      (p: any) => p && typeof p === 'object' && p.provide === APP_GUARD,
    );
    const guardNames = appGuards.map((p: any) => p.useClass?.name);
    expect(guardNames).toContain('JwtAuthGuard');
    expect(guardNames).toContain('RolesGuard');
    expect(guardNames).toContain('ThrottlerGuard');
  });

  it('PublicDatasetController is marked @Public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicDatasetController)).toBe(true);
  });

  it('AppController root handler is marked @Public', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, AppController.prototype.getHello),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/app.guards.spec.ts
```

Expected: FAIL — no APP_GUARD providers found, no `IS_PUBLIC_KEY` metadata.

- [ ] **Step 3: Register the global guards in `src/app.module.ts`**

Add imports at the top:

```typescript
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
```

(`ThrottlerModule` is already imported; add `ThrottlerGuard` to that import line instead of a new one.)

Replace the providers array (`providers: [AppService],`) with:

```typescript
  providers: [
    AppService,
    // Order matters: authenticate first, then role-check, then throttle.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
```

- [ ] **Step 4: Mark the public surfaces `@Public()`**

In `src/app.controller.ts`, import and decorate the root handler (the handler is named `getHello`; confirm by opening the file — if it has a different name, decorate that handler and update the test):

```typescript
import { Public } from './modules/auth/decorators/public.decorator';
// ...
  @Public()
  @Get()
  getHello(): string {
```

In `src/modules/dashboard/public-dataset.controller.ts`, add a class-level `@Public()` plus explicit tighter throttling (this controller was completely unguarded — SEC-07):

```typescript
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
// ...
@Public()
@Throttle({ default: { ttl: 60000, limit: 30 } })
@ApiTags('public')
@Controller('public')
export class PublicDatasetController {
```

- [ ] **Step 5: Check for newly-broken public routes**

The JWT strategy's login/register are already `@Public()`. Search for any other controller that must stay unauthenticated:

```bash
cd packages/backend && grep -rn "@Controller(" src --include="*.ts" | grep -v spec
```

Review the list: every controller except `auth` (login/register handlers), `app.controller.ts` root, and `public-dataset.controller.ts` already uses `@UseGuards(JwtAuthGuard)` or is intended to (ingestion — fixed in Task 2). No other route should be `@Public`.

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/app.guards.spec.ts
```

Expected: PASS (3/3).

- [ ] **Step 7: Run the full suite to catch regressions**

```bash
cd packages/backend && pnpm test
```

Expected: all suites pass (modulo any pre-existing failure recorded in Task 0).

- [ ] **Step 8: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/app.module.ts packages/backend/src/app.controller.ts packages/backend/src/modules/dashboard/public-dataset.controller.ts packages/backend/src/app.guards.spec.ts
git commit -m "fix(security): register JwtAuthGuard/RolesGuard/ThrottlerGuard globally with @Public opt-out (SEC-07)"
```

---

### Task 2: Real authentication on the ingestion API (SEC-01)

**Files:**
- Modify: `src/modules/ingestion/ingestion.controller.ts`
- Test: `src/modules/ingestion/ingestion.controller.spec.ts` (create)

**Interfaces:**
- Consumes: `CurrentUser` decorator from `../auth/decorators/current-user.decorator`, `User` entity from `../../database/entities`, global `JwtAuthGuard` from Task 1.
- Produces: every ingestion handler derives `organizationId` from the authenticated user; the fake decorator, the local `interface User`, and all 11 hardcoded `'8498b154-4864-433b-8573-93ae7d2ee200'` fallbacks are gone.

- [ ] **Step 1: Write the failing test**

Create `src/modules/ingestion/ingestion.controller.spec.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('IngestionController security (SEC-01)', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'ingestion.controller.ts'),
    'utf8',
  );

  it('contains no hardcoded organization UUID fallback', () => {
    expect(source).not.toContain('8498b154-4864-433b-8573-93ae7d2ee200');
  });

  it('uses the real CurrentUser decorator, not a placeholder', () => {
    expect(source).toContain(
      "from '../auth/decorators/current-user.decorator'",
    );
    expect(source).not.toContain('Placeholder');
  });

  it('declares user as required on every handler (no `user?: User`)', () => {
    expect(source).not.toMatch(/user\?\s*:\s*User/);
  });
});
```

(A source-level test is deliberate here: the bug was a *fake decorator that type-checks fine*, so a compile-level test can't catch a regression. String assertions can.)

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/ingestion/ingestion.controller.spec.ts
```

Expected: FAIL on all three assertions.

- [ ] **Step 3: Rewrite the controller's auth plumbing**

In `src/modules/ingestion/ingestion.controller.ts`:

1. Delete lines 23–34 (the comment, the fake `const CurrentUser = () => {...}` decorator, and the local `interface User`).
2. Add real imports:

```typescript
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../../database/entities';
```

3. Change the class guard from `@UseGuards(ThrottlerGuard)` to `@UseGuards(JwtAuthGuard, ThrottlerGuard)` (explicit even though Task 1 made it global — matches every other controller's style).
4. In **every** handler (`preview`, `upload`, `importFromUrl`, `importFromDatabase`, `getJob`, `listJobs`, `deleteJob`, `listStagedData`, `getStagedData`, `getStagedDataByJobId`, `deleteStagedData`):
   - change the parameter `@CurrentUser() user?: User` to `@CurrentUser() user: User` (required, keep it as the last parameter);
   - replace `const organizationId = user?.organizationId || '8498b154-4864-433b-8573-93ae7d2ee200';` with `const organizationId = user.organizationId;`.

Note for `listJobs` and `listStagedData`: optional `@Query` params precede the user param — a required param after optional ones is fine for Nest decorators (they are positional annotations, not JS default-arg semantics), so keep the order as-is.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/ingestion/ingestion.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Type-check the workspace**

```bash
cd packages/backend && npx tsc --noEmit -p tsconfig.json
```

Expected: no new errors (pre-existing errors, if any, were recorded in Task 0).

- [ ] **Step 6: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/modules/ingestion/ingestion.controller.ts packages/backend/src/modules/ingestion/ingestion.controller.spec.ts
git commit -m "fix(security): require real JWT auth on all ingestion endpoints, remove hardcoded org UUID (SEC-01)"
```

---

### Task 3: SSRF protection on URL import (SEC-02)

**Files:**
- Create: `src/modules/ingestion/importers/url-guard.ts`
- Modify: `src/modules/ingestion/importers/url-importer.service.ts`
- Test: `src/modules/ingestion/importers/url-guard.spec.ts` (create)

**Interfaces:**
- Produces: `assertSafeUrl(rawUrl: string, resolve?): Promise<void>` — throws `BadRequestException` for non-http(s) protocols, blocked hostnames, and URLs whose literal or DNS-resolved address is private/loopback/link-local; `isPrivateIp(ip: string): boolean`. `UrlImporterService` calls `assertSafeUrl` before download and no longer follows redirects.

- [ ] **Step 1: Write the failing test**

Create `src/modules/ingestion/importers/url-guard.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { assertSafeUrl, isPrivateIp } from './url-guard';

const publicResolver = async () => [{ address: '93.184.216.34' }];
const loopbackResolver = async () => [{ address: '127.0.0.1' }];

describe('isPrivateIp', () => {
  it.each([
    '127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::',
    'fe80::1', 'fd00::1', '::ffff:127.0.0.1',
  ])('flags %s as private', (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(['93.184.216.34', '8.8.8.8', '2606:4700::6810:84e5'])(
    'allows public %s',
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    },
  );

  it('treats malformed addresses as private (fail closed)', () => {
    expect(isPrivateIp('999.1.1.1')).toBe(true);
  });
});

describe('assertSafeUrl', () => {
  it('rejects non-http(s) protocols', async () => {
    await expect(assertSafeUrl('ftp://example.com/x.csv')).rejects.toThrow(
      BadRequestException,
    );
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects blocked hostnames without resolving', async () => {
    await expect(assertSafeUrl('http://localhost/x.csv')).rejects.toThrow();
    await expect(
      assertSafeUrl('http://metadata.google.internal/computeMetadata'),
    ).rejects.toThrow();
    await expect(assertSafeUrl('http://foo.internal/x')).rejects.toThrow();
  });

  it('rejects literal private IPs', async () => {
    await expect(assertSafeUrl('http://169.254.169.254/latest')).rejects.toThrow();
    await expect(assertSafeUrl('http://[::1]:8080/x')).rejects.toThrow();
  });

  it('rejects hostnames that resolve to private addresses', async () => {
    await expect(
      assertSafeUrl('https://evil.example.com/x.csv', loopbackResolver),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a public https URL', async () => {
    await expect(
      assertSafeUrl('https://data.example.org/report.csv', publicResolver),
    ).resolves.toBeUndefined();
  });

  it('rejects unresolvable hosts', async () => {
    const failResolver = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(
      assertSafeUrl('https://nope.example.org/x.csv', failResolver),
    ).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/ingestion/importers/url-guard.spec.ts
```

Expected: FAIL — module `./url-guard` not found.

- [ ] **Step 3: Implement `src/modules/ingestion/importers/url-guard.ts`**

```typescript
import { promises as dns } from 'dns';
import { BadRequestException } from '@nestjs/common';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

type Resolver = (hostname: string) => Promise<{ address: string }[]>;

const defaultResolver: Resolver = (hostname) =>
  dns.lookup(hostname, { all: true, verbatim: true });

/**
 * True when the address is loopback, private (RFC1918), link-local,
 * CGNAT, unspecified, or otherwise unsafe for server-side fetches.
 * Malformed input is treated as private (fail closed).
 */
export function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const addr = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
    if (addr === '::' || addr === '::1') return true;
    if (addr.startsWith('fe80:')) return true; // link-local
    if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // ULA
    if (addr.startsWith('::ffff:')) return isPrivateIp(addr.slice(7)); // v4-mapped
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Validates a user-supplied URL for server-side fetching (SSRF guard).
 * Checks protocol, hostname blocklist, literal IPs, and every DNS-resolved
 * address. Throws BadRequestException when the URL is unsafe.
 */
export async function assertSafeUrl(
  rawUrl: string,
  resolve: Resolver = defaultResolver,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid URL format');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestException(
      `Invalid protocol: ${parsed.protocol}. Only HTTP and HTTPS are supported.`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    throw new BadRequestException('URL host is not allowed');
  }

  const isLiteralIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
  if (isLiteralIp) {
    if (isPrivateIp(hostname)) {
      throw new BadRequestException('URL resolves to a private address');
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await resolve(hostname);
  } catch {
    throw new BadRequestException(`Could not resolve host: ${hostname}`);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new BadRequestException('URL resolves to a private address');
  }
}
```

- [ ] **Step 4: Run the guard tests**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/ingestion/importers/url-guard.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Wire the guard into `UrlImporterService`**

In `src/modules/ingestion/importers/url-importer.service.ts`:

1. Add import: `import { assertSafeUrl } from './url-guard';`
2. In `importFromUrl` (line ~42), replace `this.validateUrl(url);` with `await assertSafeUrl(url);`
3. Delete the now-unused private `validateUrl` method (lines ~140–156).
4. In `downloadFile`'s axios call (line ~112), stop following redirects and stop accepting 3xx:

```typescript
      const response = await axios.get(url, {
        headers,
        responseType: 'arraybuffer',
        maxContentLength: this.MAX_FILE_SIZE,
        maxBodyLength: this.MAX_FILE_SIZE,
        timeout: 60000, // 60 seconds
        maxRedirects: 0, // SSRF guard: a redirect could point at an internal address
        validateStatus: (status) => status >= 200 && status < 300,
      });
```

- [ ] **Step 6: Full ingestion-importer test run + type check**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/ingestion/importers/url-guard.spec.ts && npx tsc --noEmit -p tsconfig.json
```

Expected: PASS / no new type errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/modules/ingestion/importers/
git commit -m "fix(security): SSRF guard on URL imports — private-range blocking, DNS check, no redirects (SEC-02)"
```

---

### Task 4: Organization-scope the transformation executor (SEC-03)

**Files:**
- Modify: `src/modules/transformations/transformations-executor.service.ts`
- Modify: `src/modules/transformations/transformations.controller.ts:203-204`
- Modify: `src/modules/pipelines/pipelines-executor.service.ts:180-183`
- Test: `src/modules/transformations/transformations-executor.service.spec.ts` (create)

**Interfaces:**
- Produces: `TransformationsExecutorService.execute(transformationId: string, triggerType: 'manual' | 'scheduled', organizationId: string)` — the third parameter is now **required**; `loadTransformation(id, organizationId)` filters by both. Callers updated: transformations controller (passes `user.organizationId`) and pipelines executor (passes its `organizationId` argument).

- [ ] **Step 1: Write the failing test**

Create `src/modules/transformations/transformations-executor.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransformationsExecutorService } from './transformations-executor.service';
import { Transformation, TransformationRun, CachedResult } from '../../database/entities';
import { ConnectionsService } from '../connections/connections.service';
import { EncryptionService } from '../encryption/encryption.service';
import { ConfigService } from '@nestjs/config';

describe('TransformationsExecutorService org isolation (SEC-03)', () => {
  let service: TransformationsExecutorService;
  const transformationsRepository = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TransformationsExecutorService,
        { provide: getRepositoryToken(Transformation), useValue: transformationsRepository },
        { provide: getRepositoryToken(TransformationRun), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(CachedResult), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: ConnectionsService, useValue: { getDriver: jest.fn() } },
        { provide: EncryptionService, useValue: { decryptObject: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(300000) } },
      ],
    }).compile();
    service = module.get(TransformationsExecutorService);
  });

  it('rejects execution when the transformation belongs to another org', async () => {
    transformationsRepository.findOne.mockResolvedValue(null); // scoped query finds nothing
    await expect(
      service.execute('xform-owned-by-org-B', 'manual', 'org-A'),
    ).rejects.toThrow(BadRequestException);
    expect(transformationsRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'xform-owned-by-org-B', organizationId: 'org-A' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/transformations/transformations-executor.service.spec.ts
```

Expected: FAIL — `execute` accepts 2 arguments and `findOne` was called with `{ where: { id } }` only (or a TS compile error about the third argument).

- [ ] **Step 3: Implement the scoped signature**

In `src/modules/transformations/transformations-executor.service.ts`:

```typescript
  async execute(
    transformationId: string,
    triggerType: 'manual' | 'scheduled',
    organizationId: string,
  ): Promise<TransformationRunResponseDto> {
```

and change the load call (line ~45) to:

```typescript
    const transformation = await this.loadTransformation(transformationId, organizationId);
```

and the loader (line ~118) to:

```typescript
  private async loadTransformation(
    id: string,
    organizationId: string,
  ): Promise<Transformation> {
    const transformation = await this.transformationsRepository.findOne({
      where: { id, organizationId },
    });

    if (!transformation) {
      throw new BadRequestException(`Transformation with ID ${id} not found`);
    }

    return transformation;
  }
```

- [ ] **Step 4: Update both callers**

`src/modules/transformations/transformations.controller.ts` (line ~203) — add the user param and pass the org:

```typescript
  executeNow(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<TransformationRunResponseDto> {
    return this.executorService.execute(id, 'manual', user.organizationId);
  }
```

(`CurrentUser` and `User` are already imported in this controller.)

`src/modules/pipelines/pipelines-executor.service.ts` (line ~180) — `executeStep` already receives `organizationId`; pass it through:

```typescript
        const result = await this.transformationsExecutorService.execute(
          transformationId,
          'scheduled',
          organizationId,
        );
```

- [ ] **Step 5: Run the test to verify it passes, then type-check**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/transformations/transformations-executor.service.spec.ts && npx tsc --noEmit -p tsconfig.json
```

Expected: PASS; the type check surfaces any remaining 2-argument caller — fix each by passing the caller's `organizationId`.

- [ ] **Step 6: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/modules/transformations/ packages/backend/src/modules/pipelines/pipelines-executor.service.ts
git commit -m "fix(security): require organizationId in transformation executor — closes cross-tenant IDOR (SEC-03)"
```

---

### Task 5: Organization-scope pipeline cross-query steps (SEC-04)

**Files:**
- Modify: `src/modules/pipelines/pipelines-executor.service.ts:190-192`
- Test: `src/modules/pipelines/pipelines-executor.service.spec.ts` (create)

**Interfaces:**
- Consumes: Task 4's three-argument `execute` (already wired).
- Produces: the `cross-query` step's `savedCrossQueryRepository.findOne` filters on `{ id, organizationId }`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/pipelines/pipelines-executor.service.spec.ts`. Mirror the provider mocking pattern from Task 4's spec — mock every constructor dependency of `PipelinesExecutorService` (open the file's constructor and provide a `{ provide: X, useValue: jest.fn-stub }` for each; repositories via `getRepositoryToken`). The behavioral assertion:

```typescript
  it('scopes saved cross-query lookups to the executing org (SEC-04)', async () => {
    savedCrossQueryRepository.findOne.mockResolvedValue(null);
    await expect(
      (service as any).executeStep(
        { id: 's1', type: 'cross-query', config: { savedCrossQueryId: 'q-org-B' } },
        'org-A',
      ),
    ).rejects.toThrow('SavedCrossQuery q-org-B not found');
    expect(savedCrossQueryRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'q-org-B', organizationId: 'org-A' },
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/pipelines/pipelines-executor.service.spec.ts
```

Expected: FAIL — `findOne` called with `{ where: { id: 'q-org-B' } }` (missing org).

- [ ] **Step 3: Implement**

In `executeStep`, `cross-query` case (line ~190):

```typescript
        const savedQuery = await this.savedCrossQueryRepository.findOne({
          where: { id: savedCrossQueryId, organizationId },
        });
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/pipelines/pipelines-executor.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/modules/pipelines/
git commit -m "fix(security): org-scope saved cross-query lookups in pipeline steps (SEC-04)"
```

---

### Task 6: Harden staged-table DROP (SEC-05)

**Files:**
- Modify: `src/modules/ingestion/importers/staging-importer.service.ts` (add `dropTable`)
- Modify: `src/modules/ingestion/ingestion.service.ts:404-415`
- Test: `src/modules/ingestion/importers/staging-importer.service.spec.ts` (create)

**Interfaces:**
- Produces: `StagingImporterService.dropTable(tableName: string): Promise<void>` — validates the identifier against `/^[A-Za-z_][A-Za-z0-9_]*$/` (max 128 chars), double-quotes it, and drops it in the caller's staging context; throws `BadRequestException` otherwise. `IngestionService.deleteStagedDataById` calls it instead of reaching into `this.stagingImporter['dataSource']`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/ingestion/importers/staging-importer.service.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { StagingImporterService } from './staging-importer.service';

describe('StagingImporterService.dropTable (SEC-05)', () => {
  let service: StagingImporterService;
  const dataSource = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    // Construct with the same constructor args the real class declares —
    // open the file and stub each one; the dataSource stub above must be
    // passed in the DataSource position.
    service = new StagingImporterService(dataSource as any);
  });

  it('drops a well-formed identifier, double-quoted', async () => {
    await service.dropTable('staging_org_abc_customers');
    expect(dataSource.query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS "staging_org_abc_customers"',
    );
  });

  it.each([
    'foo"; DROP TABLE users;--',
    'foo bar',
    'foo;bar',
    '1starts_with_digit',
    '',
    'a'.repeat(129),
  ])('rejects malicious or malformed identifier %j', async (name) => {
    await expect(service.dropTable(name as string)).rejects.toThrow(
      BadRequestException,
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
```

If `StagingImporterService`'s constructor takes more than the DataSource, adjust the `new StagingImporterService(...)` line to stub each parameter in order (open the file to check) — keep `dataSource` in its correct position.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/ingestion/importers/staging-importer.service.spec.ts
```

Expected: FAIL — `dropTable` is not a function.

- [ ] **Step 3: Implement `dropTable` on `StagingImporterService`**

Add to `src/modules/ingestion/importers/staging-importer.service.ts` (import `BadRequestException` from `@nestjs/common` if not present):

```typescript
  private static readonly SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

  /**
   * Drops a staging table. The name must be a plain SQL identifier —
   * staging tables are always created as staging_<org>_<name>, so anything
   * else is treated as an injection attempt.
   */
  async dropTable(tableName: string): Promise<void> {
    if (
      !tableName ||
      tableName.length > 128 ||
      !StagingImporterService.SAFE_IDENTIFIER.test(tableName)
    ) {
      throw new BadRequestException(`Invalid staging table name`);
    }
    await this.dataSource.query(`DROP TABLE IF EXISTS "${tableName}"`);
  }
```

(If the class's DataSource member has a different name than `dataSource`, use that name.)

- [ ] **Step 4: Replace the unsafe call in `IngestionService`**

In `src/modules/ingestion/ingestion.service.ts` `deleteStagedDataById` (lines ~404–415), replace:

```typescript
      await this.stagingImporter['dataSource'].query(
        `DROP TABLE IF EXISTS ${stagedData.tableName}`
      );
```

with:

```typescript
      await this.stagingImporter.dropTable(stagedData.tableName);
```

(keep the surrounding try/catch and log lines unchanged).

- [ ] **Step 5: Run tests + type check**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/ingestion/importers/staging-importer.service.spec.ts && npx tsc --noEmit -p tsconfig.json
```

Expected: PASS / no new errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/modules/ingestion/
git commit -m "fix(security): validate staging table identifier before DROP, remove private-member access (SEC-05)"
```

---

### Task 7: Remove raw SQL interpolation from catalog sync persistence (SEC-06)

**Files:**
- Modify: `src/modules/catalog/catalog.service.ts:103-116`
- Test: `src/modules/catalog/catalog-sync-result.spec.ts` (create)

**Interfaces:**
- Produces: `syncAll` persists `lastSyncAt`/`lastSyncResult` via load-merge-save on the settings repository (fully parameterized by TypeORM) instead of string-built `jsonb_set`. Other `catalogConfig` keys (host, encrypted jwtToken, enabled) are preserved.

- [ ] **Step 1: Write the failing test**

Create `src/modules/catalog/catalog-sync-result.spec.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Catalog sync persistence (SEC-06)', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'catalog.service.ts'),
    'utf8',
  );

  it('does not build jsonb_set SQL from interpolated strings', () => {
    expect(source).not.toContain('jsonb_set');
  });
});
```

(Like Task 2, a source assertion is the honest test here: the vulnerability is the string-built SQL itself, and the replacement is plain repository usage that TypeORM parameterizes.)

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/catalog/catalog-sync-result.spec.ts
```

Expected: FAIL — `jsonb_set` present.

- [ ] **Step 3: Replace the query-builder block**

In `src/modules/catalog/catalog.service.ts`, replace lines 103–116 (`// Persist sync result` through `.execute();`) with:

```typescript
    // Persist sync result (load-merge-save: preserves other catalogConfig keys
    // and lets TypeORM parameterize everything — error strings may contain quotes)
    const settings = await this.settingsRepo.findOne({ where: { organizationId } });
    if (settings) {
      settings.catalogConfig = {
        ...(settings.catalogConfig ?? {}),
        lastSyncAt: new Date().toISOString(),
        lastSyncResult: {
          synced: result.synced,
          errors: result.errors,
          categories: result.categories,
        },
      };
      await this.settingsRepo.save(settings);
    }
```

If `settings.catalogConfig`'s declared type rejects the spread, cast the assigned object `as typeof settings.catalogConfig`. If the entity's org column property is not `organizationId`, match the entity's property name (check `organization-settings.entity.ts`).

- [ ] **Step 4: Run test + type check**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/catalog/catalog-sync-result.spec.ts && npx tsc --noEmit -p tsconfig.json
```

Expected: PASS / no new errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/modules/catalog/
git commit -m "fix(security): persist catalog sync result via parameterized save, drop string-built jsonb_set (SEC-06)"
```

---

### Task 8: One strong read-only SQL validator for the public path (SEC-08)

**Files:**
- Create: `src/common/readonly-sql.validator.ts`
- Modify: `src/modules/dashboard/dataset-sharing.service.ts:589-626`
- Test: `src/common/readonly-sql.validator.spec.ts` (create)

**Interfaces:**
- Produces: `validateReadOnlySql(sqlQuery: string): void` (throws `BadRequestException`) and `stripSqlComments(sql: string): string`, exported from `src/common/readonly-sql.validator.ts`. `DatasetSharingService.validateSqlQuery` delegates to it (method kept so call sites don't change).

- [ ] **Step 1: Write the failing test**

Create `src/common/readonly-sql.validator.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { validateReadOnlySql, stripSqlComments } from './readonly-sql.validator';

describe('validateReadOnlySql (SEC-08)', () => {
  it.each([
    'SELECT * FROM customers LIMIT 10',
    'select id, name from t where created_at > now()', // "create" inside created_at must NOT match
    "SELECT description FROM datasets", // old validator blocked /script/i inside "description"
    'WITH x AS (SELECT 1) SELECT * FROM x',
    'SELECT * FROM t;', // single trailing semicolon ok
  ])('accepts read-only query: %s', (sql) => {
    expect(() => validateReadOnlySql(sql)).not.toThrow();
  });

  it.each([
    'DROP TABLE users',
    'DELETE FROM t',
    'INSERT INTO t VALUES (1)',
    'UPDATE t SET a=1',
    'SELECT 1; DROP TABLE users',
    'SELECT pg_read_file(\'/etc/passwd\')',
    'SELECT * FROM dblink(\'host=internal\', \'select 1\') AS t(a int)',
    'COPY t TO PROGRAM \'rm -rf /\'',
    'SELECT pg_sleep(60)',
    "SELECT 1 INTO OUTFILE '/tmp/x'",
    'WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x',
    '/* hidden */ DROP TABLE t',
    '',
  ])('rejects: %j', (sql) => {
    expect(() => validateReadOnlySql(sql as string)).toThrow(BadRequestException);
  });

  it('strips comments before deciding the statement head', () => {
    expect(() =>
      validateReadOnlySql('-- note\nSELECT 1'),
    ).not.toThrow();
    expect(stripSqlComments('SELECT 1 -- trailing')).not.toContain('--');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/common/readonly-sql.validator.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/common/readonly-sql.validator.ts`**

```typescript
import { BadRequestException } from '@nestjs/common';

/**
 * Strongest-common-denominator validation for SQL that reaches a database
 * on behalf of an UNAUTHENTICATED caller (public dataset shares).
 * Deliberately conservative: false positives are acceptable on this path.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\b(drop|delete|insert|update|alter|create|truncate|grant|revoke|vacuum|reindex|merge|copy|call|do)\b/i,
  /\b(pg_read_file|pg_write_file|pg_ls_dir|pg_sleep|pg_terminate_backend|pg_cancel_backend|lo_import|lo_export|dblink|xp_cmdshell)\b/i,
  /\binto\s+(outfile|dumpfile)\b/i,
  /\bexec(ute)?\s*\(/i,
];

export function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

export function validateReadOnlySql(sqlQuery: string): void {
  if (!sqlQuery || typeof sqlQuery !== 'string' || !sqlQuery.trim()) {
    throw new BadRequestException('SQL query is required');
  }

  const stripped = stripSqlComments(sqlQuery).trim();
  const lowered = stripped.toLowerCase();

  if (!lowered.startsWith('select') && !lowered.startsWith('with')) {
    throw new BadRequestException('Only SELECT queries are allowed');
  }

  const body = stripped.endsWith(';') ? stripped.slice(0, -1) : stripped;
  if (body.includes(';')) {
    throw new BadRequestException('Multiple statements are not allowed');
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(stripped)) {
      throw new BadRequestException(
        'Query contains a forbidden keyword and has been blocked',
      );
    }
  }
}
```

- [ ] **Step 4: Run the validator tests**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/common/readonly-sql.validator.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Delegate the sharing service's validator**

In `src/modules/dashboard/dataset-sharing.service.ts`, add the import:

```typescript
import { validateReadOnlySql } from '../../common/readonly-sql.validator';
```

Replace the entire body of the private `validateSqlQuery` method (lines ~589–626) with:

```typescript
  private validateSqlQuery(sqlQuery: string): void {
    validateReadOnlySql(sqlQuery);
  }
```

- [ ] **Step 6: Full test + type check**

```bash
cd packages/backend && pnpm test && npx tsc --noEmit -p tsconfig.json
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/common/ packages/backend/src/modules/dashboard/dataset-sharing.service.ts
git commit -m "fix(security): shared read-only SQL validator; public share path now uses the strongest denylist (SEC-08)"
```

---

### Task 9: Hash share tokens and API keys at rest (SEC-09a)

**Files:**
- Create: `src/common/hash.util.ts`
- Create: `src/database/migrations/1711000000007-HashDatasetShareTokens.ts`
- Modify: `src/modules/dashboard/dataset-sharing.service.ts` (creation lines ~91-92, regenerate lines ~119-128, lookups at lines ~139, ~157, ~364, ~399)
- Test: `src/common/hash.util.spec.ts` (create), extend `src/modules/dashboard/` behavior expectations inline below

**Interfaces:**
- Produces: `sha256Hex(value: string): string` from `src/common/hash.util.ts`. `DatasetShare.apiKey` / `.shareToken` columns now store SHA-256 hex digests. Plaintext is returned **only** in the `createShare` / `regenerateApiKey` / `regenerateShareToken` responses. All lookups hash the presented credential before querying.
- **Known behavior change:** the shares *list* endpoint can no longer show usable keys (it returns hashes). The frontend share modal keeps working for newly created/regenerated keys (response carries plaintext). Existing shared links/keys keep working — the migration hashes the stored values in place. Log this in the commit body.

- [ ] **Step 1: Write the failing test**

Create `src/common/hash.util.spec.ts`:

```typescript
import { sha256Hex } from './hash.util';

describe('sha256Hex', () => {
  it('produces the known SHA-256 of "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is deterministic and 64 hex chars', () => {
    expect(sha256Hex('gd_x')).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('gd_x')).toBe(sha256Hex('gd_x'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/common/hash.util.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/common/hash.util.ts`**

```typescript
import { createHash } from 'crypto';

/** SHA-256 hex digest. Used to store share tokens/API keys irreversibly. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
```

Run the test: expected PASS.

- [ ] **Step 4: Store hashes, return plaintext once**

In `src/modules/dashboard/dataset-sharing.service.ts` add `import { sha256Hex } from '../../common/hash.util';`.

In `createShare` (around lines 91–92), replace:

```typescript
    share.apiKey = dto.generateApiKey ? this.generateApiKey() : undefined;
    share.shareToken = dto.generateShareToken ? this.generateShareToken() : undefined;
```

with:

```typescript
    const plainApiKey = dto.generateApiKey ? this.generateApiKey() : undefined;
    const plainShareToken = dto.generateShareToken ? this.generateShareToken() : undefined;
    share.apiKey = plainApiKey ? sha256Hex(plainApiKey) : undefined;
    share.shareToken = plainShareToken ? sha256Hex(plainShareToken) : undefined;
```

Then find where `createShare` returns/saves the share and make the return carry the plaintext exactly once:

```typescript
    const saved = await this.datasetShareRepository.save(share);
    return { ...saved, apiKey: plainApiKey ?? null, shareToken: plainShareToken ?? null };
```

(Adapt to the existing save/return lines; the essential rule: entity persists the hash, response object carries the plaintext.)

In `regenerateApiKey` (lines ~119–123) and `regenerateShareToken` (lines ~125–128), apply the same pattern:

```typescript
  async regenerateApiKey(shareId: string, organizationId: string): Promise<DatasetShare> {
    const share = await this.getShareForOrg(shareId, organizationId); // keep the existing fetch line
    const plainApiKey = this.generateApiKey();
    share.apiKey = sha256Hex(plainApiKey);
    const saved = await this.datasetShareRepository.save(share);
    return { ...saved, apiKey: plainApiKey };
  }
```

(mirror for `regenerateShareToken`; keep whatever the existing share-fetch call is — do not invent `getShareForOrg` if the method fetches differently.)

- [ ] **Step 5: Hash presented credentials at every lookup**

There are exactly four `findOne` lookups by credential (lines ~139, ~157, ~364, ~399). Change each:

```typescript
      where: { apiKey: sha256Hex(apiKey), active: true },
```

```typescript
      where: { shareToken: sha256Hex(shareToken), active: true },
```

Verify no others exist:

```bash
cd packages/backend && grep -n "where: { apiKey\|where: { shareToken" src/modules/dashboard/dataset-sharing.service.ts
```

Every hit must contain `sha256Hex(`.

- [ ] **Step 6: Write the in-place migration**

Create `src/database/migrations/1711000000007-HashDatasetShareTokens.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';
import { createHash } from 'crypto';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const looksHashed = (v: string | null) => !!v && /^[0-9a-f]{64}$/.test(v);

export class HashDatasetShareTokens1711000000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: { id: string; api_key: string | null; share_token: string | null }[] =
      await queryRunner.query(`SELECT id, api_key, share_token FROM dataset_shares`);

    for (const row of rows) {
      const apiKey =
        row.api_key && !looksHashed(row.api_key) ? sha256(row.api_key) : row.api_key;
      const shareToken =
        row.share_token && !looksHashed(row.share_token)
          ? sha256(row.share_token)
          : row.share_token;
      if (apiKey !== row.api_key || shareToken !== row.share_token) {
        await queryRunner.query(
          `UPDATE dataset_shares SET api_key = $1, share_token = $2 WHERE id = $3`,
          [apiKey, shareToken, row.id],
        );
      }
    }
  }

  public async down(): Promise<void> {
    throw new Error(
      'Irreversible: plaintext tokens cannot be recovered from hashes. Regenerate keys instead.',
    );
  }
}
```

If the table/column names differ (check `dataset-share.entity.ts` for `@Entity`/`@Column` names), match the entity.

- [ ] **Step 7: Run the migration against the dev database**

```bash
cd packages/backend && pnpm run migration:run
```

Expected: `HashDatasetShareTokens1711000000007` executes without error. (Requires the dev Postgres from `docker compose up -d` or the local setup; if the DB is not running, start it first.)

- [ ] **Step 8: Full test + type check**

```bash
cd packages/backend && pnpm test && npx tsc --noEmit -p tsconfig.json
```

Expected: green.

- [ ] **Step 9: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/common/hash.util.ts packages/backend/src/common/hash.util.spec.ts packages/backend/src/modules/dashboard/dataset-sharing.service.ts packages/backend/src/database/migrations/1711000000007-HashDatasetShareTokens.ts
git commit -m "fix(security): store dataset share tokens/API keys as SHA-256 hashes (SEC-09)

Plaintext is returned only on create/regenerate. Existing keys keep
working (migration hashes stored values in place). The shares list no
longer exposes usable credentials."
```

---

### Task 10: Stop persisting import auth secrets (SEC-09b)

**Files:**
- Modify: `src/modules/ingestion/ingestion.service.ts:536-541`
- Test: `src/modules/ingestion/ingestion.source-config.spec.ts` (create)

**Interfaces:**
- Produces: `import_jobs.source_config` never contains `auth.token`, `auth.password`, `auth.apiKey`, or header values — only `auth: { type }` and `headers: <keys only>`. Nothing reads these secrets back (verified: `sourceConfig` is written at two sites and never read), so no decryption path is needed.

- [ ] **Step 1: Write the failing test**

Create `src/modules/ingestion/ingestion.source-config.spec.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Import job sourceConfig redaction (SEC-09b)', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'ingestion.service.ts'),
    'utf8',
  );

  it('never stores the raw auth object on the import job', () => {
    // the redacted form stores only auth.type
    expect(source).not.toMatch(/sourceConfig:[\s\S]{0,200}auth:\s*uploadDto\.auth\b/);
  });

  it('never stores raw header values on the import job', () => {
    expect(source).not.toMatch(/sourceConfig:[\s\S]{0,300}headers:\s*uploadDto\.headers\b/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/ingestion/ingestion.source-config.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Redact at the write site**

In `src/modules/ingestion/ingestion.service.ts` `importFromUrl` (lines ~536–541), replace:

```typescript
        sourceConfig: uploadDto.auth || uploadDto.headers
          ? {
              auth: uploadDto.auth,
              headers: uploadDto.headers,
            }
          : undefined,
```

with:

```typescript
        // Never persist credentials — keep only non-secret metadata for the job record.
        sourceConfig: uploadDto.auth || uploadDto.headers
          ? {
              auth: uploadDto.auth ? { type: uploadDto.auth.type } : undefined,
              headerNames: uploadDto.headers ? Object.keys(uploadDto.headers) : undefined,
            }
          : undefined,
```

- [ ] **Step 4: Run test to verify it passes, type check**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/ingestion/ingestion.source-config.spec.ts && npx tsc --noEmit -p tsconfig.json
```

Expected: PASS / clean. (The entity's `sourceConfig` is loosely-typed JSONB — if TS complains about `headerNames`, check `import-job.entity.ts` and either widen the type there or cast the object `as ImportJob['sourceConfig']`.)

- [ ] **Step 5: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/modules/ingestion/
git commit -m "fix(security): stop persisting URL-import auth secrets in import_jobs.source_config (SEC-09b)"
```

---

### Task 11: Enforce RBAC on mutating endpoints (SEC-10)

**Files:**
- Modify: `src/modules/connections/connections.controller.ts` (`@Post()` line ~49, `@Delete(':id')` line ~121)
- Modify: `src/modules/settings/settings.controller.ts` (`@Put()` line ~23)
- Modify: `src/modules/dashboard/dashboard.controller.ts` (`@Post('shares')` ~47, `@Post('shares/:id/regenerate-api-key')` ~64, `@Post('shares/:id/regenerate-token')` ~74, `@Delete('shares/:id')` ~84)
- Modify: `src/modules/transformations/transformations.controller.ts` (every `@Post`/`@Patch`/`@Delete` handler)
- Modify: `src/modules/pipelines/pipelines.controller.ts` (`@Post()` ~30, `@Patch(':id')` ~45, `@Delete(':id')` ~54, `@Post(':id/run')` ~60)
- Modify: `src/modules/ingestion/ingestion.controller.ts` (every `@Post`/`@Delete` handler)
- Modify: `src/modules/data-quality/data-quality.controller.ts` (`@Post('profiles')`, `@Post('checks')`, `@Patch('checks/:id')`, `@Delete('checks/:id')`, and the check-run `@Post` handler)
- Modify: `src/modules/notebooks/notebooks.controller.ts` (`@Post()` ~37, `@Patch(':id')` ~49, `@Delete(':id')` ~59, `@Post(':id/cells/:cellId/execute')` ~66, `@Post(':id/save-as-transformation')` ~83)
- Test: `src/modules/auth/rbac-policy.spec.ts` (create)

**Interfaces:**
- Consumes: `RolesGuard` enforced globally (Task 1), `Roles` decorator from `src/modules/auth/decorators/roles.decorator.ts`, `UserRole` enum from `src/database/entities` (values: `SUPER_ADMIN`, `ORG_ADMIN`, `EDITOR`, `VIEWER`).
- Produces: the RBAC policy below, enforced. Read/GET endpoints stay open to all authenticated roles. Query execution (`queries`, `cross-query` execute) deliberately stays open to viewers — read-only analytics is the viewer role's purpose.

**Policy:**

| Surface | Allowed roles |
|---|---|
| Connections create/delete; settings update; share create/regenerate/delete | `SUPER_ADMIN`, `ORG_ADMIN` |
| Transformations, pipelines, ingestion, quality checks/profiles, notebooks — all mutating handlers | `SUPER_ADMIN`, `ORG_ADMIN`, `EDITOR` |

- [ ] **Step 1: Write the failing test**

Create `src/modules/auth/rbac-policy.spec.ts`:

```typescript
import { ROLES_KEY } from './decorators/roles.decorator';
import { UserRole } from '../../database/entities';
import { ConnectionsController } from '../connections/connections.controller';
import { SettingsController } from '../settings/settings.controller';
import { DashboardController } from '../dashboard/dashboard.controller';
import { TransformationsController } from '../transformations/transformations.controller';
import { PipelinesController } from '../pipelines/pipelines.controller';
import { IngestionController } from '../ingestion/ingestion.controller';
import { DataQualityController } from '../data-quality/data-quality.controller';
import { NotebooksController } from '../notebooks/notebooks.controller';

const rolesOf = (controller: any, method: string): UserRole[] | undefined =>
  Reflect.getMetadata(ROLES_KEY, controller.prototype[method]);

const ADMINS = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN];
const EDITORS = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR];

describe('RBAC policy (SEC-10)', () => {
  it('admin-only surfaces carry admin roles', () => {
    expect(rolesOf(ConnectionsController, 'create')).toEqual(ADMINS);
    expect(rolesOf(ConnectionsController, 'remove')).toEqual(ADMINS);
    expect(rolesOf(SettingsController, 'update')).toEqual(ADMINS);
    expect(rolesOf(DashboardController, 'createShare')).toEqual(ADMINS);
    expect(rolesOf(DashboardController, 'deleteShare')).toEqual(ADMINS);
  });

  it('editor surfaces carry editor roles', () => {
    expect(rolesOf(TransformationsController, 'executeNow')).toEqual(EDITORS);
    expect(rolesOf(PipelinesController, 'create')).toEqual(EDITORS);
    expect(rolesOf(IngestionController, 'upload')).toEqual(EDITORS);
    expect(rolesOf(DataQualityController, 'createCheck')).toEqual(EDITORS);
    expect(rolesOf(NotebooksController, 'create')).toEqual(EDITORS);
  });
});
```

**Important:** the method names above (`create`, `remove`, `update`, `createShare`, `deleteShare`, `executeNow`, `upload`, `createCheck`) must match the actual handler names — open each controller and correct the spec's method names to the real ones before first run (they are the plan author's best knowledge; `executeNow`, `upload`, `createCheck` are confirmed).

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/auth/rbac-policy.spec.ts
```

Expected: FAIL — all `rolesOf` calls return `undefined`.

- [ ] **Step 3: Annotate the controllers**

In each file listed above, add the imports:

```typescript
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../database/entities';
```

Then, per the policy table, add above each mutating handler either:

```typescript
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
```

or:

```typescript
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
```

Mechanical rule per file: annotate **every** handler decorated `@Post`, `@Patch`, `@Put`, or `@Delete`; skip `@Get` handlers. Exceptions (leave WITHOUT `@Roles`, open to viewers):
- `connections.controller.ts` `@Post(':id/test')` (line ~149) — connection testing is read-like.
- `queries.controller.ts` and `cross-query.controller.ts` — not in this task's file list at all; execution stays open.
- `public-dataset.controller.ts` — `@Public`, no roles possible.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/auth/rbac-policy.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Full suite + type check**

```bash
cd packages/backend && pnpm test && npx tsc --noEmit -p tsconfig.json
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/modules/
git commit -m "fix(security): enforce role-based access on mutating endpoints (SEC-10)

Admins: connections, settings, shares. Editors: transformations,
pipelines, ingestion, quality, notebooks. Viewers keep read + query
execution."
```

---

### Task 12: Config hardening — helmet, prod fail-fast, env sync, upload cap (SEC-11, SEC-12 mitigation, SEC-13)

**Files:**
- Create: `src/config/env.validation.ts`
- Modify: `src/main.ts`
- Modify: `src/app.module.ts` (ConfigModule + DB password default)
- Modify: `packages/backend/.env.example`
- Modify: `src/modules/ingestion/ingestion.controller.ts` (multer limits)
- Delete: `/.env.bak` (repo root)
- Test: `src/config/env.validation.spec.ts` (create)

**Interfaces:**
- Produces: `validateEnv(config: Record<string, unknown>): Record<string, unknown>` — throws when `NODE_ENV === 'production'` and any of `JWT_SECRET`, `ENCRYPTION_KEY`, `DB_PASSWORD` is missing/empty; passes config through otherwise. Wired via `ConfigModule.forRoot({ validate: validateEnv })`. `helmet` middleware active. Upload endpoints cap file size at 200 MB.

- [ ] **Step 1: Write the failing test**

Create `src/config/env.validation.spec.ts`:

```typescript
import { validateEnv } from './env.validation';

const prodEnv = {
  NODE_ENV: 'production',
  JWT_SECRET: 's3cret',
  ENCRYPTION_KEY: 'a'.repeat(64),
  DB_PASSWORD: 'pw',
};

describe('validateEnv (SEC-11)', () => {
  it('passes a complete production config through', () => {
    expect(validateEnv(prodEnv)).toEqual(prodEnv);
  });

  it.each(['JWT_SECRET', 'ENCRYPTION_KEY', 'DB_PASSWORD'])(
    'throws in production when %s is missing',
    (key) => {
      const env = { ...prodEnv } as Record<string, unknown>;
      delete env[key];
      expect(() => validateEnv(env)).toThrow(key);
    },
  );

  it('does not require secrets outside production', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/config/env.validation.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/config/env.validation.ts`**

```typescript
const REQUIRED_IN_PRODUCTION = ['JWT_SECRET', 'ENCRYPTION_KEY', 'DB_PASSWORD'] as const;

/**
 * ConfigModule validate hook. In production, refuse to boot without the
 * secrets that otherwise silently fall back to dev defaults.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (config.NODE_ENV === 'production') {
    const missing = REQUIRED_IN_PRODUCTION.filter(
      (key) => !config[key] || String(config[key]).trim() === '',
    );
    if (missing.length > 0) {
      throw new Error(
        `Refusing to start in production without required env vars: ${missing.join(', ')}`,
      );
    }
  }
  return config;
}
```

Run the test: expected PASS.

- [ ] **Step 4: Wire validation + helmet**

Install helmet:

```bash
cd packages/backend && pnpm add helmet
```

`src/app.module.ts` — add `import { validateEnv } from './config/env.validation';` and extend the ConfigModule:

```typescript
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
```

`src/main.ts` — after `const app = await NestFactory.create(AppModule);` add:

```typescript
import helmet from 'helmet';
// ...
  app.use(helmet());
```

(`helmet()` defaults are fine for a JSON API; Swagger UI at `/api/docs` needs `contentSecurityPolicy: false` if it breaks — check it loads and, only if blank, use `app.use(helmet({ contentSecurityPolicy: false }));`.)

- [ ] **Step 5: Cap upload size (SEC-12 mitigation)**

In `src/modules/ingestion/ingestion.controller.ts`, both `@UseInterceptors(FileInterceptor('file'))` occurrences (on `preview` ~line 57 and `upload` ~line 108) become:

```typescript
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024 } }),
  )
```

(200 MB — matches the URL importer's spirit; the `xlsx` advisory itself is accepted as a known risk now that the endpoint requires auth (Task 2) and has a size cap; full parser swap is out of Phase 0 scope.)

- [ ] **Step 6: Sync `packages/backend/.env.example` with the root example**

Overwrite `packages/backend/.env.example` so it matches the root `/.env.example` keys (notably: `DB_DATABASE=datagate`, add `JWT_SECRET=` and `JWT_EXPIRATION=7d`), and KEEP the three backend-only keys the root file lacks: `CROSS_QUERY_MAX_TABLES=10`, `CROSS_QUERY_MAX_JOINS=8`, `FDW_CLEANUP_INTERVAL_MS=3600000`. Copy the root file's values for shared keys (e.g. `CROSS_QUERY_TIMEOUT_MS=30000`, `CROSS_QUERY_MAX_ROWS=10000`).

- [ ] **Step 7: Delete the loose secrets file (SEC-13)**

```bash
rm -f /Users/brucehigiro/Documents/development/govdatahub/.env.bak
```

- [ ] **Step 8: Full suite + boot smoke test**

```bash
cd packages/backend && pnpm test && npx tsc --noEmit -p tsconfig.json
```

Expected: green. If the dev database is running, also smoke-boot: `timeout 25 pnpm run start 2>&1 | head -30` — expect the Nest startup banner, no crash (Ctrl-C/timeout kill is fine).

- [ ] **Step 9: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/config/ packages/backend/src/main.ts packages/backend/src/app.module.ts packages/backend/.env.example packages/backend/src/modules/ingestion/ingestion.controller.ts packages/backend/package.json pnpm-lock.yaml
git commit -m "fix(security): helmet, production fail-fast env validation, upload size cap, env example sync (SEC-11/12/13)"
```

---

### Task 13: DTO validation fixes (COR-03, COR-04)

**Files:**
- Modify: `src/modules/data-quality/quality-checks.service.ts:8-24` (decorate DTOs in place)
- Create: `src/modules/data-quality/dto/profile-table.dto.ts`
- Create: `src/modules/queries/dto/execute-staging-query.dto.ts`
- Create: `src/modules/transformations/dto/validate-sql.dto.ts`
- Create: `src/modules/cross-query/dto/validate-query.dto.ts`
- Modify: `src/modules/data-quality/data-quality.controller.ts` (profileTable body)
- Modify: `src/modules/queries/queries.controller.ts:159` (executeStagingQuery body)
- Modify: `src/modules/transformations/transformations.controller.ts:363` (validateSql body)
- Modify: `src/modules/cross-query/cross-query.controller.ts:48` (validateQuery body)
- Test: `src/modules/data-quality/quality-check-dto.spec.ts` (create)

**Interfaces:**
- Produces: every inline `@Body()` object literal replaced by a decorated DTO class; `CreateQualityCheckDto`/`UpdateQualityCheckDto` carry class-validator decorators so `POST/PATCH /data-quality/checks` stop being rejected wholesale by `forbidNonWhitelisted` (COR-03). Existing imports `QualityChecksService, CreateQualityCheckDto, UpdateQualityCheckDto` from the service file keep working (DTOs stay exported from the service module).

- [ ] **Step 1: Write the failing test**

Create `src/modules/data-quality/quality-check-dto.spec.ts`:

```typescript
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateQualityCheckDto, UpdateQualityCheckDto } from './quality-checks.service';

describe('Quality check DTO validation (COR-03)', () => {
  it('accepts a valid create payload (all properties whitelisted)', async () => {
    const dto = plainToInstance(CreateQualityCheckDto, {
      connectionId: 'c-1',
      schemaName: 'public',
      tableName: 'customers',
      name: 'not-null email',
      checkType: 'not_null',
      config: { column: 'email' },
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it('rejects a create payload missing required fields', async () => {
    const dto = plainToInstance(CreateQualityCheckDto, { name: 'x' });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown properties on update', async () => {
    const dto = plainToInstance(UpdateQualityCheckDto, { hacker: true });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && pnpm test -- --runTestsByPath src/modules/data-quality/quality-check-dto.spec.ts
```

Expected: FAIL — undecorated classes validate to zero errors even for garbage (`rejects` cases fail).

- [ ] **Step 3: Decorate the quality-check DTOs**

In `src/modules/data-quality/quality-checks.service.ts`, replace lines 8–24 with:

```typescript
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsIn,
  MaxLength,
} from 'class-validator';

export class CreateQualityCheckDto {
  @IsString() @IsNotEmpty() connectionId: string;
  @IsString() @IsNotEmpty() @MaxLength(256) schemaName: string;
  @IsString() @IsNotEmpty() @MaxLength(256) tableName: string;
  @IsOptional() @IsString() @MaxLength(256) columnName?: string;
  @IsString() @IsNotEmpty() @MaxLength(256) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString()
  @IsIn(['not_null', 'unique', 'min_rows', 'max_rows', 'freshness', 'custom_sql'])
  checkType: string;
  @IsObject() config: Record<string, any>;
}

export class UpdateQualityCheckDto {
  @IsOptional() @IsString() @MaxLength(256) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsObject() config?: Record<string, any>;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
}
```

- [ ] **Step 4: Create the four replacement DTOs**

`src/modules/data-quality/dto/profile-table.dto.ts`:

```typescript
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ProfileTableDto {
  @IsString() @IsNotEmpty() connectionId: string;
  @IsString() @IsNotEmpty() @MaxLength(256) schemaName: string;
  @IsString() @IsNotEmpty() @MaxLength(256) tableName: string;
}
```

`src/modules/queries/dto/execute-staging-query.dto.ts`:

```typescript
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ExecuteStagingQueryDto {
  @IsString() @IsNotEmpty() @MaxLength(65536) sqlQuery: string;
}
```

`src/modules/transformations/dto/validate-sql.dto.ts`:

```typescript
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ValidateSqlDto {
  @IsString() @IsNotEmpty() @MaxLength(65536) sqlQuery: string;
}
```

`src/modules/cross-query/dto/validate-query.dto.ts` (reuses the existing `QueryDefinitionDto` — import it from wherever `cross-query.controller.ts` currently imports it):

```typescript
import { IsDefined, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { QueryDefinitionDto } from './query-definition.dto';

export class ValidateQueryDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => QueryDefinitionDto)
  queryDefinition: QueryDefinitionDto;
}
```

(If `QueryDefinitionDto` lives at a different path, match the controller's existing import path.)

- [ ] **Step 5: Swap the inline body types in the four controllers**

- `data-quality.controller.ts` `profileTable`: `@Body() body: ProfileTableDto` (add import from `./dto/profile-table.dto`); property access stays `body.connectionId` etc.
- `queries.controller.ts:159`: `@Body() body: ExecuteStagingQueryDto` (import from `./dto/execute-staging-query.dto`).
- `transformations.controller.ts:363`: `@Body() dto: ValidateSqlDto` (import from `./dto/validate-sql.dto`).
- `cross-query.controller.ts:48`: `@Body() dto: ValidateQueryDto` (import from `./dto/validate-query.dto`); the handler body stays as-is (validation now actually fires via the global pipe).

- [ ] **Step 6: Run tests + type check**

```bash
cd packages/backend && pnpm test && npx tsc --noEmit -p tsconfig.json
```

Expected: green. (If `class-transformer` is not yet a direct dependency, `pnpm add class-transformer` — Nest's ValidationPipe with `transform: true` already requires it at runtime, so it's almost certainly present.)

- [ ] **Step 7: Commit**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub
git add packages/backend/src/modules/
git commit -m "fix(validation): decorate quality-check DTOs and replace inline @Body literals with validated DTOs (COR-03, COR-04)"
```

---

### Task 14: Final verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Grep-audit the fixed patterns**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub/packages/backend
grep -rn "8498b154" src && echo "FAIL: hardcoded org UUID remains" || echo "OK: no hardcoded org"
grep -rn "jsonb_set" src --include="*.ts" | grep -v migrations && echo "FAIL" || echo "OK: no jsonb_set interpolation"
grep -rn "\['dataSource'\]" src && echo "FAIL: private-member access remains" || echo "OK"
grep -n "where: { apiKey\|where: { shareToken" src/modules/dashboard/dataset-sharing.service.ts | grep -v sha256Hex && echo "FAIL: unhashed lookup" || echo "OK: lookups hashed"
```

Expected: four OK lines.

- [ ] **Step 2: Full suite, one last time**

```bash
cd packages/backend && pnpm test && npx tsc --noEmit -p tsconfig.json
```

Expected: all green.

- [ ] **Step 3: Review the branch log**

```bash
cd /Users/brucehigiro/Documents/development/govdatahub && git log --oneline ft-m1-03-cross-filter-on-click..HEAD
```

Expected: ~13 commits, one per task, each message naming its SEC/COR finding.

---

## Out of scope for Phase 0 (tracked, deliberate)

- **SEC-12 full fix** (replace `xlsx` with a maintained parser) — mitigated here by auth (Task 2) + size cap (Task 12); parser swap is a follow-up.
- **SEC-08 full unification** of all three SQL validators — the public path now uses the strongest one; consolidating the authenticated paths onto `validateReadOnlySql` risks breaking legitimate authenticated queries and belongs in a follow-up with broader test coverage.
- **Frontend changes** for the share-key UX after hashing (Task 9's behavior change) — Phase 1 work.
- COR-07 (public staged/transformation querying), OPS-* items — later phases per the Improvement Review roadmap.
