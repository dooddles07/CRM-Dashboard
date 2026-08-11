"use client";

import { create } from "zustand";
import type { AppNotification, AuditEntry, Patient } from "@/lib/types";
import { patients as seedPatients } from "@/lib/data/people";
import { notifications as seedNotifications, seedAudit } from "@/lib/data/system";

export interface RevealRequest {
  resource: string;
  resourceId: string;
  field: string;
}

/**
 * Who this store attributes its audit entries to. Set once by
 * `ViewerProvider` (components/shell/viewer-context.tsx) from the session the
 * app layout resolved, replacing the hardcoded `CURRENT_USER` this store used
 * to name — which meant every reveal in the demo was recorded against Isabel
 * Domingo no matter who was signed in, in a product whose whole subject is
 * the audit trail.
 *
 * Still a client-side, in-memory audit log. Phase 04's reveal transaction is
 * what makes an entry a row in `audit_log`; this only stops the entry naming
 * the wrong person in the meantime.
 */
export interface StoreActor {
  id: string;
  name: string;
}

const UNKNOWN_ACTOR: StoreActor = { id: "unknown", name: "Unknown" };

interface CareflowState {
  actor: StoreActor;
  setActor: (actor: StoreActor) => void;

  patients: Patient[];
  notifications: AppNotification[];
  auditLog: AuditEntry[];
  /** Keys of PII the current session has chosen to reveal. */
  revealed: Record<string, true>;
  commandOpen: boolean;
  notificationsOpen: boolean;
  railCollapsed: boolean;
  density: "comfortable" | "compact";

  reveal: (req: RevealRequest) => void;
  isRevealed: (key: string) => boolean;
  logAudit: (
    entry: Omit<AuditEntry, "id" | "actorId" | "actorName" | "timestamp" | "ip" | "device">,
  ) => void;

  addPatient: (patient: Patient) => void;
  updatePatient: (id: string, patch: Partial<Patient>) => void;

  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  setCommandOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
  toggleRail: () => void;
  setDensity: (density: "comfortable" | "compact") => void;
}

export const revealKey = (req: RevealRequest) => `${req.resourceId}:${req.field}`;

let auditSeq = 100;
const nextAuditId = () => `a-${(auditSeq += 1)}`;

/** The session's own device fingerprint, as the audit trail would record it. */
const SESSION = { ip: "112.198.44.2", device: "Chrome · Windows" };

export const useCareflow = create<CareflowState>((set, get) => ({
  actor: UNKNOWN_ACTOR,
  setActor: (actor) => set({ actor }),

  patients: seedPatients,
  notifications: seedNotifications,
  auditLog: seedAudit,
  revealed: {},
  commandOpen: false,
  notificationsOpen: false,
  railCollapsed: false,
  density: "comfortable",

  reveal: (req) => {
    const key = revealKey(req);
    if (get().revealed[key]) return;
    set((s) => ({
      revealed: { ...s.revealed, [key]: true },
      auditLog: [
        {
          id: nextAuditId(),
          actorId: get().actor.id,
          actorName: get().actor.name,
          action: "revealed",
          resource: req.resource,
          resourceId: req.resourceId,
          field: req.field,
          previousValue: null,
          newValue: null,
          timestamp: new Date().toISOString(),
          ...SESSION,
        },
        ...s.auditLog,
      ],
    }));
  },

  isRevealed: (key) => Boolean(get().revealed[key]),

  logAudit: (entry) =>
    set((s) => ({
      auditLog: [
        {
          ...entry,
          id: nextAuditId(),
          actorId: get().actor.id,
          actorName: get().actor.name,
          timestamp: new Date().toISOString(),
          ...SESSION,
        },
        ...s.auditLog,
      ],
    })),

  addPatient: (patient) => set((s) => ({ patients: [patient, ...s.patients] })),

  updatePatient: (id, patch) =>
    set((s) => ({
      patients: s.patients.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  markNotificationRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    })),

  markAllNotificationsRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),

  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
  setDensity: (density) => set({ density }),
}));

export const useUnreadCount = () =>
  useCareflow((s) => s.notifications.filter((n) => !n.read).length);
