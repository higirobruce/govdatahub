# 🔗 Linking Data to Dashboards - Complete Guide

## Overview

DataGate provides **3 ways** to connect real data to your dashboard charts:

1. **Query Results → Dashboard** ⭐ (Recommended)
2. **Manual Data Configuration** (For custom/static data)
3. **Live Query Connection** (Coming soon - auto-refresh)

---

## 🎯 Method 1: Query Results → Dashboard (Implemented)

### **User Workflow**

```
Run SQL Query → Get Results → Click "Add to Dashboard" → Configure Chart → Load in Dashboard Builder
```

### **Step-by-Step Guide**

#### **Step 1: Run a Query**
1. Navigate to **SQL Query** page (`/query`)
2. Select a database connection or staging table
3. Write your SQL query:
   ```sql
   SELECT category, SUM(revenue) as total_revenue
   FROM sales
   GROUP BY category
   ORDER BY total_revenue DESC
   LIMIT 10;
   ```
4. Click **Execute** (or Ctrl+Enter)

#### **Step 2: Add to Dashboard**
1. After query executes, you'll see two buttons:
   - **"Visualize"** - Quick preview
   - **"Add to Dashboard"** ⭐ - Add to persistent dashboard

2. Click **"Add to Dashboard"**

3. Configure the chart in the modal:
   - **Chart Title**: "Top 10 Revenue by Category"
   - **Chart Type**: Choose from Bar, Line, Pie, Area
   - **X-Axis**: `category` (label column)
   - **Y-Axis**: `total_revenue` (value column)

4. Click **"Add to Dashboard"**
   - Chart is saved to pending queue
   - You'll see: "Chart added! Go to Dashboard Builder to see it."

#### **Step 3: Load in Dashboard Builder**
1. Navigate to **Dashboard Builder** (`/dashboards`)
2. You'll see a notification button: **"Load Pending Charts"** with a red badge (📍 2)
3. Click **"Load Pending Charts"**
4. All pending charts are added to your dashboard!
5. **Drag, resize, and arrange** charts as needed
6. Click **"Save"** to persist your dashboard

---

## 📊 Data Transformation Details

### How Query Results Become Charts

When you click "Add to Dashboard", the system automatically transforms your SQL results:

```typescript
// Your SQL query returns:
[
  { category: 'Electronics', total_revenue: 45000 },
  { category: 'Clothing', total_revenue: 32000 },
  { category: 'Food', total_revenue: 28000 }
]

// Transforms to chart data:
{
  xAxis: ['Electronics', 'Clothing', 'Food'],
  series: [{
    name: 'total_revenue',
    data: [45000, 32000, 28000],
    color: '#60a5fa'
  }]
}
```

### Supported Chart Types & Their Data Needs

| Chart Type | Required Data | Best For |
|------------|---------------|----------|
| **Bar Chart** | X: Labels, Y: Numbers | Comparing categories |
| **Line Chart** | X: Time/sequence, Y: Numbers | Trends over time |
| **Pie Chart** | Labels + Values | Proportions/percentages |
| **Area Chart** | X: Time/sequence, Y: Numbers | Cumulative trends |
| **Scatter Plot** | X: Numbers, Y: Numbers | Correlations |
| **Radar Chart** | Multiple metrics per item | Multi-dimensional comparisons |
| **Gauge** | Single numeric value | KPI metrics |
| **Funnel** | Sequential stages + values | Conversion analysis |
| **Heatmap** | Matrix of values | Correlation matrices |

---

## 🔄 Method 2: Manual Data Configuration

### When to Use
- Static reference data
- One-time visualizations
- Testing chart layouts

### How It Works (Current)

**Dashboard Builder** creates charts with sample data:

```typescript
// Sample data structure
{
  xAxis: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  series: [{
    name: 'Sample Data',
    data: [120, 200, 150, 80, 70],
    color: '#60a5fa'
  }]
}
```

**To customize:**
1. Add a chart in Dashboard Builder
2. Click **Settings icon** (⚙️)
3. Change chart type - data auto-transforms
4. Modify title and options

---

## 🚀 Method 3: Live Query Connection (Future Enhancement)

### Planned Implementation

**Features:**
- Link chart to a **saved query**
- Auto-refresh on interval (every 5 min, hourly, daily)
- Parameterized queries (e.g., date range filters)
- Real-time data streaming

**Example Use Case:**
```sql
-- Save this as "Daily Revenue Query"
SELECT
  DATE(created_at) as date,
  SUM(amount) as revenue
FROM transactions
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date;
```

**Dashboard Configuration:**
- Chart refreshes every 1 hour
- Always shows last 30 days
- Updates automatically when new data arrives

---

## 💾 Data Storage & Persistence

### Current Implementation

**Pending Charts** (Query → Dashboard):
```javascript
// Stored in localStorage
localStorage.setItem('pendingDashboardCharts', JSON.stringify([
  {
    type: 'bar',
    title: 'Revenue by Category',
    data: { xAxis: [...], series: [...] },
    dataSource: {
      type: 'query',
      sql: 'SELECT...',
      timestamp: '2026-02-22T10:30:00Z'
    }
  }
]));
```

**Saved Dashboards**:
```javascript
localStorage.setItem('dashboards', JSON.stringify([
  {
    name: 'Sales Analytics',
    widgets: [...],
    layout: [...],
    createdAt: '2026-02-22T10:30:00Z'
  }
]));
```

### Future: Backend API

**Planned Endpoints:**
```typescript
POST   /api/dashboards              // Create dashboard
GET    /api/dashboards              // List all dashboards
GET    /api/dashboards/:id          // Get specific dashboard
PUT    /api/dashboards/:id          // Update dashboard
DELETE /api/dashboards/:id          // Delete dashboard
POST   /api/dashboards/:id/refresh  // Refresh all charts
```

**Database Schema:**
```sql
CREATE TABLE dashboards (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255),
  description TEXT,
  widgets JSONB,
  layout JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE dashboard_queries (
  id UUID PRIMARY KEY,
  dashboard_id UUID REFERENCES dashboards(id),
  widget_id VARCHAR(255),
  query_definition JSONB,
  refresh_interval INTEGER, -- in seconds
  last_refreshed TIMESTAMP
);
```

---

## 🎯 Real-World Examples

### Example 1: Sales Performance Dashboard

**Query 1: Revenue by Region**
```sql
SELECT region, SUM(amount) as total_revenue
FROM sales
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY region;
```
→ **Bar Chart** (Add to Dashboard)

**Query 2: Daily Sales Trend**
```sql
SELECT DATE(created_at) as date, COUNT(*) as orders
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date;
```
→ **Line Chart** (Add to Dashboard)

**Query 3: Product Category Mix**
```sql
SELECT category, COUNT(*) as count
FROM products
GROUP BY category;
```
→ **Pie Chart** (Add to Dashboard)

**Result:** 3-chart dashboard showing comprehensive sales overview!

### Example 2: System Monitoring Dashboard

**Query 1: Database Connection Status**
```sql
SELECT status, COUNT(*) as count
FROM connections
GROUP BY status;
```
→ **Pie Chart** (Online/Offline/Error)

**Query 2: Query Execution Times**
```sql
SELECT connection_name, AVG(execution_time_ms) as avg_time
FROM query_history
WHERE executed_at >= CURRENT_DATE
GROUP BY connection_name
ORDER BY avg_time DESC
LIMIT 10;
```
→ **Bar Chart** (Slowest connections)

**Query 3: Data Freshness**
```sql
SELECT
  table_name,
  EXTRACT(HOUR FROM NOW() - last_updated) as hours_old
FROM staging_tables
ORDER BY hours_old DESC
LIMIT 5;
```
→ **Gauge Chart** (Staleness indicator)

---

## 🛠️ Technical Implementation

### Chart Data Flow

```
┌─────────────┐
│ SQL Query   │
└──────┬──────┘
       │ Execute
       ▼
┌─────────────────┐
│ Query Results   │
│ {rows, fields}  │
└──────┬──────────┘
       │ Click "Add to Dashboard"
       ▼
┌──────────────────────┐
│ AddToDashboardModal  │
│ - Select chart type  │
│ - Choose X/Y columns │
└──────┬───────────────┘
       │ Transform data
       ▼
┌─────────────────────────┐
│ Chart Data Structure    │
│ {xAxis, series, ...}    │
└──────┬──────────────────┘
       │ Save to localStorage
       ▼
┌──────────────────────┐
│ Pending Charts Queue │
└──────┬───────────────┘
       │ Navigate to /dashboards
       ▼
┌─────────────────────┐
│ Dashboard Builder   │
│ - Load pending      │
│ - Drag & resize     │
│ - Save dashboard    │
└─────────────────────┘
```

### Code References

**Add to Dashboard Modal:**
```typescript
// packages/frontend/components/DashboardBuilder/AddToDashboardModal.tsx
export function AddToDashboardModal({ queryResult, onClose, onAdd }) {
  // Transforms query results to chart data
  // Supports all 9 chart types
}
```

**Query Page Integration:**
```typescript
// packages/frontend/app/query/page.tsx
<Button onClick={() => setShowAddToDashboard(true)}>
  <LayoutDashboard /> Add to Dashboard
</Button>
```

**Dashboard Builder:**
```typescript
// packages/frontend/app/dashboards/page.tsx
const loadPendingCharts = () => {
  // Loads charts from localStorage
  // Creates widgets and layouts
  // Clears pending queue
};
```

---

## ✅ Best Practices

### 1. **Query Design for Dashboards**
```sql
-- ✅ GOOD: Aggregated, limited, labeled
SELECT
  category as "Product Category",
  SUM(revenue) as "Total Revenue"
FROM sales
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY category
ORDER BY "Total Revenue" DESC
LIMIT 10;

-- ❌ BAD: Raw data, too many rows
SELECT * FROM sales;  -- Don't do this!
```

### 2. **Choose Appropriate Chart Types**
- **Time-based data** → Line or Area chart
- **Categories comparison** → Bar chart
- **Proportions** → Pie chart
- **Correlations** → Scatter plot
- **KPIs** → Gauge chart

### 3. **Optimize Performance**
- Limit results to < 1000 rows per chart
- Use aggregation in SQL (SUM, AVG, COUNT)
- Add appropriate indexes to source tables
- Cache dashboard data (coming soon)

### 4. **Naming Conventions**
```sql
-- Use clear, readable column names
SELECT
  region as "Sales Region",      -- ✅ Clear
  SUM(amount) as "Total Revenue" -- ✅ Descriptive
FROM sales;

-- Avoid technical names
SELECT r, SUM(a) FROM s;  -- ❌ Unclear
```

---

## 🔮 Future Enhancements

### Planned Features

1. **Dashboard Sharing**
   - Share with other users/organizations
   - Public dashboard URLs
   - Embed dashboards in external sites

2. **Scheduled Refresh**
   - Auto-update charts every X minutes/hours
   - Email reports on schedule
   - Alert when metrics exceed thresholds

3. **Advanced Filters**
   - Date range selector
   - Multi-select filters
   - Cross-chart filtering (click bar → filter other charts)

4. **Export Options**
   - PDF dashboard reports
   - PowerPoint slides
   - PNG/SVG image export

5. **AI-Powered Insights**
   - Auto-suggest chart types
   - Detect trends and anomalies
   - Natural language queries → charts

---

## 📝 Summary

**Current Capabilities:**
✅ Run queries → Add to dashboard
✅ 9 chart types with auto-transform
✅ Drag-and-drop dashboard builder
✅ Save/load dashboards
✅ Pending charts notification

**To Use Right Now:**
1. Run a SQL query on `/query`
2. Click "Add to Dashboard"
3. Go to `/dashboards`
4. Click "Load Pending Charts"
5. Arrange and save!

**Coming Soon:**
🔄 Auto-refresh from live queries
☁️ Backend persistence & sharing
📧 Scheduled reports
🔍 Cross-chart filtering

---

*Your data → Beautiful dashboards in 3 clicks! 🎉*
