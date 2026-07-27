import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { credentialsSchema } from "@/server/validation/auth";
import { verifyPassword } from "./password";
import { authConfig } from "./config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        // Validate shape first — never trust the client form payload.
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Unscoped lookup: there is no user context yet at login time.
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        // Constant-ish time: always run a compare to blunt user enumeration.
        const hash =
          user?.passwordHash ??
          "$2a$12$0000000000000000000000000000000000000000000000000000";
        const valid = await verifyPassword(password, hash);
        if (!user || !valid) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
});
