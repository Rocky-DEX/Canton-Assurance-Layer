import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { audit, requireUser } from "@/lib/rbac";
import { signingService } from "@/lib/service";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TopBar } from "@/components/top-bar";

const Form = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/),
  publisherParty: z.string().trim().min(3).max(200),
});

export default async function NewOrgPage(props: PageProps<"/app/new">) {
  const user = await requireUser("/app/new");
  const t = await getTranslations("orgs");
  const tc = await getTranslations("common");
  const { error } = await props.searchParams;

  async function create(formData: FormData) {
    "use server";
    const parsed = Form.safeParse({
      name: formData.get("name"),
      slug: formData.get("slug"),
      publisherParty: formData.get("publisherParty"),
    });
    if (!parsed.success) redirect("/app/new?error=invalid");
    const { name, slug, publisherParty } = parsed.data;
    if (await prisma.organization.findUnique({ where: { slug } })) redirect("/app/new?error=slug");

    const org = await prisma.organization.create({
      data: {
        name,
        slug,
        publisherParty,
        memberships: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    // Ask the signing service for this organisation's key now, so the public
    // half is on the settings page before the first publication.
    try {
      const { public_key } = await signingService.publicKey(org.id);
      await prisma.organization.update({ where: { id: org.id }, data: { signingKeyHex: public_key } });
    } catch (e) {
      // Not fatal for creating the organisation: the overview page asks again
      // and shows the service's answer, and the first publication would ask
      // too. But say so in the log; production once swallowed a permission
      // error here for hours.
      console.error(`[org.create] signing service did not return a key for ${org.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
    await audit(org.id, user.id, "org.create", org.slug);
    redirect(`/app/${org.slug}`);
  }

  return (
    <>
      <TopBar user={user} />
      <main className="mx-auto max-w-xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>{t("create")}</CardTitle>
            <CardDescription>{t("createDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={create} className="grid gap-5">
              <div className="grid gap-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input id="name" name="name" required minLength={2} maxLength={80} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slug">{t("slug")}</Label>
                <Input id="slug" name="slug" required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" placeholder="acme-exchange" />
                <p className="text-xs text-muted-foreground">{t("slugHint")}</p>
                {error === "slug" ? <p className="text-sm text-destructive">{t("slugTaken")}</p> : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="publisherParty">{t("publisherParty")}</Label>
                <Input id="publisherParty" name="publisherParty" required placeholder="venue::main" className="font-mono" />
                <p className="text-xs text-muted-foreground">{t("publisherPartyHint")}</p>
              </div>
              {error === "invalid" ? <p className="text-sm text-destructive">{t("invalid")}</p> : null}
              <div className="flex gap-3">
                <Button type="submit">{tc("create")}</Button>
                <LinkButton variant="outline" href="/app">{tc("cancel")}</LinkButton>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
