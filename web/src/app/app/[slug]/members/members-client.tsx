"use client";

import type { Role } from "@prisma/client";
import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { inviteAction, removeInvitationActionAlias, removeMemberAction, setRoleAction } from "./client-actions";

const ROLES: Role[] = ["OWNER", "ADMIN", "OPERATOR", "AUDITOR", "VIEWER"];

export function InviteForm({ slug, grantable }: { slug: string; grantable: Role[] }) {
  const t = useTranslations("members.invite");
  const tRoles = useTranslations("roles");
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(grantable.includes("OPERATOR") ? "OPERATOR" : grantable[grantable.length - 1]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await inviteAction(slug, { email, role });
              if (r.ok) {
                toast.success(r.message === "added" ? t("added") : t("invited"));
                setEmail("");
              } else toast.error(r.error);
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="invEmail">{t("email")}</Label>
            <Input id="invEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invRole">{t("role")}</Label>
            <select id="invRole" className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.filter((r) => grantable.includes(r)).map((r) => (
                <option key={r} value={r}>
                  {tRoles(r)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={pending || !email}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function RoleSelect({ slug, userId, role, grantable, disabled }: { slug: string; userId: string; role: Role; grantable: Role[]; disabled: boolean }) {
  const tRoles = useTranslations("roles");
  const [pending, start] = useTransition();
  return (
    <select
      className="rounded-md border border-input bg-background px-2 py-1 text-sm"
      value={role}
      disabled={disabled || pending}
      onChange={(e) =>
        start(async () => {
          const r = await setRoleAction(slug, userId, e.target.value);
          if (!r.ok) toast.error(r.error);
        })
      }
    >
      {ROLES.map((r) => (
        <option key={r} value={r} disabled={!grantable.includes(r)}>
          {tRoles(r)}
        </option>
      ))}
    </select>
  );
}

export function RemoveButton({ slug, userId, invitationId, disabled }: { slug: string; userId?: string; invitationId?: string; disabled?: boolean }) {
  const t = useTranslations("members");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("remove")}
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const r = userId ? await removeMemberAction(slug, userId) : await removeInvitationActionAlias(slug, invitationId ?? "");
          if (!r.ok) toast.error(r.error);
        })
      }
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
