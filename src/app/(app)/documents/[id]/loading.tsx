/** Skeleton shown while the editor page resolves the document + role. */
export default function EditorLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6" aria-busy="true" aria-label="Loading document">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="h-5 w-24 rounded bg-[var(--surface-2)] animate-pulse-soft" />
        <div className="h-8 flex-1 min-w-[200px] rounded-md bg-[var(--surface-2)] animate-pulse-soft" />
        <div className="h-7 w-40 rounded-full bg-[var(--surface-2)] animate-pulse-soft" />
      </div>
      <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-6 py-8 sm:px-10">
        <div className="space-y-3">
          <div className="h-7 w-2/3 rounded bg-[var(--surface-2)] animate-pulse-soft" />
          <div className="h-4 w-full rounded bg-[var(--surface-2)] animate-pulse-soft" />
          <div className="h-4 w-11/12 rounded bg-[var(--surface-2)] animate-pulse-soft" />
          <div className="h-4 w-4/5 rounded bg-[var(--surface-2)] animate-pulse-soft" />
        </div>
      </div>
    </div>
  );
}
