# 06: Remaining operations + admin migration

**What to build:** Migrate `/doctors/[id]`, `/admin/security`, and `/settings` from seed data to real database. Doctor detail shows profile with department, schedule, and patient panel. Admin security page shows real posture metrics. Settings page shows and persists user preferences.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `/doctors/[id]` detail reads from doctor service with real department and availability
- [ ] `/admin/security` shows real security metrics (active sessions, failed logins, lockouts) from DB
- [ ] `/settings` page reads and writes user preferences via Server Action
- [ ] Preferences persist to DB (R17 from PRD)
- [ ] All three routes have `error.tsx` and Suspense skeletons
- [ ] No imports from `lib/data/` in these routes
