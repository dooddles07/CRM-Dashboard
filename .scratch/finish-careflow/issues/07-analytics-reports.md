# 07: Analytics + reports migration

**What to build:** Migrate `/analytics` and `/reports` from seed data to real database. Analytics page shows real charts (patient growth, appointment trends, lead conversion, department load) computed from DB aggregations. Reports page generates downloadable reports from real data.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `/analytics` reads from analytics service with real aggregate queries
- [ ] Charts render real trends (patient growth, appointment volume, lead conversion rates)
- [ ] Department and channel breakdowns computed from real data
- [ ] `/reports` generates reports from real DB data
- [ ] Report export writes to audit log
- [ ] Both routes have `error.tsx` and Suspense skeletons
- [ ] No imports from `lib/data/` in analytics or reports routes
