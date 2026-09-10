import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { signingService } from "@/lib/service";
import { simulatorService } from "@/lib/simulator";

export const dynamic = "force-dynamic";

/**
 * Liveness for the container healthcheck and a readiness readout for the
 * operator: the database answers, the signing service answers, and whether
 * the optional simulator is configured and up. 200 when the console can do
 * its job (database and signing service), 503 otherwise. No secrets, no
 * tenant data; safe to expose to a load balancer.
 */
export async function GET() {
  const [db, service, simulator] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(
      () => "ok" as const,
      () => "down" as const
    ),
    signingService.health().then((ok) => (ok ? ("ok" as const) : ("down" as const))),
    simulatorService.configured()
      ? simulatorService.health().then((ok) => (ok ? ("ok" as const) : ("down" as const)))
      : Promise.resolve("not-configured" as const),
  ]);
  const ok = db === "ok" && service === "ok";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", db, signingService: service, simulator, at: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
