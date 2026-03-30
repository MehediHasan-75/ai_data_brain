"use client";
import hljs from "highlight.js";
import { useEffect, useRef } from "react";
import ToolCallVisualizer from "./ToolCallVisualizer";
import type { Message } from "ai/react";

interface MessageBubbleProps {
  message: Message;
}

function renderText(raw: string): { __html: string } {
  // Replace ```lang\n...\n``` with highlighted code blocks
  const html = raw
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const highlighted =
        lang && hljs.getLanguage(lang)
          ? hljs.highlight(code.trim(), { language: lang }).value
          : hljs.highlightAuto(code.trim()).value;
      return `<pre class="rounded-lg bg-gray-800 dark:bg-gray-900 p-3 overflow-x-auto my-2 text-xs"><code class="hljs language-${lang}">${highlighted}</code></pre>`;
    })
    // Bold
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Newlines
    .replace(/\n/g, "<br />");

  return { __html: html };
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightElement(block as HTMLElement);
      });
    }
  }, [message.content]);

  // Extract tool calls from annotations (set by BFF stream as `8:` lines)
  const toolCalls = (message.annotations ?? []).flatMap((a: unknown) => {
    const ann = a as { toolCalls?: Array<{ name: string; args: Record<string, unknown> }> };
    return ann?.toolCalls ?? [];
  });

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
          isUser
            ? "bg-blue-600 text-white rounded-tr-sm"
            : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-tl-sm"
        }`}
      >
        <div
          ref={containerRef}
          className="text-sm leading-relaxed"
          dangerouslySetInnerHTML={renderText(
            typeof message.content === "string" ? message.content : ""
          )}
        />
        {!isUser && <ToolCallVisualizer toolCalls={toolCalls} />}
      </div>
    </div>
  );
}
