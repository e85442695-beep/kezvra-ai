import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 proxy (formerly middleware). Adds a per-request CSP nonce + security headers and
 * redirects unauthenticated visitors away from app routes (cheap cookie presence check — real
 * authorization happens server-side in every page/route via `requirePageUser` / `requireUser`).
 */
const APP_PREFIXES = ["/chat", "/images", "/files", "/compare", "/billing", "/referrals", "/developers", "/settings", "/admin", "/support", "/assistants", "/prompts"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("authjs.session-token") || req.cookies.has("__Secure-authjs.session-token");
  if (!hasSession && APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io",
    "frame-src https://checkout.stripe.com https://js.stripe.com",
    "frame-ancestors 'none'",
    "form-action 'self' https://checkout.stripe.com https://accounts.google.com",
    "base-uri 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [{ source: "/((?!api|_next/static|_next/image|icon.svg|og.png|robots.txt|sitemap.xml).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
};
