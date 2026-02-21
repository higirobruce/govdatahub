# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DataGate is a data integration platform that connects to multiple databases (PostgreSQL, MySQL), provides SQL query interfaces, and enables **cross-database queries** using PostgreSQL Foreign Data Wrappers (FDW).

**Tech Stack:**
- Backend: NestJS 11 + TypeORM + PostgreSQL (metadata DB)
- Frontend: Next.js 14 (App Router) + Tailwind CSS + React Flow
- Monorepo: pnpm workspaces

## Development Commands

### Setup
```bash
# Initial setup (installs deps, starts Docker, runs migrations)
bash scripts/setup.sh

# Or manually:
pnpm install
docker compose up -d
cd packages/backend && pnpm run migration:run
```

### Running the App
```bash
# Both servers (backend:3001, frontend:3000)
pnpm dev

# Individual servers
pnpm --filter backend dev
pnpm --filter frontend dev
```

### Database Operations
```bash
cd packages/backend

# Generate migration (after entity changes)
pnpm run migration:generate -- src/database/migrations/MigrationName

# Run pending migrations
pnpm run migration:run

# Rollback last migration
pnpm run migration:revert
```

### Testing
```bash
# Backend tests
cd packages/backend
pnpm test              # Unit tests
pnpm test:watch        # Watch mode
pnpm test:e2e          # E2E tests
pnpm test:cov          # Coverage

# Frontend build check
cd packages/frontend
pnpm build
```

### Docker
```bash
pnpm docker:up         # Start PostgreSQL + MySQL
pnpm docker:down       # Stop containers
pnpm docker:logs       # View logs
```

## Architecture

### Backend Module Structure

```
packages/backend/src/modules/
├── encryption/          # AES-256-GCM credential encryption
├── auth/                # JWT authentication, organization context
├── connections/         # CRUD for database connections
├── schema/              # Schema discovery (tables, columns)
├── queries/             # SQL query execution, history
├── transformations/     # Data transformation pipelines
└── cross-query/         # Cross-database joins using FDW ⭐
    ├── fdw-manager.service.ts         # FDW server/table management
    ├── query-builder.service.ts       # SQL generation from query definitions
    ├── cross-query-executor.service.ts # Query execution coordinator
    └── cross-query.controller.ts      # API endpoints
```

**Key Entities:**
- `Connection` - Database connection metadata (encrypted credentials)
- `QueryHistory` - Query execution logs
- `FdwServer` - FDW server configurations (for cross-query)
- `SavedCrossQuery` - Saved cross-database queries
- `Organization`, `User` - Multi-tenancy support

### Frontend App Structure

```
packages/frontend/app/
├── (auth)/              # Login/register pages
├── connections/         # Connection management UI
├── catalog/             # Database schema browser (tree view)
├── query/               # SQL query editor (Monaco)
└── cross-query/         # Visual cross-database query builder ⭐
    └── page.tsx         # Main cross-query UI
```

**Key Frontend Components:**
```
components/
├── ui/                  # Radix UI primitives (button, card, checkbox, tooltip)
└── CrossQueryBuilder/   # Cross-query specific components ⭐
    ├── ConnectionSelector.tsx     # Multi-select connections
    ├── TableBrowser.tsx           # Browse and add tables
    ├── VisualJoinEditor.tsx       # React Flow canvas for joins
    ├── TableNode.tsx              # Visual table representation
    ├── JoinConfigDialog.tsx       # Join configuration modal
    ├── ColumnSelector.tsx         # Column selection (collapsible, color-coded)
    ├── QueryPreview.tsx           # SQL preview
    └── ResultsViewer.tsx          # Query results + CSV export
```

## Cross-Database Query Architecture (FDW)

**Important:** The cross-query feature uses PostgreSQL Foreign Data Wrappers to enable joins across different database connections.

### How It Works

1. **FDW Setup** (First-time per connection):
   - `FdwManagerService.setupFdwServer()` creates:
     - FDW server pointing to remote database
     - User mapping for credentials
   - Requires `postgres_fdw` extension and superuser privileges

2. **Query Execution Flow**:
   ```
   User defines query → Create foreign tables → Generate SQL → Execute → Cleanup
   ```
   - `createForeignTablesForQuery()` - Creates temporary foreign tables in org-specific schema
   - `generateSqlFromDefinition()` - Builds SQL using table aliases
   - `executeCrossQuery()` - Runs query with timeout
   - `cleanupForeignTables()` - Drops temporary foreign tables

3. **Custom Type Handling**:
   - `createForeignTableManually()` automatically handles remote ENUM types
   - Retries IMPORT FOREIGN SCHEMA up to 10 times, creating missing types as TEXT domains
   - This allows cross-database queries on tables with custom types

### FDW Setup Script

If FDW permissions fail, run:
```bash
./scripts/setup-fdw.sh
```

This creates `postgres_fdw` extension and grants superuser to `admin` user (dev only).

## Important Patterns

### Backend

**1. Organization Isolation:**
```typescript
// All controllers use JwtAuthGuard and extract organizationId
@UseGuards(JwtAuthGuard)
@Controller('api/resource')
export class ResourceController {
  async method(@Req() req) {
    const organizationId = req.user.organizationId;
    // Always filter by organizationId for multi-tenancy
  }
}
```

**2. Credential Encryption:**
```typescript
// Credentials are ALWAYS encrypted before storage
const encrypted = await this.encryptionService.encrypt(password);
// Format: "iv:authTag:encryptedData" (hex)
```

**3. Query Execution Safety:**
```typescript
// Query execution has built-in protections:
// - 30s timeout (QUERY_TIMEOUT_MS)
// - Max 10k rows (MAX_RESULT_ROWS)
// - Rate limiting: 10 queries/min
// - SQL injection pattern blocking
```

**4. FDW Schema Naming:**
```typescript
// Organization-specific FDW schemas prevent conflicts
const orgSchema = `fdw_org_${organizationId}`.replace(/-/g, '_');
// Foreign table names include timestamp for uniqueness
const foreignTableName = `ft_${alias}_${Date.now()}`;
```

### Frontend

**1. API Client:**
```typescript
// All API calls go through lib/api.ts
import { api } from '@/lib/api';
const connections = await api.connections.list();
```

**2. React Flow (Visual Join Editor):**
```typescript
// Table nodes use custom nodeTypes
const nodeTypes = { tableNode: TableNode };
// Handle connections with onConnect callback
// Join edges are created from queryDefinition.joins
```

**3. Collapsible Tables Pattern:**
```typescript
// ColumnSelector uses collapsible tables with color coding
const TABLE_COLORS = ['bg-blue-100 border-blue-300', ...];
const [collapsedTables, setCollapsedTables] = useState<Set<string>>(new Set());
```

## Error Handling

### Common Issues

**"postgres_fdw does not exist":**
- Run `./scripts/setup-fdw.sh` to create extension
- Requires PostgreSQL superuser

**"permission denied for foreign-data wrapper":**
- FDW operations require superuser privileges (dev) or GRANT USAGE
- See `scripts/setup-fdw.sql`

**"type X does not exist" (cross-query):**
- Custom ENUM types are automatically handled by retry loop
- Creates TEXT domains on-the-fly
- See `fdw-manager.service.ts:createForeignTableManually()`

**"invalid reference to FROM-clause entry":**
- Fixed by using table aliases in SELECT clause
- See `query-builder.service.ts:generateSqlFromDefinition()`

## Security Notes

**Credentials:**
- Database passwords encrypted with AES-256-GCM
- Encryption key in `ENCRYPTION_KEY` env var (64 hex chars)
- NEVER log decrypted credentials

**SQL Injection:**
- Pattern-based validation in query executor
- Use parameterized queries where possible
- Rate limiting: 10 queries/min

**FDW Security (Production):**
- Don't grant superuser to app user
- Use specific GRANTs: `GRANT USAGE ON FOREIGN DATA WRAPPER postgres_fdw`
- Consider VPC peering for cross-database connections
- Audit FDW server usage

## Testing Strategy

**Backend:**
- Unit tests: Service methods, encryption, query building
- E2E tests: Full API request/response flows
- Mock database connections in tests

**Frontend:**
- Component tests for UI components
- Integration tests for API calls
- Manual testing for React Flow interactions

**Cross-Query Testing:**
- Test with real databases (use docker-compose)
- Verify foreign table creation/cleanup
- Test custom type handling with tables containing ENUMs
- Test organization isolation

## Known Limitations

- Cross-query only supports PostgreSQL as metadata DB (required for FDW)
- Remote databases must be accessible from metadata DB host
- Custom composite types are mapped to TEXT (only ENUMs auto-handled)
- Foreign tables are temporary (created per query, then dropped)
- Maximum 10 tables per cross-query (configurable)
- Maximum 8 joins per query (configurable)

## When Modifying Cross-Query Feature

1. **FDW Schema Changes**: Update migration, test cleanup logic
2. **New Database Types**: Extend `createForeignTableManually()` retry logic
3. **Query Builder Changes**: Update both SQL generation AND validation
4. **UI Changes**: Keep color coding consistent with table count
5. **Performance**: Consider caching FDW servers (currently per-query)

## Additional Resources

- Backend API Docs: http://localhost:3001/api/docs (Swagger)
- PostgreSQL FDW Docs: https://www.postgresql.org/docs/current/postgres-fdw.html
- React Flow Docs: https://reactflow.dev/
- TypeORM Migrations: https://typeorm.io/migrations
