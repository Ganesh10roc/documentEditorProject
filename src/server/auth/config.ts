import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe base configuration. Contains NO database or bcrypt access so it can
 * run inside Next.js middleware (Edge runtime). The credentials provider — which
 * needs Node APIs — is added only in the full config (./index.ts).
 */
export const authConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 }, // 30 days
  pages: {
    signIn: "/login",
    error: "/login",
  },
  trustHost: true,
  callbacks: {
    // Persist the user id + name onto the JWT at sign-in.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
      }
      return token;
    },
    // Expose the id on the session object for server components / API routes.
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
    // Gate the entire /app area; used by middleware.
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;
      const isProtected =
        pathname.startsWith("/documents") || pathname === "/app";
      if (isProtected) return isLoggedIn;
      return true;
    },
  },
  providers: [], // populated in ./index.ts
} satisfies NextAuthConfig;
