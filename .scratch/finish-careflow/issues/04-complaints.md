# 04: Complaints migration

**What to build:** Migrate `/complaints` list and `/complaints/[id]` detail from seed data to real database. A visitor sees complaints with SLA timelines, priority indicators, and case status progression. Clicking into a complaint shows full case history with assignment, investigation notes, and resolution.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `/complaints` list reads from complaint service, not `lib/data/`
- [ ] Filters by status, priority, department work against real data
- [ ] `/complaints/[id]` detail shows real case with SLA timeline and status history
- [ ] Case status transitions (assign, investigate, resolve, close) work via Server Actions
- [ ] SLA indicators compute from real timestamps
- [ ] Both routes have `error.tsx` and Suspense skeletons
- [ ] No imports from `lib/data/` in complaint routes
