import { getTranslations } from "next-intl/server";

import { requireOrg } from "@/lib/rbac";
import { MobileNav } from "@/components/mobile-nav";
import { OrgNav } from "@/components/org-nav";
import { TopBar } from "@/components/top-bar";

export default async function OrgLayout({ children, params }: LayoutProps<"/app/[slug]">) {
  const { slug } = await params;
  const { user, org, role } = await requireOrg(slug);
  const t = await getTranslations("nav");
  const tRoles = await getTranslations("roles");
  const labels = {
    overview: t("overview"),
    publications: t("publications"),
    custody: t("custody"),
    coverage: t("coverage"),
    history: t("history"),
    simulator: t("simulator"),
    customers: t("customers"),
    members: t("members"),
    apiKeys: t("apiKeys"),
    settings: t("settings"),
    publicPage: t("publicPage"),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar user={user} crumb={{ href: `/app/${org.slug}`, label: org.name }} />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-6 py-8">
        <aside className="hidden w-48 shrink-0 md:block">
          <OrgNav slug={org.slug} role={role} roleLabel={tRoles(role)} labels={labels} />
        </aside>
        <main className="min-w-0 flex-1">
          <div className="mb-4 md:hidden">
            <MobileNav slug={org.slug} role={role} roleLabel={tRoles(role)} labels={labels} orgName={org.name} menuLabel={t("menu")} />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
