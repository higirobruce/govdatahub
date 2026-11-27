'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface NL2SQLPanelProps {
  schemaContext?: string;
  dialect?: string;
  onSqlGenerated: (sql: string) => void;
}

export default function NL2SQLPanel({ schemaContext = '', dialect, onSqlGenerated }: NL2SQLPanelProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setExplanation(null);

    try {
      const result = await api.ai.nl2sql({
        question: question.trim(),
        schemaContext: schemaContext || 'No schema provided — generate generic SQL.',
        dialect,
      });
      setExplanation(result.explanation);
      onSqlGenerated(result.sql);
    } catch (err: any) {
      setError(err.message || 'Failed to generate SQL');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="border border-[#dddddd] rounded-lg bg-[#fafafa] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[#555555] uppercase tracking-wide">AI: Natural Language to SQL</span>
        <span className="text-xs text-[#aaaaaa]">· Cmd+Enter to generate</span>
      </div>

      <textarea
        rows={2}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="e.g. Show me the top 10 customers by total revenue last month"
        className="w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] resize-none focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none bg-white"
      />

      {error && (
        <div className="text-xs text-[#991b1b] bg-[#fee2e2] border border-[#fca5a5] rounded px-3 py-2">
          {error.includes('not configured') ? (
            <>
              AI is not configured.{' '}
              <a href="/settings" className="underline font-medium">Go to Settings</a> to set up an AI provider.
            </>
          ) : error}
        </div>
      )}

      {explanation && (
        <div className="text-xs text-[#065f46] bg-[#d1fae5] border border-[#6ee7b7] rounded px-3 py-2">
          {explanation}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={handleGenerate}
          disabled={loading || !question.trim()}
        >
          {loading ? 'Generating...' : 'Generate SQL'}
        </Button>
      </div>
    </div>
  );
}
