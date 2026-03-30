import { NextRequest } from "next/server";
import { serverFetch, forwardResponse, buildMutationHeaders } from "@/lib/serverFetch";

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const body = await req.text();
  const res = await serverFetch("/auth/register/", {
    method: "POST",
    cookieHeader,
    headers: buildMutationHeaders(cookieHeader),
    body,
  });
  return forwardResponse(res);
}
