import { NextResponse } from "next/server";

const DJANGO_API_URL = process.env.DJANGO_API_URL || "http://localhost:8000";

/**
 * Cookie-forwarding fetch helper for BFF route handlers.
 * Forwards the browser's cookies to Django and pipes Set-Cookie headers back.
 */
export async function serverFetch(
  path: string,
  init: RequestInit & { cookieHeader?: string } = {}
): Promise<Response> {
  const { cookieHeader, ...fetchInit } = init;
  const headers = new Headers(fetchInit.headers as HeadersInit | undefined);

  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }
  if (!headers.has("Content-Type") && fetchInit.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${DJANGO_API_URL}${path}`, {
    ...fetchInit,
    headers,
    credentials: "include",
  });
}

/**
 * Build a NextResponse that forwards status, JSON body, and Set-Cookie headers
 * from a Django response back to the browser.
 */
export async function forwardResponse(djangoRes: Response): Promise<NextResponse> {
  let data: unknown;
  const contentType = djangoRes.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    data = await djangoRes.json();
  } else {
    data = { message: await djangoRes.text() };
  }

  const response = NextResponse.json(data, { status: djangoRes.status });
  djangoRes.headers.getSetCookie().forEach((c) =>
    response.headers.append("Set-Cookie", c)
  );
  return response;
}

/** Extract CSRF token from cookie header (server-side). */
export function extractCSRF(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(^|;\s*)csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[2]) : null;
}

/** Build headers for an unsafe method (POST/PATCH/PUT/DELETE) including CSRF. */
export function buildMutationHeaders(cookieHeader: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const csrf = extractCSRF(cookieHeader);
  if (csrf) headers["X-CSRFToken"] = csrf;
  return headers;
}
