// Re-export all shared types. Canonical source of truth for the new architecture.
// Legacy: src/data/table.ts, src/data/TableContent.ts, src/data/ChatMessages.ts

export interface TableDataType {
  id: number;
  table_name: string;
  user_id: string;
  created_at: string;
  modified_at: string;
  description?: string;
  pendingCount: number;
  headers?: string[];
  is_shared: boolean;
  owner: {
    id: number;
    username: string;
  };
  shared_with: Array<{
    id: number;
    username: string;
  }>;
}

export interface TableRow {
  [key: string]: string | number | boolean | null;
}

export interface TableData {
  headers: string[];
  rows: TableRow[];
}

export interface JsonTableItem {
  id: number;
  data: TableData;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
  isTyping?: boolean;
  displayedText?: string;
  agentData?: {
    response: string;
    tools_called: Array<{
      name: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: Record<string, any>;
    }>;
    streaming_info?: {
      tool_operations: Array<{
        step: number;
        tool_name: string;
        tool_type: string;
        operation: string;
        status: string;
        timestamp: string;
      }>;
      status: string;
    };
  };
}

export interface User {
  id: number;
  username: string;
  email: string;
  name?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
