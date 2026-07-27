import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-[70vh] grid place-items-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--accent)]">
          <FileQuestion size={24} aria-hidden />
        </div>
        <h1 className="font-serif text-2xl font-bold tracking-tight">
          Page not found
        </h1>
        <p className="mt-2 text-[var(--text-muted)]">
          This page doesn&apos;t exist, or the document may have been deleted or
          un-shared with you.
        </p>
        <Link
          href="/documents"
          className="mt-6 inline-block rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--accent-contrast)] hover:opacity-90 transition-opacity"
        >
          Back to your documents
        </Link>
      </div>
    </main>
  );
}
