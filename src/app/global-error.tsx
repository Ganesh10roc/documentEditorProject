"use client";

/**
 * Last-resort boundary for errors thrown in the root layout itself. It replaces
 * the entire document, so it must render its own <html>/<body>. Kept dependency-
 * free (no imports of app CSS/components, which may be what failed) with inline
 * styles so it renders even when the design system fails to load.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#faf9f5",
          color: "#1a1a17",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            The application crashed
          </h1>
          <p style={{ color: "#6b6862", marginTop: 8 }}>
            A critical error occurred. Please reload the page.
            {error.digest ? ` (ref: ${error.digest})` : ""}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: "#b8562f",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
