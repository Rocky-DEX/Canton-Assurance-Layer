import { ChevronRight, ShieldCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { fmtDate } from "@/lib/format";
import { requireUser } from "@/lib/rbac";
import { acceptPendingInvitations } from "@/app/app/[slug]/members/actions";
import { auditableOrgs } from "@/lib/audit";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar } from "@/components/top-bar";

export default async function AuditHome() {
  const user = await requireUser("/audit");
  await acceptPendingInvitations(user.id, user.email);
  const t = await getTranslations("audit");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const orgs = await auditableOrgs(user.id, user.email);

  return (
    <>
      <TopBar user={user} crumb={{ href: "/audit", label: t("title") }} />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        <div className="mt-6 grid gap-3">
          {orgs.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("empty.title")}</CardTitle>
                <CardDescription>{t("empty.body", { email: user.email })}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}
          {orgs.map((o) => (
            <Link key={o.id} href={`/audit/${o.slug}`} className="flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-accent">
              <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{o.name}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{o.publisherParty}</div>
              </div>
              <div className="hidden text-right text-xs text-muted-foreground sm:block">
                <div>{t("publications", { count: o._count.publications })}</div>
                <div>{o.publications[0] ? fmtDate(o.publications[0].createdAt, locale) : t("none")}</div>
              </div>
              {o.coverage[0] ? (
                <Badge variant={o.coverage[0].fullyCovered ? "default" : "destructive"}>{o.coverage[0].fullyCovered ? tc("covered") : tc("short")}</Badge>
              ) : null}
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
