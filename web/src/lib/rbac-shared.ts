import type { Role } from "@prisma/client";

/** Role ordering usable from client components (no database import). */
export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  AUDITOR: 2,
  OPERATOR: 3,
  ADMIN: 4,
  OWNER: 5,
};

export function atLeast(have: Role, want: Role): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[want];
}
