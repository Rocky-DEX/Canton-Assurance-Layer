import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/rbac";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { HistoryClient } from "./history-client";

export default async function HistoryPage({ params }: PageProps<"/app/[slug]/history">) {
  const { slug } = await params;
  const { org } = await requireOrg(slug);
  const t = await getTranslations("history");
  const pubs = await prisma.publication.findMany({
    where: { orgId: org.id },
    select: { id: true, reportDigest: true },
  });
  const byDigest = Object.fromEntries(pubs.map((p) => [p.reportDigest, p.id]));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("chain.title")}</CardTitle>
          <CardDescription>{t("chain.body")}</CardDescription>
        </CardHeader>
        <CardContent>
          <HistoryClient slug={org.slug} byDigest={byDigest} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("cli.title")}</CardTitle>
          <CardDescription>{t("cli.body")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <a className="text-xs underline" href={`/app/${org.slug}/history/anchors.json`} download>
            anchors.json
          </a>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">canton-solvency-verify anchors --chain anchors.json</pre>
        </CardContent>
      </Card>
    </div>
  );
}
