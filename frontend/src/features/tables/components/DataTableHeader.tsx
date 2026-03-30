"use client";
import { useState } from "react";
import { useEditHeader, useDeleteColumn } from "../hooks/useTableMutations";

interface DataTableHeaderProps {
  tableId: number;
  header: string;
}

export function DataTableHeader({ tableId, header }: DataTableHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(header);
  const editHeader = useEditHeader();
  const deleteColumn = useDeleteColumn();

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== header) {
      editHeader.mutate({ tableId, oldHeader: header, newHeader: draft.trim() });
    } else {
      setDraft(header);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        className="w-full px-1 py-0.5 text-xs font-semibold bg-white dark:bg-gray-800 border border-blue-400 rounded outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(header);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div className="group flex items-center justify-between gap-1 w-full">
      <span
        className="flex-1 truncate cursor-pointer"
        onDoubleClick={() => setEditing(true)}
        title="Double-click to rename"
      >
        {header}
      </span>
      <button
        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs px-0.5 transition-opacity"
        onClick={() => deleteColumn.mutate({ tableId, header })}
        title="Delete column"
      >
        ×
      </button>
    </div>
  );
}
