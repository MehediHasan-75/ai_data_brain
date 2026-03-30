// src/api/jsonTableApi.ts
import {
  JsonTableAction,
  CreateTablePayload,
} from "@/reducers/TableContentReducer";
import { JsonTableItem, TableData, TableRow } from "../data/TableContent";
import axios, {
  AxiosResponse,
  AxiosError,
  AxiosRequestConfig,
  RawAxiosRequestHeaders,
} from "axios";
// BFF proxy — all requests go through Next.js route handlers
const API_BASE_URL = "/api";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface CreateTableResponse {
  message: string;
  data: {
    id: number;
    table_name: string;
    headers: string[];
    created_at: string;
    description: string;
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

export const jsonTableApi = {
  // Get all tables
  async getTables(): Promise<ApiResponse<JsonTableItem[]>> {
    return apiRequest<JsonTableItem[]>("/main/table-contents/", "GET");
  },

  // Add a new table
  async addTable(
    payload: CreateTablePayload
  ): Promise<ApiResponse<JsonTableItem>> {
    return apiRequest<JsonTableItem>(
      "/main/create-tableContent/",
      "POST",
      payload
    );
  },

  // Delete a table
  async deleteTable(
    tableId: number
  ): Promise<ApiResponse<{ success: boolean }>> {
    return apiRequest<{ success: boolean }>(
      `/main/tables/${tableId}/`,
      "DELETE"
    );
  },

  // Add a row to a table
  async addRow(
    tableId: number,
    row: Omit<TableRow, "id">
  ): Promise<ApiResponse<TableRow>> {
    return apiRequest<TableRow>(`/main/add-row/`, "POST", {
      tableId,
      row,
    });
  },

  // Edit a row in a table
  async editRow(
    tableId: number,
    rowId: number | string,
    updates: Partial<TableRow>
  ): Promise<ApiResponse<TableRow>> {
    return apiRequest<TableRow>(`/main/update-row/`, "PATCH", {
      tableId,
      rowId,
      newRowData: updates,
    });
  },

  // Delete a row from a table
  async deleteRow(
    tableId: number,
    rowId: number | string
  ): Promise<ApiResponse<{ success: boolean }>> {
    return apiRequest<{ success: boolean }>(`/main/delete-row/`, "POST", {
      tableId,
      rowId,
    });
  },

  // Update table headers
  async updateHeaders(
    tableId: number,
    headers: string[]
  ): Promise<ApiResponse<TableData>> {
    return apiRequest<TableData>(`/main/delete-column/`, "POST", {
      tableId,
      header: headers[headers.length - 1],
    });
  },

  // Add a column to a table
  async addColumn(
    tableId: number,
    header: string
  ): Promise<ApiResponse<TableData>> {
    try {
      // Validate inputs
      if (!tableId || !header) {
        throw new Error("TableId and header are required");
      }

      // Ensure header is a string and not empty
      const sanitizedHeader = String(header).trim();
      if (!sanitizedHeader) {
        throw new Error("Header cannot be empty");
      }

      console.log("Adding column with payload:", {
        tableId,
        header: sanitizedHeader,
      });

      return apiRequest<TableData>(`/main/add-column/`, "POST", {
        tableId,
        header: sanitizedHeader,
      });
    } catch (error) {
      console.error("Error in addColumn:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to add column",
      };
    }
  },

  // Delete a column
  async deleteColumn(
    tableId: number,
    header: string
  ): Promise<ApiResponse<TableData>> {
    try {
      // Validate inputs
      if (!tableId || !header) {
        throw new Error("TableId and header are required");
      }

      // Ensure header is a string and not empty
      const sanitizedHeader = String(header).trim();
      if (!sanitizedHeader) {
        throw new Error("Header cannot be empty");
      }

      console.log("Deleting column with payload:", {
        tableId,
        header: sanitizedHeader,
      });

      return apiRequest<TableData>(`/main/delete-column/`, "POST", {
        tableId,
        header: sanitizedHeader,
      });
    } catch (error) {
      console.error("Error in deleteColumn:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete column",
      };
    }
  },

  // Edit a header
  async editHeader(
    tableId: number,
    oldHeader: string,
    newHeader: string
  ): Promise<ApiResponse<TableData>> {
    return apiRequest<TableData>(`/main/edit-header/`, "POST", {
      tableId,
      oldHeader,
      newHeader,
    });
  },
};

// Utility function to handle API calls and dispatch actions
export const handleJsonTableOperation = async (
  action: JsonTableAction,
  dispatch: React.Dispatch<JsonTableAction>
) => {
  try {
    let response;
    switch (action.type) {
      case "ADD_TABLE": {
        response = await jsonTableApi.addTable(
          action.payload as CreateTablePayload
        );

        if (!response.success || response.error) {
          throw new Error(response.error || "Failed to add table");
        }

        console.log("TableContentApi - Raw Response:", response);
        console.log("TableContentApi - Response Data:", response.data);

        const responseData = response.data as unknown as CreateTableResponse;
        const tableData: JsonTableItem = {
          id: responseData.data.id,
          data: {
            headers: responseData.data.headers,
            rows: [],
          },
        };

        console.log("TableContentApi - Converted Table Data:", tableData);

        dispatch({
          type: action.type,
          payload: tableData,
        });

        return response;
      }

      case "ADD_ROW": {
        const { tableId, row } = action.payload;
        response = await jsonTableApi.addRow(tableId, row);

        if (!response.success || response.error) {
          throw new Error(response.error || "Failed to add row");
        }

        console.log("Add Row Response:", response.data);

        const responseData = response.data as unknown as {
          message: string;
          data: TableRow & { id: number };
        };

        dispatch({
          type: "ADD_ROW",
          payload: {
            tableId,
            row: responseData.data,
          },
        });

        return response;
      }

      case "EDIT_ROW": {
        const { tableId, rowId, newRow } = action.payload;
        response = await jsonTableApi.editRow(tableId, rowId, newRow);

        if (!response.success || response.error) {
          throw new Error(response.error || "Failed to edit row");
        }

        dispatch(action);
        return response;
      }

      case "DELETE_ROW": {
        const { tableId, rowId } = action.payload;
        response = await jsonTableApi.deleteRow(tableId, rowId);

        if (!response.success || response.error) {
          throw new Error(response.error || "Failed to delete row");
        }

        dispatch(action);
        return response;
      }

      case "EDIT_TABLE_HEADERS": {
        const { tableId, headers } = action.payload;
        response = await jsonTableApi.updateHeaders(tableId, headers);

        if (!response.success || response.error) {
          throw new Error(response.error || "Failed to update headers");
        }

        dispatch(action);
        return response;
      }

      case "DELETE_TABLE": {
        const { tableId } = action.payload;
        response = await jsonTableApi.deleteTable(tableId);

        if (!response.success || response.error) {
          throw new Error(response.error || "Failed to delete table");
        }

        dispatch(action);
        return response;
      }

      case "ADD_COLUMN": {
        const { tableId, header } = action.payload;
        response = await jsonTableApi.addColumn(tableId, header);

        if (!response.success || response.error) {
          throw new Error(response.error || "Failed to add column");
        }

        dispatch(action);
        return response;
      }

      case "EDIT_HEADER": {
        const { tableId, oldHeader, newHeader } = action.payload;
        response = await jsonTableApi.editHeader(tableId, oldHeader, newHeader);

        if (!response.success || response.error) {
          throw new Error(response.error || "Failed to edit header");
        }

        dispatch(action);
        return response;
      }

      case "DELETE_COLUMN": {
        const { tableId, header } = action.payload;
        response = await jsonTableApi.deleteColumn(tableId, header);

        if (!response.success || response.error) {
          throw new Error(response.error || "Failed to delete column");
        }

        dispatch(action);
        return response;
      }

      default:
        break;
    }
  } catch (error) {
    console.error("Table operation failed:", error);
    // Rethrow the error to be handled by the caller
    throw error;
  }
};
