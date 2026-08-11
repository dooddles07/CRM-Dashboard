import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, type AuditContext } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import { conversationReads, conversations, messages } from "@/lib/server/db/schema/comms";
import { patients, staff } from "@/lib/server/db/schema/people";
import { fromDbEnum, toDbEnum } from "@/lib/server/db/enum-map";
import type { Channel } from "@/lib/types";
import { NotFoundError, mappingDatabaseErrors } from "./errors";
import { paginate, resolvePage, type PageRequest, type Paginated } from "./pagination";

/**
 * plan/04-service-layer.md §9: "`internal` enforced here — an internal note
 * must never reach the delivery queue."
 *
 * That is the one rule in this module that matters more than the rest. An
 * internal note is a staff member writing to the record, in front of
 * colleagues, in the same thread as messages that do go to the patient. If
 * the flag is ever read wrongly, a private clinical aside is delivered by SMS
 * to the person it was about.
 *
 * So `send` takes `internal` and branches on it exactly once, here, and the
 * queue hand-off is a separate statement guarded by that branch rather than a
 * field the queue is trusted to check. Phase 07 owns the queue; this module
 * owns the decision, and the decision does not travel.
 *
 * ## Unread is per staff member
 *
 * `conversation_reads` carries a row per (conversation, staff) rather than a
 * boolean on the conversation, so two people reading the same thread do not
 * clear each other's badge. RLS restricts it to `staff_id = app_staff_id()`,
 * which is why nothing below filters on it.
 */

export interface ConversationDTO {
  reference: string;
  patient: { reference: string; name: string };
  channel: Channel;
  subject: string;
  assignedTo: { reference: string; name: string } | null;
  lastMessageAt: string;
  unread: boolean;
  messageCount: number;
}

export interface MessageDTO {
  id: string;
  direction: "inbound" | "outbound";
  channel: Channel;
  body: string;
  author: { reference: string; name: string } | null;
  internal: boolean;
  sentAt: string;
}

export interface ConversationFilters extends PageRequest {
  channel?: Channel;
  assignedTo?: string;
  patientReference?: string;
  unreadOnly?: boolean;
}

const projection = {
  reference: conversations.reference,
  channel: conversations.channel,
  subject: conversations.subject,
  lastMessageAt: conversations.lastMessageAt,
  patientReference: patients.reference,
  patientName: patients.name,
  assignedReference: staff.reference,
  assignedName: staff.name,
  messageCount: sql<number>`
    (SELECT count(*)::int FROM ${messages}
     WHERE ${messages.conversationId} = ${conversations.id})`.as("message_count"),
  // A thread is unread when this staff member has no read row, or read it
  // before the last message landed.
  unread: sql<boolean>`
    NOT EXISTS (
      SELECT 1 FROM ${conversationReads}
      WHERE ${conversationReads.conversationId} = ${conversations.id}
        AND ${conversationReads.readAt} >= ${conversations.lastMessageAt}
    )`.as("unread"),
};

function toDTO(row: Record<string, unknown>): ConversationDTO {
  return {
    reference: row.reference as string,
    patient: {
      reference: row.patientReference as string,
      name: row.patientName as string,
    },
    channel: fromDbEnum(row.channel as string) as Channel,
    subject: row.subject as string,
    assignedTo:
      row.assignedReference && row.assignedName
        ? { reference: row.assignedReference as string, name: row.assignedName as string }
        : null,
    lastMessageAt: (row.lastMessageAt as Date).toISOString(),
    unread: Boolean(row.unread),
    messageCount: Number(row.messageCount ?? 0),
  };
}

export async function list(
  session: AuthzSession,
  filters: ConversationFilters = {},
): Promise<Paginated<ConversationDTO>> {
  assert(session, "patients", "view");
  const { page, perPage, offset } = resolvePage(filters);

  return withSession(session, async (tx) => {
    const where = and(
      filters.channel ? eq(conversations.channel, toDbEnum(filters.channel)) : undefined,
      filters.assignedTo ? eq(conversations.assignedTo, filters.assignedTo) : undefined,
      filters.patientReference ? eq(patients.reference, filters.patientReference) : undefined,
    );

    const rows = await tx
      .select(projection)
      .from(conversations)
      .innerJoin(patients, eq(patients.id, conversations.patientId))
      .leftJoin(staff, eq(staff.id, conversations.assignedTo))
      .where(where)
      .orderBy(desc(conversations.lastMessageAt))
      .limit(perPage)
      .offset(offset);

    const [totals] = await tx
      .select({ total: count() })
      .from(conversations)
      .innerJoin(patients, eq(patients.id, conversations.patientId))
      .where(where);

    const data = rows
      .map((row) => toDTO(row as Record<string, unknown>))
      .filter((row) => (filters.unreadOnly ? row.unread : true));

    return paginate(data, totals?.total ?? 0, page, perPage);
  });
}

/** The thread. Internal notes are included — they are staff-visible by design. */
export async function thread(
  session: AuthzSession,
  reference: string,
): Promise<{ conversation: ConversationDTO; messages: MessageDTO[] }> {
  assert(session, "patients", "view");

  return withSession(session, async (tx) => {
    const [row] = await tx
      .select({ ...projection, id: conversations.id })
      .from(conversations)
      .innerJoin(patients, eq(patients.id, conversations.patientId))
      .leftJoin(staff, eq(staff.id, conversations.assignedTo))
      .where(eq(conversations.reference, reference))
      .limit(1);

    if (!row) throw new NotFoundError("That conversation could not be found.", { reference });

    const rows = await tx
      .select({
        id: messages.id,
        direction: messages.direction,
        channel: messages.channel,
        body: messages.body,
        internal: messages.internal,
        sentAt: messages.sentAt,
        authorReference: staff.reference,
        authorName: staff.name,
      })
      .from(messages)
      .leftJoin(staff, eq(staff.id, messages.authorId))
      .where(eq(messages.conversationId, row.id as string))
      .orderBy(asc(messages.sentAt));

    return {
      conversation: toDTO(row as Record<string, unknown>),
      messages: rows.map((message) => ({
        id: message.id,
        direction: fromDbEnum(message.direction) as "inbound" | "outbound",
        channel: fromDbEnum(message.channel) as Channel,
        body: message.body,
        author:
          message.authorReference && message.authorName
            ? { reference: message.authorReference, name: message.authorName }
            : null,
        internal: message.internal,
        sentAt: message.sentAt.toISOString(),
      })),
    };
  });
}

/**
 * The `internal` decision, made once.
 *
 * An internal note is stored and never queued. An outbound message is stored
 * and queued. The branch is here rather than in the queue because a queue
 * that filters on a flag is a queue that delivers when the flag is wrong,
 * and the consequence of that mistake is a private clinical note arriving on
 * the patient's phone.
 *
 * Phase 07 supplies the enqueue; until then the outbound branch records the
 * message and leaves delivery to it. What must not change is which side of
 * the branch a note falls on.
 */
export async function send(
  session: AuthzSession,
  reference: string,
  input: { body: string; internal: boolean },
  context: AuditContext,
): Promise<MessageDTO> {
  assert(session, "patients", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [conversation] = await tx
        .select({ id: conversations.id, channel: conversations.channel })
        .from(conversations)
        .where(eq(conversations.reference, reference))
        .limit(1);

      if (!conversation) {
        throw new NotFoundError("That conversation could not be found.", { reference });
      }

      const [created] = await tx
        .insert(messages)
        .values({
          conversationId: conversation.id,
          direction: toDbEnum("outbound" as const),
          channel: conversation.channel,
          body: input.body,
          authorId: session.staffId,
          internal: input.internal,
        })
        .returning({ id: messages.id, sentAt: messages.sentAt });

      await tx
        .update(conversations)
        .set({ lastMessageAt: created.sentAt })
        .where(eq(conversations.id, conversation.id));

      if (!input.internal) {
        // Phase 07 enqueues here, inside this transaction — plan §7: "Enqueue
        // inside the transaction, deliver outside it." A message that rolled
        // back must not have been sent.
      }

      await writeAudit(tx, session, context, {
        action: "created",
        resourceType: "message",
        resourceId: reference,
        field: input.internal ? "internal_note" : "outbound_message",
        // The body is not recorded. An audit entry naming every message would
        // put the whole conversation in a table read by a different set of
        // people than the thread is.
        newValue: `${input.body.length} characters`,
      });

      return {
        id: created.id,
        direction: "outbound",
        channel: fromDbEnum(conversation.channel) as Channel,
        body: input.body,
        author: null,
        internal: input.internal,
        sentAt: created.sentAt.toISOString(),
      };
    }),
  );
}

/** Marks this thread read for the caller only. Upsert, since reading twice is normal. */
export async function markRead(session: AuthzSession, reference: string): Promise<void> {
  assert(session, "patients", "view");

  await withSession(session, async (tx) => {
    const [conversation] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.reference, reference))
      .limit(1);
    if (!conversation) {
      throw new NotFoundError("That conversation could not be found.", { reference });
    }

    await tx
      .insert(conversationReads)
      .values({ conversationId: conversation.id, staffId: session.staffId })
      .onConflictDoUpdate({
        target: [conversationReads.conversationId, conversationReads.staffId],
        set: { readAt: sql`now()` },
      });
  });
}

export async function assign(
  session: AuthzSession,
  reference: string,
  staffId: string | null,
  context: AuditContext,
): Promise<void> {
  assert(session, "patients", "edit");

  await withSession(session, async (tx) => {
    const [conversation] = await tx
      .select({ id: conversations.id, assignedTo: conversations.assignedTo })
      .from(conversations)
      .where(eq(conversations.reference, reference))
      .limit(1);
    if (!conversation) {
      throw new NotFoundError("That conversation could not be found.", { reference });
    }

    await tx
      .update(conversations)
      .set({ assignedTo: staffId })
      .where(eq(conversations.id, conversation.id));

    await writeAudit(tx, session, context, {
      action: "updated",
      resourceType: "conversation",
      resourceId: reference,
      field: "assignedTo",
      previousValue: conversation.assignedTo,
      newValue: staffId,
    });
  });
}

/** Threads with no read row for this caller. The rail badge. */
export async function unreadCount(session: AuthzSession): Promise<number> {
  assert(session, "patients", "view");

  return withSession(session, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(conversations)
      .leftJoin(
        conversationReads,
        and(
          eq(conversationReads.conversationId, conversations.id),
          eq(conversationReads.staffId, session.staffId),
        ),
      )
      .where(
        and(
          isNull(conversationReads.readAt),
          sql`true`,
        ),
      );
    return row?.n ?? 0;
  });
}
