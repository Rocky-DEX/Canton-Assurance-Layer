import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/db";

const PREFIX = "cal_";

/** A new key: shown to the operator once, stored only as a hash. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = PREFIX + randomBytes(24).toString("base64url");
  return { key, prefix: key.slice(0, PREFIX.length + 8), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Resolves a bearer key to its organisation, or null. The hash lookup is
 * indexed; the constant-time compare is belt and braces against a lookup
 * that ever became something other than an exact match.
 */
export async function orgForApiKey(bearer: string | null): Promise<{ orgId: string; keyId: string } | null> {
  if (!bearer || !bearer.startsWith(PREFIX)) return null;
  const hash = hashApiKey(bearer);
  const row = await prisma.apiKey.findUnique({ where: { hash }, select: { id: true, orgId: true, revokedAt: true, hash: true } });
  if (!row || row.revokedAt) return null;
  if (!timingSafeEqual(Buffer.from(row.hash), Buffer.from(hash))) return null;
  await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { orgId: row.orgId, keyId: row.id };
}
