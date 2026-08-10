import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { campaignStatus, channel, deliveryStatus, workflowNodeKind, workflowStatus } from "./enums";
import { outboundMessages } from "./comms";
import { patients, staff } from "./people";

/**
 * plan/01-foundation.md §4.4, verbatim. `audience_query` stores the filter
 * rather than a frozen recipient list, so the funnel on /campaigns is
 * counted from `campaign_recipients`, not columns that can disagree with
 * reality.
 */
export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: text("reference").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  channel: channel("channel").notNull(),
  status: campaignStatus("status").notNull().default("draft"),
  audienceQuery: jsonb("audience_query").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => staff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    status: deliveryStatus("status").notNull().default("queued"),
    messageId: uuid("message_id").references(() => outboundMessages.id),
  },
  (table) => [unique().on(table.campaignId, table.patientId)],
);

/**
 * plan/01-foundation.md §4.4 gives the column list without full SQL for
 * these five; types below follow lib/types.ts (`WorkflowSummary`,
 * `WorkflowNode`, `WorkflowEdge` in lib/data/marketing.ts) and the same
 * conventions used throughout §4. `position` holds the xyflow canvas
 * coordinates — the canvas is the editor for real rows, not a picture of
 * them.
 */
export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: text("reference").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  status: workflowStatus("status").notNull().default("draft"),
  triggerKind: text("trigger_kind").notNull(),
  triggerConfig: jsonb("trigger_config").notNull().default(sql`'{}'::jsonb`),
  createdBy: uuid("created_by").references(() => staff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workflowNodes = pgTable("workflow_nodes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  kind: workflowNodeKind("kind").notNull(),
  label: text("label").notNull(),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  position: jsonb("position").$type<{ x: number; y: number }>().notNull(),
});

export const workflowEdges = pgTable("workflow_edges", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  sourceNodeId: uuid("source_node_id")
    .notNull()
    .references((): typeof workflowNodes.id => workflowNodes.id, { onDelete: "cascade" }),
  targetNodeId: uuid("target_node_id")
    .notNull()
    .references((): typeof workflowNodes.id => workflowNodes.id, { onDelete: "cascade" }),
  condition: text("condition"),
});

export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
});

export const workflowRunSteps = pgTable("workflow_run_steps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid("run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  nodeId: uuid("node_id")
    .notNull()
    .references(() => workflowNodes.id),
  status: text("status").notNull(),
  output: jsonb("output"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
