import { ChatMessage } from "@/data/ChatMessages";
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

interface AgentStreamingResponse {
  success: boolean;
  message?: string;
  query?: string;
  response?: string;
  formatted_response?: string;
  raw_response?: {
    messages?: Array<
      Array<
        [
          string,
          {
            type: string;
            name: string;
            input: Record<string, unknown>;
          }
        ]
      >
    >;
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
        await apiClient.get("/auth/refresh");
        processQueue(null);
        return apiClient(originalRequest);
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

export const chatApi = {
  // Send a message and get bot response
  async sendMessage(
    message: ChatMessage,
    tableId?: string
  ): Promise<ApiResponse<ChatMessage>> {
    try {
      console.log("API Base URL:", API_BASE_URL); // Debug log
      // First get or create a chat session
      const sessionsResponse = await apiRequest<{
        data: { session_id: string }[];
      }>("/agent/chat/sessions/", "GET");

      console.log("Sessions Response:", sessionsResponse); // Debug log

      let sessionId: string;
      if (!sessionsResponse.success || !sessionsResponse.data?.data?.length) {
        // Create new session if none exists
        const createSessionResponse = await apiRequest<{
          data: { session_id: string };
        }>("/agent/chat/sessions/", "POST", { title: "New Chat" });
        if (
          !createSessionResponse.success ||
          !createSessionResponse.data?.data?.session_id
        ) {
          throw new Error("Failed to create chat session");
        }
        sessionId = createSessionResponse.data.data.session_id;
      } else {
        sessionId = sessionsResponse.data.data[0].session_id;
      }

      // Generate unique message IDs
      const userMessageId = `msg_${Date.now()}`;
      const botMessageId = `msg_${Date.now() + 1}`;

      // Save user message
      const userMessageData = {
        message_id: userMessageId,
        text: message.text,
        sender: "user",
        displayed_text: message.displayedText || message.text,
        is_typing: false,
      };

      console.log("Saving user message:", userMessageData); // Debug log

      const saveUserMessageResponse = await apiRequest(
        `/agent/chat/sessions/${sessionId}/messages/save/`,
        "POST",
        userMessageData
      );

      if (!saveUserMessageResponse.success) {
        console.error("Failed to save user message:", saveUserMessageResponse); // Debug log
        throw new Error("Failed to save user message");
      }

      // Send to agent
      const requestBody: {
        query: string;
        table_id?: string;
        context_type?: string;
      } = {
        query: message.text,
      };

      if (tableId) {
        requestBody.table_id = tableId;
        requestBody.context_type = "table_context";
      }

      const agentResponse = await apiRequest<AgentStreamingResponse>(
        "/agent/streaming/",
        "POST",
        requestBody
      );

      if (!agentResponse.success || !agentResponse.data) {
        throw new Error(agentResponse.error || "Failed to get agent response");
      }

      console.log("Raw agent response:", agentResponse.data); // Debug log

      // Create bot message from agent response
      const botMessage: ChatMessage = {
        id: botMessageId,
        text:
          agentResponse.data.formatted_response ||
          agentResponse.data.response ||
          agentResponse.data.message ||
          "Processing your request...",
        sender: "bot",
        timestamp: new Date(),
        displayedText:
          agentResponse.data.formatted_response ||
          agentResponse.data.response ||
          agentResponse.data.message ||
          "Processing your request...",
        agentData: {
          response:
            agentResponse.data.formatted_response ||
            agentResponse.data.response ||
            agentResponse.data.message ||
            "Processing your request...",
          tools_called:
            agentResponse.data.raw_response?.messages
              ?.filter((msg) => msg[0][1].type === "tool_use")
              .map((msg) => ({
                name: msg[0][1].name,
                args: msg[0][1].input as Record<string, unknown>,
              })) || [],
        },
      };

      // Save bot response
      const botMessageData = {
        message_id: botMessage.id,
        text: botMessage.text,
        sender: botMessage.sender,
        displayed_text: botMessage.displayedText,
        is_typing: false,
        agent_data: botMessage.agentData,
      };

      console.log("Saving bot message:", botMessageData); // Debug log

      const saveBotMessageResponse = await apiRequest(
        `/agent/chat/sessions/${sessionId}/messages/save/`,
        "POST",
        botMessageData
      );

      if (!saveBotMessageResponse.success) {
        console.error("Failed to save bot message:", saveBotMessageResponse); // Debug log
        throw new Error("Failed to save bot message");
      }

      return { success: true, data: botMessage };
    } catch (error) {
      console.error("Error in sendMessage:", error); // Debug log
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to send message",
      };
    }
  },

  // Load chat history
  async loadChatHistory(): Promise<ApiResponse<ChatMessage[]>> {
    try {
      // First get the active chat session
      const sessionsResponse = await apiRequest<{
        data: { session_id: string }[];
      }>("/agent/chat/sessions/", "GET");

      if (!sessionsResponse.success || !sessionsResponse.data?.data?.length) {
        return {
          success: true,
          data: [],
        };
      }

      // Get messages from the most recent session
      const latestSession = sessionsResponse.data.data[0];
      const messagesResponse = await apiRequest<{
        data: Array<{
          message_id: string;
          text: string;
          sender: string;
          timestamp: string;
          displayed_text: string;
          agent_data?: {
            response: string;
            tools_called: Array<{
              name: string;
              args: Record<string, unknown>;
            }>;
          };
        }>;
      }>(`/agent/chat/sessions/${latestSession.session_id}/messages/`, "GET");

      if (!messagesResponse.success || !messagesResponse.data?.data) {
        return {
          success: true,
          data: [],
        };
      }

      // Format messages to match ChatMessage interface
      const formattedMessages = messagesResponse.data.data.map((msg) => ({
        id: msg.message_id,
        text: msg.text,
        sender: msg.sender as "user" | "bot",
        timestamp: new Date(msg.timestamp),
        displayedText: msg.displayed_text || msg.text,
        agentData: msg.agent_data
          ? {
              response: msg.agent_data.response,
              tools_called: msg.agent_data.tools_called || [],
            }
          : undefined,
      }));

      return {
        success: true,
        data: formattedMessages,
      };
    } catch (error) {
      console.error("Error loading chat history:", error);
      return {
        success: true,
        data: [],
      };
    }
  },

  // Clear chat history
  async clearChatHistory(): Promise<ApiResponse<{ success: boolean }>> {
    try {
      // Get current session
      const sessionsResponse = await apiRequest<{
        data: { session_id: string }[];
      }>("/agent/chat/sessions/", "GET");

      if (!sessionsResponse.success || !sessionsResponse.data?.data?.length) {
        return {
          success: true,
          data: { success: true },
        };
      }

      // Clear messages from current session
      const sessionId = sessionsResponse.data.data[0].session_id;
      const response = await apiRequest<{ message: string }>(
        `/agent/chat/sessions/${sessionId}/messages/`,
        "DELETE"
      );

      return {
        success: true,
        data: { success: response.success },
      };
    } catch {
      return {
        success: true,
        data: { success: true },
      };
    }
  },
};

// Utility function to handle chat operations
export const handleChatOperation = async (
  message: ChatMessage,
  tableId?: string,
  refreshData?: () => Promise<void>
): Promise<ChatMessage> => {
  try {
    const response = await chatApi.sendMessage(message, tableId);
    if (!response.success) {
      console.error("Failed to send message:", response.error);
      throw new Error(response.error || "Failed to send message");
    }

    const botMessage = response.data;
    console.log("Bot Message:", botMessage); // Debug log

    if (!botMessage) {
      throw new Error("No response data received");
    }

    // Refresh data if callback is provided
    if (refreshData) {
      try {
        await refreshData();
        console.log("Data refreshed successfully"); // Debug log
      } catch (refreshError) {
        console.error("Error refreshing data:", refreshError); // Debug log
        // Don't throw error here, just log it
      }
    }

    return botMessage;
  } catch (error) {
    console.error("Chat operation failed:", error);
    throw error; // Throw the error to be handled by the caller
  }
};
