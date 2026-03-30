"use client";
import { useRef, useEffect } from "react";
import { useChat, type Message } from "ai/react";
import { useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/stores/uiStore";
import { useTheme } from "@/context/ThemeProvider";
import { useChatSession } from "../hooks/useChatSession";
import MessageBubble from "./MessageBubble";
import PromptInputBox from "./PromptInputBox";

export default function ChatContainer() {
  const { selectedTableId } = useUIStore();
  const { theme } = useTheme();
  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { initialMessages, loading: sessionLoading, saveMessage } = useChatSession();

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat/stream",
    body: { tableId: selectedTableId },
    initialMessages,
    onFinish: async (message: Message) => {
      const toolCalls = (message.annotations ?? []).flatMap((a: unknown) => {
        const ann = a as { toolCalls?: Array<{ name: string; args: Record<string, unknown> }> };
        return ann?.toolCalls ?? [];
      });
      await saveMessage(
        "assistant",
        message.content,
        toolCalls.length ? { tools_called: toolCalls } : undefined
      );
      if (selectedTableId !== null) {
        qc.invalidateQueries({ queryKey: ["tables", selectedTableId, "content"] });
      }
    },
  });

  // Save user message when submitted
  const onSubmit = async (e: React.FormEvent) => {
    handleSubmit(e);
    if (input.trim()) {
      await saveMessage("user", input.trim());
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isDark = theme === "dark";

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading chat history…
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${isDark ? "bg-gray-800" : "bg-white"}`}>
      {/* Header */}
      <div
        className={`px-4 py-3 border-b font-medium text-sm ${
          isDark ? "border-gray-700 text-gray-100" : "border-gray-200 text-gray-900"
        }`}
      >
        AI Assistant
        {selectedTableId && (
          <span className="ml-2 text-xs text-blue-400">
            (Table #{selectedTableId})
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Ask me anything about your data…
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {isLoading && (
          <div className="flex justify-start mb-3">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-tl-sm px-4 py-2">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={`border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
        <PromptInputBox
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={onSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
