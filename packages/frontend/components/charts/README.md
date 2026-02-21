# DataGate Charts

Native data visualization components built with Apache ECharts.

## Overview

DataGate includes a powerful charting library that provides:
- **Line Charts** - Time-series and trend visualization
- **Bar Charts** - Categorical comparisons
- **Pie Charts** - Proportional data representation
- **Interactive tooltips** - Hover to see details
- **Export functionality** - Download as PNG
- **Responsive design** - Auto-resizes with window

## Quick Start

### Basic Usage

```tsx
import { LineChart, BarChart, PieChart } from '@/components/charts';

// Line Chart
<LineChart
  data={{
    xAxis: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    series: [
      {
        name: 'Sales',
        data: [120, 200, 150, 80, 70],
        color: '#60a5fa'
      }
    ]
  }}
  title="Weekly Sales"
  showArea={true}
/>

// Bar Chart
<BarChart
  data={{
    xAxis: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      {
        name: 'Revenue',
        data: [1200, 1500, 1800, 2100],
        color: '#4ade80'
      }
    ]
  }}
  title="Quarterly Revenue"
  horizontal={false}
/>

// Pie Chart
<PieChart
  data={[
    { name: 'Desktop', value: 450, color: '#60a5fa' },
    { name: 'Mobile', value: 380, color: '#4ade80' },
    { name: 'Tablet', value: 120, color: '#fb923c' }
  ]}
  title="Device Distribution"
  donut={true}
/>
```

### Using Chart Builder

The `ChartBuilder` component provides a visual interface for creating charts:

```tsx
import { ChartBuilder } from '@/components/charts';

<ChartBuilder
  initialData={myData}
  onSave={(config) => {
    console.log('Chart saved:', config);
    // Save to database or state
  }}
/>
```

## Components

### LineChart

**Props:**
- `data: { xAxis: string[], series: Array<{ name: string, data: number[], color?: string }> }` - Chart data
- `title?: string` - Chart title
- `height?: string` - Chart height (default: '400px')
- `smooth?: boolean` - Smooth curves (default: true)
- `showArea?: boolean` - Fill area under line (default: false)

**Example:**
```tsx
<LineChart
  data={{
    xAxis: ['Jan', 'Feb', 'Mar'],
    series: [
      { name: 'Series 1', data: [100, 200, 150], color: '#60a5fa' }
    ]
  }}
  title="Monthly Trend"
  smooth={true}
  showArea={true}
/>
```

### BarChart

**Props:**
- `data: { xAxis: string[], series: Array<{ name: string, data: number[], color?: string }> }` - Chart data
- `title?: string` - Chart title
- `height?: string` - Chart height (default: '400px')
- `horizontal?: boolean` - Horizontal bars (default: false)
- `stacked?: boolean` - Stack series (default: false)

**Example:**
```tsx
<BarChart
  data={{
    xAxis: ['Category A', 'Category B', 'Category C'],
    series: [
      { name: 'Series 1', data: [120, 200, 150], color: '#60a5fa' },
      { name: 'Series 2', data: [90, 130, 110], color: '#4ade80' }
    ]
  }}
  title="Comparison"
  stacked={true}
/>
```

### PieChart

**Props:**
- `data: Array<{ name: string, value: number, color?: string }>` - Pie slices
- `title?: string` - Chart title
- `height?: string` - Chart height (default: '400px')
- `donut?: boolean` - Donut style (default: false)

**Example:**
```tsx
<PieChart
  data={[
    { name: 'Category A', value: 335, color: '#60a5fa' },
    { name: 'Category B', value: 234, color: '#4ade80' }
  ]}
  title="Distribution"
  donut={true}
/>
```

### BaseChart

Low-level component that accepts raw ECharts options. Use this for advanced customization:

```tsx
import { BaseChart } from '@/components/charts';

<BaseChart
  option={{
    xAxis: { type: 'category', data: ['A', 'B', 'C'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [10, 20, 30] }]
  }}
  height="500px"
/>
```

## Color Palette

DataGate uses a consistent color scheme:

```typescript
const COLORS = {
  blue: '#60a5fa',    // Primary
  green: '#4ade80',   // Success
  orange: '#fb923c',  // Warning
  red: '#ef4444',     // Error
  purple: '#a78bfa',  // Info
  gray: '#555555'     // Text
};
```

## Advanced Features

### Export Charts

Charts can be exported as PNG images using ECharts' built-in functionality:

```tsx
import { useRef } from 'react';
import { BaseChart } from '@/components/charts';

function MyChart() {
  const chartRef = useRef(null);

  const handleExport = (chart) => {
    const url = chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#fff'
    });

    // Download the image
    const link = document.createElement('a');
    link.download = 'chart.png';
    link.href = url;
    link.click();
  };

  return (
    <BaseChart
      option={myOption}
      onChartReady={handleExport}
    />
  );
}
```

### Responsive Charts

Charts automatically resize when the window changes. To manually trigger resize:

```tsx
import { useEffect, useRef } from 'react';

function ResponsiveChart() {
  const chartRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current) {
        chartRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <BaseChart ref={chartRef} option={myOption} />;
}
```

### Dynamic Data Updates

Charts automatically update when data changes:

```tsx
function DynamicChart() {
  const [data, setData] = useState(initialData);

  useEffect(() => {
    const interval = setInterval(() => {
      setData(fetchNewData()); // Chart updates automatically
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return <LineChart data={data} />;
}
```

## Integration with DataGate

### Connect to Transformations

```tsx
import { useSWR } from 'swr';
import { LineChart } from '@/components/charts';

function TransformationChart({ transformationId }) {
  const { data } = useSWR(`/api/transformations/${transformationId}/results`);

  if (!data) return <div>Loading...</div>;

  const chartData = {
    xAxis: data.rows.map(r => r.date),
    series: [{
      name: 'Values',
      data: data.rows.map(r => r.value)
    }]
  };

  return <LineChart data={chartData} title="Transformation Results" />;
}
```

### Connect to Query Results

```tsx
function QueryResultsChart({ queryResults }) {
  // Transform SQL results to chart format
  const chartData = {
    xAxis: queryResults.rows.map(r => r.category),
    series: [{
      name: 'Count',
      data: queryResults.rows.map(r => r.count)
    }]
  };

  return <BarChart data={chartData} title="Query Results" />;
}
```

## Performance Tips

1. **Memoize data**: Use `useMemo` for data transformations
2. **Limit data points**: ECharts can handle thousands of points, but consider aggregating for very large datasets
3. **Lazy loading**: Load charts only when visible using Intersection Observer
4. **Debounce updates**: When data changes frequently, debounce updates

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Responsive design

## License

Apache ECharts is licensed under Apache License 2.0
