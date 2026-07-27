import { z } from "zod";
import { ROLES } from "@/lib/constants";

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).default("Untitled document"),
});

export const renameDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Owner cannot be assigned via sharing; only editor/viewer are grantable.
  role: z.enum(["editor", "viewer"]),
});

export const updateMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
});

export const createSnapshotSchema = z.object({
  label: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).optional(),
  // The snapshot content itself is captured server-side from the authoritative
  // update log — never trusted from the client — so no `state` field here.
});

export const restoreSnapshotSchema = z.object({
  snapshotId: z.string().uuid(),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type CreateSnapshotInput = z.infer<typeof createSnapshotSchema>;
