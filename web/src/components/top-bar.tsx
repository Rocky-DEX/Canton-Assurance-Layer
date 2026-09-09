import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { signOut } from "@/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";

export async function TopBar({
  user,
  crumb,
}: {
  user: { email: string; name: string | null };
  crumb?: { href: string; label: string };
}) {
  const tApp = await getTranslations("app");
  const t = await getTranslations("common");
  async function out() {
    "use server";
    await signOut({ redirectTo: "/" });
  }
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
        <Link href="/app" className="font-semibold tracking-tight">
          {tApp("name")}
        </Link>
        {crumb ? (
          <>
            <span className="text-muted-foreground">/</span>
            <Link href={crumb.href} className="truncate text-sm font-medium">
              {crumb.label}
            </Link>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          <LocaleSwitcher />
          <span className="hidden text-sm text-muted-foreground sm:inline">{user.name ?? user.email}</span>
          <form action={out}>
            <Button type="submit" variant="ghost" size="sm">
              {t("signOut")}
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
