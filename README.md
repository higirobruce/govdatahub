# DataGate

**Data Integration and AI-Ready Data Platform**

DataGate connects to multiple databases, provides SQL query interfaces, enables cross-database joins via PostgreSQL Foreign Data Wrappers, and pushes metadata to data catalogs.

---

## Features

- **Multi-Database Connections** — PostgreSQL, MySQL, MongoDB, ClickHouse, BigQuery, Snowflake, SQLite, SQL Server
- **Schema Browser** — Tree-view catalog with table/column exploration and inline profiling
- **SQL Query Editor** — Monaco editor with syntax highlighting, history, and CSV export
- **SQL Notebooks** — Multi-cell notebook interface with save-as-transformation support
- **Cross-Database Queries** — Visual join builder across different databases using PostgreSQL FDW
- **Data Pipelines** — DAG-based pipeline editor with scheduling and run history
- **Data Transformations** — SQL-based transformations with execution tracking
- **Data Quality** — Column profiling and rule-based quality checks (null %, uniqueness, freshness, custom SQL)
- **NL2SQL** — Natural language to SQL via configurable AI providers (OpenAI, Anthropic, local Ollama)
- **OpenMetadata Integration** — Push connections, schemas, pipelines, lineage and query usage to OpenMetadata
- **Multi-Tenancy** — Organization-scoped data isolation with JWT authentication
- **Credential Encryption** — AES-256-GCM for all stored database passwords

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | NestJS 11 + TypeORM + PostgreSQL |
| Frontend | Next.js 14 (App Router) + Tailwind CSS + React Flow |
| Monorepo | pnpm workspaces |
| Auth | JWT (7-day expiry) |
| Encryption | AES-256-GCM |

---

## Prerequisites

- **Node.js** 20+
- **pnpm** 8+ (auto-installed if missing)
- One of:
  - **Docker + Docker Compose** — for the containerized path
  - **PostgreSQL 15+** + **MySQL 8+** installed locally — for the local path

---

## Quick Start — Docker (Recommended)

```bash
# Clone and run setup (installs deps, starts containers, runs migrations)
bash scripts/setup.sh

# Start dev servers
pnpm dev
```

After setup:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- Swagger docs: http://localhost:3001/api/docs

**Docker credentials (pre-configured):**

| Database | Host | Port | DB | User | Password |
|---|---|---|---|---|---|
| PostgreSQL (metadata) | localhost | 5432 | datagate | admin | admin123 |
| MySQL (sample) | localhost | 3306 | sampledb | testuser | testpass |

---

## Quick Start — Local (No Docker)

Use this if you have PostgreSQL and MySQL installed natively (e.g. via Homebrew).

```bash
bash scripts/setup-local.sh
```

The script:
1. Starts PostgreSQL and MySQL services
2. Creates the database and user (reads `DB_*` vars from `.env` if it exists, defaults to `datagate`/`admin`)
3. Creates `postgres_fdw` extension as superuser
4. Generates `.env` with random `ENCRYPTION_KEY` and `JWT_SECRET`
5. Installs pnpm dependencies
6. Runs all migrations

You can override the MySQL root password:
```bash
MYSQL_ROOT_PASSWORD=mypass bash scripts/setup-local.sh
```

### FDW setup (cross-database queries)

Cross-database queries require the `postgres_fdw` extension and superuser on the `admin` role.
`setup-local.sh` handles this automatically. If you need to run it separately:

```bash
# Docker
bash scripts/setup-fdw.sh

# Local — connect as your OS superuser
psql -U $(whoami) -d <your-db> -f scripts/setup-fdw.sql
```

`setup-fdw.sql` creates the `postgres_fdw` extension and grants superuser to `admin` (dev only).

---

## Manual Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env — set ENCRYPTION_KEY (openssl rand -hex 32) and JWT_SECRET

# 3. Start databases
docker compose up -d          # Docker
# OR: brew services start postgresql@15 mysql   # local macOS

# 4. Run migrations
cd packages/backend && pnpm run migration:run

# 5. Start dev servers
pnpm dev
```

---

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Description |
|---|---|
| `ENCRYPTION_KEY` | 64-char hex — AES-256-GCM key for credential encryption |
| `JWT_SECRET` | 64-char hex — signs JWT tokens |
| `DB_HOST/PORT/USERNAME/PASSWORD/DATABASE` | Metadata PostgreSQL connection |
| `NEXT_PUBLIC_API_URL` | Frontend → backend URL (default `http://localhost:3001/api`) |

---

## Database Migrations

```bash
cd packages/backend

# Run all pending migrations
pnpm run migration:run

# Generate a new migration after entity changes
pnpm run migration:generate -- src/database/migrations/MyMigrationName

# Revert last migration
pnpm run migration:revert
```

---

## Module Overview

### Backend (`packages/backend/src/modules/`)

| Module | Description |
|---|---|
| `auth` | JWT login/register, organization context |
| `connections` | CRUD for DB connections (encrypted credentials) |
| `schema` | Schema/table/column discovery |
| `queries` | SQL execution, history, rate limiting |
| `cross-query` | FDW-based cross-database join execution |
| `transformations` | SQL transformation pipelines |
| `pipelines` | DAG-based data pipelines with scheduling |
| `notebooks` | Multi-cell SQL notebooks |
| `data-quality` | Column profiling + rule-based quality checks |
| `catalog` | OpenMetadata push integration |
| `nl2sql` | Natural language → SQL via AI providers |
| `settings` | Per-organization AI, query, and catalog config |
| `ingestion` | Import data from external sources |
| `lineage` | Data lineage tracking |

### Frontend (`packages/frontend/app/`)

| Route | Description |
|---|---|
| `/` | Dashboard — metrics, recent queries, catalog status |
| `/connections` | Manage database connections |
| `/catalog` | Schema tree browser with profiling |
| `/query` | SQL query editor |
| `/notebooks` | SQL notebooks |
| `/cross-query` | Visual cross-database query builder |
| `/pipelines` | Pipeline editor and run history |
| `/quality` | Data quality checks and profiles |
| `/settings` | Organization settings (AI, SQL safety, catalog) |

---

## Cross-Database Queries (FDW)

DataGate uses PostgreSQL Foreign Data Wrappers to join tables across different database connections.

**How it works:**
1. User selects connections and tables in the visual builder
2. Backend creates temporary foreign tables in an org-scoped schema
3. Generates and executes the JOIN query
4. Drops the temporary tables after execution

**Requirements:**
- Metadata DB must be PostgreSQL
- `postgres_fdw` extension must exist in the metadata DB
- `admin` user must have superuser (dev) or `GRANT USAGE ON FOREIGN DATA WRAPPER postgres_fdw` (prod)

---

## API Reference

Interactive docs at http://localhost:3001/api/docs (Swagger).

Key endpoint groups:

```
POST   /api/auth/login
POST   /api/auth/register

GET    /api/connections
POST   /api/connections
POST   /api/connections/:id/test

GET    /api/connections/:id/schema/tables
GET    /api/connections/:id/schema/tables/:table/columns

POST   /api/query
GET    /api/query/history

POST   /api/cross-query/execute
POST   /api/cross-query/preview-sql

GET    /api/data-quality/profiles
POST   /api/data-quality/profiles
GET    /api/data-quality/checks
POST   /api/data-quality/checks
POST   /api/data-quality/checks/:id/run

POST   /api/catalog/test-connection
POST   /api/catalog/sync

GET    /api/settings
PATCH  /api/settings
```

---

## Testing

```bash
# Backend unit tests
cd packages/backend
pnpm test

# Backend e2e tests
pnpm test:e2e

# Frontend build check
cd packages/frontend
pnpm build
```

---

## Troubleshooting

**`postgres_fdw` permission denied during migration:**
```bash
# Docker
bash scripts/setup-fdw.sh

# Local
psql -U $(whoami) -d <db-name> -f scripts/setup-fdw.sql
```

**`database "X" does not exist` on migration run:**
Check `DB_DATABASE` in your `.env` matches the database the setup script created.

**Port already in use:**
```bash
lsof -i :3001   # backend
lsof -i :5432   # postgres
lsof -i :3306   # mysql
```

**Docker clean restart:**
```bash
docker compose down -v
docker compose up -d
cd packages/backend && pnpm run migration:run
```

**Frontend not reaching backend:**
- Check `NEXT_PUBLIC_API_URL` in `.env`
- Verify backend is on port 3001
- Check browser console for CORS errors

---

## Production Notes

```bash
NODE_ENV=production
ENCRYPTION_KEY=<64-char-hex>
JWT_SECRET=<64-char-hex>
DB_HOST=<prod-postgres-host>
DB_PASSWORD=<strong-password>
CORS_ORIGIN=<frontend-url>
```

For FDW in production, use granular grants instead of superuser:
```sql
GRANT USAGE ON FOREIGN DATA WRAPPER postgres_fdw TO app_user;
```

---

## License

MIT
