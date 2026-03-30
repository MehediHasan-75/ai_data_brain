import { TableRow, JsonTableItem } from "../data/TableContent";

export interface CreateTablePayload {
  table_name: string;
  headers: string[];
  description: string;
}

export type JsonTableAction =
  | {
      type: "ADD_TABLE";
      payload: CreateTablePayload | JsonTableItem;
    }
  | {
      type: "ADD_ROW";
      payload: {
        tableId: number;
        row: Omit<TableRow, "id">;
      };
    }
  | {
      type: "EDIT_ROW";
      payload: {
        tableId: number;
        rowId: number | string;
        newRow: Partial<TableRow>;
      };
    }
  | {
      type: "DELETE_ROW";
      payload: {
        tableId: number;
        rowId: number | string;
      };
    }
  | {
      type: "EDIT_TABLE_HEADERS";
      payload: {
        tableId: number;
        headers: string[];
      };
    }
  | {
      type: "DELETE_TABLE";
      payload: {
        tableId: number;
      };
    }
  | {
      type: "ADD_COLUMN";
      payload: {
        tableId: number;
        header: string;
      };
    }
  | {
      type: "EDIT_HEADER";
      payload: {
        tableId: number;
        oldHeader: string;
        newHeader: string;
      };
    }
  | {
      type: "DELETE_COLUMN";
      payload: {
        tableId: number;
        header: string;
      };
    }
  | { type: "SET_TABLES"; payload: JsonTableItem[] };

export function jsonTableReducer(
  state: JsonTableItem[],
  action: JsonTableAction
): JsonTableItem[] {
  switch (action.type) {
    case "SET_TABLES": {
      return [...action.payload];
    }
    case "ADD_TABLE": {
      const p = action.payload;
      if (!("id" in p)) return state; // CreateTablePayload — API response not yet available
      return [
        ...state,
        {
          id: (p as JsonTableItem).id,
          data: (p as JsonTableItem).data,
        },
      ];
    }
    case "ADD_ROW": {
      const { tableId, row } = action.payload;
      return state.map((table) => {
        if (table.id === tableId) {
          // Create a new row with the data from the backend
          const newRow: TableRow = {
            id: row.id || `row-${Date.now()}`,
            ...row,
          };

          return {
            ...table,
            data: {
              ...table.data,
              rows: [...table.data.rows, newRow],
            },
          };
        }
        return table;
      });
    }
    case "ADD_COLUMN": {
      const { tableId, header } = action.payload;
      return state.map((table) => {
        if (table.id === tableId) {
          return {
            ...table,
            data: {
              ...table.data,
              headers: [...table.data.headers, header],
              rows: table.data.rows.map((row) => ({
                ...row,
                [header]: "",
              })),
            },
          };
        }
        return table;
      });
    }

    case "EDIT_ROW": {
      const { tableId, rowId, newRow } = action.payload;
      return state.map((table) => {
        if (table.id === tableId) {
          return {
            ...table,
            data: {
              ...table.data,
              rows: table.data.rows.map((row) => {
                if (row.id === rowId) {
                  // Create a new object with the updated properties
                  const updatedRow: TableRow = { ...row };
                  for (const key in newRow) {
                    if (newRow[key] !== undefined) {
                      updatedRow[key] = newRow[key] as
                        | string
                        | number
                        | boolean
                        | null;
                    }
                  }
                  return updatedRow;
                }
                return row;
              }),
            },
          };
        }
        return table;
      });
    }

    case "DELETE_ROW": {
      const { tableId, rowId } = action.payload;
      return state.map((table) => {
        if (table.id === tableId) {
          return {
            ...table,
            data: {
              ...table.data,
              rows: table.data.rows.filter((row) => row.id !== rowId),
            },
          };
        }
        return table;
      });
    }

    case "EDIT_TABLE_HEADERS": {
      const { tableId, headers } = action.payload;
      return state.map((table) => {
        if (table.id === tableId) {
          return {
            ...table,
            data: {
              ...table.data,
              headers,
            },
          };
        }
        return table;
      });
    }

    case "DELETE_TABLE": {
      const { tableId } = action.payload;
      return state.filter((table) => table.id !== tableId);
    }

    case "EDIT_HEADER": {
      const { tableId, oldHeader, newHeader } = action.payload;
      return state.map((table) => {
        if (table.id === tableId) {
          const newHeaders = table.data.headers.map((header) =>
            header === oldHeader ? newHeader : header
          );
          return {
            ...table,
            data: {
              ...table.data,
              headers: newHeaders,
              rows: table.data.rows.map((row) => {
                const newRow = { ...row };
                if (oldHeader in newRow) {
                  newRow[newHeader] = newRow[oldHeader];
                  delete newRow[oldHeader];
                }
                return newRow;
              }),
            },
          };
        }
        return table;
      });
    }

    case "DELETE_COLUMN": {
      const { tableId, header } = action.payload;
      return state.map((table) => {
        if (table.id === tableId) {
          return {
            ...table,
            data: {
              ...table.data,
              headers: table.data.headers.filter((h) => h !== header),
              rows: table.data.rows.map((row) => {
                const newRow = { ...row };
                delete newRow[header];
                return newRow;
              }),
            },
          };
        }
        return table;
      });
    }

    default:
      return state;
  }
}
