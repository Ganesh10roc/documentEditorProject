import { handlers } from "@/server/auth";

export const { GET, POST } = handlers;

// Auth.js touches the DB (credentials provider) and bcrypt — force Node runtime.
export const runtime = "nodejs";
