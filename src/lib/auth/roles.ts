import type { Role } from "@/generated/prisma/client";

/** Role hierarchy and auth errors. Kept free of Auth.js imports so it can be used anywhere. */
const RANK: Record<Role, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };
export const hasRole = (role: Role, min: Role) => RANK[role] >= RANK[min];

export class AuthError extends Error {
  constructor(public status: 401 | 403, message = status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN") {
    super(message);
  }
}
