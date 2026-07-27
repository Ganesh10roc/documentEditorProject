"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoleBadge } from "@/components/documents/role-badge";
import { colorFromString, initials } from "@/lib/utils";
import type { Role } from "@/lib/constants";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

interface Invite {
  id: string;
  email: string;
  role: "editor" | "viewer";
  createdAt: string;
}

export function ShareDialog({
  documentId,
  callerRole,
  currentUserId,
  onClose,
}: {
  documentId: string;
  callerRole: Role;
  currentUserId: string;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isOwner = callerRole === "owner";
  const router = useRouter();

  async function leaveDocument() {
    setLeaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/leave`, {
        method: "POST",
      });
      if (res.ok) {
        router.push("/documents");
        router.refresh();
      } else {
        setLeaving(false);
      }
    } catch {
      setLeaving(false);
    }
  }

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/documents/${documentId}/members`);
    if (res.ok) {
      const { data } = await res.json();
      setMembers(data.members);
      setInvites(data.invites ?? []);
    }
    setLoading(false);
  }

  async function removeInvite(inviteId: string) {
    await fetch(`/api/documents/${documentId}/invites/${inviteId}`, {
      method: "DELETE",
    });
    await load();
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? "Could not share.");
        return;
      }
      setNotice(
        body?.data?.kind === "invite"
          ? `Invitation sent to ${body.data.email}. They'll get access when they sign up.`
          : "Added to the document."
      );
      setEmail("");
      await load();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, newRole: Role) {
    await fetch(`/api/documents/${documentId}/members/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await load();
  }

  async function removeMember(userId: string) {
    await fetch(`/api/documents/${documentId}/members/${userId}`, {
      method: "DELETE",
    });
    await load();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Share document"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Share document</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>

        {isOwner && (
          <form onSubmit={addMember} className="flex gap-2 mb-4">
            <Input
              type="email"
              placeholder="Invite by email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
              aria-label="Role"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button type="submit" size="icon" disabled={busy} aria-label="Add">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            </Button>
          </form>
        )}

        {error && (
          <p className="text-sm text-[var(--danger)] mb-3" role="alert">
            {error}
          </p>
        )}

        {notice && (
          <p className="text-sm text-[var(--accent)] mb-3" role="status">
            {notice}
          </p>
        )}

        {loading ? (
          <div className="py-8 grid place-items-center text-[var(--text-muted)]">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-auto">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3">
                <div
                  className="h-8 w-8 rounded-full grid place-items-center text-xs font-semibold text-white shrink-0"
                  style={{ background: colorFromString(m.email) }}
                >
                  {initials(m.name || m.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {m.name}
                    {m.userId === currentUserId && (
                      <span className="text-[var(--text-muted)]"> (you)</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {m.email}
                  </p>
                </div>
                {isOwner && m.role !== "owner" ? (
                  <div className="flex items-center gap-1">
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.userId, e.target.value as Role)}
                      className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 text-xs"
                      aria-label={`Role for ${m.name}`}
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMember(m.userId)}
                      aria-label={`Remove ${m.name}`}
                    >
                      <Trash2 size={15} className="text-[var(--danger)]" />
                    </Button>
                  </div>
                ) : (
                  <RoleBadge role={m.role} />
                )}
              </li>
            ))}
          </ul>
        )}

        {invites.length > 0 && (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <p className="text-xs font-medium text-[var(--text-muted)] mb-2">
              Pending invitations
            </p>
            <ul className="space-y-2">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3">
                  <div
                    className="h-8 w-8 rounded-full grid place-items-center text-xs font-semibold text-white shrink-0"
                    style={{ background: colorFromString(inv.email) }}
                  >
                    {initials(inv.email)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{inv.email}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Invited · hasn&apos;t signed up yet
                    </p>
                  </div>
                  <RoleBadge role={inv.role} />
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeInvite(inv.id)}
                      aria-label={`Revoke invite for ${inv.email}`}
                    >
                      <Trash2 size={15} className="text-[var(--danger)]" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isOwner && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={leaveDocument}
              disabled={leaving}
              className="text-[var(--danger)] hover:bg-[var(--danger)]/10"
            >
              {leaving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <LogOut size={15} />
              )}
              Leave this document
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
