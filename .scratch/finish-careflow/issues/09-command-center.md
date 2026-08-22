# 09: Command Center migration

**What to build:** Migrate the `/` dashboard from seed data to real database. The Command Center shows 8 KPIs with sparklines, patient growth chart, today's appointments, alerts for overdue follow-ups / missed appointments / unresolved complaints / failing workflows, department mix, lead conversion, acquisition sources, and satisfaction scores — all computed from real data across every domain.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 08

**Status:** ready-for-agent

- [ ] All 8 KPIs compute from real aggregate queries (patient count, appointments today, open leads, pending follow-ups, etc.)
- [ ] Sparklines render real 7-day or 30-day trends
- [ ] Patient growth chart shows real monthly data
- [ ] Today's appointments section pulls from appointment service
- [ ] Alert cards compute from real overdue/missed/unresolved counts
- [ ] Department mix, lead conversion funnel, acquisition chart use real aggregations
- [ ] Satisfaction score computed from real feedback data
- [ ] Route has `error.tsx` and Suspense skeletons
- [ ] No imports from `lib/data/` in Command Center
