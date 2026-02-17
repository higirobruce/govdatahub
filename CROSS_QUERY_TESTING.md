# Cross-Query Backend Testing Guide

## Overview
This guide walks through testing the cross-database join functionality (Phase 1-3 implementation).

---

## Prerequisites

1. **PostgreSQL metadata database running** (with postgres_fdw support)
2. **At least 2 test databases** (PostgreSQL or MySQL) with sample data
3. **Backend compiled and ready to run**

---

## Step 1: Run Database Migration

Create the cross-query tables:

```bash
cd /Users/brucehigiro/Documents/development/govdatahub/packages/backend

# Run migration
npm run migration:run
# or
pnpm migration:run
```

**Expected output:**
```
Migration AddCrossQuery1708400000000 has been executed successfully.
```

**Verify tables created:**
```sql
-- Connect to metadata database
psql -U admin -d govdatahub

-- Check tables exist
\dt fdw_servers
\dt saved_cross_queries

-- Check postgres_fdw extension installed
\dx postgres_fdw
```

---

## Step 2: Start Backend Server

```bash
cd /Users/brucehigiro/Documents/development/govdatahub/packages/backend

# Start in development mode
npm run start:dev
# or
pnpm start:dev
```

**Expected output:**
```
[Nest] INFO [NestApplication] Nest application successfully started
[Nest] INFO Swagger documentation available at: http://localhost:3001/api/docs
```

---

## Step 3: Set Up Test Connections

### 3.1 Create Test Databases (if not exist)

**Option A: Using docker-compose**
```yaml
# In docker-compose.yml
services:
  test-db-1:
    image: postgres:15
    environment:
      POSTGRES_DB: test_db_1
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
    ports:
      - "5433:5432"

  test-db-2:
    image: postgres:15
    environment:
      POSTGRES_DB: test_db_2
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
    ports:
      - "5434:5432"
```

**Option B: Create sample data manually**
```sql
-- Database 1: users database
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (name, email) VALUES
  ('Alice Johnson', 'alice@example.com'),
  ('Bob Smith', 'bob@example.com'),
  ('Carol Williams', 'carol@example.com');

-- Database 2: orders database
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO orders (user_id, total, status) VALUES
  (1, 99.99, 'completed'),
  (1, 149.50, 'completed'),
  (2, 299.00, 'pending'),
  (3, 49.99, 'completed');
```

### 3.2 Add Connections via API

Open Swagger UI: http://localhost:3001/api/docs

**Login first** (get JWT token):
```json
POST /api/auth/login
{
  "email": "your@email.com",
  "password": "your_password"
}
```

**Add Connection 1 (users database):**
```json
POST /api/connections
Authorization: Bearer <your_jwt_token>

{
  "name": "Users Database",
  "type": "postgresql",
  "host": "localhost",
  "port": 5433,
  "database": "test_db_1",
  "username": "testuser",
  "password": "testpass",
  "ssl": false
}
```

**Save the connection ID** from response (e.g., `conn-123`)

**Add Connection 2 (orders database):**
```json
POST /api/connections
Authorization: Bearer <your_jwt_token>

{
  "name": "Orders Database",
  "type": "postgresql",
  "host": "localhost",
  "port": 5434,
  "database": "test_db_2",
  "username": "testuser",
  "password": "testpass",
  "ssl": false
}
```

**Save the connection ID** from response (e.g., `conn-456`)

### 3.3 Test Connections

```json
POST /api/connections/{connectionId}/test
Authorization: Bearer <your_jwt_token>
```

**Expected response:**
```json
{
  "success": true,
  "message": "Connection successful"
}
```

---

## Step 4: Test Cross-Database Query

### Test Case 1: Simple INNER JOIN

**Endpoint:** `POST /api/cross-query/execute`

**Request:**
```json
{
  "queryDefinition": {
    "tables": [
      {
        "connectionId": "conn-123",
        "schemaName": "public",
        "tableName": "users",
        "alias": "u"
      },
      {
        "connectionId": "conn-456",
        "schemaName": "public",
        "tableName": "orders",
        "alias": "o"
      }
    ],
    "joins": [
      {
        "type": "INNER",
        "leftTable": "u",
        "rightTable": "o",
        "conditions": [
          {
            "leftColumn": "id",
            "operator": "=",
            "rightColumn": "user_id"
          }
        ]
      }
    ],
    "columns": [
      { "table": "u", "column": "name" },
      { "table": "u", "column": "email" },
      { "table": "o", "column": "total" },
      { "table": "o", "column": "status" }
    ],
    "limit": 10
  }
}
```

**Expected Response:**
```json
{
  "rows": [
    {
      "name": "Alice Johnson",
      "email": "alice@example.com",
      "total": 99.99,
      "status": "completed"
    },
    {
      "name": "Alice Johnson",
      "email": "alice@example.com",
      "total": 149.50,
      "status": "completed"
    },
    {
      "name": "Bob Smith",
      "email": "bob@example.com",
      "total": 299.00,
      "status": "pending"
    },
    {
      "name": "Carol Williams",
      "email": "carol@example.com",
      "total": 49.99,
      "status": "completed"
    }
  ],
  "rowCount": 4,
  "fields": [
    { "name": "name", "type": "text" },
    { "name": "email", "type": "text" },
    { "name": "total", "type": "numeric" },
    { "name": "status", "type": "text" }
  ],
  "executionTimeMs": 234,
  "generatedSql": "SELECT \"fdw_org_...\".\"name\", ..."
}
```

---

## Step 5: Test Different Join Types

### Test Case 2: LEFT JOIN

```json
{
  "queryDefinition": {
    "tables": [
      {
        "connectionId": "conn-123",
        "schemaName": "public",
        "tableName": "users",
        "alias": "u"
      },
      {
        "connectionId": "conn-456",
        "schemaName": "public",
        "tableName": "orders",
        "alias": "o"
      }
    ],
    "joins": [
      {
        "type": "LEFT",
        "leftTable": "u",
        "rightTable": "o",
        "conditions": [
          {
            "leftColumn": "id",
            "operator": "=",
            "rightColumn": "user_id"
          }
        ]
      }
    ],
    "columns": [
      { "table": "u", "column": "name" },
      { "table": "o", "column": "total" }
    ]
  }
}
```

**Expected:** Should return all users, with NULL for total if no orders

---

## Step 6: Test Filters

### Test Case 3: Query with WHERE Clause

```json
{
  "queryDefinition": {
    "tables": [
      {
        "connectionId": "conn-123",
        "schemaName": "public",
        "tableName": "users",
        "alias": "u"
      },
      {
        "connectionId": "conn-456",
        "schemaName": "public",
        "tableName": "orders",
        "alias": "o"
      }
    ],
    "joins": [
      {
        "type": "INNER",
        "leftTable": "u",
        "rightTable": "o",
        "conditions": [
          {
            "leftColumn": "id",
            "operator": "=",
            "rightColumn": "user_id"
          }
        ]
      }
    ],
    "columns": [
      { "table": "u", "column": "name" },
      { "table": "o", "column": "total" },
      { "table": "o", "column": "status" }
    ],
    "filters": [
      {
        "table": "o",
        "column": "status",
        "operator": "=",
        "value": "completed"
      }
    ]
  }
}
```

**Expected:** Only orders with status='completed'

---

## Step 7: Test Query Validation

### Test Case 4: Invalid Query (should fail)

```json
POST /api/cross-query/validate

{
  "queryDefinition": {
    "tables": [
      {
        "connectionId": "conn-123",
        "schemaName": "public",
        "tableName": "users",
        "alias": "u"
      }
    ],
    "joins": [],
    "columns": []
  }
}
```

**Expected Error:**
```json
{
  "statusCode": 400,
  "message": "At least one column must be selected"
}
```

---

## Step 8: Test Saved Queries

### Test Case 5: Save Query

```json
POST /api/cross-query/saved

{
  "name": "User Orders Report",
  "description": "Join users with their orders",
  "queryDefinition": {
    "tables": [...],
    "joins": [...],
    "columns": [...]
  }
}
```

**Expected:** Returns saved query with ID

### Test Case 6: List Saved Queries

```json
GET /api/cross-query/saved
```

**Expected:** Returns array of saved queries

### Test Case 7: Load Saved Query

```json
GET /api/cross-query/saved/{queryId}
```

**Expected:** Returns full query definition

---

## Step 9: Verify FDW Infrastructure

### Check FDW Servers Created

```sql
-- Connect to metadata database
psql -U admin -d govdatahub

-- Check FDW servers table
SELECT * FROM fdw_servers;

-- Check PostgreSQL FDW servers
SELECT srvname, srvoptions
FROM pg_foreign_server
WHERE srvname LIKE 'org_%';

-- Check user mappings
SELECT
  um.umuser::regrole AS user,
  s.srvname AS server
FROM pg_user_mappings um
JOIN pg_foreign_server s ON um.srvserver = s.oid;
```

**Expected:**
- `fdw_servers` table has records for each connection
- PostgreSQL has FDW server objects created
- User mappings exist for metadata DB user

### Check Foreign Table Cleanup

After running a query, foreign tables should be cleaned up:

```sql
-- Check for orphaned foreign tables
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname LIKE 'fdw_org_%'
  AND tablename LIKE 'ft_%';
```

**Expected:** Empty result (all temporary tables cleaned up)

---

## Step 10: Test Error Scenarios

### Test Case 8: Connection Timeout

Create a very slow query or set low timeout in .env:
```bash
CROSS_QUERY_TIMEOUT_MS=1000  # 1 second
```

**Expected Error:**
```json
{
  "statusCode": 400,
  "message": "Query execution timed out. Please simplify your query or add filters to reduce data volume."
}
```

### Test Case 9: Invalid Connection

Use a non-existent connection ID:
```json
{
  "queryDefinition": {
    "tables": [
      {
        "connectionId": "invalid-id",
        "schemaName": "public",
        "tableName": "users",
        "alias": "u"
      }
    ]
  }
}
```

**Expected Error:**
```json
{
  "statusCode": 404,
  "message": "Connection with ID invalid-id not found"
}
```

### Test Case 10: Rate Limiting

Execute 6+ queries rapidly:

**Expected:** After 5th query:
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

---

## Step 11: Performance Testing

### Test Case 11: Large Dataset Join

Create tables with 100K+ rows in each database, then join them.

**Monitor:**
- Execution time (should be < 3 minutes)
- Memory usage
- PostgreSQL FDW query plans

**Check query plan:**
```sql
-- In metadata database, run EXPLAIN on generated SQL
EXPLAIN ANALYZE <generated_sql>;
```

---

## Verification Checklist

- [ ] Migration created tables successfully
- [ ] Backend starts without errors
- [ ] Can add connections via API
- [ ] Can test connections successfully
- [ ] Simple INNER JOIN works
- [ ] LEFT JOIN works
- [ ] Filters work correctly
- [ ] Query validation catches errors
- [ ] Can save and load queries
- [ ] FDW servers created in PostgreSQL
- [ ] Foreign tables cleaned up after query
- [ ] Rate limiting works
- [ ] Timeout protection works
- [ ] Error messages are clear
- [ ] Swagger documentation is complete
- [ ] Large datasets perform adequately

---

## Troubleshooting

### Issue: postgres_fdw extension not available

**Solution:**
```bash
# On Ubuntu/Debian
sudo apt-get install postgresql-contrib

# On macOS with Homebrew
brew install postgresql
```

### Issue: FDW server creation fails

**Check:**
1. Metadata DB user has SUPERUSER or CREATE privileges
2. Target connections are reachable from metadata DB host
3. Firewall allows connections between databases

### Issue: Foreign table import fails

**Check:**
1. Schema and table names are correct
2. Source database user has SELECT privileges
3. Table exists in specified schema

### Issue: Query timeout on small datasets

**Check:**
1. Network latency between databases
2. CROSS_QUERY_TIMEOUT_MS environment variable
3. Source database performance

---

## Next Steps

Once all tests pass:
1. ✅ Phase 1-3 Backend Complete
2. 🎯 Move to Phase 4: Frontend - Basic UI
3. 🎯 Implement visual query builder
4. 🎯 Add drag-and-drop join editor

---

## Support

If you encounter issues:
1. Check backend logs for detailed error messages
2. Verify PostgreSQL logs for FDW-related errors
3. Test connections individually before cross-queries
4. Ensure postgres_fdw extension is installed

**Log locations:**
- Backend: Console output in development mode
- PostgreSQL: `/var/log/postgresql/` or check `pg_log`
