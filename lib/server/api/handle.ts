import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { resolveSession, resolveClientIp } from "@/lib/server/auth/session";
import {
  ScopeRequiredError,
  ServiceError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/server/services/errors";
import type { AuthzSession } from "@/lib/server/authz/policy";
import type { AuditContext } from "@/lib/server/audit/write";
import type { Paginated } from "@/lib/server/services/pagination";
import { authenticateToken, tokenPermits, type TokenScope } from "./tokens";
import { consume } from "./rate-limit";

/**
 * plan/05-http-api.md §2. The wrapper every route handler goes through.
 *
 * "`handle` exists so that no handler writes its own try/catch. One
 * implementation of error mapping, one place where a 500 can leak a stack
 * trace, one place to fix it."
 *
 * plan §7 turns that into two acceptance criteria — no handler contains a
 * database query, and no handler contains its own try/catch — and this is
 * what makes both achievable rather than aspirational. A handler that needs
 * a try/catch is a handler doing something a service should do.
 */

/** What a handler receives. Everything it needs, nothing it could misuse. */
export interface ApiContext {
  session: AuthzSession;
  /** Actor and request metadata for the audit writer. Never taken from the body. */
  audit: AuditContext;
  /** Present only for machine callers. `null` for a browser session. */
  token: { id: string; scopes: TokenScope[] } | null;
}

export interface HandleOptions {
  /**
   * Scope a machine caller must hold. Browser sessions ignore it — a person
   * signed in with their own account is bounded by their role, not by scopes.
   */
  scope?: TokenScope;
}

/**
 * plan §3.1's error envelope, and the only place it is constructed.
 *
 * `message` goes to the user directly, so it is the service's human-written
 * string. `reference` is the opaque id the user quotes to support and the log
 * line carries. The stack never appears — plan §7: "the response carries no
 * stack".
 */
function errorResponse(error: ServiceError, status?: number): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        reference: error.reference,
        ...(Object.keys(error.details).length > 0 ? { details: error.details } : {}),
      },
    },
    { status: status ?? error.status },
  );
}

/**
 * An error no service declared. Logged in full, reported as a bare reference.
 *
 * This is the case plan §7 cares about most: "An unhandled error returns a
 * reference and logs the detail — the response carries no stack." The client
 * gets an id and nothing else, so a database error message, a file path, or a
 * connection string cannot reach it.
 */
function unexpectedResponse(error: unknown): NextResponse {
  const reference = `err_${Math.random().toString(16).slice(2, 10)}`;
  console.error(
    JSON.stringify({
      event: "api.unhandled",
      reference,
      message: error instanceof Error ? error.message : String(error),
      // The cause chain matters: Drizzle wraps driver errors, and the useful
      // message is never the outer one.
      cause: error instanceof Error && error.cause ? String((error.cause as Error).message) : null,
      stack: error instanceof Error ? error.stack : null,
    }),
  );
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL",
        message: "Something went wrong. Quote this reference if you contact support.",
        reference,
      },
    },
    { status: 500 },
  );
}

/**
 * Resolves the caller, enforces the rate limit, runs the handler, and maps
 * every failure to the envelope.
 *
 * Order matters and is worth stating: rate limit *after* authentication, so
 * the limit is keyed to an identity rather than shared across everyone behind
 * a NAT, but *before* the handler, so a flood costs one cheap insert rather
 * than a full query.
 */
export async function handle<T>(
  request: NextRequest,
  fn: (context: ApiContext) => Promise<T>,
  options: HandleOptions = {},
): Promise<NextResponse> {
  try {
    const authorization = request.headers.get("authorization");
    const ip = resolveClientIp(request.headers);

    let context: ApiContext;

    if (authorization) {
      const identity = await authenticateToken(authorization);
      if (!identity) {
        // Unknown, revoked and expired are one answer. A caller learns only
        // that the token did not work.
        return errorResponse(new UnauthorizedError("That API token is not valid."));
      }
      if (options.scope && !tokenPermits(identity.scopes, options.scope)) {
        return errorResponse(
          new ScopeRequiredError("That API token does not carry the scope this endpoint requires.", {
            required: options.scope,
          }),
        );
      }
      await consume("token", identity.tokenId);
      context = {
        session: identity.session,
        token: { id: identity.tokenId, scopes: identity.scopes },
        audit: {
          actorName: `api-token:${identity.tokenId}`,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent"),
        },
      };
    } else {
      const authed = await resolveSession(request.headers);
      if (!authed) {
        return errorResponse(new UnauthorizedError("You are not signed in."));
      }
      await consume("session", authed.session.id);
      context = {
        session: authed.authz,
        token: null,
        audit: {
          actorName: authed.staff.name,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent"),
          sessionId: authed.session.id,
        },
      };
    }

    const result = await fn(context);
    // A handler that needs to control the response itself — a file download,
    // a redirect — returns one. Everything else gets the JSON envelope. Two
    // shapes rather than one, because `/audit/export` produces a file and
    // JSON-encoding a CSV string would deliver a quoted blob.
    if (result instanceof NextResponse) return result;
    return NextResponse.json(result);
  } catch (error) {
    // Zod first: a validation failure is the most common non-success and has
    // its own status and field detail.
    if (error instanceof ZodError) {
      const failure = new ValidationError("Some of those values are not valid.", {
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      return errorResponse(failure);
    }
    if (error instanceof ServiceError) return errorResponse(error);
    return unexpectedResponse(error);
  }
}

/** plan §3.1's collection envelope. `links` is built here, where the route is known. */
export function collection<T>(page: Paginated<T>, request: NextRequest): {
  data: T[];
  meta: Paginated<T>["meta"];
  links: { next: string | null; prev: string | null };
} {
  const url = new URL(request.url);
  const at = (n: number) => {
    const next = new URL(url.toString());
    next.searchParams.set("page", String(n));
    return `${next.pathname}${next.search}`;
  };
  return {
    data: page.data,
    meta: page.meta,
    links: {
      next: page.meta.page < page.meta.totalPages ? at(page.meta.page + 1) : null,
      prev: page.meta.page > 1 ? at(page.meta.page - 1) : null,
    },
  };
}

/** The single-record envelope. A bare object would make adding `meta` a breaking change. */
export function record<T>(data: T): { data: T } {
  return { data };
}

/** Query string as a plain object, for a Zod schema to parse. */
export function searchParamsOf(request: NextRequest): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}

/** Parses a JSON body through a schema. Malformed JSON is a 400, not a 500. */
export async function jsonBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("The request body is not valid JSON.");
  }
  return schema.parse(body);
}
