import { Download } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/db";
import { amountMap, fmtDate, shortHex, trimAmount } from "@/lib/format";
import { atLeast, requireOrg } from "@/lib/rbac";
import { signingService } from "@/lib/service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { CustodyForm } from "./custody-form";

export default async function CustodyPage({ params }: PageProps<"/app/[slug]/custody">) {
  const { slug } = await params;
  const { org, role } = await requireOrg(slug);
  const t = await getTranslations("custody");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const [rows, healthy] = await Promise.all([
    prisma.custodyReport.findMany({
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
        custodyBasis: true,
        createdAt: true,
        _count: { select: { coverage: true } },
      },
    }),
    atLeast(role, "OPERATOR") ? signingService.health() : Promise.resolve(true),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {atLeast(role, "OPERATOR") ? <CustodyForm slug={org.slug} disabled={!healthy} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("list.title")}</CardTitle>
          <CardDescription>{t("list.body")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("list.empty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">{tc("snapshot")}</th>
                  <th className="px-4 py-3 font-medium">{tc("ledgerOffset")}</th>
                  <th className="px-4 py-3 font-medium">{t("list.positions")}</th>
                  <th className="px-4 py-3 font-medium">{tc("held")}</th>
                  <th className="px-4 py-3 font-medium">{t("list.basis")}</th>
                  <th className="px-4 py-3 font-medium">{tc("digest")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-mono">{r.snapshotTime}</td>
                    <td className="px-4 py-3 font-mono">{r.ledgerOffset}</td>
                    <td className="px-4 py-3 tabular-nums">{r.leafCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 font-mono text-xs">
                        {amountMap(r.rootSums as Record<string, string>).map(([a, v]) => (
                          <span key={a} title={v}>
                            {a.replace(/^held\//, "")} {trimAmount(v)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="max-w-56 truncate px-4 py-3 text-muted-foreground" title={r.custodyBasis}>
                      {r.custodyBasis}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" title={r.reportDigest}>
                      {shortHex(r.reportDigest)}
                      <div className="text-muted-foreground">{fmtDate(r.createdAt, locale)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a className="inline-flex items-center gap-1 text-xs underline" href={`/app/${org.slug}/custody/${r.id}/custody-report.json`} download>
                        <Download className="size-3" /> JSON
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
