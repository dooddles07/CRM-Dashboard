import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { bytea } from "./columns";
import { channel, deliveryEvent, deliveryStatus, messageDirection } from "./enums";
import { patients, staff } from "./people";

/** plan/01-foundation.md §4.2, verbatim. */
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: text("reference").notNull().unique(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id),
  channel: channel("channel").notNull(),
  subject: text("subject").notNull(),
  assignedTo: uuid("assigned_to").references(() => staff.id),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirection("direction").notNull(),
    channel: channel("channel").notNull(),
    body: text("body").notNull(),
    authorId: uuid("author_id").references(() => staff.id),
    // Enforced server-side in the message service (Phase 04) — an internal
    // note must never reach the delivery queue.
    internal: boolean("internal").notNull().default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_messages_conversation").on(table.conversationId, table.sentAt)],
);

/**
 * Per-staff read state, not a boolean on the conversation — two people
 * reading the same thread must not clear each other's unread badge. The
 * `Conversation.unread` DTO field is computed from this for the calling
 * user; no screen changes.
 */
export const conversationReads = pgTable(
  "conversation_reads",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.staffId] })],
);

/**
 * plan/01-foundation.md §4.5, verbatim. The single record of anything the
 * system tries to send — campaigns, reminders, and workflow actions all
 * produce rows here. `status` is the latest event, denormalised for
 * querying; `message_events` is the history the campaign funnel counts.
 */
export const outboundMessages = pgTable("outbound_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  channel: channel("channel").notNull(),
  patientId: uuid("patient_id").references(() => patients.id),
  toEncrypted: bytea("to_encrypted").notNull(),
  toMasked: text("to_masked").notNull(),
  body: text("body").notNull(),
  sourceKind: text("source_kind").notNull(),
  sourceId: uuid("source_id"),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  status: deliveryStatus("status").notNull().default("queued"),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  failedReason: text("failed_reason"),
});

export const messageEvents = pgTable("message_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => outboundMessages.id, { onDelete: "cascade" }),
  event: deliveryEvent("event").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  detail: jsonb("detail"),
});
