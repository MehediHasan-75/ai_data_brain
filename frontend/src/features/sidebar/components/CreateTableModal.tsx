"use client";
import ReactDOM from "react-dom";
import { useState } from "react";
import { useTheme } from "@/context/ThemeProvider";
import { useCreateTable } from "@/features/tables/hooks/useTableMutations";
import { useUIStore } from "@/stores/uiStore";

interface CreateTableModalProps {
  onCloseModal: () => void;
}

export default function CreateTableModal({ onCloseModal }: CreateTableModalProps) {
  const { theme } = useTheme();
  const [tableName, setTableName] = useState("");
  const [description, setDescription] = useState("");
  const [headers, setHeaders] = useState("");
  const [formError, setFormError] = useState("");
  const createTable = useCreateTable();
  const setSelectedTableId = useUIStore((s) => s.setSelectedTableId);

  const handleCreate = async () => {
    if (!tableName.trim()) {
      setFormError("Table name is required");
      return;
    }
    setFormError("");
    const headersArray = headers
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    const defaultHeaders = ["id", ...headersArray];

    try {
      const res = await createTable.mutateAsync({
        table_name: tableName.trim(),
        description: description.trim() || undefined,
        headers: defaultHeaders,
      });
      // Select the newly created table
      const newId = res?.data?.id ?? res?.id;
      if (newId) setSelectedTableId(newId);
      onCloseModal();
    } catch {
      setFormError("Failed to create table. Please try again.");
    }
  };

  const isDark = theme === "dark";

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onCloseModal()}
    >
      <div
        className={`w-full max-w-lg rounded-2xl p-6 shadow-lg ${
          isDark ? "bg-gray-800 text-gray-100" : "bg-white text-gray-900"
        }`}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Create New Table</h2>
          <button
            onClick={onCloseModal}
            className="text-gray-500 hover:text-red-500 text-2xl font-bold"
          >
            &times;
          </button>
        </div>

        {formError && (
          <div className="mb-4 p-2 rounded bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200">
            {formError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block font-medium mb-1">Table Name</label>
            <input
              autoFocus
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Enter table name"
              className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description"
              rows={2}
              className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">
              Headers <span className="text-xs text-gray-400">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              placeholder="e.g. title, content, author"
              className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">&apos;id&apos; column is added automatically</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCloseModal}
            className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={createTable.isPending}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {createTable.isPending ? "Creating…" : "Create Table"}
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
