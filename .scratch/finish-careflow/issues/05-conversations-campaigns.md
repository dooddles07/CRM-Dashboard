# 05: Conversations + campaigns migration

**What to build:** Migrate `/inbox`, `/campaigns`, and `/campaigns/[id]` from seed data to real database. A visitor sees conversation threads across channels (SMS, email, WhatsApp, call) with real messages, and views campaigns with recipient lists, delivery status tracking, and funnel visualization.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `/inbox` reads conversations from conversation service, not `lib/data/`
- [ ] Conversation threads display messages with real timestamps and channel indicators
- [ ] Message sending works via Server Action (writes to DB, delivery stays sandbox until Phase 07)
- [ ] `/campaigns` list reads from campaign service with real status and recipient counts
- [ ] `/campaigns/[id]` detail shows recipient list, delivery stats, and funnel
- [ ] Campaign status transitions (schedule, pause, resume) work via Server Actions
- [ ] All three routes have `error.tsx` and Suspense skeletons
- [ ] No imports from `lib/data/` in inbox or campaign routes
