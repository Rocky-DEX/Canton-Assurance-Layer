import { ArrowRight, CheckCircle2, CircleDashed, FileCheck2, Landmark, Loader2, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { auth } from "@/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LinkButton } from "@/components/link-button";
import { Badge } from "@/components/ui/badge";

const REPO = "https://github.com/Rocky-DEX/Canton-Assurance-Layer";

type Status = "delivered" | "active" | "planned";

/**
 * The delivery record and the road ahead, in the order they happen. Text
 * lives in the catalogs; status and dates live here so a milestone cannot be
 * marked delivered in one language and planned in the other. Sources:
 * README "Grant Scope & Deliverables" for what shipped, ROADMAP.md for the
 * phases.
 */
const MILESTONES: Array<{ id: string; status: Status; when: string }> = [
  { id: "format", status: "delivered", when: "2026-08" },
  { id: "documents", status: "delivered", when: "2026-08" },
  { id: "reserve", status: "delivered", when: "2026-08" },
  { id: "anchoring", status: "delivered", when: "2026-08" },
  { id: "profiles", status: "delivered", when: "2026-08" },
  { id: "toolkit", status: "delivered", when: "2026-08" },
  { id: "conformance", status: "delivered", when: "2026-08" },
  { id: "console", status: "delivered", when: "2026-09" },
  { id: "simulator", status: "delivered", when: "2026-09" },
  { id: "standardisation", status: "active", when: "2026-10 → 2027-03" },
  { id: "rwa", status: "planned", when: "2026-12 → 2027-09" },
  { id: "compliance", status: "planned", when: "2027-04 → 2027-12" },
  { id: "attested", status: "planned", when: "2028" },
];

const PRINCIPLES = ["client", "format", "honest", "private", "compatible"] as const;

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

  const delivered = MILESTONES.filter((m) => m.status === "delivered").length;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <div className="font-semibold tracking-tight">{tApp("name")}</div>
        <nav className="hidden items-center gap-5 text-sm text-muted-foreground sm:flex">
          <a href="#milestones" className="hover:text-foreground">
            {t("nav.milestones")}
          </a>
          <a href="#vision" className="hover:text-foreground">
            {t("nav.vision")}
          </a>
          <a href={REPO} className="hover:text-foreground" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
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
          <Link key={s.href} href={s.href} className="group rounded-xl border bg-card p-5 transition-colors hover:bg-accent">
            <s.icon className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="mt-3 font-medium">{s.title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
          </Link>
        ))}
      </section>

      {/* Vision */}
      <section id="vision" className="scroll-mt-8 border-t py-16">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t("vision.kicker")}</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight">{t("vision.title")}</h2>
        <div className="mt-6 grid gap-8 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-4 text-muted-foreground">
            <p>{t("vision.p1")}</p>
            <p>{t("vision.p2")}</p>
            <p>{t("vision.p3")}</p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-medium">{t("vision.team.title")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t("vision.team.body")}</p>
            <ul className="mt-4 grid gap-2 text-sm">
              <li>
                <a className="underline underline-offset-4" href={REPO} target="_blank" rel="noreferrer">
                  {t("vision.team.code")}
                </a>
              </li>
              <li>
                <a className="underline underline-offset-4" href={`${REPO}/blob/main/ROADMAP.md`} target="_blank" rel="noreferrer">
                  {t("vision.team.roadmap")}
                </a>
              </li>
              <li>
                <a className="underline underline-offset-4" href={`${REPO}/blob/main/DEPLOY.md`} target="_blank" rel="noreferrer">
                  {t("vision.team.deploy")}
                </a>
              </li>
              <li>
                <a className="underline underline-offset-4" href="https://rocky.exchange" target="_blank" rel="noreferrer">
                  {t("vision.team.rocky")}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <h3 className="mt-12 font-medium">{t("vision.principles.title")}</h3>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PRINCIPLES.map((p, i) => (
            <li key={p} className="rounded-xl border bg-card p-4">
              <div className="text-xs font-semibold tabular-nums text-muted-foreground">0{i + 1}</div>
              <div className="mt-1 font-medium">{t(`vision.principles.${p}.title`)}</div>
              <p className="mt-1.5 text-sm text-muted-foreground">{t(`vision.principles.${p}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Milestones */}
      <section id="milestones" className="scroll-mt-8 border-t py-16">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t("milestones.kicker")}</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight">{t("milestones.title")}</h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">{t("milestones.sub", { delivered, total: MILESTONES.length })}</p>
        <ol className="mt-8 grid gap-0">
          {MILESTONES.map((m, i) => {
            const Icon = m.status === "delivered" ? CheckCircle2 : m.status === "active" ? Loader2 : CircleDashed;
            const last = i === MILESTONES.length - 1;
            return (
              <li key={m.id} className="grid grid-cols-[1.5rem_1fr] gap-x-4">
                <div className="flex flex-col items-center">
                  <Icon
                    className={
                      m.status === "delivered"
                        ? "size-6 text-emerald-600"
                        : m.status === "active"
                          ? "size-6 text-amber-600"
                          : "size-6 text-muted-foreground"
                    }
                    aria-hidden
                  />
                  {!last ? <div className="w-px flex-1 bg-border" /> : null}
                </div>
                <div className={last ? "pb-0" : "pb-8"}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{t(`milestones.items.${m.id}.title`)}</h3>
                    <Badge variant={m.status === "delivered" ? "default" : m.status === "active" ? "secondary" : "outline"}>
                      {t(`milestones.status.${m.status}`)}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{m.when}</span>
                  </div>
                  <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{t(`milestones.items.${m.id}.body`)}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-8 text-sm text-muted-foreground">{t("milestones.note")}</p>
      </section>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t py-6 text-sm text-muted-foreground">
        <p>{t("principle")}</p>
        <div className="flex gap-4">
          <a className="hover:text-foreground" href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a className="hover:text-foreground" href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
            Apache-2.0
          </a>
        </div>
      </footer>
    </main>
  );
}
