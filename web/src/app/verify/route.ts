import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The standalone offline verifier, served as the checked-in file. It is the
 * escape hatch from this site: a customer saves it, disconnects, and verifies
 * with no dependency on anything here.
 */
export function GET() {
  const candidates = [
    resolve(process.cwd(), "offline/verifier.html"), // docker image copies it here
    resolve(process.cwd(), "../offline/verifier.html"), // repository layout
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) return new NextResponse("offline verifier not bundled", { status: 404 });
  return new NextResponse(readFileSync(path, "utf8"), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": 'inline; filename="verifier.html"',
      "cache-control": "public, max-age=3600",
    },
  });
}
