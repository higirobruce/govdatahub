'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { PersistedCell, CellRuntimeState, CellType } from '@/types/notebook';
import { Connection } from '@/types';
import SQLEditor from '@/components/QueryInterface/SQLEditor';
import { CellToolbar } from './CellToolbar';
import { CellResults } from './CellResults';
import { Code, FileText } from 'lucide-react';

interface NotebookCellProps {
  cell: PersistedCell;
  runtime: CellRuntimeState;
  connections: Connection[];
  isFirst: boolean;
  isLast: boolean;
  isSelected: boolean;
  selectionMode: boolean;
  onContentChange: (content: string) => void;
  onConnectionChange: (connectionId: string) => void;
  onExecute: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleSelect: () => void;
  onAddBelow: (type: CellType) => void;
}

export function NotebookCell({
  cell,
  runtime,
  connections,
  isFirst,
  isLast,
  isSelected,
  selectionMode,
  onContentChange,
  onConnectionChange,
  onExecute,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleSelect,
  onAddBelow,
}: NotebookCellProps) {
  const [mdEditing, setMdEditing] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onExecute();
    }
  };

  return (
    <div
      className={`group/cell relative mb-3 rounded-xl border transition-colors ${
        isSelected
          ? 'border-violet-400 bg-violet-50'
          : runtime.status === 'running'
          ? 'border-blue-200 bg-blue-50/30'
          : runtime.status === 'error'
          ? 'border-red-200'
          : 'border-[#e8e8e8] bg-white'
      }`}
    >
      {/* Cell header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#f0f0f0]">
        <div className="flex items-center gap-2">
          {/* Selection checkbox */}
          {selectionMode && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              disabled={cell.type === 'markdown'}
              className="w-3.5 h-3.5 accent-violet-600 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
            />
          )}

          {/* Cell type badge */}
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
            cell.type === 'sql'
              ? 'bg-[#1a1a1a] text-white'
              : 'bg-[#f0f0f0] text-[#555555]'
          }`}>
            {cell.type === 'sql' ? <Code className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
            {cell.type}
          </span>

          {/* Connection selector (SQL cells only) */}
          {cell.type === 'sql' && (
            <select
              value={cell.connectionId ?? ''}
              onChange={(e) => onConnectionChange(e.target.value)}
              className="text-xs border border-[#e8e8e8] rounded px-2 py-0.5 bg-white text-[#555555] focus:outline-none focus:border-violet-400 max-w-[180px]"
            >
              <option value="">— select connection —</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <CellToolbar
          type={cell.type}
          status={runtime.status}
          onExecute={onExecute}
          onDelete={onDelete}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onAddBelow={onAddBelow}
          isFirst={isFirst}
          isLast={isLast}
        />
      </div>

      {/* Cell body */}
      <div className="p-3">
        {cell.type === 'sql' ? (
          <SQLEditor
            value={cell.content}
            onChange={onContentChange}
            onKeyDown={handleKeyDown}
            height="160px"
            theme="dark"
          />
        ) : mdEditing ? (
          <textarea
            value={cell.content}
            onChange={(e) => onContentChange(e.target.value)}
            onBlur={() => setMdEditing(false)}
            autoFocus
            placeholder="Write markdown here…"
            className="w-full min-h-[80px] px-3 py-2 text-sm font-mono border border-[#e8e8e8] rounded-lg focus:outline-none focus:border-violet-400 resize-y"
          />
        ) : (
          <div
            onClick={() => setMdEditing(true)}
            className="min-h-[40px] px-3 py-2 cursor-text rounded-lg hover:bg-[#fafafa] transition-colors"
          >
            {cell.content ? (
              <div className="text-sm text-[#333333] [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-1.5 [&_h3]:font-semibold [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_code]:bg-[#f0f0f0] [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_pre]:bg-[#1a1a1a] [&_pre]:text-white [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-auto [&_pre]:text-xs [&_strong]:font-semibold [&_em]:italic">
                <ReactMarkdown>{cell.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-[#aaaaaa] italic">Click to add markdown text…</p>
            )}
          </div>
        )}

        <CellResults runtime={runtime} />
      </div>
    </div>
  );
}
