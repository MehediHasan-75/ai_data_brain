import { NextRequest } from "next/server";
import { serverFetch, forwardResponse, buildMutationHeaders } from "@/lib/serverFetch";

// POST /api/tables/[id]/columns
// Body should include an `operation` field: "add" | "delete" | "edit"
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const body = await req.json();
  const { operation, ...rest } = body;

  let endpoint = "/main/add-column/";
  if (operation === "delete") endpoint = "/main/delete-column/";
  else if (operation === "edit") endpoint = "/main/edit-header/";

  const res = await serverFetch(endpoint, {
    method: "POST",
    cookieHeader,
    headers: buildMutationHeaders(cookieHeader),
    body: JSON.stringify({ table_id: Number(id), ...rest }),
  });
  return forwardResponse(res);
}
