# Dataset Sharing API Documentation

## Overview

The Dataset Sharing API allows you to share datasets publicly via API keys or share tokens, enabling external access to your data without authentication.

## Supported Dataset Types

1. **Staged Data** - Data imported from CSV/Excel files
2. **Connections** - Database connections (PostgreSQL, MySQL)
3. **Transformations** - Transformation pipeline results

## Authentication Methods

### API Key
- **Format**: `gd_[64-character-hex-string]`
- **Use Case**: Programmatic access, API integrations
- **Example**: `gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da`

### Share Token
- **Format**: `[48-character-hex-string]`
- **Use Case**: Web-based sharing, embedded visualizations
- **Example**: `abc123def456789...`

---

## API Endpoints

### 1. Get Dataset Metadata

Retrieve dataset information and data (if available).

**Endpoint**: `GET /api/public/datasets/:apiKey`

**Parameters**:
- `apiKey` (path) - Your dataset API key

**Response**:

For **Connection** datasets:
```json
{
  "metadata": {
    "name": "Vehicles Database",
    "description": "PostgreSQL connection",
    "connectionName": "Vehicles",
    "connectionType": "postgresql"
  },
  "data": {
    "type": "connection",
    "message": "Use the query API to fetch data from this connection"
  }
}
```

For **Transformation** datasets:
```json
{
  "metadata": {
    "name": "User Analytics",
    "description": "Daily user statistics",
    "transformationName": "Daily User Stats",
    "lastRun": "2026-02-21T10:30:00Z"
  },
  "data": {
    "rows": [...],
    "rowCount": 1500
  }
}
```

---

### 2. Execute SQL Query (Connections & Staged Data)

Execute a SELECT query on a shared database connection or staged dataset.

**Endpoint**: `POST /api/public/datasets/:apiKey/query`

**Parameters**:
- `apiKey` (path) - Your dataset API key
- `limit` (query, optional) - Max rows to return (default: 1000, max: 10000)
- `offset` (query, optional) - Rows to skip for pagination (default: 0)

**Request Body**:
```json
{
  "sqlQuery": "SELECT * FROM table_name WHERE condition LIMIT 10"
}
```

**Response**:
```json
{
  "rows": [
    {
      "id": 1,
      "make": "Toyota",
      "model": "Camry",
      "year": 2023
    },
    {
      "id": 2,
      "make": "Honda",
      "model": "Accord",
      "year": 2022
    }
  ],
  "rowCount": 2,
  "fields": [
    {
      "name": "id",
      "type": "integer"
    },
    {
      "name": "make",
      "type": "varchar"
    },
    {
      "name": "model",
      "type": "varchar"
    },
    {
      "name": "year",
      "type": "integer"
    }
  ],
  "executionTimeMs": 45,
  "metadata": {
    "connectionName": "Vehicles",
    "connectionType": "postgresql",
    "datasetName": "Vehicles Database"
  }
}
```

---

## Usage Examples

### cURL Examples

#### 1. Get Dataset Metadata

```bash
curl -X GET "http://localhost:3001/api/public/datasets/gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da"
```

#### 2. List All Tables (PostgreSQL)

```bash
curl -X POST "http://localhost:3001/api/public/datasets/gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da/query" \
  -H "Content-Type: application/json" \
  -d '{
    "sqlQuery": "SELECT table_name FROM information_schema.tables WHERE table_schema = '\''public'\'' ORDER BY table_name"
  }'
```

#### 3. Query a Table

```bash
curl -X POST "http://localhost:3001/api/public/datasets/gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da/query" \
  -H "Content-Type: application/json" \
  -d '{
    "sqlQuery": "SELECT * FROM vehicles WHERE year >= 2020 LIMIT 10"
  }'
```

#### 4. Paginated Query

```bash
# Page 1 (rows 0-99)
curl -X POST "http://localhost:3001/api/public/datasets/gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da/query?limit=100&offset=0" \
  -H "Content-Type: application/json" \
  -d '{
    "sqlQuery": "SELECT * FROM vehicles ORDER BY id"
  }'

# Page 2 (rows 100-199)
curl -X POST "http://localhost:3001/api/public/datasets/gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da/query?limit=100&offset=100" \
  -H "Content-Type: application/json" \
  -d '{
    "sqlQuery": "SELECT * FROM vehicles ORDER BY id"
  }'
```

#### 5. Aggregate Query

```bash
curl -X POST "http://localhost:3001/api/public/datasets/gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da/query" \
  -H "Content-Type: application/json" \
  -d '{
    "sqlQuery": "SELECT make, COUNT(*) as total FROM vehicles GROUP BY make ORDER BY total DESC"
  }'
```

#### 6. Save Results to File

```bash
curl -X POST "http://localhost:3001/api/public/datasets/gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da/query" \
  -H "Content-Type: application/json" \
  -d '{
    "sqlQuery": "SELECT * FROM vehicles LIMIT 1000"
  }' \
  -o vehicles_data.json
```

#### 7. Pretty Print with jq

```bash
curl -X POST "http://localhost:3001/api/public/datasets/gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da/query" \
  -H "Content-Type: application/json" \
  -d '{
    "sqlQuery": "SELECT * FROM vehicles LIMIT 5"
  }' | jq '.'
```

---

### JavaScript/TypeScript Example

```typescript
// Define the API client
const API_KEY = 'gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da';
const BASE_URL = 'http://localhost:3001/api/public/datasets';

// Execute a query
async function queryDataset(sqlQuery: string, limit = 100, offset = 0) {
  const response = await fetch(
    `${BASE_URL}/${API_KEY}/query?limit=${limit}&offset=${offset}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sqlQuery }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Query failed');
  }

  return await response.json();
}

// Usage
async function main() {
  try {
    // List tables
    const tables = await queryDataset(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    console.log('Available tables:', tables.rows);

    // Query a table
    const vehicles = await queryDataset(
      'SELECT * FROM vehicles WHERE year >= 2020 LIMIT 10'
    );
    console.log('Vehicles:', vehicles.rows);

    // Paginate through results
    for (let offset = 0; offset < 500; offset += 100) {
      const page = await queryDataset(
        'SELECT * FROM vehicles ORDER BY id',
        100,
        offset
      );
      console.log(`Page ${offset / 100 + 1}:`, page.rows.length, 'rows');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

---

### Python Example

```python
import requests
import json

API_KEY = "gd_dc1292a84958872a7bea88bf38159b739bf70d3665f8418bc73a896bbc55c1da"
BASE_URL = f"http://localhost:3001/api/public/datasets/{API_KEY}"

def query_dataset(sql_query, limit=100, offset=0):
    """Execute a SQL query on the shared dataset"""
    response = requests.post(
        f"{BASE_URL}/query",
        json={"sqlQuery": sql_query},
        params={"limit": limit, "offset": offset}
    )

    response.raise_for_status()
    return response.json()

# Get metadata
metadata = requests.get(BASE_URL).json()
print("Dataset:", metadata["metadata"]["name"])

# List tables
tables = query_dataset(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
)
print("Tables:", [row["table_name"] for row in tables["rows"]])

# Query data
vehicles = query_dataset("SELECT * FROM vehicles WHERE year >= 2020 LIMIT 10")
print(f"Found {vehicles['rowCount']} vehicles")

# Paginate through all data
all_data = []
offset = 0
limit = 100

while True:
    page = query_dataset("SELECT * FROM vehicles ORDER BY id", limit, offset)
    all_data.extend(page["rows"])

    if page["rowCount"] < limit:
        break

    offset += limit

print(f"Total vehicles: {len(all_data)}")
```

---

## SQL Query Rules & Security

### Allowed Queries
✅ **SELECT** statements
✅ **JOINs** (INNER, LEFT, RIGHT, FULL)
✅ **WHERE** clauses
✅ **GROUP BY** and **HAVING**
✅ **ORDER BY**
✅ **LIMIT** and **OFFSET**
✅ **Aggregate functions** (COUNT, SUM, AVG, MIN, MAX)
✅ **Subqueries** (in SELECT or WHERE)

### Blocked Patterns
❌ **INSERT**, **UPDATE**, **DELETE** statements
❌ **DROP**, **ALTER**, **CREATE**, **TRUNCATE** statements
❌ **GRANT**, **REVOKE** (permission changes)
❌ Multiple statements (semicolon-separated)
❌ SQL comments (`--` or `/* */`)
❌ System commands (`xp_cmdshell`, `EXEC`, etc.)

### Query Limits
- **Default limit**: 1,000 rows
- **Maximum limit**: 10,000 rows
- **Timeout**: 30 seconds
- **Rate limit**: Applied (check with your administrator)

---

## Common Use Cases

### 1. Data Export for Analysis
```bash
# Export entire table to JSON
curl -X POST "$BASE_URL/query" \
  -H "Content-Type: application/json" \
  -d '{"sqlQuery": "SELECT * FROM sales_data"}' \
  -o sales_export.json
```

### 2. Dashboard Integration
```javascript
// Fetch latest metrics for dashboard
const metrics = await queryDataset(`
  SELECT
    COUNT(*) as total_orders,
    SUM(total_amount) as revenue,
    AVG(total_amount) as avg_order_value
  FROM orders
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
`);
```

### 3. Data Validation
```bash
# Check for data quality issues
curl -X POST "$BASE_URL/query" \
  -H "Content-Type: application/json" \
  -d '{
    "sqlQuery": "SELECT * FROM users WHERE email NOT LIKE '\''%@%'\'' LIMIT 100"
  }'
```

### 4. Reporting
```python
# Generate monthly report
report = query_dataset("""
    SELECT
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as orders,
        SUM(total_amount) as revenue
    FROM orders
    WHERE created_at >= '2024-01-01'
    GROUP BY month
    ORDER BY month DESC
""")
```

---

## Error Responses

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Only SELECT queries are allowed",
  "error": "Bad Request"
}
```

**Common Causes**:
- Non-SELECT query
- Dangerous SQL pattern detected
- Invalid SQL syntax

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Invalid API key",
  "error": "Not Found"
}
```

**Causes**:
- Invalid or expired API key
- Dataset has been deleted or deactivated

### 429 Too Many Requests
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests"
}
```

**Causes**:
- Rate limit exceeded
- Wait before retrying

---

## Best Practices

### 1. Use Pagination for Large Datasets
```javascript
// Don't fetch all data at once
// ❌ Bad
const allData = await queryDataset("SELECT * FROM large_table");

// ✅ Good - paginate
async function* fetchAllData(query) {
  let offset = 0;
  const limit = 1000;

  while (true) {
    const page = await queryDataset(query, limit, offset);
    yield page.rows;

    if (page.rowCount < limit) break;
    offset += limit;
  }
}
```

### 2. Add Indexes for Better Performance
Ask your dataset administrator to add indexes on frequently queried columns.

### 3. Use Specific Column Selection
```sql
-- ❌ Don't use SELECT *
SELECT * FROM users;

-- ✅ Select only needed columns
SELECT id, name, email FROM users;
```

### 4. Handle Errors Gracefully
```typescript
try {
  const result = await queryDataset(sqlQuery);
  return result.rows;
} catch (error) {
  if (error.status === 429) {
    // Wait and retry
    await sleep(5000);
    return queryDataset(sqlQuery);
  }
  throw error;
}
```

### 5. Cache Results When Possible
```javascript
const cache = new Map();

async function getCachedQuery(query) {
  if (cache.has(query)) {
    return cache.get(query);
  }

  const result = await queryDataset(query);
  cache.set(query, result);

  // Expire after 5 minutes
  setTimeout(() => cache.delete(query), 5 * 60 * 1000);

  return result;
}
```

---

## FAQ

### Q: How do I get an API key?
A: Contact your dataset administrator to create a share and generate an API key for you.

### Q: Can I modify data through the API?
A: No, the public API is read-only. Only SELECT queries are allowed.

### Q: What happens if my query times out?
A: Queries have a 30-second timeout. Optimize your query or add WHERE clauses to limit data.

### Q: How do I discover available tables?
A: Query `information_schema.tables`:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
```

### Q: Can I join tables from different databases?
A: Not through this API. Each shared dataset can only query its own database. For cross-database queries, use the authenticated Cross-Query API.

### Q: Is my API key secure?
A: Treat API keys like passwords. Don't commit them to version control. Use environment variables.

---

## Support

For issues or questions:
- Check Swagger API docs: `http://localhost:3001/api/docs`
- Contact your dataset administrator
- File an issue in the GovDataHub repository

---

## Changelog

### Version 1.1 (2026-02-21)
- ✅ Added POST `/api/public/datasets/:apiKey/query` endpoint
- ✅ Added query execution for shared connections
- ✅ Enhanced documentation with examples
- ✅ Added pagination support

### Version 1.0
- Initial release
- GET metadata endpoint
- Basic sharing functionality
