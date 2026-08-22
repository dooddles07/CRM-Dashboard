# 03: Leads + follow-ups migration

**What to build:** Migrate `/leads`, `/leads/[id]`, and `/follow-ups` from seed data to real database. A visitor sees the lead pipeline board with drag-and-drop stage changes that persist, clicks into a lead detail with activity history, and views follow-ups with due dates and overdue indicators. Completing a follow-up updates status in the DB.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `/leads` board reads from lead service, not `lib/data/`
- [ ] Drag-and-drop stage changes persist via Server Action using lead stage service
- [ ] `/leads/[id]` detail shows real lead with stage history and activity
- [ ] Lead conversion (lead to patient) works end-to-end
- [ ] `/follow-ups` list reads from follow-up service with real due dates
- [ ] Follow-up status transitions (complete, reschedule) work via Server Actions
- [ ] Overdue follow-ups display correctly based on real dates
- [ ] All three routes have `error.tsx` and Suspense skeletons
- [ ] No imports from `lib/data/` in leads or follow-ups routes
