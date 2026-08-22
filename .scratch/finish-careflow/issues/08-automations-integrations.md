# 08: Automations + integrations migration

**What to build:** Migrate `/automations`, `/automations/[id]`, and `/integrations` from seed data to real database. Automations list shows workflows with real status. Workflow detail shows the visual canvas with real node graph from DB. Integrations page shows connection cards with real status.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `/automations` list reads from workflow service, not `lib/data/`
- [ ] `/automations/[id]` detail loads real workflow graph for the visual canvas
- [ ] Workflow status transitions (activate, pause, draft) work via Server Actions
- [ ] `/integrations` list reads from integration service with real connection status
- [ ] Integration enable/disable works via Server Actions
- [ ] All three routes have `error.tsx` and Suspense skeletons
- [ ] No imports from `lib/data/` in automation or integration routes
