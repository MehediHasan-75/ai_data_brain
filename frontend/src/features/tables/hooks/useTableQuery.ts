import { useQuery } from "@tanstack/react-query";
import type { TableDataType, JsonTableItem } from "@/types";

async function fetchTables(): Promise<TableDataType[]> {
  const res = await fetch("/api/tables", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch tables");
  const data = await res.json();
  // Django returns array directly or wrapped in data key
  return Array.isArray(data) ? data : (data.data ?? []);
}

async function fetchTableContent(tableId: number): Promise<JsonTableItem> {
  const res = await fetch("/api/tables/contents", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch table content");
  const data = await res.json();
  const items: JsonTableItem[] = Array.isArray(data) ? data : (data.data ?? []);
  const found = items.find((t) => t.id === tableId);
  if (!found) throw new Error(`Table content not found for id ${tableId}`);
  return found;
}

export function useTablesQuery() {
  return useQuery<TableDataType[]>({
    queryKey: ["tables"],
    queryFn: fetchTables,
    staleTime: 30_000,
  });
}

export function useTableContentQuery(tableId: number | null) {
  return useQuery<JsonTableItem>({
    queryKey: ["tables", tableId, "content"],
    queryFn: () => fetchTableContent(tableId!),
    enabled: tableId !== null,
    staleTime: 30_000,
  });
}
