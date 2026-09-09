import { getLocale, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/db";
import { fingerprint, fmtDate } from "@/lib/format";
import { requireOrg } from "@/lib/rbac";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { AuditorGrants, DangerZone, GeneralForm } from "./settings-client";

export default async function SettingsPage({ params }: PageProps<"/app/[slug]/settings">) {
  const { slug } = await params;
  const { org, role } = await requireOrg(slug, "ADMIN");
  const t = await getTranslations("settings");
  const locale = await getLocale();

  const [grants, logs] = await Promise.all([
    prisma.auditorGrant.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({
      where: { orgId: org.id },
      orderBy: { at: "desc" },
      take: 30,
      include: { actor: { select: { email: true } } },
    }),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <GeneralForm slug={org.slug} initial={{ name: org.name, publisherParty: org.publisherParty, publicPage: org.publicPage }} />

      <Card>
        <CardHeader>
          <CardTitle>{t("key.title")}</CardTitle>
          <CardDescription>{t("key.body")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {org.signingKeyHex ? (
            <>
              <div className="font-mono">{fingerprint(org.signingKeyHex)}</div>
              <div className="break-all font-mono text-xs text-muted-foreground">{org.signingKeyHex}</div>
            </>
          ) : (
            <p className="text-muted-foreground">{t("key.none")}</p>
          )}
          <p className="text-xs text-muted-foreground">{t("key.rotation")}</p>
        </CardContent>
      </Card>

      <AuditorGrants slug={org.slug} grants={grants.map((g) => ({ id: g.id, email: g.email, linked: Boolean(g.userId) }))} />

      <Card>
        <CardHeader>
          <CardTitle>{t("log.title")}</CardTitle>
          <CardDescription>{t("log.body")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(l.at, locale)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{l.action}</td>
                  <td className="px-4 py-2 text-muted-foreground">{l.actor?.email ?? "api"}</td>
                  <td className="max-w-64 truncate px-4 py-2 font-mono text-xs" title={l.target ?? ""}>
                    {l.target ?? ""}
                  </td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-muted-foreground">{t("log.empty")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {role === "OWNER" ? <DangerZone slug={org.slug} /> : null}
    </div>
  );
}
