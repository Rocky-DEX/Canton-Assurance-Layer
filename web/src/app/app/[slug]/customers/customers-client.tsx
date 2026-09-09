"use client";

import { FileUp, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { addCustomerAction, importRosterAction, removeCustomerAction } from "./actions";

export function RosterImport({ slug }: { slug: string }) {
  const t = useTranslations("customers.import");
  const [pending, start] = useTransition();
  const [externalId, setExternalId] = useState("");
  const [email, setEmail] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    start(async () => {
      const r = await importRosterAction(slug, text);
      if (r.ok) toast.success(r.message ?? t("done"));
      else toast.error(r.error);
    });
  }

  function addOne() {
    start(async () => {
      const r = await addCustomerAction(slug, { externalId, email });
      if (r.ok) {
        toast.success(t("added"));
        setExternalId("");
        setEmail("");
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 hover:bg-accent">
          {pending ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <FileUp className="size-5 text-muted-foreground" aria-hidden />}
          <span className="text-sm">{t("choose")}</span>
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={pending} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="externalId">{t("userId")}</Label>
            <Input id="externalId" value={externalId} onChange={(e) => setExternalId(e.target.value)} className="font-mono" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cEmail">{t("email")}</Label>
            <Input id="cEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button variant="outline" onClick={addOne} disabled={pending || !externalId || !email}>
            {t("add")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function RemoveCustomer({ slug, id }: { slug: string; id: string }) {
  const t = useTranslations("customers");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("remove")}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await removeCustomerAction(slug, id);
          if (!r.ok) toast.error(r.error);
        })
      }
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
