import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/chat/:path*", "/users/:path*"],
};

export default function middleware(req: NextRequest) {
  // Check for either sessionid (Django session auth) or access_token (JWT)
  const sessionCookie =
    req.cookies.get("sessionid") ?? req.cookies.get("access_token");

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/signin", req.url));
  }

  return NextResponse.next();
}
