import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/rbac";
import { signingService } from "@/lib/service";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LinkButton } from "@/components/link-button";

import { PublishWizard } from "./publish-wizard";

export default async function NewPublicationPage({ params }: PageProps<"/app/[slug]/publications/new">) {
  const { slug } = await params;
  const { org } = await requireOrg(slug, "OPERATOR");
  const t = await getTranslations("wizard");
  const [previous, healthy] = await Promise.all([
    prisma.publication.findFirst({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      select: { snapshotTime: true, ledgerOffset: true, manifest: true },
    }),
    signingService.health(),
  ]);

  return (
    <div className="grid gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <LinkButton variant="ghost" href={`/app/${org.slug}/publications`}>{t("cancel")}</LinkButton>
      </div>
      {!healthy ? (
        <Alert variant="destructive">
          <AlertTitle>{t("serviceDown.title")}</AlertTitle>
          <AlertDescription>{t("serviceDown.body")}</AlertDescription>
        </Alert>
      ) : null}
      <PublishWizard
        slug={org.slug}
        publisher={org.publisherParty}
        previous={
          previous
            ? {
                snapshotTime: previous.snapshotTime,
                ledgerOffset: previous.ledgerOffset,
                manifest: (previous.manifest as { audience: string; fields: Record<string, string> } | null) ?? null,
              }
            : null
        }
        disabled={!healthy}
      />
    </div>
  );
}
