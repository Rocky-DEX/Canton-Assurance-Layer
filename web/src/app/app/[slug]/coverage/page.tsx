import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { prisma } from "@/lib/db";
import { fmtDate, shortHex } from "@/lib/format";
import { atLeast, requireOrg } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { PairForm } from "./pair-form";

export default async function CoveragePage({ params }: PageProps<"/app/[slug]/coverage">) {
  const { slug } = await params;
  const { org, role } = await requireOrg(slug);
  const t = await getTranslations("coverage");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const [statements, custody, publications] = await Promise.all([
    prisma.coverageStatement.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        fullyCovered: true,
        createdAt: true,
        outcome: true,
        custody: { select: { snapshotTime: true, reportDigest: true } },
        publication: { select: { id: true, snapshotTime: true, reportDigest: true } },
      },
    }),
    prisma.custodyReport.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, snapshotTime: true, ledgerOffset: true, reportDigest: true },
    }),
    prisma.publication.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, snapshotTime: true, ledgerOffset: true, reportDigest: true },
    }),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {atLeast(role, "OPERATOR") ? (
        <PairForm
          slug={org.slug}
          custody={custody.map((c) => ({ id: c.id, label: `${c.snapshotTime} · ${shortHex(c.reportDigest, 6, 4)}` }))}
          publications={publications.map((p) => ({ id: p.id, label: `${p.snapshotTime} · ${shortHex(p.reportDigest, 6, 4)}` }))}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("list.title")}</CardTitle>
          <CardDescription>{t("list.body")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {statements.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("list.empty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">{t("list.custody")}</th>
                  <th className="px-4 py-3 font-medium">{t("list.liabilities")}</th>
                  <th className="px-4 py-3 font-medium">{t("list.assets")}</th>
                  <th className="px-4 py-3 font-medium">{tc("status")}</th>
                  <th className="px-4 py-3 font-medium">{tc("createdAt")}</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((s) => {
                  const rows = ((s.outcome as { rows?: Array<{ covered: boolean }> })?.rows ?? []);
                  const covered = rows.filter((r) => r.covered).length;
                  return (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/app/${org.slug}/coverage/${s.id}`} className="hover:underline">
                          {s.custody.snapshotTime}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{s.publication.snapshotTime}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {covered}/{rows.length}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={s.fullyCovered ? "default" : "destructive"}>{s.fullyCovered ? tc("covered") : tc("short")}</Badge>
                        <span className="ml-2 text-xs text-muted-foreground">{tc("serverReading")}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(s.createdAt, locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
