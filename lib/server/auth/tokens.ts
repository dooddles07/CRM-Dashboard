import { createHash, randomBytes } from "node:crypto";

/**
 * Shared single-use-token shape for `invitations.token_hash` and
 * `password_reset_tokens.token_hash` (task-3-brief.md §2/§4, plan
 * §6.2/§7). Both need the same two properties: a high-entropy plaintext
 * token that exists only in the emailed/console link, and a hash of it
 * stored at rest so a database read alone can't reconstruct a usable
 * token.
 *
 * Hashing choice: SHA-256, not argon2, deliberately deviating from a
 * literal reading of task-3-brief.md §2's "argon2 hash it the same way
 * passwords are hashed". Argon2 (via `@node-rs/argon2`, see
 * lib/server/auth/index.ts's `ARGON2_PARAMS`) salts every call
 * differently by design — that's what makes it a good *password* hash
 * (defeats rainbow tables against a low-entropy secret) but also means
 * `hash(token) !== hash(token)` across two calls, so there is no
 * `WHERE token_hash = ?` query that could ever find a row by
 * re-hashing the presented token; the only way to "look up" an
 * argon2-hashed token is to fetch every non-expired row and call
 * `verify()` against each one. The brief's own accept-invitation section
 * flags exactly this: "if you used a keyed hash that can't be recomputed
 * and compared this way, you chose the wrong mechanism; token lookup must
 * be practical."
 *
 * A plain deterministic hash is the right tool here instead, and this
 * isn't a novel choice — it's what Better Auth's own verification-token
 * storage does when asked to hash an identifier before persisting it
 * (`defaultKeyHasher` in
 * node_modules/better-auth/dist/api/routes/password.mjs, and
 * node_modules/@better-auth/utils/dist/hash.*): `SHA-256`, base64url of
 * the digest. What makes this safe (unlike hashing a password with
 * SHA-256, which would be wrong) is that the *token* itself is the
 * high-entropy secret — 32 random bytes, 256 bits — not a human-chosen
 * password. The hash only needs to be irreversible and fast; the token's
 * own entropy is what resists brute force, the same reasoning session
 * tokens, API keys, and OAuth codes are conventionally hashed under
 * everywhere. Node's built-in `crypto.createHash` is used directly rather
 * than pulling in `@better-auth/utils` for one call — no new dependency,
 * same algorithm, and `scripts/seed.ts` already reaches for
 * `node:crypto`'s `createHash` for document checksums, so this isn't a
 * new pattern in this codebase either.
 */
export interface GeneratedToken {
  /** The plaintext token — goes in the emailed/console link, never persisted. */
  token: string;
  /** What actually gets stored, e.g. in `invitations.token_hash`. */
  tokenHash: string;
}

export function generateToken(): GeneratedToken {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/** Re-hashes a presented plaintext token for a `WHERE token_hash = ?` lookup. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
