import { NextRequest } from "next/server";
import { serverFetch, forwardResponse } from "@/lib/serverFetch";

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const res = await serverFetch("/auth/me/", {
    method: "GET",
    cookieHeader,
  });
  return forwardResponse(res);
}
