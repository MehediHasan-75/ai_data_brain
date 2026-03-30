import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { JsonTableItem, TableRow } from "@/types";

// ── Create table ──────────────────────────────────────────────────────────────
interface CreateTableInput {
  table_name: string;
  description?: string;
  headers?: string[];
}

export function useCreateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTableInput) => {
      const res = await fetch("/api/tables", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create table");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tables"] }),
  });
}

// ── Delete table ─────────────────────────────────────────────────────────────
export function useDeleteTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tableId: number) => {
      const res = await fetch(`/api/tables/${tableId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete table");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tables"] }),
  });
}

// ── Share table ───────────────────────────────────────────────────────────────
interface ShareTableInput {
  tableId: number;
  friend_ids: number[];
  action: "share" | "unshare";
}

export function useShareTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableId, friend_ids, action }: ShareTableInput) => {
      const res = await fetch(`/api/tables/${tableId}/share`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friend_ids, action }),
      });
      if (!res.ok) throw new Error("Failed to share table");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tables"] }),
  });
}

// ── Add row ───────────────────────────────────────────────────────────────────
interface AddRowInput {
  tableId: number;
  row: Omit<TableRow, "id">;
}

export function useAddRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableId, row }: AddRowInput) => {
      const res = await fetch(`/api/tables/${tableId}/rows`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row }),
      });
      if (!res.ok) throw new Error("Failed to add row");
      return res.json();
    },
    onSuccess: (_, { tableId }) =>
      qc.invalidateQueries({ queryKey: ["tables", tableId, "content"] }),
  });
}

// ── Edit row (optimistic) ────────────────────────────────────────────────────
interface EditRowInput {
  tableId: number;
  rowId: number | string;
  newRow: Partial<TableRow>;
}

export function useEditRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableId, rowId, newRow }: EditRowInput) => {
      const res = await fetch(`/api/tables/${tableId}/rows/${rowId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newRowData: newRow }),
      });
      if (!res.ok) throw new Error("Failed to update row");
      return res.json();
    },
    onMutate: async ({ tableId, rowId, newRow }) => {
      await qc.cancelQueries({ queryKey: ["tables", tableId, "content"] });
      const previous = qc.getQueryData<JsonTableItem>(["tables", tableId, "content"]);
      qc.setQueryData(["tables", tableId, "content"], (old: JsonTableItem | undefined) => {
        if (!old) return old;
        return {
          ...old,
          data: {
            ...old.data,
            rows: old.data.rows.map((r) =>
              r.id === rowId ? { ...r, ...newRow } : r
            ),
          },
        } as JsonTableItem;
      });
      return { previous };
    },
    onError: (_err, { tableId }, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["tables", tableId, "content"], ctx.previous);
      }
    },
    onSettled: (_data, _err, { tableId }) =>
      qc.invalidateQueries({ queryKey: ["tables", tableId, "content"] }),
  });
}

// ── Delete row ────────────────────────────────────────────────────────────────
interface DeleteRowInput {
  tableId: number;
  rowId: number | string;
}

export function useDeleteRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableId, rowId }: DeleteRowInput) => {
      const res = await fetch(`/api/tables/${tableId}/rows/${rowId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete row");
    },
    onMutate: async ({ tableId, rowId }) => {
      await qc.cancelQueries({ queryKey: ["tables", tableId, "content"] });
      const previous = qc.getQueryData<JsonTableItem>(["tables", tableId, "content"]);
      qc.setQueryData<JsonTableItem>(["tables", tableId, "content"], (old) => {
        if (!old) return old;
        return {
          ...old,
          data: {
            ...old.data,
            rows: old.data.rows.filter((r) => r.id !== rowId),
          },
        };
      });
      return { previous };
    },
    onError: (_err, { tableId }, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["tables", tableId, "content"], ctx.previous);
      }
    },
    onSettled: (_data, _err, { tableId }) =>
      qc.invalidateQueries({ queryKey: ["tables", tableId, "content"] }),
  });
}

// ── Add column ────────────────────────────────────────────────────────────────
interface ColumnInput {
  tableId: number;
  header: string;
}

export function useAddColumn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableId, header }: ColumnInput) => {
      const res = await fetch(`/api/tables/${tableId}/columns`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "add", header }),
      });
      if (!res.ok) throw new Error("Failed to add column");
      return res.json();
    },
    onSuccess: (_, { tableId }) =>
      qc.invalidateQueries({ queryKey: ["tables", tableId, "content"] }),
  });
}

// ── Delete column ─────────────────────────────────────────────────────────────
export function useDeleteColumn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableId, header }: ColumnInput) => {
      const res = await fetch(`/api/tables/${tableId}/columns`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "delete", header }),
      });
      if (!res.ok) throw new Error("Failed to delete column");
      return res.json();
    },
    onSuccess: (_, { tableId }) =>
      qc.invalidateQueries({ queryKey: ["tables", tableId, "content"] }),
  });
}

// ── Edit header (rename column) ───────────────────────────────────────────────
interface EditHeaderInput {
  tableId: number;
  oldHeader: string;
  newHeader: string;
}

export function useEditHeader() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableId, oldHeader, newHeader }: EditHeaderInput) => {
      const res = await fetch(`/api/tables/${tableId}/columns`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "edit", oldHeader, newHeader }),
      });
      if (!res.ok) throw new Error("Failed to rename column");
      return res.json();
    },
    onSuccess: (_, { tableId }) =>
      qc.invalidateQueries({ queryKey: ["tables", tableId, "content"] }),
  });
}
