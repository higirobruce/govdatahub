'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Link as LinkIcon, Copy, Check, Mail, Download } from 'lucide-react';
import { Dashboard } from './types';
import { useToast } from '@/components/ui/toast';

interface ShareDashboardModalProps {
  dashboard: Dashboard;
  onClose: () => void;
}

export function ShareDashboardModal({ dashboard, onClose }: ShareDashboardModalProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [shareMethod, setShareMethod] = useState<'link' | 'json' | 'email'>('link');

  // Generate shareable link (in production, this would be a real URL)
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/dashboards/view/${btoa(dashboard.name)}`
    : '';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showToast('Failed to copy link', 'error');
    }
  };

  const handleCopyJSON = async () => {
    try {
      const jsonStr = JSON.stringify(dashboard, null, 2);
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showToast('Failed to copy JSON', 'error');
    }
  };

  const handleDownloadJSON = () => {
    const dataStr = JSON.stringify(dashboard, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${dashboard.name.replace(/\s+/g, '_')}_dashboard.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`DataGate Dashboard: ${dashboard.name}`);
    const body = encodeURIComponent(
      `I'd like to share this dashboard with you:\n\n` +
      `Dashboard: ${dashboard.name}\n` +
      `Charts: ${dashboard.widgets.length}\n` +
      `Link: ${shareUrl}\n\n` +
      `View it on DataGate to see the full interactive dashboard.`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e8]">
          <div>
            <h2 className="text-[18px] font-semibold text-[#1a1a1a]">Share Dashboard</h2>
            <p className="text-sm text-[#aaaaaa]">{dashboard.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#f0f0f0] rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-[#555555]" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Share Method Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setShareMethod('link')}
              className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                shareMethod === 'link'
                  ? 'border-[#60a5fa] bg-[#eff6ff] text-[#1a1a1a]'
                  : 'border-[#e8e8e8] text-[#555555] hover:border-[#d0d0d0]'
              }`}
            >
              <LinkIcon className="w-4 h-4 mx-auto mb-1" />
              <span className="text-sm font-medium">Link</span>
            </button>
            <button
              onClick={() => setShareMethod('json')}
              className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                shareMethod === 'json'
                  ? 'border-[#60a5fa] bg-[#eff6ff] text-[#1a1a1a]'
                  : 'border-[#e8e8e8] text-[#555555] hover:border-[#d0d0d0]'
              }`}
            >
              <Download className="w-4 h-4 mx-auto mb-1" />
              <span className="text-sm font-medium">Export</span>
            </button>
            <button
              onClick={() => setShareMethod('email')}
              className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                shareMethod === 'email'
                  ? 'border-[#60a5fa] bg-[#eff6ff] text-[#1a1a1a]'
                  : 'border-[#e8e8e8] text-[#555555] hover:border-[#d0d0d0]'
              }`}
            >
              <Mail className="w-4 h-4 mx-auto mb-1" />
              <span className="text-sm font-medium">Email</span>
            </button>
          </div>

          {/* Share Content */}
          {shareMethod === 'link' && (
            <div>
              <label className="block text-sm font-medium text-[#555555] mb-2">
                Shareable Link
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 px-3 py-2 border border-[#e8e8e8] rounded-md text-[14px] bg-[#fafafa]"
                />
                <Button onClick={handleCopyLink} className="gap-2">
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-2 text-xs text-[#aaaaaa]">
                Anyone with this link can view the dashboard (view-only mode)
              </p>
            </div>
          )}

          {shareMethod === 'json' && (
            <div>
              <label className="block text-sm font-medium text-[#555555] mb-2">
                Export Dashboard
              </label>
              <p className="text-sm text-[#aaaaaa] mb-4">
                Export dashboard as JSON to import into another DataGate instance or share with others
              </p>
              <div className="flex gap-2">
                <Button onClick={handleDownloadJSON} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download JSON
                </Button>
                <Button onClick={handleCopyJSON} variant="outline" className="gap-2">
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy JSON
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {shareMethod === 'email' && (
            <div>
              <label className="block text-sm font-medium text-[#555555] mb-2">
                Share via Email
              </label>
              <p className="text-sm text-[#aaaaaa] mb-4">
                Send dashboard link via email to collaborate with team members
              </p>
              <Button onClick={handleEmailShare} className="gap-2">
                <Mail className="w-4 h-4" />
                Open Email Client
              </Button>
            </div>
          )}

          {/* Dashboard Info */}
          <div className="bg-[#fafafa] border border-[#e8e8e8] rounded-lg p-4">
            <h3 className="text-sm font-semibold text-[#1a1a1a] mb-2">Dashboard Info</h3>
            <div className="space-y-1 text-sm text-[#555555]">
              <div>Charts: {dashboard.widgets.length}</div>
              <div>Created: {new Date(dashboard.createdAt).toLocaleDateString()}</div>
              {dashboard.description && <div>Description: {dashboard.description}</div>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-[#e8e8e8] bg-[#fafafa]">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
