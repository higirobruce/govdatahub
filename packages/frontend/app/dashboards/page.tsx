'use client';

import { useState, useCallback, useEffect } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { DashboardGrid } from '@/components/DashboardBuilder/DashboardGrid';
import { ChartConfigPanel } from '@/components/DashboardBuilder/ChartConfigPanel';
import { DashboardList } from '@/components/DashboardBuilder/DashboardList';
import { ShareDashboardModal } from '@/components/DashboardBuilder/ShareDashboardModal';
import { Plus, Save, FolderOpen, Eye, Settings, Bell, Share2 } from 'lucide-react';
import { ChartWidget, DashboardLayout, Dashboard } from '@/components/DashboardBuilder/types';

export default function DashboardsPage() {
  const [widgets, setWidgets] = useState<ChartWidget[]>([]);
  const [layout, setLayout] = useState<DashboardLayout[]>([]);
  const [selectedWidget, setSelectedWidget] = useState<ChartWidget | null>(null);
  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [dashboardName, setDashboardName] = useState('Untitled Dashboard');
  const [pendingChartsCount, setPendingChartsCount] = useState(0);
  const [showDashboardList, setShowDashboardList] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [dashboardToShare, setDashboardToShare] = useState<Dashboard | null>(null);

  // Load pending charts from query results
  useEffect(() => {
    const pendingCharts = JSON.parse(localStorage.getItem('pendingDashboardCharts') || '[]');
    setPendingChartsCount(pendingCharts.length);
  }, []);

  const loadPendingCharts = useCallback(() => {
    const pendingCharts = JSON.parse(localStorage.getItem('pendingDashboardCharts') || '[]');

    if (pendingCharts.length === 0) {
      alert('No pending charts from queries');
      return;
    }

    const newWidgets: ChartWidget[] = pendingCharts.map((chart: any, index: number) => ({
      id: `widget-${Date.now()}-${index}`,
      type: chart.type,
      title: chart.title,
      data: chart.data,
      config: {
        showLegend: true,
        height: '300px',
      },
    }));

    const newLayouts: DashboardLayout[] = newWidgets.map((widget, index) => ({
      i: widget.id,
      x: (index * 6) % 12,
      y: Infinity,
      w: 6,
      h: 4,
      minW: 3,
      minH: 3,
    }));

    setWidgets([...widgets, ...newWidgets]);
    setLayout([...layout, ...newLayouts]);

    // Clear pending charts
    localStorage.removeItem('pendingDashboardCharts');
    setPendingChartsCount(0);

    alert(`${pendingCharts.length} chart(s) added to dashboard!`);
  }, [widgets, layout]);

  const handleAddWidget = useCallback(() => {
    const newWidget: ChartWidget = {
      id: `widget-${Date.now()}`,
      type: 'bar',
      title: 'New Chart',
      data: {
        xAxis: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        series: [{
          name: 'Sample Data',
          data: [120, 200, 150, 80, 70],
          color: '#60a5fa',
        }],
      },
      config: {
        showLegend: true,
        height: '300px',
      },
    };

    const newLayout: DashboardLayout = {
      i: newWidget.id,
      x: (widgets.length * 2) % 12,
      y: Infinity,
      w: 6,
      h: 4,
      minW: 3,
      minH: 3,
    };

    setWidgets([...widgets, newWidget]);
    setLayout([...layout, newLayout]);
    setSelectedWidget(newWidget);
    setIsConfigPanelOpen(true);
  }, [widgets, layout]);

  const handleUpdateWidget = useCallback((updatedWidget: ChartWidget) => {
    setWidgets(widgets.map(w => w.id === updatedWidget.id ? updatedWidget : w));
    setSelectedWidget(updatedWidget);
  }, [widgets]);

  const handleDeleteWidget = useCallback((widgetId: string) => {
    setWidgets(widgets.filter(w => w.id !== widgetId));
    setLayout(layout.filter(l => l.i !== widgetId));
    if (selectedWidget?.id === widgetId) {
      setSelectedWidget(null);
      setIsConfigPanelOpen(false);
    }
  }, [widgets, layout, selectedWidget]);

  const handleLayoutChange = useCallback((newLayout: DashboardLayout[]) => {
    setLayout(newLayout);
  }, []);

  const handleSaveDashboard = async () => {
    const dashboard: Dashboard = {
      name: dashboardName,
      widgets,
      layout,
      createdAt: new Date().toISOString(),
    };

    // Save to localStorage for now (later: save to backend)
    const savedDashboards = JSON.parse(localStorage.getItem('dashboards') || '[]');
    savedDashboards.push(dashboard);
    localStorage.setItem('dashboards', JSON.stringify(savedDashboards));

    alert(`Dashboard "${dashboardName}" saved successfully!`);
  };

  const handleLoadDashboard = (dashboard: Dashboard) => {
    setDashboardName(dashboard.name);
    setWidgets(dashboard.widgets);
    setLayout(dashboard.layout);
    alert(`Dashboard "${dashboard.name}" loaded successfully!`);
  };

  const handleShareDashboard = (dashboard?: Dashboard) => {
    // If no dashboard provided, share the current one
    if (!dashboard) {
      dashboard = {
        name: dashboardName,
        widgets,
        layout,
        createdAt: new Date().toISOString(),
      };
    }
    setDashboardToShare(dashboard);
    setShowShareModal(true);
  };

  return (
    <div className="w-full max-w-full h-full">
      <PageHeader
        title="Dashboard Builder"
        subtitle="Create interactive dashboards with drag-and-drop charts"
      />

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={dashboardName}
              onChange={(e) => setDashboardName(e.target.value)}
              className="px-3 py-2 border border-[#e8e8e8] rounded-md text-[14px] font-semibold min-w-[200px] focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
              placeholder="Dashboard name..."
            />
            <div className="h-6 w-px bg-[#e8e8e8]" />
            <span className="text-sm text-[#aaaaaa]">
              {widgets.length} {widgets.length === 1 ? 'widget' : 'widgets'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleAddWidget}
              size="sm"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Chart
            </Button>

            {pendingChartsCount > 0 && (
              <Button
                onClick={loadPendingCharts}
                size="sm"
                variant="outline"
                className="gap-2 relative"
              >
                <Bell className="w-4 h-4" />
                Load Pending Charts
                <span className="absolute -top-1 -right-1 bg-[#ef4444] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingChartsCount}
                </span>
              </Button>
            )}

            <Button
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {isPreviewMode ? (
                <>
                  <Settings className="w-4 h-4" />
                  Edit Mode
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  Preview
                </>
              )}
            </Button>

            <div className="h-6 w-px bg-[#e8e8e8]" />

            <Button
              onClick={handleSaveDashboard}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              Save
            </Button>

            <Button
              onClick={() => setShowDashboardList(true)}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              My Dashboards
            </Button>

            <Button
              onClick={() => handleShareDashboard()}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Share2 className="w-4 h-4" />
              Share
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex gap-6">
        {/* Dashboard Grid */}
        <div className={`flex-1 transition-all duration-300 ${isConfigPanelOpen ? 'mr-0' : ''}`}>
          {widgets.length === 0 ? (
            <div className="bg-white rounded-xl border-2 border-dashed border-[#e8e8e8] p-12 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-16 h-16 bg-[#f0f0f0] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-8 h-8 text-[#aaaaaa]" />
                </div>
                <h3 className="text-lg font-semibold text-[#1a1a1a] mb-2">
                  No charts yet
                </h3>
                <p className="text-[#aaaaaa] mb-6">
                  Start building your dashboard by adding charts. Drag and resize them to create your perfect layout.
                </p>
                <Button onClick={handleAddWidget} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Your First Chart
                </Button>
              </div>
            </div>
          ) : (
            <DashboardGrid
              widgets={widgets}
              layout={layout}
              onLayoutChange={handleLayoutChange}
              onSelectWidget={(widget) => {
                setSelectedWidget(widget);
                setIsConfigPanelOpen(true);
              }}
              onDeleteWidget={handleDeleteWidget}
              isPreviewMode={isPreviewMode}
            />
          )}
        </div>

        {/* Configuration Panel */}
        {isConfigPanelOpen && selectedWidget && (
          <ChartConfigPanel
            widget={selectedWidget}
            onUpdate={handleUpdateWidget}
            onClose={() => setIsConfigPanelOpen(false)}
          />
        )}
      </div>

      {/* Dashboard List Modal */}
      {showDashboardList && (
        <DashboardList
          onClose={() => setShowDashboardList(false)}
          onLoad={handleLoadDashboard}
          onShare={(dashboard) => {
            setShowDashboardList(false);
            handleShareDashboard(dashboard);
          }}
        />
      )}

      {/* Share Dashboard Modal */}
      {showShareModal && dashboardToShare && (
        <ShareDashboardModal
          dashboard={dashboardToShare}
          onClose={() => {
            setShowShareModal(false);
            setDashboardToShare(null);
          }}
        />
      )}
    </div>
  );
}
