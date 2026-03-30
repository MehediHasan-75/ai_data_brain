import { NextRequest } from "next/server";
import { serverFetch, forwardResponse, buildMutationHeaders } from "@/lib/serverFetch";

// DELETE /api/tables/[id] → Django DELETE /main/tables/{id}/
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const res = await serverFetch(`/main/tables/${id}/`, {
    method: "DELETE",
    cookieHeader,
    headers: buildMutationHeaders(cookieHeader),
  });
  return forwardResponse(res);
}
