import { Github, Linkedin, Mail } from "lucide-react";
import { AUTHOR, SITE } from "@/lib/site";

/**
 * Submission requirement: name, GitHub, and LinkedIn in the footer.
 * Edit these values in src/lib/site.ts.
 */
export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] mt-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
        <p>
          {SITE.name} — built by{" "}
          <span className="font-medium text-[var(--text)]">{AUTHOR.name}</span>
        </p>
        <nav className="flex items-center gap-4" aria-label="Author links">
          <a
            href={AUTHOR.github}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors"
          >
            <Github size={16} aria-hidden /> GitHub
          </a>
          <a
            href={AUTHOR.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors"
          >
            <Linkedin size={16} aria-hidden /> LinkedIn
          </a>
          <a
            href={`mailto:${AUTHOR.email}`}
            className="inline-flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors"
          >
            <Mail size={16} aria-hidden /> Email
          </a>
        </nav>
      </div>
    </footer>
  );
}
