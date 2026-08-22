# 15: Observability

**What to build:** Add an `error_log` table in Neon for persistent error tracking, structured console logging for Vercel runtime logs, and surface error trends in the admin security UI. Errors caught by error boundaries report to the DB via Server Action.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `error_log` table migration: id, timestamp, level, message, stack, request_id, user_id, metadata (jsonb)
- [ ] Structured logging helper at `lib/server/logging.ts` outputting JSON to console (Vercel parses these)
- [ ] Error boundary `error.tsx` components report errors to DB via Server Action
- [ ] `lib/server/api/handle.ts` logs caught errors to `error_log` table
- [ ] Admin security page (`/admin/security`) shows error count by hour chart + recent errors table
- [ ] Errors older than 30 days auto-pruned (or capped by row count to stay within Neon storage)
