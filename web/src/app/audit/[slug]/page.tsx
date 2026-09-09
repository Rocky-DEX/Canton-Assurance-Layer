import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { fingerprint, fmtDate, shortHex } from "@/lib/format";
import { requireUser } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar } from "@/components/top-bar";

import { AuditClient } from "./audit-client";

export default async function AuditOrgPage({ params }: PageProps<"/audit/[slug]">) {
  const { slug } = await params;
  const user = await requireUser(`/audit/${slug}`);
  const t = await getTranslations("audit");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, publisherParty: true, signingKeyHex: true } });
  if (!org) notFound();
  const allowed =
    (await prisma.auditorGrant.count({ where: { orgId: org.id, OR: [{ userId: user.id }, { email: user.email.toLowerCase() }] } })) > 0 ||
    (await prisma.membership.count({ where: { orgId: org.id, userId: user.id } })) > 0;
  if (!allowed) notFound();

  const [publications, coverage] = await Promise.all([
    prisma.publication.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, formatVersion: true, snapshotTime: true, ledgerOffset: true, reportDigest: true, anchorDigest: true, leafCount: true, publisherKey: true, createdAt: true, _count: { select: { coverage: true } } },
    }),
    prisma.coverageStatement.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, fullyCovered: true, createdAt: true, custody: { select: { snapshotTime: true } }, publication: { select: { snapshotTime: true } } },
    }),
  ]);

  return (
    <>
      <TopBar user={user} crumb={{ href: "/audit", label: t("title") }} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-sm text-muted-foreground">
          <Link href="/audit" className="hover:underline">
            {t("title")}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <p className="font-mono text-sm text-muted-foreground">{org.publisherParty}</p>
        {org.signingKeyHex ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("key")} <span className="font-mono">{fingerprint(org.signingKeyHex)}</span>
          </p>
        ) : null}

        <div className="mt-6 grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("chain.title")}</CardTitle>
              <CardDescription>{t("chain.body")}</CardDescription>
            </CardHeader>
            <CardContent>
              <AuditClient slug={org.slug} publications={publications.map((p) => ({ id: p.id, reportDigest: p.reportDigest, publisherKey: p.publisherKey, snapshotTime: p.snapshotTime }))} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("publications.title", { count: publications.length })}</CardTitle>
              <CardDescription>{t("publications.body")}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-3 font-medium">{tc("snapshot")}</th>
                    <th className="px-4 py-3 font-medium">{tc("ledgerOffset")}</th>
                    <th className="px-4 py-3 font-medium">{tc("entries")}</th>
                    <th className="px-4 py-3 font-medium">{tc("digest")}</th>
                    <th className="px-4 py-3 font-medium">{t("publications.files")}</th>
                  </tr>
                </thead>
                <tbody>
                  {publications.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-mono text-xs">
                        {p.snapshotTime}
                        {p.formatVersion.endsWith("v2") ? (
                          <Badge variant="outline" className="ml-2">
                            v2
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.ledgerOffset}</td>
                      <td className="px-4 py-3 tabular-nums">{p.leafCount}</td>
                      <td className="px-4 py-3 font-mono text-xs" title={p.reportDigest}>
                        {shortHex(p.reportDigest)}
                        <div className="text-muted-foreground">{fmtDate(p.createdAt, locale)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {(["report.json", "anchor.json", "pack.json"] as const).map((n) => (
                          <a key={n} className="mr-3 underline" href={`/app/${org.slug}/publications/${p.id}/files/${n}`} download>
                            {n}
                          </a>
                        ))}
                        <Link className="underline" href={`/app/${org.slug}/publications/${p.id}`}>
                          {t("publications.open")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("coverage.title")}</CardTitle>
              <CardDescription>{t("coverage.body")}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {coverage.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{t("coverage.empty")}</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {coverage.map((c) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-mono text-xs">{c.custody.snapshotTime}</td>
                        <td className="px-4 py-3 font-mono text-xs">{c.publication.snapshotTime}</td>
                        <td className="px-4 py-3">
                          <Badge variant={c.fullyCovered ? "default" : "destructive"}>{c.fullyCovered ? tc("covered") : tc("short")}</Badge>
                          <span className="ml-2 text-xs text-muted-foreground">{tc("serverReading")}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          <Link className="underline" href={`/app/${org.slug}/coverage/${c.id}`}>
                            {t("coverage.recompute")}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
