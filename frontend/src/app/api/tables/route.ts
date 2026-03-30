import { NextRequest } from "next/server";
import { serverFetch, forwardResponse, buildMutationHeaders } from "@/lib/serverFetch";

// GET /api/tables → Django GET /main/tables/
export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const res = await serverFetch("/main/tables/", {
    method: "GET",
    cookieHeader,
  });
  return forwardResponse(res);
}

// POST /api/tables → Django POST /main/create-tableContent/
export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const body = await req.text();
  const res = await serverFetch("/main/create-tableContent/", {
    method: "POST",
    cookieHeader,
    headers: buildMutationHeaders(cookieHeader),
    body,
  });
  return forwardResponse(res);
}
