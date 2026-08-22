# 12: Background jobs

**What to build:** Install pg-boss for durable job processing on Postgres. Vercel cron triggers an API route that processes the job queue. Jobs include campaign batch sends, appointment reminders, and follow-up overdue notifications. Jobs execute in the serverless function invoked by cron.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] pg-boss installed and schema created in Neon
- [ ] Job processing API route at `/api/cron/process-jobs`
- [ ] Vercel cron configuration triggers the processing route
- [ ] Campaign batch send job: picks queued campaign, sends batch via email provider, updates delivery status
- [ ] Appointment reminder job: finds appointments within reminder window, sends notification
- [ ] Follow-up overdue job: marks overdue follow-ups, creates notifications
- [ ] Jobs are idempotent (safe to re-run if cron fires twice)
- [ ] Job failures logged with retry policy
- [ ] If Vercel free tier cron limit (1/day) is too infrequent, document cron-job.org as supplement
