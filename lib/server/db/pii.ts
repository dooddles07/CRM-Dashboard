import { sql } from "drizzle-orm";

/**
 * Task 3 (plan/02-authentication.md §6/§7). The exact `pgp_sym_encrypt`
 * pattern `scripts/seed.ts` uses for `staff.emailEncrypted` and friends,
 * extracted here so `scripts/provision.ts`, `lib/server/auth/invitations.ts`,
 * and `lib/server/auth/password-reset.ts` — three call sites, per
 * task-3-brief.md §1 — don't each reinvent it. `scripts/seed.ts` itself is
 * left as-is (out of scope for this task; its own copy stays authoritative
 * for how seeding does it).
 *
 * Reads `PII_ENCRYPTION_KEY` at import time and throws if it's missing, the
 * same fail-fast shape `scripts/seed.ts` uses — every consumer of this
 * module needs the key, so there's no case where importing it should
 * succeed without one.
 */
const PII_KEY = process.env.PII_ENCRYPTION_KEY;
if (!PII_KEY) {
  throw new Error(
    "lib/server/db/pii: PII_ENCRYPTION_KEY is not set. It backs every phone/email/address column " +
      "(plan/01-foundation.md §4.1) and must be present before this module is used.",
  );
}

/** `pgp_sym_encrypt` runs in Postgres, not Node — the key never holds plaintext in JS memory longer than necessary. */
export function encryptPii(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  return sql`pgp_sym_encrypt(${value}, ${PII_KEY})`;
}

/** Same as `encryptPii`, typed for NOT NULL contact columns (`staff.emailEncrypted` and friends). */
export function encryptPiiRequired(value: string) {
  return sql`pgp_sym_encrypt(${value}, ${PII_KEY})`;
}

/** `staff.emailDomain` / `outbound_messages`-adjacent domain extraction, same rule as `scripts/seed.ts`'s `domainOf()`. */
export function emailDomainOf(email: string): string {
  return email.split("@")[1] ?? "";
}

/**
 * `outbound_messages.to_masked` — no existing masking convention elsewhere
 * in the codebase to match (checked: nothing renders a masked email today,
 * only `patients.phone_last2` / `address_city` for phone/address). Keeps
 * the first character of the local part and the whole domain, e.g.
 * `j***@example.com` — enough to recognise "yes, that's the right inbox"
 * in a sandbox console log / outbound_messages row without exposing the
 * full address. This exact shape is a judgment call (task-3-report.md).
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const maskedLocal = local.length <= 1 ? "*" : `${local[0]}${"*".repeat(local.length - 1)}`;
  return `${maskedLocal}@${domain}`;
}
