# 11: Email delivery

**What to build:** Wire Resend free tier (100 emails/day) as an email provider alongside the existing sandbox. Invitation emails, password reset emails, and campaign sends actually deliver to real addresses. Provider selected via env var, sandbox remains the fallback.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Resend provider adapter at `lib/server/comms/providers/resend.ts`
- [ ] Provider selection via env var (`EMAIL_PROVIDER=resend|sandbox`)
- [ ] Invitation emails send via Resend when configured
- [ ] Password reset emails send via Resend when configured
- [ ] Campaign batch sends use Resend with delivery tracking
- [ ] Delivery events (sent, delivered, opened, bounced, failed) tracked in `message_events` table
- [ ] Sandbox provider still works when `EMAIL_PROVIDER=sandbox` or env var missing
- [ ] `RESEND_API_KEY` env var documented
