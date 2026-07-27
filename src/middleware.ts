import NextAuth from "next-auth";
import { authConfig } from "@/server/auth/config";

// Edge-safe auth (no DB/bcrypt) — only the `authorized` callback runs here to
// redirect unauthenticated users away from protected routes.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
  // The `authorized` callback in authConfig decides access; when it returns
  // false for a protected route, next-auth issues the redirect to /login.
  void req;
});

export const config = {
  // Run on everything except static assets, API auth, and image optimisation.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
