import { auth } from "./index";
import { UnauthorizedError } from "@/server/errors";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Resolve the authenticated user, or `null`. For use in route handlers that
 * want to branch on auth state.
 */
export async function getUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
  };
}

/** Resolve the user or throw — the caller's try/catch maps it to a 401. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
