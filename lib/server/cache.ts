import { revalidateTag, updateTag } from "next/cache";

/**
 * plan/04-service-layer.md §8. Cache invalidation, and the Next 16 API change
 * the plan warns about.
 *
 * | Need                                    | API                        |
 * |-----------------------------------------|----------------------------|
 * | Read-your-writes after a Server Action  | `updateTag(tag)`           |
 * | Background staleness is acceptable      | `revalidateTag(tag, prof)` |
 *
 * **`revalidateTag` takes two arguments now.** Verified against
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md:
 * the signature is `revalidateTag(tag: string, profile: string | { expire?:
 * number })`, and the single-argument form is deprecated — it expires the
 * entry immediately, making the next request a blocking cache miss. The
 * recommended profile is `"max"`, which marks the tag stale and serves the
 * stale copy while fresh content loads.
 *
 * `updateTag` is Server-Action-only and expires immediately, which is what
 * read-your-own-writes needs: the person who just archived a patient must not
 * see it in the list on the next render. `revalidateTag` is for everything
 * else, where a few seconds of staleness costs nothing.
 *
 * plan §8 also notes the shape of this product limits how much tagging buys:
 * "Most screens in this product are per-user and uncacheable, so tagging is
 * thinner than it looks." Every `(app)` route is `force-dynamic` and every
 * query runs under a per-caller RLS context, so two staff members cannot
 * share a cache entry for a patient list at all. These tags therefore matter
 * for the genuinely shared, non-scoped reads — the department directory, the
 * integration catalogue — and for the router cache, not for patient data.
 */

/**
 * Tags are per-resource and per-record, per plan §8:
 *
 *     patients            patients:PT-102938
 *     appointments        appointments:AP-40871
 *     notifications:u-001
 *
 * Built through these helpers rather than typed as strings at call sites, so
 * a typo is a compile error rather than a cache entry that is never
 * invalidated — the failure mode of a mistyped tag is silent and permanent
 * staleness, which is hard to notice and harder to attribute.
 */
export const tags = {
  patients: () => "patients",
  patient: (reference: string) => `patients:${reference}`,
  appointments: () => "appointments",
  appointment: (reference: string) => `appointments:${reference}`,
  leads: () => "leads",
  lead: (reference: string) => `leads:${reference}`,
  followUps: () => "follow-ups",
  tasks: () => "tasks",
  conversations: () => "conversations",
  conversation: (reference: string) => `conversations:${reference}`,
  complaints: () => "complaints",
  complaint: (reference: string) => `complaints:${reference}`,
  feedback: () => "feedback",
  campaigns: () => "campaigns",
  campaign: (reference: string) => `campaigns:${reference}`,
  workflows: () => "workflows",
  workflow: (reference: string) => `workflows:${reference}`,
  integrations: () => "integrations",
  departments: () => "departments",
  doctors: () => "doctors",
  staff: () => "staff",
  /** Per staff member — nobody shares a notification cache entry. */
  notifications: (staffId: string) => `notifications:${staffId}`,
  preferences: (staffId: string) => `preferences:${staffId}`,
} as const;

/**
 * Read-your-own-writes. Call from a Server Action after a write, with every
 * tag the write touched — usually the collection and the record.
 *
 * ```ts
 * await patients.archive(session, reference, reason, context);
 * invalidateNow(tags.patients(), tags.patient(reference));
 * ```
 *
 * `updateTag` throws outside a Server Action, which is the correct behaviour
 * rather than something to guard against: a route handler wanting this
 * semantics is a route handler that should be an action.
 */
export function invalidateNow(...list: string[]): void {
  for (const tag of list) updateTag(tag);
}

/**
 * Background invalidation, for writes whose readers can tolerate a moment of
 * staleness — a job finishing, a webhook landing.
 *
 * Always passes a profile. The one-argument form still compiles in some
 * versions and is deprecated; wrapping it here means no call site has to
 * remember, and plan §11's "revalidateTag is never called with one argument"
 * is true by construction rather than by review.
 */
export function invalidateSoon(...list: string[]): void {
  for (const tag of list) revalidateTag(tag, "max");
}
