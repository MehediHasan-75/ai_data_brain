"use client";
import { useState } from "react";

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

interface ToolCallVisualizerProps {
  toolCalls: ToolCall[];
}

export default function ToolCallVisualizer({ toolCalls }: ToolCallVisualizerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!toolCalls.length) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-medium"
      >
        <span>{expanded ? "▾" : "▸"}</span>
        <span>
          {toolCalls.length} tool{toolCalls.length > 1 ? "s" : ""} called
        </span>
      </button>

      {expanded && (
        <div className="mt-1 space-y-1">
          {toolCalls.map((tc, i) => (
            <div
              key={i}
              className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-2"
            >
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">
                🔧 {tc.name}
              </p>
              <pre className="text-xs text-gray-600 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(tc.args, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
