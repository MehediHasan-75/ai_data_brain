// src/api/tableApi.ts
import { TableDataType } from "@/data/table";
import { TableDataAction } from "@/reducers/TableReducer";
import axios, {
  AxiosResponse,
  AxiosError,
  AxiosRequestConfig,
  RawAxiosRequestHeaders,
} from "axios";
import { TableRow, TableData } from "@/data/TableContent";

// BFF proxy — all requests go through Next.js route handlers
const API_BASE_URL = "/api";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface AddTableDataType {
  id: number;
  table_name: string;
  description: string;
  headers?: string[];
}

interface TableContentResponse {
  id: number;
  data: TableData;
}

interface RowResponse {
  id: number;
  data: TableRow;
}

interface EditTablePayload {
  id: number;
  table_name: string;
  description?: string;
}

interface ShareTablePayload {
  table_id: number;
  friend_ids: number[];
  action: "share" | "unshare";
}

interface ShareTableResponse {
  table: {
    id: number;
    table_name: string;
    is_shared: boolean;
    shared_with: Array<{
      id: number;
      username: string;
    }>;
  };
}

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add token refresh functionality
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If access token expired and it's the first retry
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        // Refresh the token
        await apiClient.get("/auth/refresh");
        processQueue(null);
        return apiClient(originalRequest); // Retry original request
      } catch (refreshError) {
        const error =
          refreshError instanceof Error
            ? refreshError
            : new Error(String(refreshError));
        processQueue(error, null);

        if (typeof window !== "undefined") {
          window.location.href = "/signin";
        }

        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Helper function for API requests
const apiRequest = async <T>(
  endpoint: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<ApiResponse<T>> => {
  try {
    const config: AxiosRequestConfig = {
      url: endpoint,
      method,
      data: body,
      headers: headers
        ? ({
            ...apiClient.defaults.headers.common,
            ...headers,
          } as RawAxiosRequestHeaders)
        : (apiClient.defaults.headers.common as RawAxiosRequestHeaders),
    };

    const response: AxiosResponse<T> = await apiClient.request(config);
    return { success: true, data: response.data };
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      return {
        success: false,
        error:
          (axiosError.response.data as { message?: string })?.message ||
          `HTTP error! status: ${axiosError.response.status}`,
      };
    } else if (axiosError.request) {
      return {
        success: false,
        error: "No response received from server",
      };
    } else {
      return {
        success: false,
        error: axiosError.message || "An unknown error occurred",
      };
    }
  }
};

// Table API Service
export const tableApi = {
  // Get all tables
  async getTables(): Promise<ApiResponse<TableDataType[]>> {
    return apiRequest<TableDataType[]>("/main/tables/", "GET");
  },

  // Add a new table
  async addTable(
    tableData: Omit<AddTableDataType, "id">
  ): Promise<ApiResponse<TableDataType>> {
    return apiRequest<TableDataType>(
      "/main/create-tableContent/",
      "POST",
      tableData
    );
  },

  // Edit a table
  async editTable(
    id: number,
    updateData: { table_name: string; description?: string }
  ): Promise<ApiResponse<TableDataType>> {
    return apiRequest<TableDataType>("/main/tables/update/", "PUT", {
      id,
      ...updateData,
    });
  },

  // Delete a table
  async deleteTable(id: number): Promise<ApiResponse<{ success: boolean }>> {
    return apiRequest<{ success: boolean }>(`/main/tables/${id}/`, "DELETE");
  },

  // Get table content
  async getTableContent(): Promise<ApiResponse<TableContentResponse[]>> {
    return apiRequest<TableContentResponse[]>("/main/table-contents/", "GET");
  },

  // Add a row to a table
  async addRow(
    tableId: number,
    row: TableRow
  ): Promise<ApiResponse<RowResponse>> {
    return apiRequest<RowResponse>("/main/add-row/", "POST", {
      tableId,
      row,
    });
  },

  // Update a row
  async updateRow(
    tableId: number,
    rowId: number | string,
    newRowData: Partial<TableRow>
  ): Promise<ApiResponse<RowResponse>> {
    return apiRequest<RowResponse>("/main/update-row/", "PATCH", {
      tableId,
      rowId,
      newRowData,
    });
  },

  // Delete a row
  async deleteRow(
    tableId: number,
    rowId: number | string
  ): Promise<ApiResponse<{ success: boolean }>> {
    return apiRequest<{ success: boolean }>("/main/delete-row/", "POST", {
      tableId,
      rowId,
    });
  },

  // Add a column
  async addColumn(
    tableId: number,
    header: string
  ): Promise<ApiResponse<TableData>> {
    return apiRequest<TableData>("/main/add-column/", "POST", {
      tableId,
      header,
    });
  },

  // Delete a column
  async deleteColumn(
    tableId: number,
    header: string
  ): Promise<ApiResponse<TableData>> {
    return apiRequest<TableData>("/main/delete-column/", "POST", {
      tableId,
      header,
    });
  },

  // Share a table with friends
  async shareTable(
    payload: ShareTablePayload
  ): Promise<ApiResponse<ShareTableResponse>> {
    return apiRequest<ShareTableResponse>(
      "/main/share-table/",
      "POST",
      payload
    );
  },
};

// Utility function to handle API calls and dispatch actions
export const handleTableOperation = async (
  action: TableDataAction,
  dispatch: React.Dispatch<TableDataAction>
) => {
  try {
    switch (action.type) {
      case "ADD_TABLE": {
        const response = await tableApi.addTable(action.payload);

        if (response.error) throw new Error(response.error);

        dispatch({
          type: "ADD_TABLE",
          payload: {
            id: response.data?.id ?? action.payload.id,
            table_name: response.data?.table_name ?? action.payload.table_name,
            description:
              response.data?.description ?? action.payload.description,
            headers: response.data?.headers ?? action.payload.headers,
          },
        });
        break;
      }

      case "EDIT": {
        const payload = action.payload as EditTablePayload;
        const response = await tableApi.editTable(payload.id, {
          table_name: payload.table_name,
          description: payload.description,
        });

        if (response.error) throw new Error(response.error);

        dispatch(action);
        break;
      }

      case "DELETE": {
        const response = await tableApi.deleteTable(action.payload.id);

        if (response.error) throw new Error(response.error);

        dispatch(action);
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error("Table operation failed:", error);
    // Consider dispatching an error action
  }
};
