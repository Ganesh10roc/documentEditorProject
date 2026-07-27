/** Skeleton shown while the documents list is fetched server-side. */
export default function DocumentsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10" aria-busy="true" aria-label="Loading documents">
      <div className="mb-8 flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded-md bg-[var(--surface-2)] animate-pulse-soft" />
          <div className="h-4 w-24 rounded bg-[var(--surface-2)] animate-pulse-soft" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-[var(--surface-2)] animate-pulse-soft" />
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="h-36 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <div className="mb-3 h-5 w-5 rounded bg-[var(--surface-2)] animate-pulse-soft" />
            <div className="mb-2 h-5 w-3/4 rounded bg-[var(--surface-2)] animate-pulse-soft" />
            <div className="h-3 w-1/2 rounded bg-[var(--surface-2)] animate-pulse-soft" />
          </li>
        ))}
      </ul>
    </div>
  );
}
