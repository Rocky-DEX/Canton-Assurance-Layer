import { ArrowRight, FileCheck2, Landmark, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { LinkButton } from "@/components/link-button";

/**
 * What a signed-in account with no organisation sees: who are you, and where
 * do you go. Publishers create an organisation; customers and auditors were
 * invited by email and need nothing but to open their surface.
 */
export async function Welcome({ email }: { email: string }) {
  const t = await getTranslations("onboarding.welcome");
  const paths = [
    { icon: Landmark, key: "publisher", href: "/app/new", primary: true },
    { icon: FileCheck2, key: "customer", href: "/portal", primary: false },
    { icon: ShieldCheck, key: "auditor", href: "/audit", primary: false },
  ] as const;
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("body", { email })}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {paths.map((p) => (
          <div key={p.key} className={`flex flex-col rounded-xl border p-5 ${p.primary ? "border-foreground/30 bg-card" : "bg-card"}`}>
            <p.icon className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="mt-3 font-medium">{t(`${p.key}.title`)}</h2>
            <p className="mt-1.5 flex-1 text-sm text-muted-foreground">{t(`${p.key}.body`)}</p>
            <LinkButton href={p.href} variant={p.primary ? "default" : "outline"} size="sm" className="mt-4 w-fit">
              {t(`${p.key}.cta`)} <ArrowRight className="size-4" />
            </LinkButton>
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-muted/40 p-5 text-sm">
        <div className="font-medium">{t("how.title")}</div>
        <ol className="mt-2 grid gap-2 sm:grid-cols-4">
          {(["commit", "publish", "prove", "verify"] as const).map((k, i) => (
            <li key={k} className="rounded-md bg-background p-3">
              <div className="text-xs text-muted-foreground">{i + 1}</div>
              <div className="mt-1 font-medium">{t(`how.${k}.title`)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t(`how.${k}.body`)}</div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("how.note")}{" "}
          <Link className="underline" href="/verify">
            {t("how.offline")}
          </Link>
        </p>
      </div>
    </div>
  );
}
