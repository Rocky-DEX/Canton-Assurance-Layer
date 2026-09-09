"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { Forbidden, audit, orgForAction } from "@/lib/rbac";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Forbidden ? e.message : e instanceof Error ? e.message : String(e) };
}

const General = z.object({
  name: z.string().trim().min(2).max(80),
  publisherParty: z.string().trim().min(3).max(200),
  publicPage: z.boolean(),
});

export async function updateGeneralAction(slug: string, raw: unknown): Promise<ActionResult> {
  try {
    const ctx = await orgForAction(slug, "ADMIN");
    const parsed = General.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    await prisma.organization.update({ where: { id: ctx.org.id }, data: parsed.data });
    await audit(ctx.org.id, ctx.user.id, "org.update", undefined, parsed.data);
    revalidatePath(`/app/${slug}`, "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function grantAuditorAction(slug: string, emailRaw: string): Promise<ActionResult> {
  try {
    const ctx = await orgForAction(slug, "ADMIN");
    const email = z.string().trim().email().parse(emailRaw).toLowerCase();
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    await prisma.auditorGrant.upsert({
      where: { orgId_email: { orgId: ctx.org.id, email } },
      create: { orgId: ctx.org.id, email, userId: user?.id ?? null, grantedById: ctx.user.id },
      update: { userId: user?.id ?? null },
    });
    await audit(ctx.org.id, ctx.user.id, "auditor.grant", email);
    revalidatePath(`/app/${slug}/settings`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeAuditorAction(slug: string, id: string): Promise<ActionResult> {
  try {
    const ctx = await orgForAction(slug, "ADMIN");
    const row = await prisma.auditorGrant.findFirst({ where: { id, orgId: ctx.org.id } });
    if (!row) return { ok: false, error: "not found" };
    await prisma.auditorGrant.delete({ where: { id } });
    await audit(ctx.org.id, ctx.user.id, "auditor.revoke", row.email);
    revalidatePath(`/app/${slug}/settings`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Deletes the organisation and everything under it. Owners only, and the
 * slug must be typed back. Signed documents already handed to customers and
 * auditors keep verifying: nothing here is the authority on that.
 */
export async function deleteOrgAction(slug: string, confirmSlug: string): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await orgForAction(slug, "OWNER");
  } catch (e) {
    return fail(e);
  }
  if (confirmSlug !== slug) return { ok: false, error: "type the slug to confirm" };
  await prisma.organization.delete({ where: { id: ctx.org.id } });
  redirect("/app");
}
