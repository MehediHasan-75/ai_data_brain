import { NextRequest } from "next/server";
import { serverFetch, forwardResponse, buildMutationHeaders } from "@/lib/serverFetch";

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const res = await serverFetch("/agent/chat/sessions/", {
    method: "GET",
    cookieHeader,
  });
  return forwardResponse(res);
}

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const body = await req.text();
  const res = await serverFetch("/agent/chat/sessions/", {
    method: "POST",
    cookieHeader,
    headers: buildMutationHeaders(cookieHeader),
    body,
  });
  return forwardResponse(res);
}
