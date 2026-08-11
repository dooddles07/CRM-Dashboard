import { requireSession } from "@/lib/server/auth/session";
import { permissionSet, type PermissionSet } from "./policy";
import type { Role } from "./matrix";

/**
 * plan/03-authorisation.md §3.1. What the app shell is handed about the
 * person using it, and the shape `GET /me` serves in Phase 05.
 *
 * Everything here crosses into a Client Component, so everything here is
 * safe to be seen by the person it describes and nothing else: their own
 * name, their own role, their own email, their own permission set. No
 * `user.id`, no session token, and nothing about anybody else.
 *
 * `email` comes from Better Auth's `user` row, which stores it in plaintext
 * because Better Auth looks accounts up by it. `staff.email_encrypted` is
 * the encrypted copy and is not read here — decrypting is Phase 04's reveal
 * path, and this needs no such thing for the caller's own address.
 *
 * `permissions` is a courtesy for drawing, per §3.1 and docs/SECURITY.md
 * §3.2 — "UI hiding stays as a courtesy. A hidden button is not an access
 * control." Nothing on the server may read it back from the client.
 */
export interface Viewer {
  staffId: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  departmentId: string | null;
  impersonated: boolean;
  permissions: PermissionSet;
}

/**
 * The session as the shell needs it, or `null` when there is none.
 *
 * Returns null rather than redirecting for the same reason
 * `requireSession()` does: redirecting is presentation-layer behaviour, and
 * the caller — app/(app)/layout.tsx — is the layer that knows where to send
 * someone. proxy.ts will normally have redirected already; this is the
 * per-request check that runs regardless, since "a matcher typo is a silent
 * hole" (plan/02-authentication.md §4.1).
 */
export async function currentViewer(): Promise<Viewer | null> {
  const authed = await requireSession();
  if (!authed) return null;

  return {
    staffId: authed.authz.staffId,
    name: authed.staff.name,
    initials: authed.staff.initials,
    email: authed.user.email,
    role: authed.authz.role,
    departmentId: authed.authz.departmentId,
    impersonated: authed.authz.impersonated,
    permissions: permissionSet(authed.authz),
  };
}
