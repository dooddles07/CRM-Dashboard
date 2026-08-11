import { holds, type AuthzSession } from "@/lib/server/authz/policy";

/**
 * plan/04-service-layer.md §3. Server-side masking.
 *
 * docs/SECURITY.md §3.3 is the requirement this discharges: **the API must
 * never send a value the caller has not revealed.** Masking used to be
 * presentational — `mask()` in lib/format.ts transformed a string the browser
 * already held, so the full value sat in the bundle and devtools read it
 * without an audit entry. These functions replace that: the server sends the
 * mask, and the plaintext never leaves Postgres except through
 * lib/server/services/reveal.ts.
 *
 * ## Built from fragments, not from plaintext
 *
 * Every mask below is composed from the *unencrypted* fragment columns —
 * `phone_last2`, `email_domain`, `address_city` (plan/01-foundation.md §4.1)
 * — never by decrypting and then hiding. That is the reason those columns
 * exist: rendering a list of 24 patients decrypts zero rows, which is plan
 * §11's "A list response for 24 patients decrypts zero rows".
 *
 * ## Why these do not reuse `mask()` from lib/format.ts
 *
 * plan §3's sketch calls `mask(row.emailDomain, "email")`, and that does not
 * work. `mask()` takes a *whole* value and removes from it; the fragments are
 * what is left after removal. Handing `"example.com"` to the email branch
 * makes it split on `@`, find no domain, and return `ex••••••@••••••` — the
 * local part leaked, the domain lost, the TLD gone.
 *
 * The fragments also cannot reproduce the client's shapes even in principle:
 * that email mask shows the first two characters of the local part, and the
 * phone mask shows the country code, and neither is stored. So these shapes
 * differ slightly from the demo's, and each difference discloses less:
 *
 *   client (from plaintext)      server (from fragments)
 *   ma••••••@••••••.com          ••••••@example.com
 *   +63 ••• ••• ••90             ••• ••• ••90
 *   ••••••••••, Quezon City      ••••••••••, Quezon City
 *
 * The address mask is unchanged, since `address_city` is exactly what the
 * client mask kept.
 */

const DOT = "•";

/** What every contact field looks like on the wire. Never a bare string. */
export interface MaskedField {
  masked: string;
  /**
   * Whether to draw a reveal affordance. plan §3: "A Marketing user sees the
   * mask with no affordance, because the server told the client there is
   * nothing to click." Not an access control — reveal.ts checks again.
   */
  revealable: boolean;
}

/** `+63 917 421 8890` stored as `phone_last2 = "90"` renders `••• ••• ••90`. */
export function maskPhone(last2: string | null): string {
  const tail = (last2 ?? "").slice(-2).padStart(2, DOT);
  return `${DOT.repeat(3)} ${DOT.repeat(3)} ${DOT.repeat(2)}${tail}`;
}

/**
 * `maria.santos@example.com` stored as `email_domain = "example.com"` renders
 * `••••••@example.com`. The whole local part is hidden — the fragment does
 * not contain it, so there is nothing to leak even by accident.
 */
export function maskEmailFromDomain(domain: string | null): string {
  if (!domain) return DOT.repeat(6);
  return `${DOT.repeat(6)}@${domain}`;
}

/** `18 Sampaguita St, Quezon City` stored as `address_city = "Quezon City"`. */
export function maskAddress(city: string | null): string {
  return city ? `${DOT.repeat(10)}, ${city}` : DOT.repeat(12);
}

/** `1981-03-14` renders `•• ••• 1981`. The year is not sensitive on its own; the day is. */
export function maskDateOfBirth(iso: string | null): string {
  const year = (iso ?? "").slice(0, 4);
  return year ? `${DOT.repeat(2)} ${DOT.repeat(3)} ${year}` : DOT.repeat(11);
}

/**
 * A mask for a column with **no fragment stored beside it**.
 *
 * `leads` holds `phone_encrypted` and `email_encrypted` but no `phone_last2`
 * or `email_domain` (lib/server/db/schema/pipeline.ts). plan/01-foundation.md
 * §4.1 added those fragments to `patients`, `staff` and `doctors` and not to
 * leads, so the masking approach in plan/04 §3 has nothing to build from
 * here.
 *
 * The alternative would be to decrypt in order to mask, which defeats the
 * entire reason the fragments exist — a lead list of any size would decrypt
 * every row to render dots. So a lead's contact renders as an unhinted mask:
 * the caller learns a value exists and can be revealed, and nothing else.
 *
 * If a lead list ever needs the same triage affordance a patient list has
 * (matching an inbound call against a record without a reveal), the fix is a
 * migration adding the fragments, not a decryption here.
 */
export function maskWithoutFragment(present: boolean): string {
  return present ? `${DOT.repeat(3)} ${DOT.repeat(3)} ${DOT.repeat(4)}` : "";
}

/**
 * The contact block a lead DTO carries. Same shape as `maskContact` so the
 * `Protected` component cannot tell the difference, but built from existence
 * rather than from fragments.
 */
export function maskLeadContact(
  session: AuthzSession,
  present: { phone: boolean; email: boolean },
): { phone: MaskedField; email: MaskedField } {
  const revealable = holds(session, "reveal");
  return {
    // Nothing to reveal when nothing is stored, whatever the role holds.
    phone: { masked: maskWithoutFragment(present.phone), revealable: revealable && present.phone },
    email: { masked: maskWithoutFragment(present.email), revealable: revealable && present.email },
  };
}

/**
 * The contact block every patient DTO carries, per plan §3.
 *
 * Takes the fragments individually rather than a row, so it cannot be handed
 * a Drizzle row and cannot accidentally read an encrypted column — plan §2.1
 * keeps row types unexported for the same reason.
 */
export function maskContact(
  session: AuthzSession,
  fragments: {
    phoneLast2: string | null;
    emailDomain?: string | null;
    addressCity?: string | null;
    dateOfBirth?: string | null;
  },
): {
  phone: MaskedField;
  email: MaskedField;
  address: MaskedField;
  dateOfBirth: MaskedField;
} {
  // One call, not four: `holds` is the same answer for every field, and
  // asking once makes it obvious that revealability is a property of the
  // session rather than of the field.
  const revealable = holds(session, "reveal");
  return {
    phone: { masked: maskPhone(fragments.phoneLast2), revealable },
    email: { masked: maskEmailFromDomain(fragments.emailDomain ?? null), revealable },
    address: { masked: maskAddress(fragments.addressCity ?? null), revealable },
    dateOfBirth: { masked: maskDateOfBirth(fragments.dateOfBirth ?? null), revealable },
  };
}
