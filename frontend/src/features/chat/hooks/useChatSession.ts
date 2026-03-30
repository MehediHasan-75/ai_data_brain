import { useEffect, useState } from "react";

interface Session {
  session_id: string;
}

async function getOrCreateSession(): Promise<string | null> {
  try {
    const listRes = await fetch("/api/chat/sessions", { credentials: "include" });
    if (listRes.ok) {
      const data = await listRes.json();
      const sessions: Session[] = Array.isArray(data)
        ? data
        : (data?.data ?? []);
      if (sessions.length > 0) return sessions[0].session_id;
    }

    // Create new session
    const createRes = await fetch("/api/chat/sessions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Chat" }),
    });
    if (!createRes.ok) return null;
    const created = await createRes.json();
    return created?.data?.session_id ?? created?.session_id ?? null;
  } catch {
    return null;
  }
}

interface StoredMessage {
  message_id: string;
  text: string;
  sender: string;
  displayed_text: string;
  agent_data?: {
    response: string;
    tools_called: Array<{ name: string; args: Record<string, unknown> }>;
  };
}

async function loadMessages(sessionId: string): Promise<StoredMessage[]> {
  try {
    const res = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data?.data ?? []);
  } catch {
    return [];
  }
}

export type InitialMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  annotations?: any[];
};

export function useChatSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<InitialMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await getOrCreateSession();
      if (cancelled) return;
      setSessionId(id);

      if (id) {
        const stored = await loadMessages(id);
        if (!cancelled) {
          setInitialMessages(
            stored.map((m) => ({
              id: m.message_id,
              role: m.sender === "user" ? "user" : "assistant",
              content: m.displayed_text || m.text,
              annotations: m.agent_data?.tools_called?.length
                ? [{ toolCalls: m.agent_data.tools_called }]
                : undefined,
            }))
          );
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveMessage = async (
    role: "user" | "assistant",
    text: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agentData?: any
  ) => {
    if (!sessionId) return;
    await fetch(`/api/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message_id: `msg_${Date.now()}`,
        text,
        sender: role === "user" ? "user" : "bot",
        displayed_text: text,
        is_typing: false,
        agent_data: agentData,
      }),
    });
  };

  return { sessionId, initialMessages, loading, saveMessage };
}
