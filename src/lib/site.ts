/**
 * Site-wide metadata and author credits.
 *
 * ▸ Submission requirement: the footer must show your name, GitHub, and
 *   LinkedIn. Update the AUTHOR block below with your real profile URLs.
 */
export const SITE = {
  name: "Palimpsest",
  tagline: "A local-first collaborative editor that never loses your words.",
  description:
    "Write offline, sync deterministically, and travel through your document's history. " +
    "Built with Next.js 16, Yjs CRDTs, and PostgreSQL.",
} as const;

export const AUTHOR = {
  name: "Ganesh Sriramula",
  github: "https://github.com/Ganesh10roc",
  linkedin: "https://www.linkedin.com/in/sriramulaganesh",
  email: "sriramulaganesh375@gmail.com",
} as const;
