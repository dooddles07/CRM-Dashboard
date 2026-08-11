import { and, count, desc, eq, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, type AuditContext } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import { campaignRecipients, campaigns } from "@/lib/server/db/schema/marketing";
import { patients, staff } from "@/lib/server/db/schema/people";
import { fromDbEnum, toDbEnum } from "@/lib/server/db/enum-map";
import type { Campaign, Channel } from "@/lib/types";
import { ConflictError, NotFoundError, mappingDatabaseErrors } from "./errors";
import { paginate, resolvePage, type PageRequest, type Paginated } from "./pagination";

/**
 * plan/04-service-layer.md §9: "Funnel counted from `campaign_recipients`,
 * never stored." And §7: "Campaign launch — transaction creates the
 * recipients; the sends are queued, not sent, inside it."
 *
 * The funnel rule is the same argument as the follow-up status: a stored
 * `delivered_count` is a number that drifts the moment a webhook lands out of
 * order, and a screen showing a stale funnel is worse than one showing none.
 * Counting from the recipient rows costs a `GROUP BY` and cannot be wrong.
 *
 * The launch rule matters more. Resolving an audience and enqueuing sends
 * happen in one transaction; the provider is never called inside it. plan §7:
 * "A campaign that rolls back must not have sent anything, and a provider call
 * inside a transaction holds a database connection open across a network
 * round trip." Phase 07 owns the queue worker; this module's job is to make
 * the recipient set and the campaign's state agree or neither exist.
 */

export type CampaignStatus = Campaign["status"];

export interface CampaignDTO {
  reference: string;
  name: string;
  type: string;
  channel: Channel;
  status: CampaignStatus;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: { reference: string; name: string } | null;
  createdAt: string;
  recipientCount: number;
}

/** Counted, never stored. Keys are delivery states; values are recipient counts. */
export interface CampaignFunnel {
  total: number;
  byStatus: Record<string, number>;
}

export interface CampaignFilters extends PageRequest {
  status?: CampaignStatus;
  channel?: Channel;
}

const projection = {
  reference: campaigns.reference,
  name: campaigns.name,
  type: campaigns.type,
  channel: campaigns.channel,
  status: campaigns.status,
  scheduledFor: campaigns.scheduledFor,
  startedAt: campaigns.startedAt,
  completedAt: campaigns.completedAt,
  createdAt: campaigns.createdAt,
  creatorReference: staff.reference,
  creatorName: staff.name,
  recipientCount: sql<number>`
    (SELECT count(*)::int FROM ${campaignRecipients}
     WHERE ${campaignRecipients.campaignId} = ${campaigns.id})`.as("recipient_count"),
};

function toDTO(row: Record<string, unknown>): CampaignDTO {
  return {
    reference: row.reference as string,
    name: row.name as string,
    type: row.type as string,
    channel: fromDbEnum(row.channel as string) as Channel,
    status: fromDbEnum(row.status as string) as CampaignStatus,
    scheduledFor: (row.scheduledFor as Date | null)?.toISOString() ?? null,
    startedAt: (row.startedAt as Date | null)?.toISOString() ?? null,
    completedAt: (row.completedAt as Date | null)?.toISOString() ?? null,
    createdBy:
      row.creatorReference && row.creatorName
        ? { reference: row.creatorReference as string, name: row.creatorName as string }
        : null,
    createdAt: (row.createdAt as Date).toISOString(),
    recipientCount: Number(row.recipientCount ?? 0),
  };
}

export async function list(
  session: AuthzSession,
  filters: CampaignFilters = {},
): Promise<Paginated<CampaignDTO>> {
  assert(session, "pipeline", "view");
  const { page, perPage, offset } = resolvePage(filters);

  return withSession(session, async (tx) => {
    const where = and(
      filters.status ? eq(campaigns.status, toDbEnum(filters.status)) : undefined,
      filters.channel ? eq(campaigns.channel, toDbEnum(filters.channel)) : undefined,
    );

    const rows = await tx
      .select(projection)
      .from(campaigns)
      .leftJoin(staff, eq(staff.id, campaigns.createdBy))
      .where(where)
      .orderBy(desc(campaigns.createdAt))
      .limit(perPage)
      .offset(offset);

    const [totals] = await tx.select({ total: count() }).from(campaigns).where(where);

    return paginate(
      rows.map((row) => toDTO(row as Record<string, unknown>)),
      totals?.total ?? 0,
      page,
      perPage,
    );
  });
}

export async function byReference(
  session: AuthzSession,
  reference: string,
): Promise<CampaignDTO> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const [row] = await tx
      .select(projection)
      .from(campaigns)
      .leftJoin(staff, eq(staff.id, campaigns.createdBy))
      .where(eq(campaigns.reference, reference))
      .limit(1);
    if (!row) throw new NotFoundError("That campaign could not be found.", { reference });
    return toDTO(row as Record<string, unknown>);
  });
}

/** The funnel, counted from recipients rather than read from a stored column. */
export async function funnel(session: AuthzSession, reference: string): Promise<CampaignFunnel> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const [campaign] = await tx
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.reference, reference))
      .limit(1);
    if (!campaign) throw new NotFoundError("That campaign could not be found.", { reference });

    const rows = await tx
      .select({ status: campaignRecipients.status, n: sql<number>`count(*)::int` })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaign.id))
      .groupBy(campaignRecipients.status);

    const byStatus = Object.fromEntries(rows.map((row) => [fromDbEnum(row.status), row.n]));
    return {
      total: rows.reduce((sum, row) => sum + row.n, 0),
      byStatus,
    };
  });
}

/**
 * plan §7. Resolves the audience and creates the recipient rows in one
 * transaction, marking the campaign as running. Nothing is sent here.
 *
 * The audience is resolved *under the caller's own row-level scope*, which is
 * the property worth stating: a Marketing user launching a campaign reaches
 * every department because their role is unscoped, while a department-scoped
 * role would build an audience of their own department only. The campaign
 * cannot reach patients its author could not see.
 *
 * Requires `pipeline: full` rather than `edit` — launching sends messages to
 * real people and is the destructive-in-effect operation of this area, even
 * though it deletes nothing.
 */
export async function launch(
  session: AuthzSession,
  reference: string,
  context: AuditContext,
): Promise<CampaignDTO> {
  assert(session, "pipeline", "full");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [campaign] = await tx
        .select({ id: campaigns.id, status: campaigns.status })
        .from(campaigns)
        .where(eq(campaigns.reference, reference))
        .limit(1);
      if (!campaign) throw new NotFoundError("That campaign could not be found.", { reference });

      const draft = toDbEnum("draft" as CampaignStatus);
      const scheduled = toDbEnum("scheduled" as CampaignStatus);
      if (campaign.status !== draft && campaign.status !== scheduled) {
        // Launching twice would duplicate the recipient set and, once Phase 07
        // is delivering, send every message a second time.
        throw new ConflictError(
          "CONFLICT",
          "That campaign has already been launched.",
          { reference, status: fromDbEnum(campaign.status) },
        );
      }

      // The audience: every non-archived patient the caller can see. The
      // stored `audience_query` refines this in a later phase; today the
      // filter that matters is the one Postgres applies.
      const audience = await tx
        .select({ id: patients.id })
        .from(patients)
        .where(sql`${patients.archivedAt} IS NULL`);

      if (audience.length > 0) {
        await tx
          .insert(campaignRecipients)
          .values(audience.map((row) => ({ campaignId: campaign.id, patientId: row.id })))
          // Re-launching a partially-built campaign must not duplicate rows;
          // the (campaign_id, patient_id) unique constraint decides.
          .onConflictDoNothing();
      }

      await tx
        .update(campaigns)
        .set({ status: toDbEnum("running" as CampaignStatus), startedAt: sql`now()` })
        .where(eq(campaigns.id, campaign.id));

      // Phase 07 enqueues the sends here, inside this transaction. Delivery
      // happens outside it, from the queue worker.

      await writeAudit(tx, session, context, {
        action: "updated",
        resourceType: "campaign",
        resourceId: reference,
        field: "status",
        previousValue: fromDbEnum(campaign.status),
        newValue: `running (${audience.length} recipients)`,
      });

      const [fresh] = await tx
        .select(projection)
        .from(campaigns)
        .leftJoin(staff, eq(staff.id, campaigns.createdBy))
        .where(eq(campaigns.id, campaign.id))
        .limit(1);
      return toDTO(fresh as Record<string, unknown>);
    }),
  );
}

/** Pausing stops the queue draining. Recipients already sent stay sent. */
export async function pause(
  session: AuthzSession,
  reference: string,
  context: AuditContext,
): Promise<CampaignDTO> {
  assert(session, "pipeline", "full");

  return withSession(session, async (tx) => {
    const [campaign] = await tx
      .select({ id: campaigns.id, status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.reference, reference))
      .limit(1);
    if (!campaign) throw new NotFoundError("That campaign could not be found.", { reference });

    await tx
      .update(campaigns)
      .set({ status: toDbEnum("paused" as CampaignStatus) })
      .where(eq(campaigns.id, campaign.id));

    await writeAudit(tx, session, context, {
      action: "updated",
      resourceType: "campaign",
      resourceId: reference,
      field: "status",
      previousValue: fromDbEnum(campaign.status),
      newValue: "paused",
    });

    const [fresh] = await tx
      .select(projection)
      .from(campaigns)
      .leftJoin(staff, eq(staff.id, campaigns.createdBy))
      .where(eq(campaigns.id, campaign.id))
      .limit(1);
    return toDTO(fresh as Record<string, unknown>);
  });
}
