import { MailCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LinkButton } from "@/components/link-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SentPage() {
  const t = await getTranslations("login");
  const dev = process.env.NODE_ENV !== "production" && !process.env.EMAIL_SERVER;
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <MailCheck className="size-6 text-muted-foreground" aria-hidden />
          <CardTitle>{t("sent.title")}</CardTitle>
          <CardDescription>{t("sent.description")}</CardDescription>
        </CardHeader>
        {dev ? (
          <CardContent>
            <LinkButton variant="outline" className="w-full" href="/dev/mail">{t("sent.devMail")}</LinkButton>
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}
