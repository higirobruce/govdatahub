# Dashboard Analytics API Documentation

## Overview

The Dashboard Analytics API provides comprehensive insights into your DataGate platform usage, performance, and health. All endpoints require JWT authentication and are scoped to your organization.

**Base URL**: `http://localhost:3001/api/dashboard/analytics`

**Authentication**: Bearer token (JWT)

---

## Available Analytics Endpoints

### 1. Query Performance Analytics

Get detailed statistics about query execution, performance, and failure rates.

**Endpoint**: `GET /api/dashboard/analytics/query-performance`

**Response**:
```json
{
  "avgExecutionTimeMs": 2350,
  "totalQueries": 156,
  "failedQueries": 8,
  "failureRate": 5.1,
  "timeoutQueries": 3,
  "slowestQueries": [
    {
      "id": "uuid-1234",
      "sqlQuery": "SELECT * FROM large_table WHERE...",
      "executionTimeMs": 5420,
      "status": "success",
      "executedAt": "2026-02-21T10:30:00Z",
      "connectionName": "PostgreSQL Production"
    }
  ],
  "queriesByDay": {
    "2026-02-20": 45,
    "2026-02-21": 52
  }
}
```

**Use Cases**:
- Identify slow queries that need optimization
- Monitor query failure trends
- Track query volume over time
- Detect timeout issues

---

### 2. Shared Dataset Analytics

Track shared dataset usage, API access patterns, and public dataset engagement.

**Endpoint**: `GET /api/dashboard/analytics/shared-datasets`

**Response**:
```json
{
  "totalSharedDatasets": 12,
  "publicShares": 8,
  "organizationShares": 3,
  "privateShares": 1,
  "totalApiCalls": 3456,
  "apiCallsToday": 234,
  "mostAccessedDatasets": [
    {
      "id": "uuid-1234",
      "name": "Customer Analytics Dataset",
      "datasetType": "connection",
      "accessCount": 1250,
      "lastAccessedAt": "2026-02-21T14:30:00Z",
      "apiKey": "gd_dc1292a84..."
    }
  ],
  "apiCallsByDay": {
    "2026-02-20": 198,
    "2026-02-21": 234
  }
}
```

**Use Cases**:
- Monitor which datasets are most valuable
- Track API usage trends
- Identify unused shared datasets
- Understand data consumption patterns

---

### 3. Data Freshness & Quality Stats

Monitor stale datasets, transformation health, and data quality issues.

**Endpoint**: `GET /api/dashboard/analytics/data-freshness`

**Response**:
```json
{
  "staleDatasets": 5,
  "failedTransformations": 2,
  "totalTransformations": 15,
  "transformationSuccessRate": 86.7,
  "staleDatasetsList": [
    {
      "id": "uuid-1234",
      "name": "Old Customer Data",
      "type": "staged",
      "daysSinceLastAccess": 45,
      "lastAccessedAt": "2026-01-05T10:00:00Z"
    }
  ],
  "failedTransformationsList": [
    {
      "id": "uuid-5678",
      "name": "Daily User Analytics",
      "lastRunAt": "2026-02-21T02:00:00Z",
      "errorMessage": "Connection timeout",
      "consecutiveFailures": 3
    }
  ]
}
```

**Use Cases**:
- Identify datasets that can be archived or deleted
- Monitor transformation pipeline health
- Track data quality issues
- Alert on failing data pipelines

**Stale Dataset Definition**: Datasets not accessed in 30+ days

---

### 4. Connection Health Status

Monitor database connection health, query activity, and error rates.

**Endpoint**: `GET /api/dashboard/analytics/connection-health`

**Response**:
```json
{
  "totalConnections": 8,
  "onlineConnections": 6,
  "offlineConnections": 1,
  "errorConnections": 1,
  "idleConnections": 2,
  "connections": [
    {
      "id": "uuid-1234",
      "name": "PostgreSQL Production",
      "type": "postgresql",
      "status": "online",
      "queryCount": 156,
      "lastUsedAt": "2026-02-21T14:30:00Z",
      "recentErrors": 0
    },
    {
      "id": "uuid-5678",
      "name": "MySQL Analytics",
      "type": "mysql",
      "status": "error",
      "queryCount": 45,
      "lastUsedAt": "2026-02-20T10:15:00Z",
      "recentErrors": 12
    }
  ],
  "connectionsByType": {
    "postgresql": 5,
    "mysql": 3
  }
}
```

**Connection Status Definitions**:
- **online**: Recent successful queries
- **offline**: Last query failed (but < 5 recent errors)
- **error**: 5+ errors in last 30 days
- **untested**: Never queried

**Use Cases**:
- Quickly identify problematic connections
- Monitor connection usage patterns
- Detect idle/unused connections
- Track connection health trends

---

## Usage Examples

### cURL Examples

#### Get Query Performance Stats
```bash
curl -X GET "http://localhost:3001/api/dashboard/analytics/query-performance" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Get Shared Dataset Stats
```bash
curl -X GET "http://localhost:3001/api/dashboard/analytics/shared-datasets" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Get Data Freshness Stats
```bash
curl -X GET "http://localhost:3001/api/dashboard/analytics/data-freshness" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Get Connection Health
```bash
curl -X GET "http://localhost:3001/api/dashboard/analytics/connection-health" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### JavaScript/TypeScript Example

```typescript
import { api } from '@/lib/api';

// Get all analytics data
async function loadDashboardAnalytics() {
  try {
    const [
      queryPerf,
      sharedDatasets,
      dataFreshness,
      connectionHealth
    ] = await Promise.all([
      api.get('/dashboard/analytics/query-performance'),
      api.get('/dashboard/analytics/shared-datasets'),
      api.get('/dashboard/analytics/data-freshness'),
      api.get('/dashboard/analytics/connection-health'),
    ]);

    console.log('Query Performance:', queryPerf.data);
    console.log('Shared Datasets:', sharedDatasets.data);
    console.log('Data Freshness:', dataFreshness.data);
    console.log('Connection Health:', connectionHealth.data);

    return {
      queryPerf: queryPerf.data,
      sharedDatasets: sharedDatasets.data,
      dataFreshness: dataFreshness.data,
      connectionHealth: connectionHealth.data,
    };
  } catch (error) {
    console.error('Failed to load analytics:', error);
    throw error;
  }
}

// Use in React component
function DashboardPage() {
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    loadDashboardAnalytics().then(setAnalytics);
  }, []);

  if (!analytics) return <Loading />;

  return (
    <div>
      <h1>Dashboard Analytics</h1>

      {/* Query Performance Section */}
      <section>
        <h2>Query Performance</h2>
        <StatCard
          title="Avg Execution Time"
          value={`${analytics.queryPerf.avgExecutionTimeMs}ms`}
          subtitle={`${analytics.queryPerf.totalQueries} queries`}
        />
        <StatCard
          title="Failure Rate"
          value={`${analytics.queryPerf.failureRate}%`}
          status={analytics.queryPerf.failureRate > 10 ? 'error' : 'success'}
        />
      </section>

      {/* Shared Datasets Section */}
      <section>
        <h2>Shared Datasets</h2>
        <StatCard
          title="Total API Calls"
          value={analytics.sharedDatasets.totalApiCalls}
          subtitle={`${analytics.sharedDatasets.apiCallsToday} today`}
        />
      </section>

      {/* Connection Health Matrix */}
      <section>
        <h2>Connection Health</h2>
        <ConnectionGrid connections={analytics.connectionHealth.connections} />
      </section>
    </div>
  );
}
```

---

### Python Example

```python
import requests

API_URL = "http://localhost:3001/api/dashboard/analytics"
TOKEN = "your_jwt_token"

headers = {
    "Authorization": f"Bearer {TOKEN}"
}

def get_analytics():
    """Fetch all dashboard analytics"""

    # Query performance
    query_perf = requests.get(
        f"{API_URL}/query-performance",
        headers=headers
    ).json()

    # Shared datasets
    shared_datasets = requests.get(
        f"{API_URL}/shared-datasets",
        headers=headers
    ).json()

    # Data freshness
    data_freshness = requests.get(
        f"{API_URL}/data-freshness",
        headers=headers
    ).json()

    # Connection health
    connection_health = requests.get(
        f"{API_URL}/connection-health",
        headers=headers
    ).json()

    return {
        "query_performance": query_perf,
        "shared_datasets": shared_datasets,
        "data_freshness": data_freshness,
        "connection_health": connection_health
    }

# Usage
analytics = get_analytics()

# Check for issues
if analytics["query_performance"]["failureRate"] > 10:
    print("⚠️ Warning: High query failure rate!")

if analytics["data_freshness"]["failedTransformations"] > 0:
    print(f"⚠️ {analytics['data_freshness']['failedTransformations']} transformations failing")

if analytics["connection_health"]["errorConnections"] > 0:
    print(f"⚠️ {analytics['connection_health']['errorConnections']} connections in error state")

# Print slowest queries
print("\n🐌 Slowest Queries:")
for query in analytics["query_performance"]["slowestQueries"][:5]:
    print(f"  - {query['executionTimeMs']}ms: {query['sqlQuery'][:50]}...")
```

---

## Dashboard UI Recommendations

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Quick Stats Row (4 cards)                                  │
│  [Avg Query Time] [Total Queries] [Shared Datasets] [Errors]│
├─────────────────────────────────────────────────────────────┤
│  Query Performance (2 columns)                              │
│  ┌──────────────────────┬──────────────────────────────┐   │
│  │ Execution Time Trend │ Top Slow Queries             │   │
│  │ (line chart)         │ (table)                      │   │
│  └──────────────────────┴──────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Data Health (3 columns)                                    │
│  ┌────────┬────────────┬──────────────────────────────┐   │
│  │ Stale  │ Failed     │ Transformation Success Rate  │   │
│  │ Data   │ Trans.     │ (progress bar: 86.7%)       │   │
│  └────────┴────────────┴──────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Shared Dataset Analytics                                   │
│  ┌──────────────────────┬──────────────────────────────┐   │
│  │ Most Accessed        │ API Usage Trend              │   │
│  │ Datasets (table)     │ (area chart)                 │   │
│  └──────────────────────┴──────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Connection Health Matrix                                   │
│  [●] PostgreSQL-A  [●] MySQL-B  [○] PostgreSQL-C  [●] ...  │
└─────────────────────────────────────────────────────────────┘
```

### Visual Indicators

**Query Performance**:
- 🟢 Green: < 2s avg execution time
- 🟡 Yellow: 2-5s avg execution time
- 🔴 Red: > 5s avg execution time

**Failure Rate**:
- 🟢 Green: < 5% failure rate
- 🟡 Yellow: 5-10% failure rate
- 🔴 Red: > 10% failure rate

**Connection Status**:
- 🟢 Online: Recent successful queries
- 🔴 Error: Multiple recent failures
- ⚪ Offline: Last query failed
- ⚫ Untested: Never queried

---

## Performance Considerations

**Data Time Ranges**:
- Query Performance: Last 7 days (configurable)
- Shared Dataset Stats: Last 7 days (configurable)
- Data Freshness: Last 30 days
- Connection Health: Last 30 days

**Caching Recommendations**:
- Cache analytics data for 5-10 minutes
- Use SWR or React Query with stale-while-revalidate
- Implement background refresh for live dashboards

**Pagination**:
- Slowest queries: Limited to top 10
- Most accessed datasets: Limited to top 10
- Stale datasets list: Limited to 10
- Failed transformations: Limited to 10

---

## Alerts and Notifications

### Recommended Alert Thresholds

1. **Query Performance**:
   - Alert if failure rate > 10%
   - Alert if avg execution time > 5s
   - Alert if timeout count > 5/day

2. **Data Freshness**:
   - Alert if transformation fails 3+ times consecutively
   - Notify if stale datasets > 20
   - Weekly report of transformation success rates

3. **Connection Health**:
   - Alert if any connection in error state
   - Notify if idle connections > 5
   - Daily connection health summary

4. **Shared Datasets**:
   - Alert if API calls drop > 50% day-over-day
   - Notify on unauthorized access attempts (future feature)

---

## API Response Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | Success | Analytics data returned |
| 401 | Unauthorized | Invalid or missing JWT token |
| 403 | Forbidden | Token valid but lacks organization access |
| 500 | Server Error | Database or internal error |

---

## FAQ

### Q: How often should I poll these endpoints?

**A**: Recommended intervals:
- Real-time dashboards: Every 30 seconds (with caching)
- Standard dashboards: Every 5 minutes
- Reports: Once per hour or on-demand

### Q: Can I customize the time range?

**A**: Currently set to 7 days for query/shared stats and 30 days for freshness/health. Future versions will support query parameters like `?days=14`.

### Q: Are these stats real-time?

**A**: Stats are calculated on-demand from the database. There's no pre-aggregation, so they reflect current data. For high-frequency updates, consider caching on the client side.

### Q: What counts as a "stale" dataset?

**A**: A dataset is considered stale if it hasn't been accessed (via query or API) in 30+ days.

### Q: How is "idle connection" defined?

**A**: A connection that has been added to the system but never had any queries executed against it.

---

## Changelog

### Version 1.0 (2026-02-21)
- ✅ Initial release
- ✅ Query performance analytics
- ✅ Shared dataset statistics
- ✅ Data freshness monitoring
- ✅ Connection health tracking
- ✅ Comprehensive API documentation

### Planned Features (Future)
- [ ] Custom date range selection
- [ ] Export analytics to CSV/PDF
- [ ] Scheduled email reports
- [ ] Webhook alerts for critical events
- [ ] User-level analytics (query patterns per user)
- [ ] Cost analytics (query resource consumption)
- [ ] Predictive analytics (ML-based anomaly detection)

---

## Support

For issues or questions:
- Check Swagger API docs: `http://localhost:3001/api/docs`
- Review this documentation
- File an issue in the DataGate repository
