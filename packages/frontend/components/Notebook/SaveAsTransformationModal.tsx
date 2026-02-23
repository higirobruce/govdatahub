'use client';

import { useState } from 'react';
import { PersistedCell } from '@/types/notebook';
import { Connection } from '@/types';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { GitBranch, X, AlertCircle } from 'lucide-react';

interface SaveAsTransformationModalProps {
  notebookId: string;
  selectedCells: PersistedCell[];
  connections: Connection[];
  onClose: () => void;
  onSaved: () => void;
}

export function SaveAsTransformationModal({
  notebookId,
  selectedCells,
  connections,
  onClose,
  onSaved,
}: SaveAsTransformationModalProps) {
  const { showToast } = useToast();

  // Determine if all selected cells share the same connection
  const uniqueConnectionIds = Array.from(new Set(selectedCells.map((c) => c.connectionId).filter(Boolean)));
  const defaultConnectionId = uniqueConnectionIds.length === 1 ? uniqueConnectionIds[0] : '';
  const mixedConnections = uniqueConnectionIds.length > 1;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [connectionId, setConnectionId] = useState<string>(defaultConnectionId ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const combinedSql = selectedCells
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c) => c.content.trim())
    .filter(Boolean)
    .join(';\n\n');

  const canSave = name.trim() && description.trim() && connectionId && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await api.notebooks.saveAsTransformation(notebookId, {
        name: name.trim(),
        description: description.trim(),
        sourceConnectionId: connectionId,
        combinedSql,
      });
      showToast(`Transformation "${name.trim()}" created successfully`, 'success');
      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Failed to save transformation', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e8]">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-violet-500" />
            <h2 className="text-base font-semibold text-[#1a1a1a]">Save as Transformation</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#f5f5f5] rounded transition-colors"
          >
            <X className="w-4 h-4 text-[#555555]" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Mixed connections warning */}
          {mixedConnections && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Selected cells use different connections. Choose one connection for the transformation.
              </p>
            </div>
          )}

          {/* SQL preview */}
          <div>
            <p className="text-xs font-semibold text-[#555555] mb-1.5">
              SQL ({selectedCells.length} cell{selectedCells.length !== 1 ? 's' : ''})
            </p>
            <pre className="text-xs text-[#333333] bg-[#1a1a1a] rounded-lg p-3 overflow-auto max-h-32 font-mono leading-relaxed">
              {combinedSql || '(no SQL content)'}
            </pre>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-[#555555] mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Clean Customer Data"
              className="w-full text-sm border border-[#e8e8e8] rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-[#555555] mb-1.5">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this transformation do?"
              rows={2}
              className="w-full text-sm border border-[#e8e8e8] rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 resize-none"
            />
          </div>

          {/* Connection */}
          <div>
            <label className="block text-xs font-semibold text-[#555555] mb-1.5">
              Source Connection <span className="text-red-500">*</span>
            </label>
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="w-full text-sm border border-[#e8e8e8] rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 bg-white"
            >
              <option value="">— select connection —</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#e8e8e8] bg-[#fafafa]">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="gap-2 bg-violet-600 hover:bg-violet-700"
          >
            {isSaving ? 'Saving…' : 'Save Transformation'}
          </Button>
        </div>
      </div>
    </div>
  );
}
