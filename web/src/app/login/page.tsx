import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage(props: PageProps<"/login">) {
  const { next, error } = await props.searchParams;
  const session = await auth();
  if (session?.user) redirect(typeof next === "string" && next.startsWith("/") ? next : "/app");

  const t = await getTranslations("login");
  const tApp = await getTranslations("app");
  const redirectTo = typeof next === "string" && next.startsWith("/") ? next : "/app";

  async function requestLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    if (!email) return;
    await signIn("nodemailer", { email, redirectTo, redirect: true });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-6 flex w-full max-w-sm items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight">
          {tApp("name")}
        </Link>
        <LocaleSwitcher />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={requestLink} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@institution.example" />
            </div>
            {error ? <p className="text-sm text-destructive">{t("error")}</p> : null}
            <Button type="submit">{t("submit")}</Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">{t("note")}</p>
        </CardContent>
      </Card>
    </main>
  );
}
