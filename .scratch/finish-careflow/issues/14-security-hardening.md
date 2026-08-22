# 14: Security hardening

**What to build:** Add CSP with nonce, security headers, and rate limiting via Upstash Redis free tier. The application serves proper security headers on every response and rate-limits API requests to prevent abuse.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] CSP nonce generated in `proxy.ts`, passed to root layout via header
- [ ] Root layout injects nonce into script and style tags
- [ ] Security headers set in `proxy.ts`: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- [ ] `@upstash/ratelimit` installed with Upstash Redis free tier
- [ ] Rate limiting applied in `lib/server/api/handle.ts`: sliding window, per-IP for anonymous, per-user for authenticated
- [ ] Rate limit exceeded returns 429 with `RateLimitError`
- [ ] Upload validation: file type allowlist, size cap enforced at API boundary
- [ ] `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars documented
