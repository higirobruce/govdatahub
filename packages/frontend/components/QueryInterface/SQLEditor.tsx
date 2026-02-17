'use client';

interface SQLEditorProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  disabled?: boolean;
}

export default function SQLEditor({
  value,
  onChange,
  onKeyDown,
  disabled,
}: SQLEditorProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      disabled={disabled}
      className="w-full h-64 font-mono text-sm border border-gray-300 rounded-md p-4 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-500"
      placeholder="Enter your SQL query here...&#10;&#10;Example:&#10;SELECT * FROM users LIMIT 10;"
      spellCheck={false}
    />
  );
}
