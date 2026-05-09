"use client";
import React, { useRef } from "react";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center h-full"
      style={{ background: "#1e1e1e", color: "#64748b", fontSize: "13px" }}
    >
      <span className="animate-pulse">Loading editor…</span>
    </div>
  ),
});

const LANG_MAP: Record<string, string> = {
  JAVASCRIPT: "javascript",
  CPP: "cpp",
  PYTHON: "python",
  JAVA: "java",
  C: "c",
};

const EDITOR_OPTIONS = {
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontLigatures: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  lineNumbers: "on" as const,
  glyphMargin: false,
  folding: true,
  renderLineHighlight: "line" as const,
  tabSize: 2,
  automaticLayout: true,
  padding: { top: 12, bottom: 12 },
  cursorBlinking: "smooth" as const,
  smoothScrolling: true,
  contextmenu: true,
  wordWrap: "off" as const,
  bracketPairColorization: { enabled: true },
};

export function CodeEditor({
  value,
  onChange,
  language,
  height = "100%",
}: {
  value: string;
  onChange: (val: string) => void;
  language: string;
  height?: string;
}) {
  const monacoLang = LANG_MAP[language] ?? "javascript";
  const editorRef = useRef<unknown>(null);

  return (
    <div className="monaco-wrapper h-full" style={{ height }}>
      <MonacoEditor
        height={height}
        language={monacoLang}
        value={value}
        theme="vs-dark"
        options={EDITOR_OPTIONS}
        onChange={(v) => onChange(v ?? "")}
        onMount={(editor) => { editorRef.current = editor; }}
      />
    </div>
  );
}
