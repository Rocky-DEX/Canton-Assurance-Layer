import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { RemoveCustomer, RosterImport } from "./customers-client";

const PAGE = 50;

export default async function CustomersPage(props: PageProps<"/app/[slug]/customers">) {
  const { slug } = await props.params;
  const { q, page } = await props.searchParams;
  const { org } = await requireOrg(slug, "OPERATOR");
  const t = await getTranslations("customers");
  const tc = await getTranslations("common");

  const query = typeof q === "string" ? q.trim() : "";
  const pageNo = Math.max(1, Number(page) || 1);
  const where = {
    orgId: org.id,
    ...(query ? { OR: [{ externalId: { contains: query } }, { email: { contains: query } }] } : {}),
  };
  const [rows, total, linked, latest] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { externalId: "asc" }, skip: (pageNo - 1) * PAGE, take: PAGE }),
    prisma.customer.count({ where }),
    prisma.customer.count({ where: { orgId: org.id, userId: { not: null } } }),
    prisma.publication.findFirst({ where: { orgId: org.id }, orderBy: { createdAt: "desc" }, select: { id: true } }),
  ]);
  // Which of these customers have a proof in the latest publication.
  const withProof = latest
    ? new Set(
        (
          await prisma.proof.findMany({
            where: { publicationId: latest.id, externalId: { in: rows.map((r) => r.externalId) } },
            select: { externalId: true },
          })
        ).map((p) => p.externalId)
      )
    : new Set<string>();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <RosterImport slug={org.slug} />

      <Card>
        <CardHeader>
          <CardTitle>{t("list.title", { total, linked })}</CardTitle>
          <CardDescription>{t("list.body")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <form className="flex gap-2">
            <Input name="q" defaultValue={query} placeholder={t("list.search")} className="max-w-xs" />
            <Button type="submit" variant="outline">
              {tc("search")}
            </Button>
          </form>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("list.empty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 font-medium">{t("list.userId")}</th>
                  <th className="py-2 font-medium">{tc("email")}</th>
                  <th className="py-2 font-medium">{t("list.account")}</th>
                  <th className="py-2 font-medium">{t("list.latestProof")}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{r.externalId}</td>
                    <td className="py-2">{r.email}</td>
                    <td className="py-2">
                      <Badge variant={r.userId ? "default" : "outline"}>{r.userId ? t("list.linked") : t("list.pending")}</Badge>
                    </td>
                    <td className="py-2">
                      {latest ? (
                        withProof.has(r.externalId) ? (
                          <Badge variant="secondary">{tc("yes")}</Badge>
                        ) : (
                          <Badge variant="outline">{tc("no")}</Badge>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <RemoveCustomer slug={org.slug} id={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("list.showing", { from: total === 0 ? 0 : (pageNo - 1) * PAGE + 1, to: Math.min(pageNo * PAGE, total), total })}</span>
            <span className="flex gap-2">
              {pageNo > 1 ? (
                <Link className="underline" href={`?q=${encodeURIComponent(query)}&page=${pageNo - 1}`}>
                  ←
                </Link>
              ) : null}
              {pageNo * PAGE < total ? (
                <Link className="underline" href={`?q=${encodeURIComponent(query)}&page=${pageNo + 1}`}>
                  →
                </Link>
              ) : null}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
