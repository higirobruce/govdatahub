'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { v4 as uuidv4 } from 'uuid';
import { api } from '@/lib/api';
import { Notebook, PersistedCell, CellRuntimeState, CellType, CellResult } from '@/types/notebook';
import { Connection } from '@/types';
import { NotebookCell } from '@/components/Notebook/NotebookCell';
import { SaveAsTransformationModal } from '@/components/Notebook/SaveAsTransformationModal';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import {
  BookOpen,
  Plus,
  ChevronLeft,
  GitBranch,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';

const DEFAULT_RUNTIME: CellRuntimeState = { status: 'idle', result: null, error: null };
const MONGO_DEFAULT = '{\n  "collection": "",\n  "filter": {},\n  "limit": 100\n}';
const SQL_DEFAULT = 'SELECT ';

export default function NotebookEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const notebookId = params.id as string;

  // Data
  const { data: notebook } = useSWR<Notebook>(
    `/notebooks/${notebookId}`,
    () => api.notebooks.get(notebookId) as Promise<Notebook>,
  );
  const { data: connections } = useSWR<Connection[]>(
    '/connections',
    () => api.connections.list() as Promise<Connection[]>,
  );

  // Local editable state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cells, setCells] = useState<PersistedCell[]>([]);
  const [runtimeState, setRuntimeState] = useState<Record<string, CellRuntimeState>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);

  // Save as Transformation
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Auto-save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Seed local state from fetched notebook
  useEffect(() => {
    if (notebook && !isDirty) {
      setName(notebook.name);
      setDescription(notebook.description);
      setCells(notebook.cells.slice().sort((a, b) => a.order - b.order));
    }
  }, [notebook]);

  // Auto-save: debounced 2s after changes
  const scheduleSave = useCallback(() => {
    setIsDirty(true);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await api.notebooks.update(notebookId, { name, description, cells });
        setIsDirty(false);
      } catch {
        showToast('Failed to auto-save notebook', 'error');
      } finally {
        setIsSaving(false);
      }
    }, 2000);
  }, [notebookId, name, description, cells]);

  const markDirty = useCallback(() => scheduleSave(), [scheduleSave]);

  // ── Cell CRUD helpers ──────────────────────────────────────────────

  const addCell = (type: CellType, afterOrder?: number) => {
    const newOrder = afterOrder !== undefined ? afterOrder + 1 : cells.length;
    const defaultConn = connections?.[0];
    const isMongoDB = defaultConn?.type === 'mongodb';
    const newCell: PersistedCell = {
      id: uuidv4(),
      type,
      content: type === 'sql' ? (isMongoDB ? MONGO_DEFAULT : SQL_DEFAULT) : '',
      connectionId: defaultConn?.id,
      order: newOrder,
    };
    setCells((prev) => {
      // Shift orders for cells that come after
      const updated = prev.map((c) =>
        c.order >= newOrder ? { ...c, order: c.order + 1 } : c,
      );
      return [...updated, newCell].sort((a, b) => a.order - b.order);
    });
    markDirty();
  };

  const deleteCell = (cellId: string) => {
    setCells((prev) => {
      const remaining = prev.filter((c) => c.id !== cellId);
      // Re-index orders
      return remaining.map((c, i) => ({ ...c, order: i }));
    });
    setRuntimeState((prev) => {
      const next = { ...prev };
      delete next[cellId];
      return next;
    });
    markDirty();
  };

  const moveCell = (cellId: string, direction: 'up' | 'down') => {
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === cellId);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((c, i) => ({ ...c, order: i }));
    });
    markDirty();
  };

  const updateCellContent = (cellId: string, content: string) => {
    setCells((prev) => prev.map((c) => (c.id === cellId ? { ...c, content } : c)));
    markDirty();
  };

  const updateCellConnection = (cellId: string, connectionId: string) => {
    setCells((prev) => prev.map((c) => {
      if (c.id !== cellId) return c;
      const prevType = connections?.find((cn) => cn.id === c.connectionId)?.type;
      const nextType = connections?.find((cn) => cn.id === connectionId)?.type;
      const wasMongoDb = prevType === 'mongodb';
      const isNowMongoDb = nextType === 'mongodb';
      let content = c.content;
      if (wasMongoDb !== isNowMongoDb) {
        const trimmed = content.trim();
        if (isNowMongoDb && (trimmed === 'SELECT ' || trimmed === 'SELECT' || trimmed === '')) {
          content = MONGO_DEFAULT;
        } else if (!isNowMongoDb && (trimmed === MONGO_DEFAULT.trim() || trimmed === '')) {
          content = SQL_DEFAULT;
        }
      }
      return { ...c, connectionId, content };
    }));
    markDirty();
  };

  // ── Execution ──────────────────────────────────────────────────────

  const executeCell = async (cellId: string) => {
    const cell = cells.find((c) => c.id === cellId);
    if (!cell || cell.type !== 'sql' || !cell.connectionId || !cell.content.trim()) {
      showToast('Select a connection and enter a query to run', 'warning');
      return;
    }
    setRuntimeState((prev) => ({
      ...prev,
      [cellId]: { status: 'running', result: null, error: null },
    }));
    try {
      const result = await api.notebooks.executeCell(notebookId, cellId, {
        connectionId: cell.connectionId,
        sql: cell.content,
      });
      setRuntimeState((prev) => ({
        ...prev,
        [cellId]: {
          status: 'success',
          result: result as CellResult,
          error: null,
        },
      }));
    } catch (err: any) {
      setRuntimeState((prev) => ({
        ...prev,
        [cellId]: {
          status: 'error',
          result: null,
          error: err.message || 'Query failed',
        },
      }));
    }
  };

  // ── Save as Transformation ─────────────────────────────────────────

  const toggleSelectionMode = () => {
    setSelectionMode((v) => !v);
    setSelectedCells(new Set());
  };

  const toggleCellSelect = (cellId: string) => {
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(cellId)) next.delete(cellId);
      else next.add(cellId);
      return next;
    });
  };

  const selectedSqlCells = cells.filter(
    (c) => c.type === 'sql' && selectedCells.has(c.id),
  );

  // ── Name editing ───────────────────────────────────────────────────

  const handleNameChange = (newName: string) => {
    setName(newName);
    markDirty();
  };

  // ── Render ─────────────────────────────────────────────────────────

  if (!notebook) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#f2f2f2]">
        <Loader2 className="w-6 h-6 animate-spin text-[#aaaaaa]" />
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-[#f2f2f2] overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-[#e8e8e8] px-6 py-3 flex items-center gap-4 shadow-sm">
        <Link
          href="/notebooks"
          className="flex items-center gap-1 text-sm text-[#777777] hover:text-[#1a1a1a] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Notebooks
        </Link>

        <div className="h-4 border-r border-[#e0e0e0]" />

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <BookOpen className="w-4 h-4 text-violet-500 flex-shrink-0" />
          {isEditingName ? (
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={() => setIsEditingName(false)}
              autoFocus
              className="text-sm font-semibold text-[#1a1a1a] border-b border-violet-400 bg-transparent focus:outline-none px-0.5 min-w-0 flex-1"
            />
          ) : (
            <span
              className="text-sm font-semibold text-[#1a1a1a] cursor-pointer hover:text-violet-600 truncate"
              onClick={() => setIsEditingName(true)}
              title="Click to rename"
            >
              {name}
            </span>
          )}

          {/* Save indicator */}
          <span className={`text-xs flex-shrink-0 ${isSaving ? 'text-violet-500' : isDirty ? 'text-[#aaaaaa]' : 'text-[#cccccc]'}`}>
            {isSaving ? 'Saving…' : isDirty ? 'Unsaved' : 'Saved'}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <span className="text-xs text-[#777777]">
                {selectedSqlCells.length} query cell{selectedSqlCells.length !== 1 ? 's' : ''} selected
              </span>
              {selectedSqlCells.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSaveModal(true)}
                  className="gap-2 border-violet-300 text-violet-600 hover:bg-violet-50"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  Save as Transformation
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={toggleSelectionMode}
                className="gap-2"
              >
                <Square className="w-3.5 h-3.5" />
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={toggleSelectionMode}
              className="gap-2"
              title="Select Query cells to save as a Transformation"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Save as Transformation
            </Button>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <div className="w-[240px] flex-shrink-0 bg-white border-r border-[#e8e8e8] flex flex-col p-4 gap-4 overflow-y-auto">
          <div>
            <p className="text-[10px] font-bold text-[#999999] tracking-wider uppercase mb-2">
              Description
            </p>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); markDirty(); }}
              placeholder="Add a description…"
              className="w-full text-xs text-[#555555] border border-[#e8e8e8] rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-violet-400 min-h-[80px]"
            />
          </div>

          <div>
            <p className="text-[10px] font-bold text-[#999999] tracking-wider uppercase mb-2">
              Add Cell
            </p>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => addCell('sql')}
                className="flex items-center gap-2 px-3 py-2 text-xs text-[#1a1a1a] border border-[#e8e8e8] rounded-lg hover:bg-[#f5f5f5] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Query cell
              </button>
              <button
                onClick={() => addCell('markdown')}
                className="flex items-center gap-2 px-3 py-2 text-xs text-[#1a1a1a] border border-[#e8e8e8] rounded-lg hover:bg-[#f5f5f5] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Markdown cell
              </button>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-[#999999] tracking-wider uppercase mb-2">
              Cells ({cells.length})
            </p>
            <div className="flex flex-col gap-1">
              {cells.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => {
                    document.getElementById(`cell-${c.id}`)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-[#555555] rounded hover:bg-[#f5f5f5] transition-colors text-left truncate"
                >
                  <span className="text-[10px] text-[#aaaaaa] w-4 text-right">{i + 1}</span>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.type === 'sql' ? 'bg-[#1a1a1a]' : 'bg-[#aaaaaa]'}`} />
                  <span className="truncate">{c.content.slice(0, 30) || `(empty ${c.type})`}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Notebook cells */}
        <div className="flex-1 overflow-auto p-6 min-w-0">
          {cells.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-4 text-center">
              <p className="text-sm text-[#aaaaaa]">No cells yet. Add a Query or Markdown cell to get started.</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => addCell('sql')} className="gap-2">
                  <Plus className="w-3.5 h-3.5" /> Query cell
                </Button>
                <Button size="sm" variant="outline" onClick={() => addCell('markdown')} className="gap-2">
                  <Plus className="w-3.5 h-3.5" /> Markdown cell
                </Button>
              </div>
            </div>
          ) : (
            <>
              {cells.map((cell, idx) => (
                <div key={cell.id} id={`cell-${cell.id}`}>
                  <NotebookCell
                    cell={cell}
                    runtime={runtimeState[cell.id] ?? DEFAULT_RUNTIME}
                    connections={connections ?? []}
                    isFirst={idx === 0}
                    isLast={idx === cells.length - 1}
                    isSelected={selectedCells.has(cell.id)}
                    selectionMode={selectionMode}
                    onContentChange={(content) => updateCellContent(cell.id, content)}
                    onConnectionChange={(connectionId) => updateCellConnection(cell.id, connectionId)}
                    onExecute={() => executeCell(cell.id)}
                    onDelete={() => deleteCell(cell.id)}
                    onMoveUp={() => moveCell(cell.id, 'up')}
                    onMoveDown={() => moveCell(cell.id, 'down')}
                    onToggleSelect={() => toggleCellSelect(cell.id)}
                    onAddBelow={(type) => addCell(type, cell.order)}
                  />
                </div>
              ))}

              {/* Add cell footer */}
              <div className="flex justify-center gap-2 mt-2 pb-6">
                <button
                  onClick={() => addCell('sql')}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs text-[#777777] border border-dashed border-[#d0d0d0] rounded-lg hover:border-violet-400 hover:text-violet-600 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Query cell
                </button>
                <button
                  onClick={() => addCell('markdown')}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs text-[#777777] border border-dashed border-[#d0d0d0] rounded-lg hover:border-violet-400 hover:text-violet-600 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Markdown cell
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showSaveModal && (
        <SaveAsTransformationModal
          notebookId={notebookId}
          selectedCells={selectedSqlCells}
          connections={connections ?? []}
          onClose={() => setShowSaveModal(false)}
          onSaved={() => {
            setShowSaveModal(false);
            setSelectionMode(false);
            setSelectedCells(new Set());
            router.push('/transformations');
          }}
        />
      )}
    </div>
  );
}
