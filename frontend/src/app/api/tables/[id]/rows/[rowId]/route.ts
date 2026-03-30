import { NextRequest } from "next/server";
import { serverFetch, forwardResponse, buildMutationHeaders } from "@/lib/serverFetch";

// PATCH /api/tables/[id]/rows/[rowId] → Django PATCH /main/update-row/
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const { id, rowId } = await params;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const body = await req.json();
  const res = await serverFetch("/main/update-row/", {
    method: "PATCH",
    cookieHeader,
    headers: buildMutationHeaders(cookieHeader),
    body: JSON.stringify({ table_id: Number(id), row_id: Number(rowId), ...body }),
  });
  return forwardResponse(res);
}

// DELETE /api/tables/[id]/rows/[rowId] → Django POST /main/delete-row/
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const { id, rowId } = await params;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const res = await serverFetch("/main/delete-row/", {
    method: "POST",
    cookieHeader,
    headers: buildMutationHeaders(cookieHeader),
    body: JSON.stringify({ table_id: Number(id), row_id: Number(rowId) }),
  });
  return forwardResponse(res);
}
