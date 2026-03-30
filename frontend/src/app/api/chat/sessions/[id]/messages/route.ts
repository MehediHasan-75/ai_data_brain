import { NextRequest } from "next/server";
import { serverFetch, forwardResponse, buildMutationHeaders } from "@/lib/serverFetch";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const res = await serverFetch(`/agent/chat/sessions/${id}/messages/`, {
    method: "GET",
    cookieHeader,
  });
  return forwardResponse(res);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const body = await req.text();
  const res = await serverFetch(`/agent/chat/sessions/${id}/messages/save/`, {
    method: "POST",
    cookieHeader,
    headers: buildMutationHeaders(cookieHeader),
    body,
  });
  return forwardResponse(res);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const res = await serverFetch(`/agent/chat/sessions/${id}/messages/`, {
    method: "DELETE",
    cookieHeader,
    headers: buildMutationHeaders(cookieHeader),
  });
  return forwardResponse(res);
}
