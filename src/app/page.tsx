import Link from "next/link";
import { CloudOff, GitBranch, History, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Footer } from "@/components/layout/footer";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SITE } from "@/lib/site";

const FEATURES = [
  {
    Icon: CloudOff,
    title: "Local-first",
    body: "Your browser is the source of truth. Open, edit, and close documents with zero network latency — even fully offline.",
  },
  {
    Icon: GitBranch,
    title: "Deterministic merges",
    body: "Conflict-free replicated data types (Yjs CRDTs) reconcile concurrent edits with mathematical guarantees. No lost words, ever.",
  },
  {
    Icon: History,
    title: "Time travel",
    body: "Capture named snapshots and restore any past version safely — without corrupting the shared state for active collaborators.",
  },
  {
    Icon: Users,
    title: "Granular roles",
    body: "Owner, Editor, and Viewer permissions enforced server-side and at the database row level. Viewers can read, never push.",
  },
  {
    Icon: ShieldCheck,
    title: "Hardened sync",
    body: "Every payload is strictly validated and size-bounded to prevent malformed or oversized data from crashing the server.",
  },
  {
    Icon: Sparkles,
    title: "AI assistance",
    body: "Summarise, rewrite, title, and explain what changed between versions — powered by Claude, streamed as you watch.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="mx-auto w-full max-w-6xl px-4 py-5 flex items-center justify-between">
        <span className="font-serif text-xl font-bold tracking-tight">
          {SITE.name}
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="text-sm font-medium hover:text-[var(--accent)] transition-colors px-3 py-2"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="text-sm font-medium rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] px-4 py-2 hover:opacity-90 transition-opacity"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pt-16 pb-20 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse-soft" />
            Offline-ready · Real-time · Versioned
          </p>
          <h1 className="font-serif text-5xl sm:text-6xl font-bold leading-[1.05] tracking-tight">
            The editor that never
            <span className="text-[var(--accent)]"> loses your words.</span>
          </h1>
          <p className="mt-6 text-lg text-[var(--text-muted)] max-w-xl mx-auto">
            {SITE.description}
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/register"
              className="rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] px-6 py-3 font-medium hover:opacity-90 transition-opacity"
            >
              Start writing
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-[var(--border)] px-6 py-3 font-medium hover:bg-[var(--surface-2)] transition-colors"
            >
              Sign in
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ Icon, title, body }) => (
              <div
                key={title}
                className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--accent)] mb-4">
                  <Icon size={20} aria-hidden />
                </div>
                <h3 className="font-semibold text-lg mb-1.5">{title}</h3>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
