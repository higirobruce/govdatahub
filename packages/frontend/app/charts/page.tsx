'use client';

import { useState } from 'react';
import { ChartBuilder } from '@/components/charts/ChartBuilder';
import { LineChart, BarChart, PieChart } from '@/components/charts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, TrendingUp, PieChart as PieChartIcon } from 'lucide-react';

export default function ChartsPage() {
  const [savedCharts, setSavedCharts] = useState<any[]>([]);

  // Sample data for example charts
  const sampleTimeSeriesData = {
    xAxis: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    series: [
      {
        name: 'Revenue',
        data: [4200, 5100, 6100, 5900, 7200, 8100],
        color: '#60a5fa'
      },
      {
        name: 'Expenses',
        data: [3200, 4100, 4500, 4300, 5100, 5800],
        color: '#ef4444'
      }
    ]
  };

  const sampleUserData = {
    xAxis: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    series: [
      {
        name: 'Active Users',
        data: [1200, 1900, 1500, 2100],
        color: '#4ade80'
      }
    ]
  };

  const sampleDistributionData = [
    { name: 'Desktop', value: 450, color: '#60a5fa' },
    { name: 'Mobile', value: 380, color: '#4ade80' },
    { name: 'Tablet', value: 120, color: '#fb923c' },
    { name: 'Other', value: 50, color: '#a78bfa' }
  ];

  const handleSaveChart = (config: any) => {
    setSavedCharts([...savedCharts, { ...config, id: Date.now() }]);
    alert('Chart saved successfully!');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-bold text-[#1a1a1a] mb-2">Data Visualization</h1>
        <p className="text-[15px] text-[#555555]">
          Create interactive charts to visualize your data. Built with Apache ECharts.
        </p>
      </div>

      <Tabs defaultValue="examples" className="space-y-6">
        <TabsList className="bg-white border border-[#e8e8e8]">
          <TabsTrigger value="examples">
            <BarChart3 className="w-4 h-4 mr-2" />
            Example Charts
          </TabsTrigger>
          <TabsTrigger value="builder">
            <TrendingUp className="w-4 h-4 mr-2" />
            Chart Builder
          </TabsTrigger>
        </TabsList>

        {/* Example Charts Tab */}
        <TabsContent value="examples" className="space-y-6">
          {/* Revenue vs Expenses - Line Chart */}
          <div className="bg-white rounded-lg border border-[#e8e8e8] p-6">
            <div className="mb-4">
              <h3 className="text-[17px] font-semibold text-[#1a1a1a] mb-1">
                Revenue vs Expenses Trend
              </h3>
              <p className="text-[13px] text-[#555555]">
                Monthly comparison showing business performance
              </p>
            </div>
            <LineChart
              data={sampleTimeSeriesData}
              title="Financial Overview"
              showArea={true}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* User Growth - Bar Chart */}
            <div className="bg-white rounded-lg border border-[#e8e8e8] p-6">
              <div className="mb-4">
                <h3 className="text-[17px] font-semibold text-[#1a1a1a] mb-1">
                  User Growth
                </h3>
                <p className="text-[13px] text-[#555555]">
                  Weekly active users trend
                </p>
              </div>
              <BarChart
                data={sampleUserData}
                title="Active Users by Week"
              />
            </div>

            {/* Device Distribution - Pie Chart */}
            <div className="bg-white rounded-lg border border-[#e8e8e8] p-6">
              <div className="mb-4">
                <h3 className="text-[17px] font-semibold text-[#1a1a1a] mb-1">
                  Device Distribution
                </h3>
                <p className="text-[13px] text-[#555555]">
                  User sessions by device type
                </p>
              </div>
              <PieChart
                data={sampleDistributionData}
                title="Sessions by Device"
                donut={true}
              />
            </div>
          </div>

          {/* Feature Highlights */}
          <div className="bg-gradient-to-br from-[#eff6ff] to-[#f0fdf4] rounded-lg border border-[#e8e8e8] p-6">
            <h3 className="text-[17px] font-semibold text-[#1a1a1a] mb-4">
              Chart Features
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-[#60a5fa] rounded-full mt-2"></div>
                <div>
                  <div className="text-[14px] font-medium text-[#1a1a1a]">Interactive Tooltips</div>
                  <div className="text-[13px] text-[#555555]">Hover to see detailed data points</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-[#4ade80] rounded-full mt-2"></div>
                <div>
                  <div className="text-[14px] font-medium text-[#1a1a1a]">Export to PNG</div>
                  <div className="text-[13px] text-[#555555]">Download charts as images</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-[#fb923c] rounded-full mt-2"></div>
                <div>
                  <div className="text-[14px] font-medium text-[#1a1a1a]">Responsive Design</div>
                  <div className="text-[13px] text-[#555555]">Auto-resizes with window</div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Chart Builder Tab */}
        <TabsContent value="builder">
          <ChartBuilder onSave={handleSaveChart} />

          {/* Saved Charts */}
          {savedCharts.length > 0 && (
            <div className="mt-8 bg-white rounded-lg border border-[#e8e8e8] p-6">
              <h3 className="text-[17px] font-semibold text-[#1a1a1a] mb-4">
                Saved Charts ({savedCharts.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savedCharts.map((chart) => (
                  <div key={chart.id} className="border border-[#e8e8e8] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[14px] font-medium text-[#1a1a1a]">{chart.title}</span>
                      <span className="text-[12px] text-[#555555] capitalize">{chart.type}</span>
                    </div>
                    <div className="text-[13px] text-[#555555]">
                      Saved at {new Date(chart.id).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
