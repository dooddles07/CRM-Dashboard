"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Lead, LeadStage } from "@/lib/types";
import { leadStage, priorityMeta } from "@/lib/status";
import { staffById } from "@/lib/data/people";
import { sourceLabels } from "@/lib/data/constants";
import { formatCurrency } from "@/lib/format";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { StatusChip } from "@/components/healthcare/status-chip";
import { cn } from "@/lib/utils";

const STAGES: LeadStage[] = ["new", "contacted", "qualified", "booked", "visited", "converted"];

function LeadCard({ lead, overlay }: { lead: Lead; overlay?: boolean }) {
  const owner = staffById(lead.ownerId);
  return (
    <div
      className={cn(
        "rounded-md border border-line bg-surface p-2.5 shadow-card",
        overlay ? "cursor-grabbing shadow-raised" : "cursor-grab hover:border-line-strong",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-body-sm font-medium text-ink">{lead.name}</p>
        <StatusChip meta={priorityMeta[lead.priority]} showIcon={false} className="shrink-0" />
      </div>
      <p className="mt-0.5 truncate text-caption text-ink-3">{lead.interest}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-body-sm font-medium text-ink tabular-nums">
          {formatCurrency(lead.value)}
        </span>
        <span className="flex items-center gap-1.5 text-caption text-ink-3">
          {sourceLabels[lead.source]}
          {owner && (
            <PersonAvatar name={owner.name} id={owner.id} size="xs" initials={owner.initials} />
          )}
        </span>
      </div>
    </div>
  );
}

function DraggableCard({ lead }: { lead: Lead }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => router.push(`/leads/${lead.id}`)}
      className={cn("touch-none outline-none", isDragging && "opacity-40")}
    >
      <LeadCard lead={lead} />
    </div>
  );
}

function Column({ stage, leads }: { stage: LeadStage; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const meta = leadStage[stage];
  const total = leads.reduce((s, l) => s + l.value, 0);

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <StatusChip meta={meta} />
          <span className="text-caption text-ink-3 tabular-nums">{leads.length}</span>
        </div>
        <span className="text-caption text-ink-3 tabular-nums">{formatCurrency(total)}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors",
          isOver ? "border-primary-line bg-primary-soft/40" : "border-line bg-surface-2/50",
        )}
      >
        {leads.map((l) => (
          <DraggableCard key={l.id} lead={l} />
        ))}
        {leads.length === 0 && (
          <p className="px-1 py-6 text-center text-caption text-ink-3">Drop leads here</p>
        )}
      </div>
    </div>
  );
}

export function LeadBoard({ leads: initial }: { leads: Lead[] }) {
  const [leads, setLeads] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const target = over.id as LeadStage;
    if (!STAGES.includes(target)) return;
    setLeads((prev) =>
      prev.map((l) => (l.id === active.id && l.stage !== target ? { ...l, stage: target } : l)),
    );
  }

  const active = leads.find((l) => l.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => (
          <Column key={stage} stage={stage} leads={leads.filter((l) => l.stage === stage)} />
        ))}
      </div>
      <DragOverlay>{active ? <LeadCard lead={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
