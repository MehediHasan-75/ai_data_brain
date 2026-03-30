import { TableDataType } from "@/data/table";
export type TableDataAction =
  | { type: "EDIT"; payload: { id: number; table_name: string } }
  | {
      type: "SHARE";
      payload: {
        id: number;
        is_shared: boolean;
        shared_with: Array<{
          id: number;
          username: string;
        }>;
      };
    }
  | { type: "DELETE"; payload: { id: number } }
  | { type: "SET_TABLES"; payload: TableDataType[] }
  | {
      type: "ADD_TABLE";
      payload: {
        id: number;
        table_name: string;
        description: string;
        headers: string[];
      };
    };

export const TableReducer = (
  tables: TableDataType[],
  action: TableDataAction
): TableDataType[] => {
  switch (action.type) {
    case "SET_TABLES": {
      console.log("at tablereducer set table: ", action.payload);

      return [...action.payload];
    }
    case "ADD_TABLE": {
      return [
        ...tables,
        {
          id: action.payload.id,
          table_name: action.payload.table_name,
          user_id: "1",
          created_at: new Date().toISOString(),
          modified_at: new Date().toISOString(),
          description: action.payload.description,
          pendingCount: 0,
          is_shared: false,
          owner: { id: 0, username: "" },
          shared_with: [],
        } as TableDataType,
      ].sort(
        (a, b) =>
          new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime()
      );
    }
    case "EDIT": {
      return tables
        .map((table) =>
          table.id === action.payload.id
            ? {
                ...table,
                table_name: action.payload.table_name,
                modified_at: new Date().toISOString(),
              }
            : table
        )
        .sort(
          (a, b) =>
            new Date(b.modified_at).getTime() -
            new Date(a.modified_at).getTime()
        );
    }

    case "SHARE": {
      return tables.map((table) =>
        table.id === action.payload.id
          ? {
              ...table,
              is_shared: action.payload.is_shared,
              shared_with: action.payload.shared_with,
              modified_at: new Date().toISOString(),
            }
          : table
      );
    }

    case "DELETE": {
      return tables.filter((table) => table.id !== action.payload.id);
    }

    default:
      return [...tables]; // Fallback for unrecognized action
  }
};
