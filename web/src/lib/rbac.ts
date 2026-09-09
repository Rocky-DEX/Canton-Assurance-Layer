import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/** Higher is more. Every check is "at least this role". */
export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  AUDITOR: 2,
  OPERATOR: 3,
  ADMIN: 4,
  OWNER: 5,
};

export const ROLES: Role[] = ["OWNER", "ADMIN", "OPERATOR", "AUDITOR", "VIEWER"];

export function atLeast(have: Role, want: Role): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[want];
}

export class Forbidden extends Error {
  constructor(message = "forbidden") {
    super(message);
  }
}

/** The signed-in user, or a redirect to the login page. */
export async function requireUser(next?: string) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return { id: session.user.id, email: session.user.email, name: session.user.name ?? null };
}

export type OrgContext = {
  user: { id: string; email: string; name: string | null };
  org: {
    id: string;
    slug: string;
    name: string;
    publisherParty: string;
    publicPage: boolean;
    signingKeyHex: string | null;
  };
  role: Role;
};

/**
 * The organisation at `slug`, with the caller's role in it, or a redirect.
 * An external auditor grant reads as the AUDITOR role.
 */
export async function requireOrg(slug: string, minRole: Role = "VIEWER"): Promise<OrgContext> {
  const user = await requireUser(`/app/${slug}`);
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      publisherParty: true,
      publicPage: true,
      signingKeyHex: true,
    },
  });
  if (!org) redirect("/app");

  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
    select: { role: true },
  });
  let role: Role | null = membership?.role ?? null;
  if (!role) {
    const grant = await prisma.auditorGrant.findFirst({
      where: { orgId: org.id, OR: [{ userId: user.id }, { email: user.email }] },
      select: { id: true },
    });
    if (grant) role = "AUDITOR";
  }
  if (!role) redirect("/app");
  if (!atLeast(role, minRole)) redirect(`/app/${slug}`);
  return { user, org, role };
}

/** Like requireOrg, but throws instead of redirecting — for server actions. */
export async function orgForAction(slug: string, minRole: Role): Promise<OrgContext> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) throw new Forbidden("not signed in");
  const user = { id: session.user.id, email: session.user.email, name: session.user.name ?? null };
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      publisherParty: true,
      publicPage: true,
      signingKeyHex: true,
    },
  });
  if (!org) throw new Forbidden("no such organisation");
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
    select: { role: true },
  });
  const role = membership?.role;
  if (!role || !atLeast(role, minRole)) throw new Forbidden("insufficient role");
  return { user, org, role };
}

export async function audit(
  orgId: string,
  actorId: string | null,
  action: string,
  target?: string,
  meta?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: { orgId, actorId, action, target, meta: meta as object | undefined },
  });
}
