import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { fmtDate, shortHex } from "@/lib/format";
import { requireOrg } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CoverageVerify } from "@/components/coverage-verify";

export default async function CoverageDetail({ params }: PageProps<"/app/[slug]/coverage/[id]">) {
  const { slug, id } = await params;
  const { org } = await requireOrg(slug);
  const t = await getTranslations("coverage");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const s = await prisma.coverageStatement.findFirst({
    where: { id, orgId: org.id },
    select: {
      id: true,
      fullyCovered: true,
      createdAt: true,
      outcome: true,
      custody: { select: { id: true, snapshotTime: true, ledgerOffset: true, reportDigest: true, publisherKey: true, custodyBasis: true } },
      publication: { select: { id: true, snapshotTime: true, ledgerOffset: true, reportDigest: true, publisherKey: true } },
    },
  });
  if (!s) notFound();
  const maxSkew = Number((s.outcome as { maxSkew?: number })?.maxSkew ?? 300);
  const base = `/app/${org.slug}`;

  return (
    <div className="grid gap-6">
      <div>
        <div className="text-sm text-muted-foreground">
          <Link href={`${base}/coverage`} className="hover:underline">
            {t("title")}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("detail.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {fmtDate(s.createdAt, locale)} ·{" "}
          <Badge variant={s.fullyCovered ? "default" : "destructive"}>{s.fullyCovered ? tc("covered") : tc("short")}</Badge>{" "}
          <span className="text-xs">({tc("serverReading")})</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("verify.title")}</CardTitle>
          <CardDescription>{t("verify.body")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CoverageVerify
            custodyUrl={`${base}/custody/${s.custody.id}/custody-report.json`}
            liabilitiesUrl={`${base}/publications/${s.publication.id}/files/report.json`}
            statementUrl={`${base}/coverage/${s.id}/coverage-statement.json`}
            custodyKey={s.custody.publisherKey}
            liabilitiesKey={s.publication.publisherKey}
            maxSkew={maxSkew}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.custody")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Fact label={tc("snapshot")} value={s.custody.snapshotTime} />
            <Fact label={tc("ledgerOffset")} value={s.custody.ledgerOffset} />
            <Fact label={tc("digest")} value={shortHex(s.custody.reportDigest, 12, 8)} title={s.custody.reportDigest} />
            <Fact label={t("detail.basis")} value={s.custody.custodyBasis} />
            <a className="text-xs underline" href={`${base}/custody/${s.custody.id}/custody-report.json`} download>
              custody-report.json
            </a>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.liabilities")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Fact label={tc("snapshot")} value={s.publication.snapshotTime} />
            <Fact label={tc("ledgerOffset")} value={s.publication.ledgerOffset} />
            <Fact label={tc("digest")} value={shortHex(s.publication.reportDigest, 12, 8)} title={s.publication.reportDigest} />
            <Link className="text-xs underline" href={`${base}/publications/${s.publication.id}`}>
              {t("detail.openPublication")}
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("detail.statement")}</CardTitle>
          <CardDescription>{t("detail.statementBody")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <a className="text-xs underline" href={`${base}/coverage/${s.id}/coverage-statement.json`} download>
            coverage-statement.json
          </a>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{`canton-solvency-verify coverage \\
  --custody custody-report.json --liabilities report.json \\
  --statement coverage-statement.json --max-skew ${maxSkew} \\
  --key ${s.publication.publisherKey}${s.custody.publisherKey !== s.publication.publisherKey ? ` \\\n  --custody-key ${s.custody.publisherKey}` : ""}`}</pre>
        </CardContent>
      </Card>
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
