"use server";

import type { Role } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { Forbidden, ROLE_RANK, atLeast, audit, orgForAction } from "@/lib/rbac";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Forbidden ? e.message : e instanceof Error ? e.message : String(e) };
}

const ROLES = ["OWNER", "ADMIN", "OPERATOR", "AUDITOR", "VIEWER"] as const;
const Invite = z.object({ email: z.string().trim().email(), role: z.enum(ROLES) });

/**
 * Invites by email. If the address already has an account the membership is
 * created at once; otherwise an invitation waits for the first sign-in, when
 * /app accepts every pending invitation for the signed-in address.
 */
export async function inviteAction(slug: string, raw: unknown): Promise<ActionResult> {
  try {
    const ctx = await orgForAction(slug, "ADMIN");
    const parsed = Invite.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const email = parsed.data.email.toLowerCase();
    const role = parsed.data.role as Role;
    // Nobody grants a role above their own.
    if (ROLE_RANK[role] > ROLE_RANK[ctx.role]) return { ok: false, error: "cannot grant a role above your own" };

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      await prisma.membership.upsert({
        where: { orgId_userId: { orgId: ctx.org.id, userId: user.id } },
        create: { orgId: ctx.org.id, userId: user.id, role },
        update: { role },
      });
      await audit(ctx.org.id, ctx.user.id, "members.add", email, { role });
      revalidatePath(`/app/${slug}/members`);
      return { ok: true, message: "added" };
    }
    await prisma.invitation.create({
      data: {
        orgId: ctx.org.id,
        email,
        role,
        token: randomBytes(24).toString("base64url"),
        expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      },
    });
    await audit(ctx.org.id, ctx.user.id, "members.invite", email, { role });
    revalidatePath(`/app/${slug}/members`);
    return { ok: true, message: "invited" };
  } catch (e) {
    return fail(e);
  }
}

export async function setRoleAction(slug: string, userId: string, roleRaw: string): Promise<ActionResult> {
  try {
    const ctx = await orgForAction(slug, "ADMIN");
    if (!ROLES.includes(roleRaw as Role)) return { ok: false, error: "unknown role" };
    const role = roleRaw as Role;
    if (ROLE_RANK[role] > ROLE_RANK[ctx.role]) return { ok: false, error: "cannot grant a role above your own" };
    const target = await prisma.membership.findUnique({ where: { orgId_userId: { orgId: ctx.org.id, userId } } });
    if (!target) return { ok: false, error: "not a member" };
    if (!atLeast(ctx.role, target.role)) return { ok: false, error: "cannot change a member above your own role" };
    if (target.role === "OWNER" && role !== "OWNER") {
      const owners = await prisma.membership.count({ where: { orgId: ctx.org.id, role: "OWNER" } });
      if (owners <= 1) return { ok: false, error: "an organisation keeps at least one owner" };
    }
    await prisma.membership.update({ where: { orgId_userId: { orgId: ctx.org.id, userId } }, data: { role } });
    await audit(ctx.org.id, ctx.user.id, "members.role", userId, { role });
    revalidatePath(`/app/${slug}/members`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeMemberAction(slug: string, userId: string): Promise<ActionResult> {
  try {
    const ctx = await orgForAction(slug, "ADMIN");
    const target = await prisma.membership.findUnique({ where: { orgId_userId: { orgId: ctx.org.id, userId } } });
    if (!target) return { ok: false, error: "not a member" };
    if (!atLeast(ctx.role, target.role)) return { ok: false, error: "cannot remove a member above your own role" };
    if (target.role === "OWNER") {
      const owners = await prisma.membership.count({ where: { orgId: ctx.org.id, role: "OWNER" } });
      if (owners <= 1) return { ok: false, error: "an organisation keeps at least one owner" };
    }
    await prisma.membership.delete({ where: { orgId_userId: { orgId: ctx.org.id, userId } } });
    await audit(ctx.org.id, ctx.user.id, "members.remove", userId);
    revalidatePath(`/app/${slug}/members`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeInvitationAction(slug: string, id: string): Promise<ActionResult> {
  try {
    const ctx = await orgForAction(slug, "ADMIN");
    const inv = await prisma.invitation.findFirst({ where: { id, orgId: ctx.org.id } });
    if (!inv) return { ok: false, error: "not found" };
    await prisma.invitation.delete({ where: { id } });
    await audit(ctx.org.id, ctx.user.id, "members.revokeInvite", inv.email);
    revalidatePath(`/app/${slug}/members`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Called from /app on every visit: turn pending invitations for this address into memberships. */
export async function acceptPendingInvitations(userId: string, email: string): Promise<number> {
  const pending = await prisma.invitation.findMany({
    where: { email: email.toLowerCase(), acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  for (const inv of pending) {
    await prisma.$transaction([
      prisma.membership.upsert({
        where: { orgId_userId: { orgId: inv.orgId, userId } },
        create: { orgId: inv.orgId, userId, role: inv.role },
        update: {},
      }),
      prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } }),
    ]);
  }
  // Customer rows and auditor grants keyed by this email link to the account too.
  await prisma.customer.updateMany({ where: { email: email.toLowerCase(), userId: null }, data: { userId } });
  await prisma.auditorGrant.updateMany({ where: { email: email.toLowerCase(), userId: null }, data: { userId } });
  return pending.length;
}
