'use client';

import { Settings2 } from 'lucide-react';

interface SourceQueryEditorProps {
  connectionType: string;
  value: string;
  onChange: (value: string) => void;
}

export function SourceQueryEditor({
  connectionType,
  value,
  onChange,
}: SourceQueryEditorProps) {
  const isMongoDB = connectionType === 'mongodb';

  return (
    <div className="border-t border-gray-200 pt-2 mt-1">
      <div className="flex items-center gap-1 mb-1">
        <Settings2 className="w-3 h-3 text-amber-500" />
        <span className="text-[10px] text-amber-600 uppercase tracking-wide font-medium">
          Source query
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[11px] font-mono border border-gray-200 rounded p-1.5 resize-y bg-[#fafafa] focus:outline-none focus:border-amber-400 min-h-[56px]"
        placeholder={
          isMongoDB
            ? '{"collection":"...","filter":{},"limit":10000}'
            : 'SELECT * FROM table LIMIT 10000'
        }
        rows={3}
        spellCheck={false}
      />
      <p className="text-[10px] text-gray-400 mt-0.5">
        Materialized at query time · default limit 10,000 rows
      </p>
    </div>
  );
}
