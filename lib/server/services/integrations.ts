import { desc, eq, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, type AuditContext } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import { integrations } from "@/lib/server/db/schema/system";
import { encryptPii } from "@/lib/server/db/pii";
import { fromDbEnum, toDbEnum } from "@/lib/server/db/enum-map";
import type { Integration } from "@/lib/types";
import { NotFoundError, mappingDatabaseErrors } from "./errors";

/**
 * plan/04-service-layer.md §9: "Credentials encrypted, never returned."
 *
 * `secret_encrypted` is never selected by anything in this module. Not
 * selected-and-stripped — never named in a projection at all, the same
 * discipline the patient DTOs use for contact columns. The DTO reports
 * `hasSecret` so a screen can render "configured" versus "not configured",
 * which is the only thing a screen legitimately needs to know.
 *
 * There is deliberately no `revealSecret`. An API key is not a patient's
 * phone number: nobody needs to read it back, because the only consumer is
 * the integration itself, and a key that cannot be read can only be replaced.
 * If one is lost, rotating it at the provider and re-entering it is both the
 * recovery path and the correct security posture.
 *
 * Settings is a `settings`-area surface, so writes need `settings: edit` —
 * Hospital Admin and Super Admin only.
 */

export type IntegrationStatus = Integration["status"];

export interface IntegrationDTO {
  slug: string;
  name: string;
  category: string;
  description: string;
  status: IntegrationStatus;
  /** Whether a credential is stored. Never the credential. */
  hasSecret: boolean;
  config: Record<string, unknown>;
  lastSyncAt: string | null;
}

const projection = {
  slug: integrations.slug,
  name: integrations.name,
  category: integrations.category,
  description: integrations.description,
  status: integrations.status,
  config: integrations.config,
  lastSyncAt: integrations.lastSyncAt,
  // Existence only. The column itself is never read.
  hasSecret: sql<boolean>`${integrations.secretEncrypted} IS NOT NULL`.as("has_secret"),
};

function toDTO(row: Record<string, unknown>): IntegrationDTO {
  return {
    slug: row.slug as string,
    name: row.name as string,
    category: row.category as string,
    description: row.description as string,
    status: fromDbEnum(row.status as string) as IntegrationStatus,
    hasSecret: Boolean(row.hasSecret),
    config: (row.config as Record<string, unknown>) ?? {},
    lastSyncAt: (row.lastSyncAt as Date | null)?.toISOString() ?? null,
  };
}

export async function list(session: AuthzSession): Promise<IntegrationDTO[]> {
  assert(session, "settings", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select(projection)
      .from(integrations)
      .orderBy(desc(integrations.category), integrations.name);
    return rows.map((row) => toDTO(row as Record<string, unknown>));
  });
}

/**
 * Stores a credential and marks the integration connected.
 *
 * The secret is encrypted by Postgres through `encryptPii`, the same
 * `pgp_sym_encrypt` path patient contact details take — one key, one
 * mechanism, and the plaintext never sits in a JS variable longer than the
 * call.
 *
 * The audit entry records that a credential was set and never what it was.
 * An entry containing the key would put it in a table read by a different
 * group of people than the one allowed to configure integrations, and audit
 * entries cannot be deleted.
 */
export async function connect(
  session: AuthzSession,
  slug: string,
  input: { secret: string; config?: Record<string, unknown> },
  context: AuditContext,
): Promise<IntegrationDTO> {
  assert(session, "settings", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [existing] = await tx
        .select({ id: integrations.id })
        .from(integrations)
        .where(eq(integrations.slug, slug))
        .limit(1);
      if (!existing) throw new NotFoundError("That integration could not be found.", { slug });

      await tx
        .update(integrations)
        .set({
          secretEncrypted: encryptPii(input.secret),
          status: toDbEnum("connected" as IntegrationStatus),
          ...(input.config ? { config: input.config } : {}),
        })
        .where(eq(integrations.id, existing.id));

      await writeAudit(tx, session, context, {
        action: "updated",
        resourceType: "integration",
        resourceId: slug,
        field: "secret",
        // Deliberately not the value, and deliberately not its length either —
        // a length narrows a brute force.
        newValue: "set",
      });

      return readOne(tx, slug);
    }),
  );
}

/** Clears the credential. The row survives so the catalogue still lists it. */
export async function disconnect(
  session: AuthzSession,
  slug: string,
  context: AuditContext,
): Promise<IntegrationDTO> {
  assert(session, "settings", "edit");

  return withSession(session, async (tx) => {
    const [existing] = await tx
      .select({ id: integrations.id })
      .from(integrations)
      .where(eq(integrations.slug, slug))
      .limit(1);
    if (!existing) throw new NotFoundError("That integration could not be found.", { slug });

    await tx
      .update(integrations)
      .set({
        secretEncrypted: null,
        status: toDbEnum("disconnected" as IntegrationStatus),
        lastSyncAt: null,
      })
      .where(eq(integrations.id, existing.id));

    await writeAudit(tx, session, context, {
      action: "updated",
      resourceType: "integration",
      resourceId: slug,
      field: "secret",
      previousValue: "set",
      newValue: null,
    });

    return readOne(tx, slug);
  });
}

/** Stamps a successful sync. Called by Phase 07's workers, not by a screen. */
export async function recordSync(session: AuthzSession, slug: string): Promise<void> {
  assert(session, "settings", "edit");

  await withSession(session, async (tx) => {
    await tx
      .update(integrations)
      .set({ lastSyncAt: sql`now()` })
      .where(eq(integrations.slug, slug));
  });
}

async function readOne(
  tx: Parameters<Parameters<typeof withSession>[1]>[0],
  slug: string,
): Promise<IntegrationDTO> {
  const [row] = await tx.select(projection).from(integrations).where(eq(integrations.slug, slug)).limit(1);
  if (!row) throw new NotFoundError("That integration could not be found.", { slug });
  return toDTO(row as Record<string, unknown>);
}
