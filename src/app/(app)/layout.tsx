import { redirect } from "next/navigation";
import { getUser } from "@/server/auth/session";
import { AppHeader } from "@/components/layout/app-header";
import { Footer } from "@/components/layout/footer";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:rounded-lg focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-[var(--accent-contrast)] focus:font-medium"
      >
        Skip to content
      </a>
      <AppHeader user={{ name: user.name, email: user.email }} />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <Footer />
    </div>
  );
}
