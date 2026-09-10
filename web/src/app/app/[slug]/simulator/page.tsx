import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { atLeast, requireOrg } from "@/lib/rbac";
import { simulatorService } from "@/lib/simulator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { SimulatorClient } from "./simulator-client";

export default async function SimulatorPage({ params }: PageProps<"/app/[slug]/simulator">) {
  const { slug } = await params;
  const { org, role } = await requireOrg(slug);
  const t = await getTranslations("simulator");

  const configured = simulatorService.configured();
  const [healthy, schedule] = configured
    ? await Promise.all([
        simulatorService.health(),
        simulatorService.feeSchedule().catch(() => null),
      ])
    : [false, null];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {!configured ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>{t("unavailable.notConfigured")}</AlertTitle>
          <AlertDescription>{t("unavailable.notConfiguredBody")}</AlertDescription>
        </Alert>
      ) : !healthy ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("unavailable.unreachable")}</AlertTitle>
          <AlertDescription>{t("unavailable.unreachableBody")}</AlertDescription>
        </Alert>
      ) : null}

      <SimulatorClient
        slug={org.slug}
        canSimulate={atLeast(role, "OPERATOR")}
        available={configured && healthy}
        schedule={schedule}
      />
    </div>
  );
}
