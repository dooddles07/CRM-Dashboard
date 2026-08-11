import { desc, eq, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, type AuditContext } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import {
  workflowEdges,
  workflowNodes,
  workflowRuns,
  workflows,
} from "@/lib/server/db/schema/marketing";
import { staff } from "@/lib/server/db/schema/people";
import { fromDbEnum, toDbEnum } from "@/lib/server/db/enum-map";
import type { WorkflowNodeKind, WorkflowSummary } from "@/lib/types";
import { NotFoundError, mappingDatabaseErrors } from "./errors";

/**
 * plan/04-service-layer.md §9: "Canvas edits persist nodes and edges."
 *
 * The xyflow canvas is the editor for real rows, not a picture of them
 * (lib/server/db/schema/marketing.ts). So `saveGraph` replaces the whole node
 * and edge set in one transaction rather than diffing: a canvas save is a
 * statement about the entire graph, and a partial apply would leave edges
 * pointing at nodes that no longer exist.
 *
 * Delete-then-insert inside a transaction is correct here for a reason worth
 * naming: the edges have foreign keys onto the nodes, so any order that keeps
 * both sets live at once has to reconcile them. Replacing both together means
 * the constraint is satisfied at commit, which is the only moment it is
 * checked from outside.
 */

export type WorkflowStatus = WorkflowSummary["status"];

export interface WorkflowNodeDTO {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface WorkflowEdgeDTO {
  id: string;
  source: string;
  target: string;
  condition: string | null;
}

export interface WorkflowDTO {
  reference: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  triggerKind: string;
  triggerConfig: Record<string, unknown>;
  createdBy: { reference: string; name: string } | null;
  nodeCount: number;
  runCount: number;
}

export interface WorkflowGraph {
  workflow: WorkflowDTO;
  nodes: WorkflowNodeDTO[];
  edges: WorkflowEdgeDTO[];
}

const projection = {
  reference: workflows.reference,
  name: workflows.name,
  description: workflows.description,
  status: workflows.status,
  triggerKind: workflows.triggerKind,
  triggerConfig: workflows.triggerConfig,
  creatorReference: staff.reference,
  creatorName: staff.name,
  nodeCount: sql<number>`
    (SELECT count(*)::int FROM ${workflowNodes}
     WHERE ${workflowNodes.workflowId} = ${workflows.id})`.as("node_count"),
  runCount: sql<number>`
    (SELECT count(*)::int FROM ${workflowRuns}
     WHERE ${workflowRuns.workflowId} = ${workflows.id})`.as("run_count"),
};

function toDTO(row: Record<string, unknown>): WorkflowDTO {
  return {
    reference: row.reference as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    status: fromDbEnum(row.status as string) as WorkflowStatus,
    triggerKind: row.triggerKind as string,
    triggerConfig: (row.triggerConfig as Record<string, unknown>) ?? {},
    createdBy:
      row.creatorReference && row.creatorName
        ? { reference: row.creatorReference as string, name: row.creatorName as string }
        : null,
    nodeCount: Number(row.nodeCount ?? 0),
    runCount: Number(row.runCount ?? 0),
  };
}

export async function list(session: AuthzSession): Promise<WorkflowDTO[]> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select(projection)
      .from(workflows)
      .leftJoin(staff, eq(staff.id, workflows.createdBy))
      .orderBy(desc(workflows.updatedAt));
    return rows.map((row) => toDTO(row as Record<string, unknown>));
  });
}

export async function graph(session: AuthzSession, reference: string): Promise<WorkflowGraph> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const [row] = await tx
      .select({ ...projection, id: workflows.id })
      .from(workflows)
      .leftJoin(staff, eq(staff.id, workflows.createdBy))
      .where(eq(workflows.reference, reference))
      .limit(1);
    if (!row) throw new NotFoundError("That workflow could not be found.", { reference });

    const id = row.id as string;
    const nodes = await tx
      .select({
        id: workflowNodes.id,
        kind: workflowNodes.kind,
        label: workflowNodes.label,
        config: workflowNodes.config,
        position: workflowNodes.position,
      })
      .from(workflowNodes)
      .where(eq(workflowNodes.workflowId, id));

    const edges = await tx
      .select({
        id: workflowEdges.id,
        source: workflowEdges.sourceNodeId,
        target: workflowEdges.targetNodeId,
        condition: workflowEdges.condition,
      })
      .from(workflowEdges)
      .where(eq(workflowEdges.workflowId, id));

    return {
      workflow: toDTO(row as Record<string, unknown>),
      nodes: nodes.map((node) => ({
        id: node.id,
        kind: fromDbEnum(node.kind) as WorkflowNodeKind,
        label: node.label,
        config: (node.config as Record<string, unknown>) ?? {},
        position: node.position,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        condition: edge.condition,
      })),
    };
  });
}

/**
 * Replaces the graph wholesale. See the module comment for why this is a
 * replace rather than a diff.
 *
 * Node ids come from the client because the canvas creates them before the
 * server sees them and the edges reference them. That is safe here — they are
 * UUIDs scoped to a workflow the caller can already edit, and a collision
 * fails on the primary key rather than overwriting someone else's node.
 */
export async function saveGraph(
  session: AuthzSession,
  reference: string,
  input: { nodes: WorkflowNodeDTO[]; edges: Omit<WorkflowEdgeDTO, "id">[] },
  context: AuditContext,
): Promise<WorkflowGraph> {
  assert(session, "pipeline", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [workflow] = await tx
        .select({ id: workflows.id })
        .from(workflows)
        .where(eq(workflows.reference, reference))
        .limit(1);
      if (!workflow) throw new NotFoundError("That workflow could not be found.", { reference });

      // Edges first: they reference the nodes, so removing them before the
      // nodes keeps the foreign keys satisfied at every step.
      await tx.delete(workflowEdges).where(eq(workflowEdges.workflowId, workflow.id));
      await tx.delete(workflowNodes).where(eq(workflowNodes.workflowId, workflow.id));

      if (input.nodes.length > 0) {
        await tx.insert(workflowNodes).values(
          input.nodes.map((node) => ({
            id: node.id,
            workflowId: workflow.id,
            kind: toDbEnum(node.kind),
            label: node.label,
            config: node.config,
            position: node.position,
          })),
        );
      }

      if (input.edges.length > 0) {
        await tx.insert(workflowEdges).values(
          input.edges.map((edge) => ({
            workflowId: workflow.id,
            sourceNodeId: edge.source,
            targetNodeId: edge.target,
            condition: edge.condition,
          })),
        );
      }

      await tx.update(workflows).set({ updatedAt: new Date() }).where(eq(workflows.id, workflow.id));

      await writeAudit(tx, session, context, {
        action: "updated",
        resourceType: "workflow",
        resourceId: reference,
        field: "graph",
        newValue: `${input.nodes.length} nodes, ${input.edges.length} edges`,
      });

      return graphIn(tx, reference);
    }),
  );
}

export async function setStatus(
  session: AuthzSession,
  reference: string,
  status: WorkflowStatus,
  context: AuditContext,
): Promise<WorkflowDTO> {
  assert(session, "pipeline", "edit");

  return withSession(session, async (tx) => {
    const [before] = await tx
      .select({ id: workflows.id, status: workflows.status })
      .from(workflows)
      .where(eq(workflows.reference, reference))
      .limit(1);
    if (!before) throw new NotFoundError("That workflow could not be found.", { reference });

    await tx
      .update(workflows)
      .set({ status: toDbEnum(status), updatedAt: new Date() })
      .where(eq(workflows.id, before.id));

    await writeAudit(tx, session, context, {
      action: "updated",
      resourceType: "workflow",
      resourceId: reference,
      field: "status",
      previousValue: fromDbEnum(before.status),
      newValue: status,
    });

    const [fresh] = await tx
      .select(projection)
      .from(workflows)
      .leftJoin(staff, eq(staff.id, workflows.createdBy))
      .where(eq(workflows.id, before.id))
      .limit(1);
    return toDTO(fresh as Record<string, unknown>);
  });
}

/** Run history for the workflow detail page. */
export async function runs(
  session: AuthzSession,
  reference: string,
  limit = 20,
): Promise<{ id: string; subjectType: string; status: string; startedAt: string; finishedAt: string | null; error: string | null }[]> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select({
        id: workflowRuns.id,
        subjectType: workflowRuns.subjectType,
        status: workflowRuns.status,
        startedAt: workflowRuns.startedAt,
        finishedAt: workflowRuns.finishedAt,
        error: workflowRuns.error,
      })
      .from(workflowRuns)
      .innerJoin(workflows, eq(workflows.id, workflowRuns.workflowId))
      .where(eq(workflows.reference, reference))
      .orderBy(desc(workflowRuns.startedAt))
      .limit(Math.min(100, Math.max(1, limit)));

    return rows.map((row) => ({
      id: row.id,
      subjectType: row.subjectType,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      error: row.error,
    }));
  });
}

async function graphIn(
  tx: Parameters<Parameters<typeof withSession>[1]>[0],
  reference: string,
): Promise<WorkflowGraph> {
  const [row] = await tx
    .select({ ...projection, id: workflows.id })
    .from(workflows)
    .leftJoin(staff, eq(staff.id, workflows.createdBy))
    .where(eq(workflows.reference, reference))
    .limit(1);
  if (!row) throw new NotFoundError("That workflow could not be found.", { reference });

  const id = row.id as string;
  const nodes = await tx
    .select({
      id: workflowNodes.id,
      kind: workflowNodes.kind,
      label: workflowNodes.label,
      config: workflowNodes.config,
      position: workflowNodes.position,
    })
    .from(workflowNodes)
    .where(eq(workflowNodes.workflowId, id));
  const edges = await tx
    .select({
      id: workflowEdges.id,
      source: workflowEdges.sourceNodeId,
      target: workflowEdges.targetNodeId,
      condition: workflowEdges.condition,
    })
    .from(workflowEdges)
    .where(eq(workflowEdges.workflowId, id));

  return {
    workflow: toDTO(row as Record<string, unknown>),
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: fromDbEnum(node.kind) as WorkflowNodeKind,
      label: node.label,
      config: (node.config as Record<string, unknown>) ?? {},
      position: node.position,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      condition: edge.condition,
    })),
  };
}
