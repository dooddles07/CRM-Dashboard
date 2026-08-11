/**
 * plan/04-service-layer.md §6. One error type per failure mode, thrown by
 * services and translated once at each boundary.
 *
 * Every one carries a `reference` — a short opaque id that goes into the log
 * line and into the `ErrorState` the user sees, so a staff member can quote
 * it to support and it can be found in the logs without them describing what
 * they were doing.
 *
 * `message` is written for the person reading it. docs/API.md: "the UI shows
 * it directly", so the string is
 * "Your role cannot reveal contact details for patients outside your
 * department", never "Forbidden".
 *
 * Deliberately dependency-free: no database, no Next, no logger. These are
 * thrown from services and caught by Phase 05's `handle` and by Server
 * Actions, and both need to import them without dragging anything along.
 */

/** Codes the API contract documents. Phase 05 maps each to a status. */
export type ServiceErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "REVEAL_NOT_PERMITTED"
  | "EXPORT_NOT_PERMITTED"
  | "AUDIT_ACCESS_DENIED"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "SLOT_CONFLICT"
  | "DUPLICATE_REFERENCE"
  | "RATE_EXCEEDED"
  | "REVEAL_RATE_EXCEEDED";

/**
 * Short, opaque, and not sequential — a reference that counted up would leak
 * how much traffic the system takes. Eight hex characters is enough to find
 * one entry in a log and short enough that somebody can read it down a phone
 * line.
 *
 * Uses the Web Crypto API rather than node:crypto so this module stays
 * importable from anywhere.
 */
function newReference(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return `err_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export abstract class ServiceError extends Error {
  abstract readonly code: ServiceErrorCode;
  /** HTTP status Phase 05 should map this to. Kept here so the mapping has one home. */
  abstract readonly status: number;
  readonly reference: string;
  /** Structured context for the log and the audit entry. Never rendered raw to a user. */
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.reference = newReference();
    this.details = details;
  }
}

/**
 * 404. Also the answer for a row that row-level security hid, which is why
 * services must not distinguish the two: plan/03-authorisation.md §8 and
 * plan/05-http-api.md §3.2 both require "out of scope is indistinguishable
 * from not existing", because a 403 confirms the record exists.
 */
export class NotFoundError extends ServiceError {
  readonly code = "NOT_FOUND" as const;
  readonly status = 404;
  readonly name = "NotFoundError";
}

/** 422. Input failed validation at the boundary. `details` carries the field errors. */
export class ValidationError extends ServiceError {
  readonly code = "VALIDATION_FAILED" as const;
  readonly status = 422;
  readonly name = "ValidationError";
}

/** 409. A double-booked slot, a duplicate reference — states the database refused. */
export class ConflictError extends ServiceError {
  readonly code: ServiceErrorCode;
  readonly status = 409;
  readonly name = "ConflictError";

  constructor(
    code: Extract<ServiceErrorCode, "CONFLICT" | "SLOT_CONFLICT" | "DUPLICATE_REFERENCE">,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message, details);
    this.code = code;
  }
}

/** 429. plan §5.1's reveal budget, and any other limit. */
export class RateLimitError extends ServiceError {
  readonly code: ServiceErrorCode;
  readonly status = 429;
  readonly name = "RateLimitError";

  constructor(
    code: Extract<ServiceErrorCode, "RATE_EXCEEDED" | "REVEAL_RATE_EXCEEDED">,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message, details);
    this.code = code;
  }
}

/**
 * Postgres SQLSTATEs that mean something specific to this product, per plan
 * §6's table. Anything unrecognised is deliberately absent: it becomes a
 * generic 500 with a reference, and the detail goes to the log rather than to
 * the client. "An unmapped database error reaching the client as a 500 with a
 * stack trace is a leak."
 *
 * The exclusion violation is the appointment overlap constraint from
 * drizzle/manual/0003_no_double_booking.sql. plan §9: "Conflict is the
 * database's answer, not a pre-check" — a pre-check races, the constraint
 * cannot.
 */
const SQLSTATE: Record<string, () => ServiceError> = {
  // 23P01 — exclusion_violation
  "23P01": () =>
    new ConflictError(
      "SLOT_CONFLICT",
      "That time slot is already booked for this doctor. Choose another time.",
    ),
  // 23505 — unique_violation
  "23505": () =>
    new ConflictError("DUPLICATE_REFERENCE", "A record with that reference already exists."),
  // 23503 — foreign_key_violation
  "23503": () =>
    new ValidationError("That record refers to something that does not exist."),
};

/**
 * Unwraps a thrown database error and maps it, or returns `null` when it is
 * not one this product has an answer for.
 *
 * The unwrapping is not optional and is the part most easily got wrong.
 * Drizzle wraps every driver failure in a `DrizzleQueryError` whose own
 * `message` is `Failed query: ...` and whose `code` is undefined; the real
 * error — with the SQLSTATE on `.code` — is on `.cause`. Reading the top
 * level alone silently maps nothing, which is exactly how
 * scripts/policy-tests.ts came to report a working database as broken (see
 * that file's `messageChain`). Walk the chain.
 */
export function mapDatabaseError(error: unknown): ServiceError | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const step = current as { code?: unknown; cause?: unknown };
    if (typeof step.code === "string" && step.code in SQLSTATE) {
      return SQLSTATE[step.code]();
    }
    current = step.cause;
  }
  return null;
}

/**
 * Rethrows a database error as a `ServiceError` when it maps to one, and
 * rethrows it untouched when it does not.
 *
 * Wrap a write in this at the service boundary — plan §6: "Postgres errors
 * map at the service boundary, never above it."
 */
export async function mappingDatabaseErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const mapped = mapDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
}
