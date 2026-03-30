"use client";
import { useRef, useState } from "react";
import { useTheme } from "@/context/ThemeProvider";

interface PromptInputBoxProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
}

export default function PromptInputBox({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
}: PromptInputBoxProps) {
  const { theme } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const isDark = theme === "dark";

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const formEvent = new Event("submit", { bubbles: true, cancelable: true });
      textareaRef.current?.form?.dispatchEvent(formEvent);
    }
  };

  const toggleVoice = () => {
    if (typeof window === "undefined") return;
    // react-speech-recognition compatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    setVoiceActive((v) => !v);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3">
      <div className="relative flex-1">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={onKeyDown}
          placeholder="Ask AI about your data…"
          rows={1}
          className={`w-full resize-none rounded-xl px-4 py-2.5 pr-10 text-sm outline-none border transition-colors ${
            isDark
              ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500"
              : "bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-400"
          }`}
          style={{ maxHeight: 120, overflowY: "auto" }}
        />
      </div>

      {/* Voice button */}
      <button
        type="button"
        onClick={toggleVoice}
        className={`p-2.5 rounded-xl border transition-colors ${
          voiceActive
            ? "bg-red-500 border-red-500 text-white"
            : isDark
            ? "bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600"
            : "bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200"
        }`}
        title="Voice input"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 10-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Send button */}
      <button
        type="submit"
        disabled={isLoading || !input.trim()}
        className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Send"
      >
        {isLoading ? (
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        )}
      </button>
    </form>
  );
}
