# Fix: FDW Server Setup Error

## Problem

The backend was failing with "Failed to setup FDW server" error due to:
1. Generic error messages hiding the actual cause
2. postgres_fdw extension not installed (permission denied)

## What Was Fixed

### 1. Improved Error Messages

**File:** `packages/backend/src/modules/cross-query/fdw-manager.service.ts`

Changed error handling to expose actual error details:

```typescript
// Before:
throw new BadRequestException('Failed to setup FDW server');

// After:
throw new BadRequestException(
  `Failed to setup FDW server: ${error.message || error}`,
);
```

This applies to both `setupFdwServer()` and `teardownFdwServer()` methods.

### 2. Created FDW Setup Scripts

**Files Created:**
- `scripts/setup-fdw.sql` - SQL commands to create postgres_fdw extension
- `scripts/setup-fdw.sh` - Bash script to run the SQL commands

These scripts will:
- Create the `postgres_fdw` extension as a superuser
- Grant necessary permissions to the `admin` database user
- Verify the extension was created successfully

## How to Fix

### Step 1: Setup postgres_fdw Extension

Run the setup script as the postgres superuser:

```bash
cd /Users/brucehigiro/Documents/development/datagate
./scripts/setup-fdw.sh
```

**You will be prompted for the postgres user password.**

**Alternative:** If you prefer to run manually:

```bash
psql -U postgres -d datagate -f scripts/setup-fdw.sql
```

### Step 2: Restart Backend Server

After the extension is created, restart your backend:

```bash
# Stop the backend (Ctrl+C if running)
cd packages/backend
npm run start:dev
```

### Step 3: Test Cross-Database Query

Now try creating a cross-database query again:

1. Go to http://localhost:3000/cross-query
2. Select 2+ connections
3. Add tables from different connections
4. Drag to create a join
5. Configure the join
6. Select columns
7. Execute query

**The error message will now show the actual problem if anything fails.**

## Verification

To verify postgres_fdw is installed correctly:

```bash
psql -U postgres -d datagate -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'postgres_fdw';"
```

Expected output:
```
    extname    | extversion
---------------+------------
 postgres_fdw  | 1.1
(1 row)
```

## What Changed

### Backend Files Modified:
1. `packages/backend/src/modules/cross-query/fdw-manager.service.ts`
   - Line 133: Improved error message in setupFdwServer()
   - Line 188: Improved error message in teardownFdwServer()

### New Files Created:
1. `scripts/setup-fdw.sql` - PostgreSQL setup commands
2. `scripts/setup-fdw.sh` - Automated setup script

## If You Still Get Errors

After running the setup script and restarting the backend:

1. **Check the new error message** - It will now show the actual problem:
   - Connection issues (host, port, credentials)
   - Permission issues (CREATE SERVER, CREATE USER MAPPING)
   - Network issues (firewall, SSL)

2. **Check backend console logs** - Look for detailed error messages with stack traces

3. **Verify database credentials** - Make sure the connections you're trying to join have correct credentials

4. **Test individual connections** - Go to /connections page and test each connection individually

## Common Issues and Solutions

### Issue: "CREATE SERVER" permission denied
**Solution:** Grant permission to admin user:
```sql
psql -U postgres -d datagate -c "ALTER USER admin WITH SUPERUSER;"
```

### Issue: "relation 'fdw_servers' does not exist"
**Solution:** Run migrations:
```bash
cd packages/backend
npm run migration:run
```

### Issue: Cannot connect to remote database
**Solution:** Verify:
- Remote database is running
- Credentials are correct
- Network allows connection (check firewall/security groups)
- SSL settings match remote database requirements

---

## Next Steps After Fix

Once FDW server setup works, continue with Phase 5 testing:

- [ ] Test simple 2-table join (same schema)
- [ ] Test cross-database join (different databases)
- [ ] Test visual join editor (drag and drop)
- [ ] Test join configuration dialog (INNER, LEFT, RIGHT, FULL)
- [ ] Test multiple joins (3+ tables)
- [ ] Test filter conditions
- [ ] Test saved queries
- [ ] Test pagination and CSV export

---

**Summary:** Run `./scripts/setup-fdw.sh`, restart backend, then test cross-database queries. Error messages will now show the actual problem if anything fails.
