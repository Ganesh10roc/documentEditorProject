"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-segment error boundary. Catches render/runtime errors in the app tree
 * and offers recovery (retry via `reset`, or navigate home) instead of a blank
 * screen. Digest is logged for correlation with server logs.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] route error:", error);
  }, [error]);

  return (
    <main className="min-h-[70vh] grid place-items-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--danger)]/12 text-[var(--danger)]">
          <TriangleAlert size={24} aria-hidden />
        </div>
        <h1 className="font-serif text-2xl font-bold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-2 text-[var(--text-muted)]">
          An unexpected error occurred. Your local edits are safe in this
          browser — nothing was lost.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={reset}>
            <RotateCcw size={16} /> Try again
          </Button>
          <Link
            href="/documents"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] transition-colors"
          >
            Back to documents
          </Link>
        </div>
      </div>
    </main>
  );
}
