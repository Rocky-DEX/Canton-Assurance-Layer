import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { amountMap, fingerprint, fmtDate, shortHex, trimAmount } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ReportVerify } from "@/components/report-verify";

import { PublicHistory } from "./public-history";

export default async function PublicPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, publisherParty: true, publicPage: true, signingKeyHex: true },
  });
  if (!org || !org.publicPage) notFound();
  const t = await getTranslations("public");
  const tc = await getTranslations("common");
  const tApp = await getTranslations("app");
  const locale = await getLocale();

  const publications = await prisma.publication.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, formatVersion: true, snapshotTime: true, ledgerOffset: true, reportDigest: true, rootHash: true, leafCount: true, rootSums: true, publisherKey: true, createdAt: true },
  });
  const latest = publications[0];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          {tApp("name")}
        </Link>
        <LocaleSwitcher />
      </header>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{org.name}</h1>
      <p className="font-mono text-sm text-muted-foreground">{org.publisherParty}</p>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("key.title")}</CardTitle>
          <CardDescription>{t("key.body")}</CardDescription>
        </CardHeader>
        <CardContent>
          {org.signingKeyHex ? (
            <>
              <div className="font-mono">{fingerprint(org.signingKeyHex)}</div>
              <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{org.signingKeyHex}</div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("key.none")}</p>
          )}
        </CardContent>
      </Card>

      {latest ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("latest.title")}</CardTitle>
            <CardDescription>
              {tc("snapshot")} <span className="font-mono">{latest.snapshotTime}</span> · {tc("ledgerOffset")} <span className="font-mono">{latest.ledgerOffset}</span> · {t("latest.published", { at: fmtDate(latest.createdAt, locale) })}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {amountMap(latest.rootSums as Record<string, string>).map(([a, v]) => (
                <Badge key={a} variant="secondary" className="font-mono" title={v}>
                  {a} {trimAmount(v)}
                </Badge>
              ))}
              <Badge variant="outline">{t("latest.entries", { count: latest.leafCount })}</Badge>
            </div>
            <ReportVerify fileUrl={`/p/${org.slug}/files/${latest.id}/report.json`} expectedDigest={latest.reportDigest} trustedKeyHex={latest.publisherKey} />
            <div className="flex flex-wrap gap-3 text-xs">
              {(["report.json", "anchor.json", "pack.json"] as const).map((n) => (
                <a key={n} className="underline" href={`/p/${org.slug}/files/${latest.id}/${n}`} download>
                  {n}
                </a>
              ))}
              <a className="underline" href="/verify">
                {t("latest.offline")}
              </a>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("none")}</CardTitle>
          </CardHeader>
        </Card>
      )}

      {publications.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("history.title")}</CardTitle>
            <CardDescription>{t("history.body")}</CardDescription>
          </CardHeader>
          <CardContent>
            <PublicHistory slug={org.slug} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("all.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-3 font-medium">{tc("snapshot")}</th>
                <th className="px-4 py-3 font-medium">{tc("entries")}</th>
                <th className="px-4 py-3 font-medium">{tc("digest")}</th>
                <th className="px-4 py-3 font-medium">{t("all.files")}</th>
              </tr>
            </thead>
            <tbody>
              {publications.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{p.snapshotTime}</td>
                  <td className="px-4 py-3 tabular-nums">{p.leafCount}</td>
                  <td className="px-4 py-3 font-mono text-xs" title={p.reportDigest}>
                    {shortHex(p.reportDigest)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {(["report.json", "anchor.json", "pack.json"] as const).map((n) => (
                      <a key={n} className="mr-3 underline" href={`/p/${org.slug}/files/${p.id}/${n}`} download>
                        {n}
                      </a>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <footer className="mt-10 text-xs text-muted-foreground">{t("footer")}</footer>
    </main>
  );
}
