import { NextRequest } from "next/server";
import { serverFetch, forwardResponse, buildMutationHeaders } from "@/lib/serverFetch";

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const res = await serverFetch("/auth/logout/", {
    method: "POST",
    cookieHeader,
    headers: buildMutationHeaders(cookieHeader),
  });
  return forwardResponse(res);
}
