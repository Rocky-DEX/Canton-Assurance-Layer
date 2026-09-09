import { changeRows } from "canton-solvency-verifier/src/publisher";
import type { Manifest } from "canton-solvency-verifier/src/report";
import { Download } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { amountMap, fingerprint, fmtDate, shortHex, trimAmount } from "@/lib/format";
import { requireOrg } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ReportVerify } from "@/components/report-verify";

const PAGE = 50;

export default async function PublicationPage(props: PageProps<"/app/[slug]/publications/[id]">) {
  const { slug, id } = await props.params;
  const { q, page } = await props.searchParams;
  const { org } = await requireOrg(slug);
  const t = await getTranslations("publication");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const pub = await prisma.publication.findFirst({
    where: { id, orgId: org.id },
    select: {
      id: true,
      formatVersion: true,
      snapshotTime: true,
      ledgerOffset: true,
      reportDigest: true,
      rootHash: true,
      leafCount: true,
      rootSums: true,
      publisherKey: true,
      anchorDigest: true,
      manifest: true,
      createdAt: true,
      previous: { select: { id: true, manifest: true, snapshotTime: true } },
      next: { select: { id: true, snapshotTime: true } },
      coverage: { select: { id: true, fullyCovered: true, createdAt: true } },
      createdBy: { select: { email: true, name: true } },
    },
  });
  if (!pub) notFound();

  const query = typeof q === "string" ? q.trim() : "";
  const pageNo = Math.max(1, Number(page) || 1);
  const where = { publicationId: pub.id, ...(query ? { externalId: { contains: query } } : {}) };
  const [proofs, proofTotal] = await Promise.all([
    prisma.proof.findMany({
      where,
      orderBy: { externalId: "asc" },
      skip: (pageNo - 1) * PAGE,
      take: PAGE,
      select: { externalId: true, fileName: true },
    }),
    prisma.proof.count({ where }),
  ]);

  const base = `/app/${org.slug}/publications/${pub.id}`;
  const file = (name: string) => `${base}/files/${encodeURIComponent(name)}`;
  const manifest = pub.manifest as Manifest | null;
  const prevManifest = (pub.previous?.manifest as Manifest | null) ?? null;
  const changes = manifest ? changeRows(prevManifest, manifest) : [];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">
            <Link href={`/app/${org.slug}/publications`} className="hover:underline">
              {t("crumb")}
            </Link>
          </div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{pub.snapshotTime}</h1>
          <p className="text-sm text-muted-foreground">
            {t("publishedAt", { at: fmtDate(pub.createdAt, locale) })}
            {pub.createdBy ? ` · ${pub.createdBy.name ?? pub.createdBy.email}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["report.json", "anchor.json", "pack.json"] as const).map((n) => (
            <LinkButton key={n} variant="outline" size="sm" href={file(n)} download>
              <Download className="size-4" /> {n}
            </LinkButton>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("verify.title")}</CardTitle>
              <CardDescription>{t("verify.body")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ReportVerify fileUrl={file("report.json")} expectedDigest={pub.reportDigest} trustedKeyHex={pub.publisherKey} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("proofs.title", { count: pub.leafCount })}</CardTitle>
              <CardDescription>{t("proofs.body")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <form className="flex gap-2">
                <Input name="q" defaultValue={query} placeholder={t("proofs.search")} className="max-w-xs" />
                <Button type="submit" variant="outline">
                  {tc("search")}
                </Button>
              </form>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 font-medium">{t("proofs.userId")}</th>
                    <th className="py-2 font-medium">{t("proofs.file")}</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {proofs.map((p) => (
                    <tr key={p.fileName} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs">{p.externalId}</td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">{p.fileName}</td>
                      <td className="py-2 text-right">
                        <a className="text-xs underline" href={file(p.fileName)} download>
                          {tc("download")}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("proofs.showing", { from: proofTotal === 0 ? 0 : (pageNo - 1) * PAGE + 1, to: Math.min(pageNo * PAGE, proofTotal), total: proofTotal })}</span>
                <span className="flex gap-2">
                  {pageNo > 1 ? (
                    <Link className="underline" href={`${base}?q=${encodeURIComponent(query)}&page=${pageNo - 1}`}>
                      ←
                    </Link>
                  ) : null}
                  {pageNo * PAGE < proofTotal ? (
                    <Link className="underline" href={`${base}?q=${encodeURIComponent(query)}&page=${pageNo + 1}`}>
                      →
                    </Link>
                  ) : null}
                </span>
              </div>
            </CardContent>
          </Card>

          {manifest ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("manifest.title", { audience: manifest.audience })}</CardTitle>
                <CardDescription>{t("manifest.body")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(manifest.fields)
                    .sort()
                    .map(([path, state]) => (
                      <Badge key={path} variant={state === "published" ? "default" : state === "committed" ? "secondary" : "outline"} className="font-mono">
                        {path}: {state}
                      </Badge>
                    ))}
                </div>
                <div>
                  <div className="font-medium">{t("manifest.changes")}</div>
                  {changes.length === 0 ? (
                    <p className="text-muted-foreground">{pub.previous ? t("manifest.noChanges") : t("manifest.first")}</p>
                  ) : (
                    <ul className="mt-1 grid gap-1">
                      {changes.map((c) => (
                        <li key={c.path} className={`font-mono text-xs ${c.reduction ? "text-amber-700" : ""}`}>
                          {c.path}: {c.from ?? "—"} → {c.to ?? "—"}
                          {c.reduction ? ` (${t("manifest.reduction")})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="grid gap-6 self-start">
          <Card>
            <CardHeader>
              <CardTitle>{t("facts.title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <Fact label={t("facts.format")} value={pub.formatVersion} />
              <Fact label={tc("ledgerOffset")} value={pub.ledgerOffset} />
              <Fact label={tc("entries")} value={String(pub.leafCount)} />
              <Fact label={tc("root")} value={shortHex(pub.rootHash, 12, 8)} title={pub.rootHash} />
              <Fact label={tc("digest")} value={shortHex(pub.reportDigest, 12, 8)} title={pub.reportDigest} />
              <Fact label={t("facts.anchor")} value={shortHex(pub.anchorDigest, 12, 8)} title={pub.anchorDigest} />
              <Fact label={t("facts.key")} value={fingerprint(pub.publisherKey)} title={pub.publisherKey} />
              <div>
                <div className="text-muted-foreground">{t("facts.totals")}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {amountMap(pub.rootSums as Record<string, string>).map(([a, v]) => (
                    <Badge key={a} variant="secondary" className="font-mono" title={v}>
                      {a} {trimAmount(v)}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("chain.title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {pub.previous ? (
                <Link className="underline" href={`/app/${org.slug}/publications/${pub.previous.id}`}>
                  ← {pub.previous.snapshotTime}
                </Link>
              ) : (
                <span className="text-muted-foreground">{t("chain.genesis")}</span>
              )}
              {pub.next ? (
                <Link className="underline" href={`/app/${org.slug}/publications/${pub.next.id}`}>
                  {pub.next.snapshotTime} →
                </Link>
              ) : (
                <span className="text-muted-foreground">{t("chain.latest")}</span>
              )}
              <Link className="text-xs underline" href={`/app/${org.slug}/history`}>
                {t("chain.history")}
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("coverage.title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {pub.coverage.length === 0 ? <span className="text-muted-foreground">{t("coverage.none")}</span> : null}
              {pub.coverage.map((c) => (
                <div key={c.id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{fmtDate(c.createdAt, locale)}</span>
                  <Badge variant={c.fullyCovered ? "default" : "destructive"}>{c.fullyCovered ? tc("covered") : tc("short")}</Badge>
                </div>
              ))}
              <Link className="text-xs underline" href={`/app/${org.slug}/coverage`}>
                {t("coverage.open")}
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("cli.title")}</CardTitle>
              <CardDescription>{t("cli.body")}</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{`canton-solvency-verify verify \\
  --report report.json --proof-dir . \\
  --key ${pub.publisherKey}`}</pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono text-xs break-all" title={title}>
        {value}
      </div>
    </div>
  );
}
