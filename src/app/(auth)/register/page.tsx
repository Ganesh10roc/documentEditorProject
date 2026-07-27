"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { SITE } from "@/lib/site";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Prefill the email when arriving from an invitation link (/register?email=…).
  // Read from the URL directly to avoid needing a Suspense boundary.
  useEffect(() => {
    const invited = new URLSearchParams(window.location.search).get("email");
    if (invited) setEmail(invited);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? "Registration failed.");
        setLoading(false);
        return;
      }
      // Auto-sign-in after successful registration.
      await signIn("credentials", { email, password, redirect: false });
      router.push("/documents");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="font-serif text-2xl font-bold tracking-tight block text-center mb-8"
        >
          {SITE.name}
        </Link>
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6">
          <h1 className="text-xl font-semibold mb-1">Create your account</h1>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Start writing in seconds.
          </p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                At least 8 characters.
              </p>
            </div>
            {error && (
              <p className="text-sm text-[var(--danger)]" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 size={16} className="animate-spin" />}
              Create account
            </Button>
          </form>
        </div>
        <p className="text-sm text-center text-[var(--text-muted)] mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--accent)] font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
