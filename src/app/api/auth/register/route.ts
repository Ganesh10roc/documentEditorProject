import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { registerSchema } from "@/server/validation/auth";
import { hashPassword } from "@/server/auth/password";
import { acceptInvitesForEmail } from "@/server/services/invites";
import { fail, handle, invalid, ok } from "@/server/http/responses";
import { rateLimit } from "@/server/http/rate-limit";
import { clientIp } from "@/server/http/params";
import { ZodError } from "zod";

export const runtime = "nodejs";

export function POST(req: NextRequest) {
  return handle(async () => {
    // Throttle signups per IP to blunt automated account creation. Normalise the
    // (possibly multi-hop, spoofable) XFF header to the left-most client IP so
    // the bucket key can't be splintered by appending proxy values.
    const ip = clientIp(req.headers.get("x-forwarded-for"));
    const rl = rateLimit(`register:${ip}`, 5, 60_000);
    if (!rl.allowed) return fail(429, "rate_limited", "Too many attempts");

    let parsed;
    try {
      parsed = registerSchema.parse(await req.json());
    } catch (e) {
      if (e instanceof ZodError) return invalid(e);
      return fail(400, "bad_request", "Invalid JSON body");
    }

    const { email, name, password } = parsed;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing[0]) {
      return fail(409, "email_taken", "An account with that email already exists");
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({ email, name, passwordHash })
      .returning({ id: users.id, email: users.email, name: users.name });

    // Grant any documents this email was invited to before signing up. Non-fatal:
    // a failure here must not fail an otherwise-successful registration.
    try {
      await acceptInvitesForEmail(user!.id, user!.email);
    } catch (e) {
      console.error("[register] accepting invites failed:", e);
    }

    return ok({ user }, { status: 201 });
  });
}
