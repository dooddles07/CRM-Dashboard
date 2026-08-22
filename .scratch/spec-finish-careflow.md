---
labels: ready-for-agent
title: "Ship CareFlow CRM to production — zero cost, full scope"
---

## Problem Statement

CareFlow CRM is 60% complete. All 37 screens are built and visually polished, but 20 routes still read from in-memory seed data instead of the real Neon Postgres database. Phases 07–10 (jobs/messaging, security hardening, observability, deployment) are not started. The project cannot serve as a credible portfolio piece until a hiring manager can click the live link, log in with pre-filled credentials, and interact with real data through real backend flows.

## Solution

Complete all remaining work across Phases 06–10, deploy to Vercel free tier, and present a fully functional healthcare CRM backed by real infrastructure — all at zero recurring cost.

**Phase 06 — Screen Migration (20 routes):**
Migrate every remaining route from `lib/data/` seed imports to server-shell pattern calling `lib/server/services/`. Follow the established recipe: git mv to `-client.tsx`, accept props, write server shell with `use cache` / Suspense / error boundary, wire mutations to Server Actions.

**Phase 07 — Jobs & Messaging:**
Wire Resend free tier for transactional and campaign email delivery. Add pg-boss for background job processing, triggered by Vercel cron. Build provider adapter layer so the sandbox fallback remains available.

**Phase 08 — Security Hardening:**
Add CSP with nonce, security headers via proxy.ts, rate limiting via Upstash Redis free tier, upload validation for Vercel Blob (250MB free tier).

**Phase 09 — Observability:**
Add `error_log` table in Neon. Structured console logging. Vercel built-in logs for runtime visibility. Surface error trends in admin UI.

**Phase 10 — Deployment:**
GitHub Actions CI (lint, typecheck, test on PR). Drizzle migration check step. Vercel auto-deploy on push to main. Rollback via Vercel dashboard. Pre-filled demo credentials on login page. Seed script populates realistic data on deploy.

**AI Features:**
Replace canned AI responses on `/ai` and Command Center insights with real LLM calls via a free-tier provider (Google Gemini or Groq).

**File Storage:**
Vercel Blob free tier for patient document uploads.

## User Stories

1. As a hiring manager, I want to click a live link and see a populated CRM dashboard, so that I can evaluate the candidate's full-stack capabilities in 30 seconds.
2. As a hiring manager, I want pre-filled login credentials on the login page, so that I can access the demo without searching for credentials.
3. As a demo visitor, I want to browse a patient list with realistic data, so that I can see the data table, filters, and search working against a real database.
4. As a demo visitor, I want to click into a patient record and see all 9 tabs populated, so that I can evaluate the detail-view architecture.
5. As a demo visitor, I want to view masked contact fields and click "Reveal" to see the real value, so that I can experience the PII protection mechanism.
6. As a demo visitor, I want to view the appointment calendar with scheduled appointments, so that I can see the scheduling UI working with real data.
7. As a demo visitor, I want to create a new appointment and see it appear on the calendar, so that I can verify write operations work end-to-end.
8. As a demo visitor, I want to view the lead pipeline board with drag-and-drop stage changes, so that I can see the pipeline management flow.
9. As a demo visitor, I want to drag a lead to a new stage and see the change persist, so that I can verify mutations work through the board UI.
10. As a demo visitor, I want to click into a lead detail page with real activity history, so that I can see the full lead lifecycle.
11. As a demo visitor, I want to view follow-ups with due dates and overdue indicators, so that I can see the follow-up tracking system.
12. As a demo visitor, I want to complete a follow-up and see the status update, so that I can verify the follow-up workflow.
13. As a demo visitor, I want to view and manage tasks with real status transitions, so that I can see the task management system.
14. As a demo visitor, I want to view referrals with source tracking, so that I can see the referral pipeline.
15. As a demo visitor, I want to see the inbox with real conversation threads, so that I can evaluate the messaging UI.
16. As a demo visitor, I want to view campaigns with recipient lists and delivery status, so that I can see the campaign management system.
17. As a demo visitor, I want to see feedback entries with sentiment indicators, so that I can evaluate the patient experience module.
18. As a demo visitor, I want to view complaints with SLA timelines and case progression, so that I can see the complaint resolution workflow.
19. As a demo visitor, I want to see the Command Center dashboard with real KPIs computed from database data, so that I can evaluate the analytics capabilities.
20. As a demo visitor, I want to view the analytics page with real charts and trends, so that I can see data visualization skills.
21. As a demo visitor, I want to interact with the AI console and receive real LLM-generated insights, so that I can see AI integration capabilities.
22. As a demo visitor, I want to see AI-generated insights on the Command Center, so that the dashboard feels intelligent and modern.
23. As a demo visitor, I want to view doctor profiles with real department assignments and availability, so that I can see the staff directory.
24. As a demo visitor, I want to browse the automation/workflow canvas, so that I can see the visual workflow builder.
25. As a demo visitor, I want to see integration cards with connection status, so that I can evaluate the integration management UI.
26. As a demo visitor, I want to view the audit log with real entries from my demo session, so that I can see the security audit trail.
27. As a demo visitor, I want to see the admin security posture page with real metrics, so that I can evaluate the security dashboard.
28. As a demo visitor, I want to visit the settings page and see real user preferences, so that the settings screen is not empty.
29. As a demo visitor, I want the reports page to show real generated reports, so that I can see the reporting module.
30. As a portfolio reviewer, I want to see the GitHub repo has CI passing on every commit, so that I can verify engineering discipline.
31. As a portfolio reviewer, I want to see proper security headers in the browser devtools, so that I can verify security awareness.
32. As a portfolio reviewer, I want the site to load fast with good Core Web Vitals, so that I can verify performance competence.
33. As a portfolio reviewer, I want to see the application handles errors gracefully (not white screens), so that I can verify error handling maturity.
34. As a demo visitor, I want email notifications to actually send (invite flow, password reset), so that the transactional email system is demonstrably real.
35. As a demo visitor, I want to upload a document to a patient record and see it persist, so that file storage is demonstrably real.

## Implementation Decisions

### Phase 06 — Screen Migration

- Follow the established 5-step migration recipe from `plan/06-screen-migration.md`. The `/patients` route is the reference implementation.
- Migration order: core CRM first (appointments, leads, follow-ups, patients/[id], patients/new, Command Center), then engagement (complaints, inbox, campaigns), then operations (doctors/[id]), then insights (analytics, reports, ai), then admin (security, settings), then automation (automations, integrations).
- Every migrated route gets `error.tsx` and a Suspense skeleton.
- Server Actions go in `app/actions/`, one file per domain, following the `ActionResult<T>` pattern from `patients.ts`.
- Cache invalidation via `updateTag()`, not `revalidateTag()`.
- "Done when" no file under `app/` imports from `lib/data/`.

### Phase 07 — Jobs & Messaging

- Resend free tier (100 emails/day) for real email delivery. Provider adapter pattern: `lib/server/comms/providers/resend.ts` alongside existing `sandbox.ts`. Selection via env var `EMAIL_PROVIDER=resend|sandbox`.
- pg-boss installed, schema in Neon. Worker triggered by Vercel cron hitting an API route (`/api/cron/process-jobs`). Cron frequency limited by Vercel free tier (1/day via Vercel, supplement with cron-job.org for higher frequency).
- Job types: campaign batch send, appointment reminders, follow-up overdue notifications.
- Outbound message tracking via existing `outbound_messages` + `message_events` tables.

### Phase 08 — Security Hardening

- CSP with nonce generated in `proxy.ts` (Next 16 middleware). Nonce passed via header, consumed by root layout.
- Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy — all set in `proxy.ts`.
- Rate limiting via `@upstash/ratelimit` with Upstash Redis free tier. Applied in `lib/server/api/handle.ts` (already has rate limit scaffolding). Sliding window, per-IP for anonymous, per-user for authenticated.
- Upload validation: file type allowlist, size cap (10MB per file), Vercel Blob free tier (250MB total).

### Phase 09 — Observability

- `error_log` table in Neon: id, timestamp, level, message, stack, request_id, user_id, metadata (jsonb).
- Structured logging helper: `lib/server/logging.ts` writing to console in JSON format (Vercel parses structured logs).
- Error boundary integration: `error.tsx` components call a server action that writes to `error_log`.
- Admin UI: surface error trends on `/admin/security` page. Simple count-by-hour chart + recent errors table.

### Phase 10 — Deployment

- GitHub Actions workflow: `.github/workflows/ci.yml`. Triggers on PR to main. Steps: checkout, install, lint (`npm run lint`), typecheck (`npx tsc --noEmit`), test (`npm test`), drizzle migration check (`npx drizzle-kit check`).
- Vercel auto-deploy on push to main (already configured via Vercel GitHub integration).
- Rollback via Vercel dashboard (built-in, no custom tooling).
- Demo credentials: seed script creates a demo user (`demo@careflow.dev` / `CareFlow2026!`). Login page pre-fills these values.
- Seed script (`scripts/seed.ts`) runs as part of deploy setup, populating realistic patient, appointment, lead, and operational data.

### AI Features

- Free-tier LLM provider (Google Gemini free or Groq free). Provider abstraction: `lib/server/ai/provider.ts` with `generateInsight(prompt): Promise<string>`.
- AI console (`/ai`): real conversational interface calling LLM with CRM context (recent KPIs, patient counts, trends) as system prompt.
- Command Center insights: pre-computed daily via cron job, stored in a `ai_insights` table or computed on request with short cache.
- Graceful degradation: if LLM quota exhausted, fall back to last cached response with staleness indicator.

### File Storage

- Vercel Blob via `@vercel/blob`. Upload via Server Action in `app/actions/documents.ts`.
- Patient documents stored with reference to patient, uploader, timestamp, file type.
- 250MB cap managed by checking total usage before upload.

## Testing Decisions

- **Seam:** Service layer (`lib/server/services/*.ts`). All business logic routes through services. API routes and server actions are thin wrappers — testing services covers the business logic.
- **Pattern:** `node:test` + `node:assert/strict`, matching `matrix.test.ts`. No framework to add.
- **What makes a good test:** Test external behavior (input DTO in, output DTO out, side effects verified). Do not test Drizzle query construction or internal helper functions. Test against a real Neon branch database, not mocks.
- **Scope:** One test file per service module: `patients.test.ts`, `appointments.test.ts`, `leads.test.ts`, `complaints.test.ts`, `campaigns.test.ts`. Cover create, read (list + detail), update, archive/restore, and authorization denial for each.
- **Prior art:** `lib/server/authz/matrix.test.ts` — same runner, same assertion style, same file-adjacent placement.
- **Integration test:** `scripts/policy-tests.ts` pattern for RLS verification of new tables.

## Out of Scope

- Self-registration (accounts are provisioned by invitation, by design)
- Custom domain (zero cost constraint)
- Real EMR integration (CareFlow sits beside the EMR conceptually; no actual HL7/FHIR interface)
- Mobile-native app (responsive web only)
- Multi-tenant / multi-hospital support
- HIPAA compliance certification (this is a portfolio demo, not a regulated product)
- Paid service tiers or upgrades beyond free tiers
- Automated load testing or performance benchmarking
- Internationalization / localization
- Offline support / PWA

## Further Notes

- **Free tier limits to monitor:** Neon 0.5 GB storage (schema + seed data + uploads metadata must fit), Vercel 100 GB bandwidth, Resend 100 emails/day, Upstash 10K requests/day, Vercel Blob 250MB. All generous for a portfolio project with minimal real traffic.
- **Estimated remaining effort:** 25–35 sessions across all phases.
- **Risk:** pg-boss on Vercel serverless requires cron-triggered processing, not a persistent worker. If Vercel free tier limits cron to 1/day, supplement with cron-job.org (free, 1-minute intervals).
- **Risk:** Free LLM tier may have rate limits or downtime. Graceful degradation to cached responses is mandatory.
- **The seed data modules in `lib/data/` can be deleted entirely once Phase 06 completes.** This is the clearest "done" signal: zero imports from that directory.
