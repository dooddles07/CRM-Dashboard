# 02: Appointments migration

**What to build:** Migrate `/appointments` list and `/appointments/[id]` detail from seed data to real database. A visitor sees today's appointment board, filters by status/doctor/department, clicks into a detail view with patient context and status progression, and can create or reschedule an appointment.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `/appointments` list reads from appointment service, not `lib/data/`
- [ ] `/appointments/[id]` detail shows real appointment with patient + doctor info
- [ ] Calendar view (`/appointments/calendar`) renders real scheduled appointments
- [ ] Status transitions (confirm, check-in, complete, cancel, reschedule) work via Server Actions
- [ ] Appointment creation form persists to DB
- [ ] Double-booking exclusion constraint respected (existing DB constraint)
- [ ] Both routes have `error.tsx` and Suspense skeletons
- [ ] No imports from `lib/data/` in appointment routes
