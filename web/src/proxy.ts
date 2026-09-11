import { NextResponse, type NextRequest } from "next/server";

/**
 * A rate limit on the one unauthenticated write that costs something: the
 * magic-link request. Every POST to the sign-in endpoint sends an email (or
 * writes a link to the log), so an open form is a mail cannon and a way to
 * flood a victim's inbox. Ten per IP per fifteen minutes is generous for a
 * person and useless for a script.
 *
 * In-memory, per process: exact for the single-container deployment this
 * ships with, and still a floor behind a load balancer. A reverse proxy's
 * own limiter is the place for anything stricter.
 */

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 10;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function proxy(req: NextRequest) {
  if (req.method !== "POST") return NextResponse.next();
  const now = Date.now();
  const ip = clientIp(req);
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return NextResponse.next();
  }
  bucket.count += 1;
  if (bucket.count > LIMIT) {
    const retry = Math.ceil((bucket.resetAt - now) / 1000);
    return new NextResponse("Too many sign-in requests. Try again later.", {
      status: 429,
      headers: { "retry-after": String(retry), "cache-control": "no-store" },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/signin/:path*", "/api/auth/callback/:path*"],
};
