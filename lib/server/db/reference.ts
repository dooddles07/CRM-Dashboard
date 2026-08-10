import { randomInt } from "node:crypto";

/**
 * Business identifiers, e.g. PT-102938. Not sequential — a receptionist
 * must not be able to enumerate patients by decrementing one. Each call
 * draws a random number in the prefix's configured width and retries on
 * collision, so the space is sparse without needing a per-prefix sequence
 * object. See plan/01-foundation.md §3.1.
 */
export const REFERENCE_PREFIXES = {
  patient: "PT",
  doctor: "dr",
  staff: "u",
  appointment: "AP",
  lead: "LD",
  referral: "RF",
  followUp: "FU",
  task: "TS",
  conversation: "CV",
  feedback: "FB",
  complaint: "CS",
  campaign: "CMP",
  workflow: "WF",
  document: "DOC",
  audit: "a",
} as const;

export type ReferenceKind = keyof typeof REFERENCE_PREFIXES;

// Digits after the prefix. Wide enough that collisions stay rare at this
// product's scale while keeping references short enough to read aloud.
const DIGIT_WIDTH: Partial<Record<ReferenceKind, number>> = {
  workflow: 2,
};
const DEFAULT_DIGIT_WIDTH = 6;

function randomDigits(width: number): string {
  const max = 10 ** width;
  return randomInt(0, max).toString().padStart(width, "0");
}

/**
 * Generates a reference for `kind`, retrying against `exists` (typically a
 * `SELECT 1 FROM … WHERE reference = $1` lookup) until it finds one that is
 * not already taken.
 */
export async function generateReference(
  kind: ReferenceKind,
  exists: (reference: string) => Promise<boolean>,
  maxAttempts = 10,
): Promise<string> {
  const prefix = REFERENCE_PREFIXES[kind];
  const width = DIGIT_WIDTH[kind] ?? DEFAULT_DIGIT_WIDTH;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = `${prefix}-${randomDigits(width)}`;
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  throw new Error(`generateReference: exhausted ${maxAttempts} attempts for kind "${kind}"`);
}
