# GovDataHub

**Data Integration and AI-Ready Data Platform for Government Use Cases**

GovDataHub is a web-based platform that allows users to connect to multiple databases, browse schemas, run SQL queries, and provide a REST API for external applications.

## Features

- 🔌 **Multi-Database Support** - Connect to PostgreSQL and MySQL databases
- 🔍 **Schema Discovery** - Browse database schemas, tables, and columns
- 📝 **SQL Query Interface** - Execute queries with syntax highlighting and results visualization
- 🔐 **Secure Credential Storage** - AES-256-GCM encryption for database credentials
- 📊 **Query History** - Track and review past query executions
- 🚦 **Rate Limiting** - Built-in protection against query abuse
- 📚 **API Documentation** - Interactive Swagger/OpenAPI documentation
- 🎯 **Data Catalog** - Tree view of database structures

## Tech Stack

### Backend
- **NestJS 11** - TypeScript framework
- **TypeORM** - Database ORM for metadata storage
- **PostgreSQL** - Metadata database
- **Swagger** - API documentation
- **Native Drivers** - `pg` for PostgreSQL, `mysql2` for MySQL

### Frontend
- **Next.js 14** - React framework with App Router
- **Tailwind CSS** - Utility-first CSS
- **SWR** - Data fetching and caching
- **TypeScript** - Type safety

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **pnpm** 8+ (will be installed automatically if missing)
- **Docker** & **Docker Compose** (for local development)

## Quick Start

### 1. Clone and Setup

```bash
cd govdatahub
bash scripts/setup.sh
```

This script will:
- Install pnpm (if not already installed)
- Generate encryption key and create `.env` file
- Install all dependencies
- Start PostgreSQL and MySQL containers
- Run database migrations

### 2. Start Development Servers

```bash
# Start both backend and frontend
pnpm dev
```

Or start them separately:

```bash
# Terminal 1 - Backend (port 3001)
pnpm --filter backend dev

# Terminal 2 - Frontend (port 3000)
pnpm --filter frontend dev
```

### 3. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api
- **Swagger Docs**: http://localhost:3001/api/docs

## Manual Setup (Alternative)

### 1. Install Dependencies

```bash
# Install pnpm globally
npm install -g pnpm

# Install project dependencies
pnpm install
```

### 2. Configure Environment

Create `.env` in the root and `packages/backend/.env`:

```bash
# Generate encryption key
openssl rand -hex 32

# Create .env files with the generated key
```

See [`.env.example`](.env.example) for all required variables.

### 3. Start Database

```bash
docker compose up -d
```

### 4. Run Migrations

```bash
cd packages/backend
pnpm run migration:run
```

### 5. Start Development

```bash
pnpm dev
```

## Usage Guide

### 1. Add a Database Connection

1. Navigate to **Connections** page
2. Click **Add Connection**
3. Fill in database credentials:
   - Connection Name
   - Database Type (PostgreSQL or MySQL)
   - Host, Port, Username, Password, Database Name
   - Optional: Enable SSL
4. Click **Create Connection**
5. Click **Test** to verify connection

The connection will be saved with encrypted credentials.

### 2. Browse Database Schema

1. Go to **Catalog** page
2. Select a connection from the dropdown
3. Expand schemas to see tables
4. Expand tables to see columns
5. Click **Query** on any table to start a query

### 3. Execute SQL Queries

1. Navigate to **Query** page
2. Select a database connection
3. Write your SQL query in the editor
4. Click **Execute** or press `Ctrl+Enter` (Cmd+Enter on Mac)
5. View results in the table below

**Security Features:**
- SQL injection patterns are blocked
- Query timeout: 30 seconds max
- Rate limit: 10 queries per minute
- Read-only mode recommended for production

### 4. View Query History

The **Dashboard** shows:
- Total connections count
- Queries executed today
- Recent query history with status and execution time

## API Documentation

### Interactive Documentation

Visit http://localhost:3001/api/docs for interactive Swagger documentation.

### Key Endpoints

#### Connections
```
POST   /api/connections           - Create connection
GET    /api/connections           - List all connections
GET    /api/connections/:id       - Get connection details
DELETE /api/connections/:id       - Delete connection
POST   /api/connections/:id/test  - Test connection
```

#### Schema Discovery
```
GET /api/connections/:id/schema/schemas                  - List schemas
GET /api/connections/:id/schema/tables                   - List tables
GET /api/connections/:id/schema/tables/:table/columns    - Get columns
```

#### Query Execution
```
POST /api/query          - Execute SQL query
GET  /api/query/history  - Get query history
GET  /api/query/:id      - Get query details
```

### Example API Usage

```bash
# Create a connection
curl -X POST http://localhost:3001/api/connections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Database",
    "type": "postgresql",
    "host": "localhost",
    "port": 5432,
    "username": "admin",
    "password": "admin123",
    "database": "govdatahub"
  }'

# Execute a query
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "connectionId": "550e8400-e29b-41d4-a716-446655440000",
    "sql": "SELECT * FROM connections LIMIT 10"
  }'
```

## Project Structure

```
govdatahub/
├── packages/
│   ├── backend/              # NestJS API
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── database/
│   │   │   │   ├── entities/     # TypeORM entities
│   │   │   │   └── migrations/   # Database migrations
│   │   │   └── modules/
│   │   │       ├── encryption/   # AES-256-GCM encryption
│   │   │       ├── connections/  # Connection CRUD
│   │   │       ├── schema/       # Schema discovery
│   │   │       └── queries/      # Query execution
│   │   └── package.json
│   └── frontend/             # Next.js App
│       ├── app/
│       │   ├── page.tsx          # Dashboard
│       │   ├── connections/      # Connection Manager
│       │   ├── query/            # Query Interface
│       │   └── catalog/          # Data Catalog
│       ├── components/
│       ├── lib/
│       │   └── api.ts            # API client
│       └── package.json
├── docker-compose.yml        # PostgreSQL + MySQL
├── scripts/
│   └── setup.sh              # Setup script
├── .env.example
└── package.json              # Root workspace
```

## Security Features

### Credential Encryption
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Storage**: Environment variable (not in code/database)
- **Format**: `iv:authTag:encryptedData` (all in hex)

### SQL Injection Prevention
- Pattern-based validation (blocks dangerous SQL)
- Query timeout enforcement (30 seconds)
- Rate limiting (10 queries/minute)

### API Security
- CORS configuration
- Input validation (class-validator)
- Throttling (30 requests/minute)
- Never logs credentials or passwords

## Testing

### Test with Sample Databases

The docker-compose setup includes:

**PostgreSQL** (Metadata DB)
- Host: localhost
- Port: 5432
- Database: govdatahub
- Username: admin
- Password: admin123

**MySQL** (Sample DB)
- Host: localhost
- Port: 3306
- Database: sampledb
- Username: testuser
- Password: testpass

### Run Backend Tests

```bash
cd packages/backend
pnpm test              # Unit tests
pnpm test:e2e          # Integration tests
```

## Development

### Database Migrations

```bash
cd packages/backend

# Generate new migration
pnpm run migration:generate -- src/database/migrations/YourMigrationName

# Run migrations
pnpm run migration:run

# Revert last migration
pnpm run migration:revert
```

### Troubleshooting

**Port already in use:**
```bash
# Check what's using port 3001 (backend)
lsof -i :3001

# Check what's using port 5432 (postgres)
lsof -i :5432
```

**Docker issues:**
```bash
# View logs
docker compose logs -f

# Restart services
docker compose restart

# Clean restart
docker compose down -v
docker compose up -d
```

**Frontend not connecting to backend:**
- Check `NEXT_PUBLIC_API_URL` in `.env`
- Verify backend is running on port 3001
- Check browser console for CORS errors

## Production Deployment

### Environment Variables

Set these in production:

```bash
NODE_ENV=production
ENCRYPTION_KEY=<64-char-hex-string>
DB_HOST=<production-postgres-host>
DB_PASSWORD=<strong-password>
CORS_ORIGIN=<frontend-url>
```

### Build for Production

```bash
# Build both apps
pnpm build

# Start production servers
pnpm start
```

### Security Checklist

- [ ] Change default database passwords
- [ ] Use strong encryption key
- [ ] Enable SSL for database connections
- [ ] Configure CORS for specific origins
- [ ] Set up authentication/authorization
- [ ] Use HTTPS in production
- [ ] Enable audit logging
- [ ] Regular security updates

## Roadmap

### Future Enhancements

- [ ] **Authentication** - JWT-based user authentication
- [ ] **More Databases** - MongoDB, Snowflake, SQL Server, Oracle
- [ ] **Query Builder** - Visual query builder UI
- [ ] **Data Exports** - CSV, Excel, JSON export
- [ ] **Scheduled Queries** - Cron-based query execution
- [ ] **Webhooks** - Notify external systems on query completion
- [ ] **Collaboration** - Share queries, add comments
- [ ] **Advanced Security** - SSO, field-level encryption, VPC peering
- [ ] **Performance** - Query result streaming, Redis caching

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- Open an issue on GitHub
- Check the [Swagger documentation](http://localhost:3001/api/docs)
- Review the code comments

---

**Built with ❤️ for Government Data Integration**