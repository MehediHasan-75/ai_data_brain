"use client";
import { useMemo, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useUIStore } from "@/stores/uiStore";
import { useTableContentQuery } from "../hooks/useTableQuery";
import { useAddRow, useDeleteRow, useAddColumn } from "../hooks/useTableMutations";
import { EditableCell } from "./EditableCell";
import { DataTableHeader } from "./DataTableHeader";
import EmptyTableState from "@/components/MainComponents/EmptyTableState";
import type { TableRow } from "@/types";
import { useTheme } from "@/context/ThemeProvider";

const ROW_HEIGHT = 40;

export default function VirtualTableContainer() {
  const { selectedTableId } = useUIStore();
  const { theme } = useTheme();
  const { data: tableContent, isLoading, error } = useTableContentQuery(selectedTableId);
  const addRow = useAddRow();
  const deleteRow = useDeleteRow();
  const addColumn = useAddColumn();

  const [newColumnName, setNewColumnName] = useState("");
  const [showAddColumn, setShowAddColumn] = useState(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; rowId: number | string } | null>(null);

  const headers: string[] = useMemo(
    () => tableContent?.data?.headers ?? [],
    [tableContent]
  );
  const rows: TableRow[] = useMemo(
    () => tableContent?.data?.rows ?? [],
    [tableContent]
  );

  const columns = useMemo<ColumnDef<TableRow>[]>(
    () =>
      headers.map((h) => ({
        id: h,
        accessorKey: h,
        header: () =>
          selectedTableId ? (
            <DataTableHeader tableId={selectedTableId} header={h} />
          ) : (
            h
          ),
        cell: ({ row }) =>
          selectedTableId ? (
            <EditableCell
              tableId={selectedTableId}
              rowId={row.original.id as number | string}
              column={h}
              value={row.original[h]}
            />
          ) : null,
        size: 160,
      })),
    [headers, selectedTableId]
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const tableRows = table.getRowModel().rows;

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleAddRow = () => {
    if (!selectedTableId) return;
    const emptyRow = headers.reduce<Omit<TableRow, "id">>((acc, h) => {
      acc[h] = "";
      return acc;
    }, {});
    addRow.mutate({ tableId: selectedTableId, row: emptyRow });
  };

  const handleAddColumn = () => {
    if (!selectedTableId || !newColumnName.trim()) return;
    addColumn.mutate({ tableId: selectedTableId, header: newColumnName.trim() });
    setNewColumnName("");
    setShowAddColumn(false);
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    rowId: number | string
  ) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, rowId });
  };

  const handleDeleteRow = () => {
    if (!selectedTableId || !ctxMenu) return;
    deleteRow.mutate({ tableId: selectedTableId, rowId: ctxMenu.rowId });
    setCtxMenu(null);
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (!selectedTableId) return <EmptyTableState />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading table…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        Failed to load table.
      </div>
    );
  }

  const isDark = theme === "dark";
  const border = isDark ? "border-gray-700" : "border-gray-200";
  const headerBg = isDark ? "bg-gray-800 text-gray-200" : "bg-gray-50 text-gray-700";
  const rowBg = isDark ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900";
  const rowHover = isDark ? "hover:bg-gray-800" : "hover:bg-gray-50";

  return (
    <div
      className="flex flex-col h-full"
      onClick={() => ctxMenu && setCtxMenu(null)}
    >
      {/* Toolbar */}
      <div className={`flex items-center gap-2 px-4 py-2 border-b ${border}`}>
        <button
          onClick={handleAddRow}
          disabled={addRow.isPending}
          className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
        >
          + Row
        </button>
        {showAddColumn ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              className="px-2 py-1 text-xs border rounded outline-none dark:bg-gray-800 dark:border-gray-600"
              placeholder="Column name"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddColumn();
                if (e.key === "Escape") setShowAddColumn(false);
              }}
            />
            <button
              onClick={handleAddColumn}
              className="px-2 py-1 text-xs rounded bg-green-600 hover:bg-green-700 text-white"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddColumn(false)}
              className="px-2 py-1 text-xs rounded bg-gray-400 hover:bg-gray-500 text-white"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddColumn(true)}
            className="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors"
          >
            + Column
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {rows.length} rows
        </span>
      </div>

      {/* Table */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{ contain: "strict" }}
      >
        <table className="w-full border-collapse text-sm" style={{ minWidth: headers.length * 160 }}>
          {/* Sticky header */}
          <thead className={`sticky top-0 z-10 ${headerBg}`}>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`px-2 py-2 text-left text-xs font-semibold border-b border-r ${border}`}
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          {/* Virtualized body */}
          <tbody>
            {/* Top padding spacer */}
            {virtualItems.length > 0 && virtualItems[0].start > 0 && (
              <tr>
                <td
                  style={{ height: virtualItems[0].start, padding: 0 }}
                  colSpan={headers.length}
                />
              </tr>
            )}

            {virtualItems.map((vRow) => {
              const row = tableRows[vRow.index];
              return (
                <tr
                  key={row.id}
                  className={`${rowBg} ${rowHover} transition-colors`}
                  style={{ height: ROW_HEIGHT }}
                  onContextMenu={(e) =>
                    handleContextMenu(e, row.original.id as number | string)
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`border-b border-r ${border} p-0`}
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}

            {/* Bottom padding spacer */}
            {virtualItems.length > 0 && (
              <tr>
                <td
                  style={{
                    height:
                      totalSize -
                      (virtualItems[virtualItems.length - 1]?.end ?? 0),
                    padding: 0,
                  }}
                  colSpan={headers.length}
                />
              </tr>
            )}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            No rows yet. Click &quot;+ Row&quot; to add one.
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          className={`fixed z-50 rounded shadow-lg border py-1 text-sm ${
            isDark
              ? "bg-gray-800 border-gray-700 text-gray-100"
              : "bg-white border-gray-200 text-gray-800"
          }`}
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button
            className="w-full px-4 py-1.5 text-left hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"
            onClick={handleDeleteRow}
          >
            Delete row
          </button>
        </div>
      )}
    </div>
  );
}
