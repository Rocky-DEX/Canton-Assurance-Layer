import { ArrowRight, FileCheck2, Landmark, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { auth } from "@/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LinkButton } from "@/components/link-button";

export default async function Landing() {
  const t = await getTranslations("landing");
  const tApp = await getTranslations("app");
  const session = await auth();
  const signedIn = Boolean(session?.user);

  const surfaces = [
    { icon: Landmark, title: t("publisher.title"), body: t("publisher.body"), href: "/app" },
    { icon: FileCheck2, title: t("portal.title"), body: t("portal.body"), href: "/portal" },
    { icon: ShieldCheck, title: t("auditor.title"), body: t("auditor.body"), href: "/audit" },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <div className="font-semibold tracking-tight">{tApp("name")}</div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <LinkButton variant={signedIn ? "default" : "outline"} href={signedIn ? "/app" : "/login"}>{signedIn ? t("open") : t("signIn")}</LinkButton>
        </div>
      </header>

      <section className="py-16">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{tApp("tagline")}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{t("headline")}</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">{t("sub")}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton size="lg" href={signedIn ? "/app" : "/login"}>
              {t("cta")} <ArrowRight className="size-4" />
            </LinkButton>
          <LinkButton size="lg" variant="outline" href="/verify">{t("verifyOffline")}</LinkButton>
        </div>
      </section>

      <section className="grid gap-5 pb-16 sm:grid-cols-3">
        {surfaces.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-xl border bg-card p-5 transition-colors hover:bg-accent"
          >
            <s.icon className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="mt-3 font-medium">{s.title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
          </Link>
        ))}
      </section>

      <footer className="mt-auto border-t py-6 text-sm text-muted-foreground">
        <p>{t("principle")}</p>
      </footer>
    </main>
  );
}
