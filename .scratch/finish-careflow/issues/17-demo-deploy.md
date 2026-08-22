# 17: Demo setup + deploy

**What to build:** Configure the live demo for portfolio visitors. Login page shows pre-filled credentials for a demo account. Seed script creates realistic data. Deploy configuration verified on Vercel free tier. A hiring manager clicks the link, sees pre-filled creds, logs in, and lands on a populated Command Center.

**Blocked by:** 09, 16

**Status:** ready-for-agent

- [ ] Seed script creates demo user (`demo@careflow.dev` / known password) with appropriate role
- [ ] Login page pre-fills email and password fields for demo user
- [ ] Pre-filled credentials are visually indicated (e.g., helper text: "Demo credentials pre-filled")
- [ ] Seed script populates realistic data: 50+ patients, 100+ appointments, 30+ leads, follow-ups, complaints, feedback, conversations, campaigns
- [ ] Seed script is idempotent (safe to re-run without duplicating data)
- [ ] All required env vars set in Vercel dashboard
- [ ] Deploy succeeds on Vercel free tier
- [ ] Health check endpoint (`/api/health`) passes post-deploy
- [ ] Live URL accessible and demo login works end-to-end
