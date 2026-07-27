import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/server/errors";

/** Uniform JSON success envelope. */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

/** Uniform JSON error envelope with an application error code. */
export function fail(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...extra } },
    { status }
  );
}

export const tooLarge = (msg = "Payload too large") =>
  fail(413, "payload_too_large", msg);

/** Translate a ZodError into a 422 with field-level detail. */
export function invalid(err: ZodError) {
  return fail(422, "validation_error", "Invalid request payload", {
    issues: err.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  });
}

/**
 * Wrap an async handler so uncaught errors never leak stack traces. Domain
 * errors carry their own status/code (see AppError) and map straight through;
 * anything else is a genuine 500.
 */
export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((err: unknown) => {
    if (err instanceof ZodError) return invalid(err);
    if (err instanceof AppError) return fail(err.status, err.code, err.message);
    console.error("[api] unhandled error:", err);
    return fail(500, "internal_error", "Something went wrong");
  });
}
