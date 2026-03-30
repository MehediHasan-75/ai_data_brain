"use client";
import { useState, useRef, useEffect } from "react";
import { useEditRow } from "../hooks/useTableMutations";
import type { TableRow } from "@/types";

interface EditableCellProps {
  tableId: number;
  rowId: number | string;
  column: string;
  value: string | number | boolean | null;
}

export function EditableCell({ tableId, rowId, column, value }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);
  const editRow = useEditRow();

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const original = String(value ?? "");
    if (draft === original) return;
    const update: Partial<TableRow> = { [column]: draft };
    editRow.mutate({ tableId, rowId, newRow: update });
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="w-full h-full px-2 py-1 text-sm bg-blue-50 dark:bg-blue-900/30 border border-blue-400 rounded outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(String(value ?? ""));
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      className="w-full h-full px-2 py-1 text-sm truncate cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
      onClick={() => {
        setDraft(String(value ?? ""));
        setEditing(true);
      }}
    >
      {value === null || value === undefined ? (
        <span className="text-gray-400 italic">null</span>
      ) : (
        String(value)
      )}
    </div>
  );
}
