import { NextRequest } from "next/server";
import { serverFetch } from "@/lib/serverFetch";

// SSE endpoint: polls Django /main/tables/ every 15s and emits table-updated events
export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const encoder = new TextEncoder();
  let lastEtag = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          // client disconnected
        }
      };

      // Initial ping
      send("ping", JSON.stringify({ ts: Date.now() }));

      const poll = async () => {
        try {
          const res = await serverFetch("/main/tables/", {
            method: "GET",
            cookieHeader,
          });
          const etag = res.headers.get("etag") ?? res.headers.get("last-modified") ?? "";
          if (etag && etag !== lastEtag) {
            lastEtag = etag;
            send("table-updated", JSON.stringify({ ts: Date.now() }));
          }
        } catch {
          // ignore poll errors
        }
      };

      const interval = setInterval(poll, 15_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
