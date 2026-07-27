"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { colorFromString, initials } from "@/lib/utils";
import { SITE } from "@/lib/site";

export function AppHeader({ user }: { user: { name: string; email: string } }) {
  return (
    <header className="border-b border-[var(--border)] sticky top-0 z-30 bg-[var(--bg)]/85 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <Link
          href="/documents"
          className="font-serif text-lg font-bold tracking-tight"
        >
          {SITE.name}
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div
            className="h-8 w-8 rounded-full grid place-items-center text-xs font-semibold text-white"
            style={{ background: colorFromString(user.email) }}
            title={`${user.name} (${user.email})`}
            aria-label={user.name}
          >
            {initials(user.name || user.email)}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut({ callbackUrl: "/" })}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={18} />
          </Button>
        </div>
      </div>
    </header>
  );
}
