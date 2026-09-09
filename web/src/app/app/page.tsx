import { Building2, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { acceptPendingInvitations } from "@/app/app/[slug]/members/actions";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/link-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar } from "@/components/top-bar";

export default async function OrgListPage() {
  const user = await requireUser("/app");
  const t = await getTranslations("orgs");
  const tRoles = await getTranslations("roles");
  // Invitations, customer rows and auditor grants keyed by this email attach to the account here.
  await acceptPendingInvitations(user.id, user.email);

  const [memberships, grants] = await Promise.all([
    prisma.membership.findMany({
      where: { userId: user.id },
      include: { org: { select: { slug: true, name: true, publisherParty: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.auditorGrant.findMany({
      where: { OR: [{ userId: user.id }, { email: user.email }] },
      include: { org: { select: { slug: true, name: true, publisherParty: true } } },
    }),
  ]);

  const rows = [
    ...memberships.map((m) => ({ org: m.org, role: m.role })),
    ...grants
      .filter((g) => !memberships.some((m) => m.orgId === g.orgId))
      .map((g) => ({ org: g.org, role: "AUDITOR" as const })),
  ];

  return (
    <>
      <TopBar user={user} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <LinkButton href="/app/new">{t("create")}</LinkButton>
        </div>

        <div className="mt-6 grid gap-3">
          {rows.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("empty")}</CardTitle>
                <CardDescription>{t("createDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3 text-sm">
                <Link className="underline" href="/portal">
                  {t("portalHint")}
                </Link>
                <Link className="underline" href="/audit">
                  {t("auditHint")}
                </Link>
              </CardContent>
            </Card>
          ) : null}
          {rows.map(({ org, role }) => (
            <Link
              key={org.slug}
              href={`/app/${org.slug}`}
              className="flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-accent"
            >
              <Building2 className="size-5 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{org.name}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{org.publisherParty}</div>
              </div>
              <Badge variant="secondary">{tRoles(role)}</Badge>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
