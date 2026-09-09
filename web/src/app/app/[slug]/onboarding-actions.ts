"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

/** Hides (or shows again) the getting-started checklist for the signed-in member. */
export async function setChecklistHiddenAction(slug: string, hidden: boolean): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!org) return;
  await prisma.membership.updateMany({
    where: { orgId: org.id, userId: session.user.id },
    data: { onboardingDismissedAt: hidden ? new Date() : null },
  });
  revalidatePath(`/app/${slug}`);
}
