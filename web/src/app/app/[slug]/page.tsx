import { ArrowRight, FileText, Scale, ShieldAlert, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { prisma } from "@/lib/db";
import { fingerprint, fmtDate, shortHex, trimAmount, amountMap } from "@/lib/format";
import { atLeast, requireOrg } from "@/lib/rbac";
import { computeChecklist } from "@/lib/onboarding";
import { GettingStarted } from "@/components/onboarding/checklist";
import { ShowChecklist } from "@/components/onboarding/checklist-controls";
import { ConsoleTour } from "@/components/onboarding/tour";
import { signingService } from "@/lib/service";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/link-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OrgOverview({ params }: PageProps<"/app/[slug]">) {
  const { slug } = await params;
  const { org, role, user } = await requireOrg(slug);
  const t = await getTranslations("overview");
  const tOnboarding = await getTranslations("onboarding");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  // An organisation without a recorded key asks the signing service again
  // here, and shows the answer if it is not a key. Creation tried once and
  // moved on; this is where a failure becomes visible to an admin.
  let signingKeyHex = org.signingKeyHex;
  let keyError: string | null = null;
  if (!signingKeyHex && atLeast(role, "ADMIN")) {
    try {
      const { public_key } = await signingService.publicKey(org.id);
      await prisma.organization.update({ where: { id: org.id }, data: { signingKeyHex: public_key } });
      signingKeyHex = public_key;
    } catch (e) {
      keyError = e instanceof Error ? e.message : String(e);
    }
  }
  const orgWithKey = { ...org, signingKeyHex };

  const [latest, counts, latestCoverage, healthy] = await Promise.all([
    prisma.publication.findFirst({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        snapshotTime: true,
        ledgerOffset: true,
        reportDigest: true,
        rootHash: true,
        leafCount: true,
        rootSums: true,
        formatVersion: true,
        createdAt: true,
      },
    }),
    Promise.all([
      prisma.publication.count({ where: { orgId: org.id } }),
      prisma.customer.count({ where: { orgId: org.id } }),
      prisma.custodyReport.count({ where: { orgId: org.id } }),
    ]),
    prisma.coverageStatement.findFirst({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      select: { fullyCovered: true, createdAt: true, publicationId: true },
    }),
    signingService.health(),
  ]);
  const [publications, customers, custody] = counts;
  const canPublish = atLeast(role, "OPERATOR");
  const [checklist, membership] = await Promise.all([
    computeChecklist(orgWithKey, role),
    prisma.membership.findUnique({ where: { orgId_userId: { orgId: org.id, userId: user.id } }, select: { onboardingDismissedAt: true } }),
  ]);
  const showChecklist = !checklist.complete && !membership?.onboardingDismissedAt;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
          <p className="font-mono text-sm text-muted-foreground">{org.publisherParty}</p>
        </div>
        {canPublish ? (
          <LinkButton href={`/app/${org.slug}/publications/new`} data-tour="publish">
              {t("publish")} <ArrowRight className="size-4" />
            </LinkButton>
        ) : null}
      </div>

      {showChecklist ? <GettingStarted slug={org.slug} checklist={checklist} /> : null}
      <ConsoleTour autoStart={showChecklist} />

      {!healthy && canPublish ? (
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertTitle>{t("serviceDown.title")}</AlertTitle>
          <AlertDescription>{t("serviceDown.body")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={FileText} label={t("stats.publications")} value={publications} href={`/app/${org.slug}/publications`} />
        <Stat icon={Users} label={t("stats.customers")} value={customers} href={`/app/${org.slug}/customers`} />
        <Stat icon={Scale} label={t("stats.custody")} value={custody} href={`/app/${org.slug}/custody`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("latest.title")}</CardTitle>
          <CardDescription>{latest ? fmtDate(latest.createdAt, locale) : t("latest.none")}</CardDescription>
        </CardHeader>
        {latest ? (
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            <Row label={tc("snapshot")} value={latest.snapshotTime} mono />
            <Row label={tc("ledgerOffset")} value={latest.ledgerOffset} mono />
            <Row label={tc("root")} value={shortHex(latest.rootHash, 12, 8)} mono title={latest.rootHash} />
            <Row label={tc("digest")} value={shortHex(latest.reportDigest, 12, 8)} mono title={latest.reportDigest} />
            <Row label={tc("entries")} value={String(latest.leafCount)} />
            <Row label={t("latest.format")} value={latest.formatVersion} mono />
            <div className="sm:col-span-2">
              <div className="text-muted-foreground">{t("latest.totals")}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {amountMap(latest.rootSums as Record<string, string>).map(([asset, amount]) => (
                  <Badge key={asset} variant="secondary" className="font-mono" title={amount}>
                    {asset} {trimAmount(amount)}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("latest.totalsNote")}</p>
            </div>
            <div className="sm:col-span-2">
              <LinkButton variant="outline" size="sm" href={`/app/${org.slug}/publications/${latest.id}`}>{t("latest.open")}</LinkButton>
            </div>
          </CardContent>
        ) : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("key.title")}</CardTitle>
            <CardDescription>{t("key.body")}</CardDescription>
          </CardHeader>
          <CardContent>
            {signingKeyHex ? (
              <>
                <div className="font-mono text-sm">{fingerprint(signingKeyHex)}</div>
                <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{signingKeyHex}</div>
              </>
            ) : keyError ? (
              <div className="grid gap-1 text-sm text-destructive">
                <p>{t("key.failed")}</p>
                <p className="font-mono text-xs break-all">{keyError}</p>
                <p className="text-xs text-muted-foreground">{t("key.failedHint")}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("key.none")}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("coverage.title")}</CardTitle>
            <CardDescription>
              {latestCoverage ? fmtDate(latestCoverage.createdAt, locale) : t("coverage.none")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            {latestCoverage ? (
              <Badge variant={latestCoverage.fullyCovered ? "default" : "destructive"}>
                {latestCoverage.fullyCovered ? t("coverage.covered") : t("coverage.short")}
              </Badge>
            ) : null}
            <LinkButton variant="outline" size="sm" href={`/app/${org.slug}/coverage`}>{t("coverage.open")}</LinkButton>
          </CardContent>
        </Card>
      </div>

      <p data-tour="principle" className="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <span>{tOnboarding("principle")}</span>
        {!showChecklist && !checklist.complete ? <ShowChecklist slug={org.slug} /> : null}
      </p>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href} className="rounded-xl border bg-card p-4 transition-colors hover:bg-accent">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
    </Link>
  );
}

function Row({ label, value, mono, title }: { label: string; value: string; mono?: boolean; title?: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono" : ""} title={title}>
        {value}
      </div>
    </div>
  );
}
