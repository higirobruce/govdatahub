'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Trash2, Eye, Share2, Download, Calendar, BarChart3 } from 'lucide-react';
import { Dashboard } from './types';

interface DashboardListProps {
  onClose: () => void;
  onLoad: (dashboard: Dashboard) => void;
  onShare: (dashboard: Dashboard) => void;
}

export function DashboardList({ onClose, onLoad, onShare }: DashboardListProps) {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('dashboards') || '[]');
    setDashboards(saved);
  }, []);

  const handleDelete = (index: number) => {
    if (confirm('Delete this dashboard? This action cannot be undone.')) {
      const updated = dashboards.filter((_, i) => i !== index);
      setDashboards(updated);
      localStorage.setItem('dashboards', JSON.stringify(updated));
    }
  };

  const handleExport = (dashboard: Dashboard) => {
    const dataStr = JSON.stringify(dashboard, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${dashboard.name.replace(/\s+/g, '_')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e8]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#eff6ff] rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-[#60a5fa]" />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[#1a1a1a]">My Dashboards</h2>
              <p className="text-sm text-[#aaaaaa]">{dashboards.length} saved dashboard(s)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#f0f0f0] rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-[#555555]" />
          </button>
        </div>

        {/* Dashboard List */}
        <div className="flex-1 overflow-y-auto p-6">
          {dashboards.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 text-[#aaaaaa] mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-[#1a1a1a] mb-2">
                No saved dashboards
              </h3>
              <p className="text-[#aaaaaa]">
                Create a dashboard and save it to see it here
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dashboards.map((dashboard, index) => (
                <div
                  key={index}
                  className="border-2 border-[#e8e8e8] rounded-lg p-4 hover:border-[#60a5fa] transition-colors"
                >
                  {/* Dashboard Info */}
                  <div className="mb-3">
                    <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">
                      {dashboard.name}
                    </h3>
                    {dashboard.description && (
                      <p className="text-sm text-[#aaaaaa] line-clamp-2">
                        {dashboard.description}
                      </p>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-[#aaaaaa] mb-3">
                    <span className="flex items-center gap-1">
                      <BarChart3 className="w-3 h-3" />
                      {dashboard.widgets.length} charts
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(dashboard.createdAt)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => {
                        onLoad(dashboard);
                        onClose();
                      }}
                      size="sm"
                      className="flex-1 gap-2"
                    >
                      <Eye className="w-3 h-3" />
                      Load
                    </Button>
                    <Button
                      onClick={() => {
                        onShare(dashboard);
                      }}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      title="Share dashboard"
                    >
                      <Share2 className="w-3 h-3" />
                    </Button>
                    <Button
                      onClick={() => handleExport(dashboard)}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      title="Export as JSON"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <Button
                      onClick={() => handleDelete(index)}
                      variant="outline"
                      size="sm"
                      className="gap-2 hover:bg-[#fee2e2]"
                      title="Delete dashboard"
                    >
                      <Trash2 className="w-3 h-3 text-[#ef4444]" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#e8e8e8] bg-[#fafafa]">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
