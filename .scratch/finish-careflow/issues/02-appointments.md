# 02: Appointments migration

**What to build:** Migrate `/appointments` list and `/appointments/[id]` detail from seed data to real database. A visitor sees today's appointment board, filters by status/doctor/department, clicks into a detail view with patient context and status progression, and can create or reschedule an appointment.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `/appointments` list reads from appointment service, not `lib/data/`
- [x] `/appointments/[id]` detail shows real appointment with patient + doctor info
- [x] Calendar view (`/appointments/calendar`) renders real scheduled appointments
- [x] Status transitions (confirm, check-in, complete, cancel, reschedule) work via Server Actions
- [x] Appointment creation form persists to DB
- [x] Double-booking exclusion constraint respected (existing DB constraint)
- [x] Both routes have `error.tsx` and Suspense skeletons
- [x] No imports from `lib/data/` in appointment routes
