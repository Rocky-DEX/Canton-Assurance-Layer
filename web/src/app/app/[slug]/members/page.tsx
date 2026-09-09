import type { Role } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { ROLE_RANK, requireOrg } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { InviteForm, RemoveButton, RoleSelect } from "./members-client";

export default async function MembersPage({ params }: PageProps<"/app/[slug]/members">) {
  const { slug } = await params;
  const { org, role, user } = await requireOrg(slug, "ADMIN");
  const t = await getTranslations("members");
  const tc = await getTranslations("common");
  const tRoles = await getTranslations("roles");
  const locale = await getLocale();

  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { orgId: org.id },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.invitation.findMany({ where: { orgId: org.id, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  const grantable = (Object.keys(ROLE_RANK) as Role[]).filter((r) => ROLE_RANK[r] <= ROLE_RANK[role]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <InviteForm slug={org.slug} grantable={grantable} />

      <Card>
        <CardHeader>
          <CardTitle>{t("list.title", { count: members.length })}</CardTitle>
          <CardDescription>{t("list.body")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-3 font-medium">{tc("email")}</th>
                <th className="px-4 py-3 font-medium">{tc("role")}</th>
                <th className="px-4 py-3 font-medium">{t("list.since")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const self = m.userId === user.id;
                const above = ROLE_RANK[m.role] > ROLE_RANK[role];
                return (
                  <tr key={m.userId} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      {m.user.name ? <span className="mr-2">{m.user.name}</span> : null}
                      <span className="text-muted-foreground">{m.user.email}</span>
                      {self ? (
                        <Badge variant="outline" className="ml-2">
                          {t("list.you")}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <RoleSelect slug={org.slug} userId={m.userId} role={m.role} grantable={grantable} disabled={self || above} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(m.createdAt, locale)}</td>
                    <td className="px-4 py-3 text-right">
                      <RemoveButton slug={org.slug} userId={m.userId} disabled={self || above} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("pending.title", { count: invitations.length })}</CardTitle>
            <CardDescription>{t("pending.body")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {invitations.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{i.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{tRoles(i.role)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t("pending.expires", { at: fmtDate(i.expiresAt, locale) })}</td>
                    <td className="px-4 py-3 text-right">
                      <RemoveButton slug={org.slug} invitationId={i.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
