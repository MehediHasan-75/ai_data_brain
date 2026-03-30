import { NextRequest, NextResponse } from "next/server";
import { serverFetch, buildMutationHeaders } from "@/lib/serverFetch";

interface AgentStreamingResponse {
  success?: boolean;
  message?: string;
  response?: string;
  formatted_response?: string;
  raw_response?: {
    messages?: Array<
      Array<[string, { type: string; name: string; input: Record<string, unknown> }]>
    >;
  };
}

function extractToolCalls(
  agentData: AgentStreamingResponse
): Array<{ name: string; args: Record<string, unknown> }> {
  return (
    agentData.raw_response?.messages
      ?.flatMap((msgGroup) =>
        msgGroup
          .filter(([, v]) => v.type === "tool_use")
          .map(([, v]) => ({ name: v.name, args: v.input }))
      ) ?? []
  );
}

// BFF adapter: translates Django AgentStreamingResponse → Vercel AI SDK data-stream protocol
export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const { message, tableId } = await req.json();

  const requestBody: Record<string, unknown> = { query: message };
  if (tableId) {
    requestBody.table_id = tableId;
    requestBody.context_type = "table_context";
  }

  let agentData: AgentStreamingResponse;
  try {
    const djangoRes = await serverFetch("/agent/streaming/", {
      method: "POST",
      cookieHeader,
      headers: buildMutationHeaders(cookieHeader),
      body: JSON.stringify(requestBody),
    });

    if (!djangoRes.ok) {
      return NextResponse.json(
        { error: "Agent request failed" },
        { status: djangoRes.status }
      );
    }

    agentData = await djangoRes.json();
  } catch {
    return NextResponse.json({ error: "Failed to reach agent" }, { status: 502 });
  }

  const text =
    agentData.formatted_response ??
    agentData.response ??
    agentData.message ??
    "";

  const toolCalls = extractToolCalls(agentData);

  // Emit Vercel AI SDK data-stream protocol
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // 0: text chunk
      controller.enqueue(
        encoder.encode(`0:${JSON.stringify(text)}\n`)
      );
      // 8: annotation (tool calls)
      if (toolCalls.length > 0) {
        controller.enqueue(
          encoder.encode(`8:${JSON.stringify([{ toolCalls }])}\n`)
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "x-vercel-ai-data-stream": "v1",
    },
  });
}
