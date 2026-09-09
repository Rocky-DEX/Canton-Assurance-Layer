"use client";

import { Copy, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createApiKeyAction, revokeApiKeyAction } from "./actions";

export function CreateKey({ slug }: { slug: string }) {
  const t = useTranslations("apiKeys.create");
  const tc = useTranslations("common");
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createApiKeyAction(slug, name);
              if (r.ok) {
                setCreated(r.key);
                setName("");
              } else toast.error(r.error);
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="keyName">{t("name")}</Label>
            <Input id="keyName" required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("submit")}
          </Button>
        </form>
        {created ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30">
            <div className="font-medium">{t("once")}</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs">{created}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(created).then(() => toast.success(tc("copied")));
                }}
              >
                <Copy className="size-3.5" /> {tc("copy")}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function RevokeKey({ slug, id }: { slug: string; id: string }) {
  const t = useTranslations("apiKeys");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("revoke")}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await revokeApiKeyAction(slug, id);
          if (!r.ok) toast.error(r.error);
        })
      }
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
