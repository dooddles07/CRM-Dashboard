import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, or, gt } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { apiTokens } from "@/lib/server/db/schema/api";
import { staff } from "@/lib/server/db/schema/people";
import { authzSession, type AuthzSession } from "@/lib/server/authz/policy";

/**
 * plan/05-http-api.md §4. Machine callers.
 *
 * A token inherits the role and department of the staff member it belongs to,
 * so row-level security and the policy matrix apply to it unchanged. There is
 * no `role` column on `api_tokens` for that reason: a token carrying its own
 * role would be a second place privileges are decided, and the two would
 * disagree the first time somebody changed a staff member's role without
 * thinking about their tokens.
 *
 * **Scopes narrow, never widen.** A scope cannot grant something the staff
 * member's role does not already allow; it can only remove. That ordering is
 * what makes a leaked token strictly less dangerous than the account it
 * belongs to, rather than a parallel identity with its own reach.
 */

/** The operations a token may be granted. Deliberately coarse. */
export const TOKEN_SCOPES = [
  "patients:read",
  "patients:write",
  "appointments:read",
  "appointments:write",
  "pipeline:read",
  "pipeline:write",
  "reports:read",
] as const;

export type TokenScope = (typeof TOKEN_SCOPES)[number];

/**
 * plan §4: "No token may hold `reveal`."
 *
 * There is no `reveal` scope in the list above, and this constant exists to
 * say why rather than leaving it to be inferred from an absence. Automated
 * bulk decryption is exactly the threat docs/SECURITY.md §4 names as bulk
 * exfiltration, and no integration has a legitimate need — an integration
 * that genuinely needs a phone number needs a human to reveal it and an audit
 * entry against that human's name.
 *
 * `authenticateToken` sets `impersonated: true` on the session it builds,
 * which makes `holds(session, "reveal")` return false through the same code
 * path that blocks impersonation. One mechanism, two callers: a machine and
 * an impersonator are both "acting without a person present to be accountable
 * for the disclosure", and that is precisely the condition reveal requires.
 */
export const TOKENS_MAY_NOT_REVEAL = true;

const PREFIX = "cf_";

/** SHA-256, not argon2 — see the schema comment for why a slow hash buys nothing here. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedToken {
  /** Shown once. Never stored, never recoverable. */
  token: string;
  id: string;
  name: string;
  scopes: TokenScope[];
  expiresAt: string | null;
}

/**
 * Mints a token for a staff member.
 *
 * 32 bytes of entropy, base64url. The `cf_` prefix exists so that a token
 * pasted into a chat or a log is recognisable as a credential by secret
 * scanners — GitHub's push protection and similar tools match on prefixes,
 * and an unprefixed random string is invisible to them.
 */
export async function issue(input: {
  staffId: string;
  name: string;
  scopes: TokenScope[];
  expiresAt?: Date | null;
}): Promise<IssuedToken> {
  const token = `${PREFIX}${randomBytes(32).toString("base64url")}`;

  const [row] = await db
    .insert(apiTokens)
    .values({
      name: input.name,
      tokenHash: hashToken(token),
      staffId: input.staffId,
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
    })
    .returning({ id: apiTokens.id });

  return {
    token,
    id: row.id,
    name: input.name,
    scopes: input.scopes,
    expiresAt: input.expiresAt?.toISOString() ?? null,
  };
}

export interface TokenIdentity {
  session: AuthzSession;
  tokenId: string;
  scopes: TokenScope[];
}

/**
 * Resolves `Authorization: Bearer <token>` to a session, or `null`.
 *
 * Runs on `db` rather than inside `withSession`, and must: the whole point is
 * to discover *who* is asking, and there is no session context to declare
 * until that is known. `api_tokens` therefore carries no row-level security,
 * for the same reason the Better Auth tables do not.
 *
 * Returns null for revoked, expired, and unknown alike. A caller learns only
 * that the token did not work, never which of the three it was.
 */
export async function authenticateToken(header: string | null): Promise<TokenIdentity | null> {
  if (!header?.startsWith("Bearer ")) return null;
  const presented = header.slice("Bearer ".length).trim();
  if (!presented.startsWith(PREFIX)) return null;

  const [row] = await db
    .select({
      id: apiTokens.id,
      scopes: apiTokens.scopes,
      staffId: staff.id,
      role: staff.role,
      departmentId: staff.departmentId,
      staffStatus: staff.status,
    })
    .from(apiTokens)
    .innerJoin(staff, eq(staff.id, apiTokens.staffId))
    .where(
      and(
        eq(apiTokens.tokenHash, hashToken(presented)),
        isNull(apiTokens.revokedAt),
        or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, new Date())),
      ),
    )
    .limit(1);

  if (!row) return null;
  // A suspended staff member's tokens stop working with them. Revoking each
  // one by hand at suspension time would be a step somebody forgets.
  if (row.staffStatus !== "active") return null;

  // Deliberately not awaited-in-band as part of the auth decision: a failed
  // bookkeeping write must not fail an otherwise valid request.
  void db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => undefined);

  return {
    session: authzSession({
      staffId: row.staffId,
      role: row.role,
      departmentId: row.departmentId,
      // See TOKENS_MAY_NOT_REVEAL. This is what stops a token revealing.
      impersonated: true,
    }),
    tokenId: row.id,
    scopes: (row.scopes ?? []) as TokenScope[],
  };
}

/** Whether a token's scopes permit an operation. Narrowing only — the role still decides. */
export function tokenPermits(scopes: TokenScope[], required: TokenScope): boolean {
  return scopes.includes(required);
}

export async function revoke(tokenId: string): Promise<void> {
  await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, tokenId));
}
