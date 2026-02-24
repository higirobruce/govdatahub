'use client';

import { CellType, CellStatus } from '@/types/notebook';
import { Play, Trash2, ChevronUp, ChevronDown, Plus, Loader2 } from 'lucide-react';

interface CellToolbarProps {
  type: CellType;
  status: CellStatus;
  onExecute: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddBelow: (type: CellType) => void;
  isFirst: boolean;
  isLast: boolean;
}

export function CellToolbar({
  type,
  status,
  onExecute,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddBelow,
  isFirst,
  isLast,
}: CellToolbarProps) {
  const isRunning = status === 'running';

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover/cell:opacity-100 transition-opacity">
      {type === 'sql' && (
        <button
          onClick={onExecute}
          disabled={isRunning}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-[#1a1a1a] text-white rounded hover:bg-[#333333] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Run cell (Ctrl+Enter)"
        >
          {isRunning ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          Run
        </button>
      )}

      <button
        onClick={onMoveUp}
        disabled={isFirst}
        className="p-1 text-[#777777] hover:text-[#1a1a1a] hover:bg-[#f0f0f0] rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Move up"
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={onMoveDown}
        disabled={isLast}
        className="p-1 text-[#777777] hover:text-[#1a1a1a] hover:bg-[#f0f0f0] rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Move down"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      <div className="relative group/add">
        <button
          className="flex items-center gap-1 p-1 text-[#777777] hover:text-[#1a1a1a] hover:bg-[#f0f0f0] rounded transition-colors"
          title="Add cell below"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        {/* Dropdown */}
        <div className="absolute right-0 top-full mt-1 bg-white border border-[#e8e8e8] rounded-lg shadow-lg z-10 py-1 min-w-[140px] hidden group-hover/add:block">
          <button
            onClick={() => onAddBelow('sql')}
            className="w-full text-left px-3 py-1.5 text-xs text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
          >
            + Query cell
          </button>
          <button
            onClick={() => onAddBelow('markdown')}
            className="w-full text-left px-3 py-1.5 text-xs text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
          >
            + Markdown cell
          </button>
        </div>
      </div>

      <button
        onClick={onDelete}
        className="p-1 text-[#777777] hover:text-red-500 hover:bg-red-50 rounded transition-colors"
        title="Delete cell"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
