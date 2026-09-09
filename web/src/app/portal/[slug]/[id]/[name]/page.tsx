import { Download } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fingerprint } from "@/lib/format";
import { proofForUser } from "@/lib/portal";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/link-button";
import { ProofVerify } from "@/components/proof-verify";
import { TopBar } from "@/components/top-bar";

export default async function PortalProofPage({ params }: PageProps<"/portal/[slug]/[id]/[name]">) {
  const { slug, id, name } = await params;
  const user = await requireUser(`/portal/${slug}/${id}/${name}`);
  const t = await getTranslations("portal");
  const proof = await proofForUser(user.id, user.email, id, name);
  if (!proof) notFound();
  const org = await prisma.organization.findFirst({ where: { slug, id: proof.publication.orgId }, select: { name: true, publisherParty: true } });
  if (!org) notFound();

  const base = `/portal/${slug}/${id}/${encodeURIComponent(name)}/files`;
  const reportUrl = `${base}/report.json`;
  const proofUrl = `${base}/${encodeURIComponent(name)}`;

  return (
    <>
      <TopBar user={user} crumb={{ href: "/portal", label: t("title") }} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="text-sm text-muted-foreground">
          <Link href="/portal" className="hover:underline">
            {t("title")}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <p className="text-sm text-muted-foreground">
          {t("yourId")} <span className="font-mono">{proof.externalId}</span>
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("verify.title")}</CardTitle>
            <CardDescription>{t("verify.body")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ProofVerify reportUrl={reportUrl} proofUrl={proofUrl} trustedKeyHex={proof.publication.publisherKey} />
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("files.title")}</CardTitle>
            <CardDescription>{t("files.body")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <LinkButton variant="outline" size="sm" href={reportUrl} download="report.json">
                <Download className="size-4" /> report.json
              </LinkButton>
              <LinkButton variant="outline" size="sm" href={proofUrl} download="proof.json">
                <Download className="size-4" /> proof.json
              </LinkButton>
              <LinkButton variant="outline" size="sm" href="/verify" download="verifier.html">
                <Download className="size-4" /> verifier.html
              </LinkButton>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("files.keyNote")} <span className="font-mono">{fingerprint(proof.publication.publisherKey)}</span>
            </p>
            <p className="text-xs text-muted-foreground">{t("files.independent")}</p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
