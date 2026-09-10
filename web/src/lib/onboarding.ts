import type { Role } from "@prisma/client";

import { prisma } from "@/lib/db";
import { atLeast } from "@/lib/rbac-shared";

export type StepId = "org" | "key" | "customers" | "publish" | "coverage" | "members" | "apiKey" | "publicPage";

export type ChecklistStep = {
  id: StepId;
  done: boolean;
  /** Where the step is completed, relative to the organisation. */
  href: string;
  /** The lowest role that can complete it; others see it without a link. */
  minRole: Role;
};

export type Checklist = {
  steps: ChecklistStep[];
  done: number;
  total: number;
  complete: boolean;
};

/**
 * What a new organisation has and has not done yet, derived from the data
 * rather than from flags a page could forget to set. The order is the order
 * a first publication actually needs: identity, key, roster, publish, then
 * the things that make it a practice rather than a one-off.
 */
export async function computeChecklist(org: { id: string; slug: string; publisherParty: string; signingKeyHex: string | null; publicPage: boolean }, role: Role): Promise<Checklist> {
  const base = `/app/${org.slug}`;
  const [customers, publications, coverage, members, apiKeys] = await Promise.all([
    prisma.customer.count({ where: { orgId: org.id } }),
    prisma.publication.count({ where: { orgId: org.id } }),
    prisma.coverageStatement.count({ where: { orgId: org.id } }),
    prisma.membership.count({ where: { orgId: org.id } }),
    prisma.apiKey.count({ where: { orgId: org.id, revokedAt: null } }),
  ]);

  const raw: ChecklistStep[] = [
    { id: "org", done: org.publisherParty.trim().length > 0, href: `${base}/settings`, minRole: "ADMIN" },
    // A recorded key, nothing less: a healthy service that cannot write its
    // keystore answers /health and fails /keys.
    { id: "key", done: Boolean(org.signingKeyHex), href: base, minRole: "ADMIN" },
    { id: "customers", done: customers > 0, href: `${base}/customers`, minRole: "OPERATOR" },
    { id: "publish", done: publications > 0, href: `${base}/publications/new`, minRole: "OPERATOR" },
    { id: "coverage", done: coverage > 0, href: `${base}/custody`, minRole: "OPERATOR" },
    { id: "members", done: members > 1, href: `${base}/members`, minRole: "ADMIN" },
    { id: "apiKey", done: apiKeys > 0, href: `${base}/api-keys`, minRole: "ADMIN" },
    { id: "publicPage", done: org.publicPage, href: `${base}/settings`, minRole: "ADMIN" },
  ];
  const steps = raw.map((s) => ({ ...s, href: atLeast(role, s.minRole) ? s.href : "" }));

  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}
