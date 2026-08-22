# 01: Patient detail + creation migration

**What to build:** Migrate `/patients/[id]` and `/patients/new` from seed data to real database. The patient detail page has 9 tabs (overview, appointments, documents, notes, timeline, billing, insurance, follow-ups, activity). A visitor clicks into a patient from the already-migrated list, sees all tabs populated with real data, and can create a new patient via the creation form with validation and persistence.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `/patients/[id]` reads from patient service, not `lib/data/`
- [x] All 9 tabs render real data via server shell + `-client.tsx` pattern
- [x] Patient timeline tab uses the timeline service
- [x] `/patients/new` form submits via Server Action, creates real patient in DB
- [x] PII fields render masked; Reveal works end-to-end with audit entry
- [x] Both routes have `error.tsx` and Suspense skeletons
- [x] No imports from `lib/data/` in either route
