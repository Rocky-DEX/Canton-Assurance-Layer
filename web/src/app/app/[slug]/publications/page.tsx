import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { prisma } from "@/lib/db";
import { amountMap, fmtDate, shortHex, trimAmount } from "@/lib/format";
import { atLeast, requireOrg } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/link-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PublicationsPage({ params }: PageProps<"/app/[slug]/publications">) {
  const { slug } = await params;
  const { org, role } = await requireOrg(slug);
  const t = await getTranslations("publications");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const rows = await prisma.publication.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      snapshotTime: true,
      ledgerOffset: true,
      reportDigest: true,
      leafCount: true,
      rootSums: true,
      formatVersion: true,
      createdAt: true,
      _count: { select: { coverage: true } },
    },
  });

  return (
    <div className="grid gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {atLeast(role, "OPERATOR") ? (
          <LinkButton href={`/app/${org.slug}/publications/new`}>{t("new")}</LinkButton>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("empty.title")}</CardTitle>
            <CardDescription>{t("empty.body")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">{tc("snapshot")}</th>
                  <th className="px-4 py-3 font-medium">{tc("ledgerOffset")}</th>
                  <th className="px-4 py-3 font-medium">{tc("entries")}</th>
                  <th className="px-4 py-3 font-medium">{t("totals")}</th>
                  <th className="px-4 py-3 font-medium">{tc("digest")}</th>
                  <th className="px-4 py-3 font-medium">{tc("createdAt")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-3 font-mono">
                      <Link href={`/app/${org.slug}/publications/${r.id}`} className="underline-offset-2 hover:underline">
                        {r.snapshotTime}
                      </Link>
                      {r.formatVersion.endsWith("v2") ? (
                        <Badge variant="outline" className="ml-2">
                          v2
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono">{r.ledgerOffset}</td>
                    <td className="px-4 py-3 tabular-nums">{r.leafCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {amountMap(r.rootSums as Record<string, string>).map(([a, v]) => (
                          <span key={a} className="font-mono text-xs" title={v}>
                            {a} {trimAmount(v)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" title={r.reportDigest}>
                      {shortHex(r.reportDigest)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
