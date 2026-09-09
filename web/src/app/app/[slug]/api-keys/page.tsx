import { getLocale, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { requireOrg } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { CreateKey, RevokeKey } from "./api-keys-client";

export default async function ApiKeysPage({ params }: PageProps<"/app/[slug]/api-keys">) {
  const { slug } = await params;
  const { org } = await requireOrg(slug, "ADMIN");
  const t = await getTranslations("apiKeys");
  const locale = await getLocale();
  const keys = await prisma.apiKey.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "desc" } });
  const origin = process.env.AUTH_URL?.replace(/\/$/, "") ?? "";

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <CreateKey slug={org.slug} />

      <Card>
        <CardHeader>
          <CardTitle>{t("list.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {keys.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("list.empty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">{t("list.name")}</th>
                  <th className="px-4 py-3 font-medium">{t("list.prefix")}</th>
                  <th className="px-4 py-3 font-medium">{t("list.lastUsed")}</th>
                  <th className="px-4 py-3 font-medium">{t("list.created")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      {k.name}
                      {k.revokedAt ? (
                        <Badge variant="outline" className="ml-2">
                          {t("list.revoked")}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{k.prefix}…</td>
                    <td className="px-4 py-3 text-muted-foreground">{k.lastUsedAt ? fmtDate(k.lastUsedAt, locale) : t("list.never")}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(k.createdAt, locale)}</td>
                    <td className="px-4 py-3 text-right">{k.revokedAt ? null : <RevokeKey slug={org.slug} id={k.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("usage.title")}</CardTitle>
          <CardDescription>{t("usage.body")}</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{`# Publish from a nightly job. Body: the same shape the console sends.
curl -X POST ${origin}/api/v1/orgs/${org.slug}/publications \\
  -H "Authorization: Bearer cal_…" -H "Content-Type: application/json" \\
  -d '{
    "snapshot_time": "2026-09-09T00:00:00Z",
    "ledger_offset": "000000000000003042",
    "leaves": [{"user_id": "alice", "balances": {"USDA": "100.5"}}],
    "manifest": {"audience": "public", "fields": {"root_sums": "published"}}
  }'

# Or upload the CSV directly.
curl -X POST ${origin}/api/v1/orgs/${org.slug}/publications?snapshot_time=2026-09-09T00:00:00Z&ledger_offset=3042 \\
  -H "Authorization: Bearer cal_…" -H "Content-Type: text/csv" --data-binary @balances.csv

# Latest publication and its files.
curl ${origin}/api/v1/orgs/${org.slug}/publications/latest -H "Authorization: Bearer cal_…"
curl ${origin}/api/v1/orgs/${org.slug}/publications/latest/files/report.json -H "Authorization: Bearer cal_…"`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
