import { getTableData, TableDataType } from "@/data/table";
import { getAllTableContents, JsonTableItem } from "@/data/TableContent";
import { JsonTableAction, jsonTableReducer } from "@/reducers/TableContentReducer";
import { TableReducer, TableDataAction } from "@/reducers/TableReducer";
import { ReactNode, useReducer, createContext, useContext } from "react";

interface TablesDataContextType {
  tablesData: TableDataType[];
  dispatchTablesData: React.Dispatch<TableDataAction>;
  getTableData: (tableId: number | null) => TableDataType[];
}

const initialTablesData: TableDataType[] = getTableData("1") as unknown as TableDataType[];

export const TablesDataContext = createContext<TablesDataContextType | null>(null);


interface TablesContentContextType {
    tablesContent: JsonTableItem[];
    dispatchtablesContent: React.Dispatch<JsonTableAction>;
    getTableContents: (tableId: number | null) => JsonTableItem[];
}
const initialTablesContent: JsonTableItem[] = getAllTableContents();
export const TablesContentContext = createContext<TablesContentContextType | null> (null);


export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [tablesData, dispatchTablesData] = useReducer(TableReducer,initialTablesData);
  const [tablesContent, dispatchtablesContent] = useReducer(jsonTableReducer, initialTablesContent);

  const getTableContents = (tableId: number | null) => {
        if (tableId === null) return [];
        return tablesContent.filter(table => table.id === tableId)
    };
  
  const getTableData = (tableId: number | null) => {
        if (tableId === null) return [];
        return tablesData.filter(table => table.id === tableId)
    };

  return (
    <TablesDataContext.Provider value={{ tablesData, getTableData, dispatchTablesData }}>
        <TablesContentContext.Provider value={{tablesContent, dispatchtablesContent, getTableContents}}>
      {children}
      </TablesContentContext.Provider>
    </TablesDataContext.Provider>
  );
};

export const useTablesData = () => {
  const context = useContext(TablesDataContext);
  if (!context) {
    throw new Error("useTablesData must be used within a DataProvider");
  }
  return context;
};

export const useTablesContent = () => {
  const context = useContext(TablesContentContext);
  if (!context) {
    throw new Error("useTablesData must be used within a DataProvider");
  }
  return context;
};
