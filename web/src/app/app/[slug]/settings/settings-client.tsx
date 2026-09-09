"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { deleteOrgAction, grantAuditorAction, revokeAuditorAction, updateGeneralAction } from "./actions";

export function GeneralForm({
  slug,
  initial,
}: {
  slug: string;
  initial: { name: string; publisherParty: string; publicPage: boolean };
}) {
  const t = useTranslations("settings.general");
  const tc = useTranslations("common");
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial.name);
  const [party, setParty] = useState(initial.publisherParty);
  const [publicPage, setPublicPage] = useState(initial.publicPage);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await updateGeneralAction(slug, { name, publisherParty: party, publicPage });
              if (r.ok) toast.success(t("saved"));
              else toast.error(r.error);
            });
          }}
        >
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="orgName">{t("name")}</Label>
            <Input id="orgName" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
          </div>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="party">{t("party")}</Label>
            <Input id="party" value={party} onChange={(e) => setParty(e.target.value)} className="font-mono" required />
            <p className="text-xs text-muted-foreground">{t("partyHint")}</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={publicPage} onChange={(e) => setPublicPage(e.target.checked)} />
            <span>
              <span className="font-medium">{t("publicPage")}</span>
              <span className="block text-muted-foreground">{t("publicPageHint", { url: `/p/${slug}` })}</span>
            </span>
          </label>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {tc("save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function AuditorGrants({ slug, grants }: { slug: string; grants: Array<{ id: string; email: string; linked: boolean }> }) {
  const t = useTranslations("settings.auditors");
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await grantAuditorAction(slug, email);
              if (r.ok) {
                toast.success(t("granted"));
                setEmail("");
              } else toast.error(r.error);
            });
          }}
        >
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="auditor@firm.example" className="max-w-sm" />
          <Button type="submit" variant="outline" disabled={pending || !email}>
            {t("grant")}
          </Button>
        </form>
        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {grants.map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span>
                  {g.email} <span className="text-xs text-muted-foreground">{g.linked ? t("linked") : t("pending")}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("revoke")}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await revokeAuditorAction(slug, g.id);
                      if (!r.ok) toast.error(r.error);
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function DangerZone({ slug }: { slug: string }) {
  const t = useTranslations("settings.danger");
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState("");
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="confirm">{t("confirm", { slug })}</Label>
          <Input id="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="font-mono" />
        </div>
        <Button
          variant="destructive"
          disabled={pending || confirm !== slug}
          onClick={() =>
            start(async () => {
              const r = await deleteOrgAction(slug, confirm);
              if (r && !r.ok) toast.error(r.error);
            })
          }
        >
          {t("delete")}
        </Button>
      </CardContent>
    </Card>
  );
}
