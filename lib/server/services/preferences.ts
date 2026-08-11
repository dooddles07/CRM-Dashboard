import { eq, sql } from "drizzle-orm";
import type { AuthzSession } from "@/lib/server/authz/policy";
import { withSession } from "@/lib/server/db/session";
import { userPreferences } from "@/lib/server/db/schema/system";
import { ValidationError } from "./errors";

/**
 * plan/04-service-layer.md §9: "Replaces the UI slice of the zustand store."
 *
 * §10 is more precise about what that means: `railCollapsed` and `density`
 * are "kept, and mirrored to `user_preferences` so they survive a device
 * change". The store stays the source of truth for the current tab — a
 * density toggle must not wait on a round trip — and this is where it lands
 * so the next device agrees.
 *
 * Per-staff, like notifications, and scoped by `user_preferences_own` in
 * drizzle/manual/0007 rather than by a `WHERE` clause here. No `assert`
 * call: these are the caller's own settings, and no role in the matrix has
 * anything to say about whether someone may prefer a compact table.
 */

export type Density = "comfortable" | "compact";
export type Theme = "light" | "dark" | "system";

export interface PreferencesDTO {
  density: Density;
  theme: Theme;
  railCollapsed: boolean;
}

const DEFAULTS: PreferencesDTO = {
  density: "comfortable",
  theme: "system",
  railCollapsed: false,
};

const DENSITIES: readonly string[] = ["comfortable", "compact"];
const THEMES: readonly string[] = ["light", "dark", "system"];

/**
 * Returns defaults rather than throwing when no row exists.
 *
 * A staff member who has never opened Settings has no row, and that is the
 * normal case rather than an error — every account starts there. Writing a
 * row at provisioning time instead would put a migration's worth of rows in
 * the way of a feature nobody has used yet.
 */
export async function get(session: AuthzSession): Promise<PreferencesDTO> {
  return withSession(session, async (tx) => {
    const [row] = await tx
      .select({
        density: userPreferences.density,
        theme: userPreferences.theme,
        railCollapsed: userPreferences.railCollapsed,
      })
      .from(userPreferences)
      .where(eq(userPreferences.staffId, session.staffId))
      .limit(1);

    if (!row) return { ...DEFAULTS };
    return {
      density: (DENSITIES.includes(row.density) ? row.density : DEFAULTS.density) as Density,
      theme: (THEMES.includes(row.theme) ? row.theme : DEFAULTS.theme) as Theme,
      railCollapsed: row.railCollapsed,
    };
  });
}

/**
 * Upsert, because "first write" and "later write" are the same operation from
 * the caller's side and splitting them would push a `get` before every `set`.
 *
 * `staff_id` is taken from the session, never from the patch — the row's
 * identity is who is asking. The RLS policy would refuse a mismatched id
 * anyway, but not accepting one at all means there is no parameter in which
 * to attempt it.
 */
export async function update(
  session: AuthzSession,
  patch: Partial<PreferencesDTO>,
): Promise<PreferencesDTO> {
  if (patch.density !== undefined && !DENSITIES.includes(patch.density)) {
    throw new ValidationError("That display density is not one this application offers.", {
      field: "density",
      value: patch.density,
    });
  }
  if (patch.theme !== undefined && !THEMES.includes(patch.theme)) {
    throw new ValidationError("That theme is not one this application offers.", {
      field: "theme",
      value: patch.theme,
    });
  }

  return withSession(session, async (tx) => {
    const next = {
      ...(patch.density !== undefined ? { density: patch.density } : {}),
      ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
      ...(patch.railCollapsed !== undefined ? { railCollapsed: patch.railCollapsed } : {}),
    };

    await tx
      .insert(userPreferences)
      .values({ staffId: session.staffId, ...DEFAULTS, ...next, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userPreferences.staffId,
        set: { ...next, updatedAt: sql`now()` },
      });

    const [row] = await tx
      .select({
        density: userPreferences.density,
        theme: userPreferences.theme,
        railCollapsed: userPreferences.railCollapsed,
      })
      .from(userPreferences)
      .where(eq(userPreferences.staffId, session.staffId))
      .limit(1);

    return {
      density: (row?.density ?? DEFAULTS.density) as Density,
      theme: (row?.theme ?? DEFAULTS.theme) as Theme,
      railCollapsed: row?.railCollapsed ?? DEFAULTS.railCollapsed,
    };
  });
}
