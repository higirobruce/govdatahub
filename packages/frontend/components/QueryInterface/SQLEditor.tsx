'use client';

import Editor from '@monaco-editor/react';
import { useEffect, useRef } from 'react';

interface SQLEditorProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  disabled?: boolean;
  height?: string;
  theme?: 'light' | 'dark';
}

export default function SQLEditor({
  value,
  onChange,
  onKeyDown,
  disabled = false,
  height = '400px',
  theme = 'dark',
}: SQLEditorProps) {
  const editorRef = useRef<any>(null);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;

    // Configure editor options
    editor.updateOptions({
      minimap: { enabled: true },
      lineNumbers: 'on',
      glyphMargin: false,
      folding: true,
      lineDecorationsWidth: 10,
      lineNumbersMinChars: 3,
      renderLineHighlight: 'all',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      fontLigatures: true,
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      suggestOnTriggerCharacters: true,
      quickSuggestions: true,
      wordBasedSuggestions: true,
    });

    // Add keyboard shortcut for execution (Cmd+Enter or Ctrl+Enter)
    editor.addAction({
      id: 'execute-query',
      label: 'Execute Query',
      keybindings: [2097 | 3], // Ctrl+Enter or Cmd+Enter
      run: () => {
        if (onKeyDown) {
          const event = new KeyboardEvent('keydown', {
            key: 'Enter',
            ctrlKey: true,
            metaKey: true
          }) as any;
          onKeyDown(event);
        }
      },
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    onChange(value || '');
  };

  return (
    <div className="border border-[#2d2d2d] rounded-lg overflow-hidden">
      <Editor
        height={height}
        defaultLanguage="sql"
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
        options={{
          readOnly: disabled,
          contextmenu: true,
          mouseWheelZoom: true,
          selectOnLineNumbers: true,
          roundedSelection: true,
          padding: { top: 16, bottom: 16 },
        }}
      />
    </div>
  );
}
