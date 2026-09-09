import { FileCheck2 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { fingerprint, fmtDate } from "@/lib/format";
import { proofsForUser } from "@/lib/portal";
import { requireUser } from "@/lib/rbac";
import { acceptPendingInvitations } from "@/app/app/[slug]/members/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar } from "@/components/top-bar";

export default async function PortalPage() {
  const user = await requireUser("/portal");
  await acceptPendingInvitations(user.id, user.email);
  const t = await getTranslations("portal");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const rows = await proofsForUser(user.id, user.email);

  return (
    <>
      <TopBar user={user} crumb={{ href: "/portal", label: t("title") }} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

        <div className="mt-6 grid gap-4">
          {rows.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("empty.title")}</CardTitle>
                <CardDescription>{t("empty.body", { email: user.email })}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}
          {rows.map((r) => (
            <Card key={`${r.org.id}:${r.externalId}`}>
              <CardHeader>
                <CardTitle>{r.org.name}</CardTitle>
                <CardDescription>
                  {t("yourId")} <span className="font-mono">{r.externalId}</span> · {tc("publisher")}{" "}
                  <span className="font-mono">{r.org.publisherParty}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {r.org.signingKeyHex ? (
                  <p className="text-xs text-muted-foreground">
                    {t("keyNote")} <span className="font-mono">{fingerprint(r.org.signingKeyHex)}</span>
                  </p>
                ) : null}
                {r.publications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noProofs")}</p>
                ) : (
                  <ul className="grid gap-2">
                    {r.publications.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/portal/${r.org.slug}/${p.id}/${encodeURIComponent(p.fileName)}`}
                          className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent"
                        >
                          <FileCheck2 className="size-4 text-muted-foreground" aria-hidden />
                          <span className="font-mono">{p.snapshotTime}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{fmtDate(p.createdAt, locale)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>{t("how.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 sm:grid-cols-3">
              {(["commitment", "proof", "check"] as const).map((k, i) => (
                <li key={k} className="rounded-md border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">{i + 1}</div>
                  <div className="mt-1 font-medium">{t(`how.${k}.title`)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{t(`how.${k}.body`)}</div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <p className="mt-6 text-xs text-muted-foreground">
          {t("offlineNote")}{" "}
          <Link className="underline" href="/verify">
            {t("offlineLink")}
          </Link>
        </p>
      </main>
    </>
  );
}
