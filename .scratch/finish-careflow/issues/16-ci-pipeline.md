# 16: CI pipeline

**What to build:** GitHub Actions workflow that runs on every PR to main. Checks lint, typecheck, tests, and Drizzle migration consistency. PRs cannot merge with failing checks. Vercel auto-deploys on push to main.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `.github/workflows/ci.yml` created
- [ ] Triggers on pull_request to main
- [ ] Steps: checkout, install dependencies, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npx drizzle-kit check`
- [ ] Node.js version matches project (check engines field or .nvmrc)
- [ ] CI passes on current codebase (fix any existing lint/type errors first)
- [ ] Vercel GitHub integration auto-deploys on push to main (verify existing setup)
- [ ] Branch protection rule recommended (document, don't enforce — free tier may limit)
