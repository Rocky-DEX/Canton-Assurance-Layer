"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { generateApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/db";
import { Forbidden, audit, orgForAction } from "@/lib/rbac";

export type CreateKeyResult = { ok: true; key: string; prefix: string } | { ok: false; error: string };
export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createApiKeyAction(slug: string, nameRaw: string): Promise<CreateKeyResult> {
  try {
    const ctx = await orgForAction(slug, "ADMIN");
    const name = z.string().trim().min(1).max(60).parse(nameRaw);
    const { key, prefix, hash } = generateApiKey();
    await prisma.apiKey.create({ data: { orgId: ctx.org.id, name, prefix, hash } });
    await audit(ctx.org.id, ctx.user.id, "apiKey.create", prefix, { name });
    revalidatePath(`/app/${slug}/api-keys`);
    return { ok: true, key, prefix };
  } catch (e) {
    return { ok: false, error: e instanceof Forbidden ? e.message : e instanceof Error ? e.message : String(e) };
  }
}

export async function revokeApiKeyAction(slug: string, id: string): Promise<ActionResult> {
  try {
    const ctx = await orgForAction(slug, "ADMIN");
    const row = await prisma.apiKey.findFirst({ where: { id, orgId: ctx.org.id } });
    if (!row) return { ok: false, error: "not found" };
    await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit(ctx.org.id, ctx.user.id, "apiKey.revoke", row.prefix);
    revalidatePath(`/app/${slug}/api-keys`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Forbidden ? e.message : e instanceof Error ? e.message : String(e) };
  }
}
