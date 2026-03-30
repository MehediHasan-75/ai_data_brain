import { NextRequest } from "next/server";
import { serverFetch, forwardResponse } from "@/lib/serverFetch";

// GET /api/tables/contents → Django GET /main/table-contents/
export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const res = await serverFetch("/main/table-contents/", {
    method: "GET",
    cookieHeader,
  });
  return forwardResponse(res);
}
