import { NextRequest } from "next/server";
import { serverFetch, forwardResponse, buildMutationHeaders } from "@/lib/serverFetch";

// POST /api/tables/[id]/rows → Django POST /main/add-row/
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const body = await req.json();
  const res = await serverFetch("/main/add-row/", {
    method: "POST",
    cookieHeader,
    headers: buildMutationHeaders(cookieHeader),
    body: JSON.stringify({ table_id: Number(id), ...body }),
  });
  return forwardResponse(res);
}
