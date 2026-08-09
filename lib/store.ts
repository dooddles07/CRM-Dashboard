"use client";

import { create } from "zustand";
import type { AppNotification, AuditEntry, Patient } from "@/lib/types";
import { CURRENT_USER } from "@/lib/data/constants";
import { patients as seedPatients } from "@/lib/data/people";
import { notifications as seedNotifications, seedAudit } from "@/lib/data/system";

export interface RevealRequest {
  resource: string;
  resourceId: string;
  field: string;
}

interface CareflowState {
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
          actorId: CURRENT_USER.id,
          actorName: CURRENT_USER.name,
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
          actorId: CURRENT_USER.id,
          actorName: CURRENT_USER.name,
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
