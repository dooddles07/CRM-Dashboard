import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveSession } from "@/lib/server/auth/session";

/**
 * plan/02-authentication.md §4.1. Next 16 renamed `middleware.ts` to
 * `proxy.ts` — verified against
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 * ("Middleware is deprecated and has been renamed to Proxy") and
 * .../01-getting-started/16-proxy.md. The runtime is Node by default and
 * not configurable — exporting `runtime` here throws, per the same doc's
 * "Runtime" section, so this file must not (and does not) set one; it's
 * also why calling `resolveSession`, which touches the database and
 * `@node-rs/argon2`-adjacent auth machinery, is safe here at all.
 *
 * This is the optimistic, redirect-based enforcement layer — plan §4.1 is
 * explicit that it is "not the only check": every server shell and
 * service also calls `requireSession()` (lib/server/auth/session.ts),
 * because "a matcher typo is a silent hole and a missing function
 * argument is a compile error." Both layers share `resolveSession`'s
 * implementation so they can't disagree about what "valid" means.
 *
 * The plan's own proxy.ts sketch additionally checks
 * `session.user.twoFactorVerified` and redirects to `/mfa` when it's
 * false, labelled illustrative ("verify against the real API"). That
 * field does not exist in this better-auth version (grepped the full
 * `better-auth`/`@better-auth/core` dist trees — no hit) and the
 * mechanism it was standing in for works differently: the `twoFactor`
 * plugin (node_modules/better-auth/dist/plugins/two-factor/index.mjs)
 * deletes the session `/sign-in/email` just created and swaps in a
 * short-lived, session-less challenge cookie instead whenever
 * `user.twoFactorEnabled` is true, so *no session exists at all* while a
 * TOTP challenge is pending — there is nothing for proxy to distinguish
 * here. `resolveSession` finding no session is already the correct
 * "send them to sign in" signal; the sign-in Server Action (Task 4) is
 * what redirects a `{ twoFactorRedirect: true }` response straight to
 * `/mfa` without ever routing that through proxy at all.
 */
export const config = {
  matcher: [
    // Excludes: static assets, image optimisation, favicon/icon files,
    // and every screen under app/(auth)/* — task-2-brief.md §2: "this app
    // has more public routes than just /login and /forgot-password ...
    // exclude all of app/(auth)/*, not just the two named in the plan's
    // snippet." Only login, mfa, forgot-password exist as folders today
    // (checked app/(auth)/layout.tsx's route group); reset-password and
    // accept-invite are listed pre-emptively so Task 3 adding those
    // screens doesn't silently start gating them. `api` is excluded too:
    // no /api/auth route is mounted in this worktree yet (see
    // lib/server/auth/index.ts's `nextCookies()` comment), but Better
    // Auth's own token-callback URLs (e.g. the password-reset email link)
    // are unauthenticated by nature, and this keeps the matcher correct
    // if/when Task 3 mounts app/api/auth/[...all]/route.ts.
    "/((?!api|_next/static|_next/image|favicon|icon\\.svg|login|mfa|forgot-password|reset-password|accept-invite).*)",
  ],
};

export async function proxy(request: NextRequest) {
  const authed = await resolveSession(request.headers);
  if (!authed) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}
