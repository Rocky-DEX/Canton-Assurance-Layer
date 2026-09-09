"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseRosterCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { Forbidden, audit, orgForAction } from "@/lib/rbac";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Forbidden ? e.message : e instanceof Error ? e.message : String(e) };
}

/** Upsert `user_id,email` rows. An email already tied to a signed-in user links immediately. */
export async function importRosterAction(slug: string, csvText: string): Promise<ActionResult> {
  try {
    const ctx = await orgForAction(slug, "OPERATOR");
    const { rows, errors } = parseRosterCsv(csvText);
    if (rows.length === 0) return { ok: false, error: errors[0] ?? "no rows" };
    const users = await prisma.user.findMany({
      where: { email: { in: [...new Set(rows.map((r) => r.email))] } },
      select: { id: true, email: true },
    });
    const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
    await prisma.$transaction(
      rows.map((r) =>
        prisma.customer.upsert({
          where: { orgId_externalId: { orgId: ctx.org.id, externalId: r.externalId } },
          create: { orgId: ctx.org.id, externalId: r.externalId, email: r.email, userId: byEmail.get(r.email) ?? null },
          update: { email: r.email, userId: byEmail.get(r.email) ?? null },
        })
      )
    );
    await audit(ctx.org.id, ctx.user.id, "customers.import", undefined, { rows: rows.length, rejected: errors.length });
    revalidatePath(`/app/${slug}/customers`);
    return { ok: true, message: errors.length ? `${rows.length} imported, ${errors.length} rows rejected: ${errors[0]}` : `${rows.length} imported` };
  } catch (e) {
    return fail(e);
  }
}

const One = z.object({ externalId: z.string().trim().min(1).max(200), email: z.string().trim().email() });

export async function addCustomerAction(slug: string, raw: unknown): Promise<ActionResult> {
  try {
    const ctx = await orgForAction(slug, "OPERATOR");
    const parsed = One.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    await prisma.customer.upsert({
      where: { orgId_externalId: { orgId: ctx.org.id, externalId: parsed.data.externalId } },
      create: { orgId: ctx.org.id, externalId: parsed.data.externalId, email, userId: user?.id ?? null },
      update: { email, userId: user?.id ?? null },
    });
    await audit(ctx.org.id, ctx.user.id, "customers.add", parsed.data.externalId);
    revalidatePath(`/app/${slug}/customers`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeCustomerAction(slug: string, id: string): Promise<ActionResult> {
  try {
    const ctx = await orgForAction(slug, "OPERATOR");
    const row = await prisma.customer.findFirst({ where: { id, orgId: ctx.org.id }, select: { externalId: true } });
    if (!row) return { ok: false, error: "not found" };
    await prisma.customer.delete({ where: { id } });
    await audit(ctx.org.id, ctx.user.id, "customers.remove", row.externalId);
    revalidatePath(`/app/${slug}/customers`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
