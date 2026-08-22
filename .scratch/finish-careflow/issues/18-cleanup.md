# 18: Cleanup

**What to build:** Delete the seed data layer (`lib/data/`) and the zustand store that served mock data. Verify zero imports from deleted modules across the entire codebase. Remove any dead code left behind by the migration.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] `lib/data/` directory deleted entirely
- [ ] Zustand store (`useCareflow` or similar) removed if no longer used for real client state
- [ ] Zero imports from `lib/data/` anywhere in `app/`
- [ ] Zero references to deleted modules in any file
- [ ] Build passes (`npm run build`)
- [ ] Lint passes (`npm run lint`)
- [ ] Types pass (`npx tsc --noEmit`)
- [ ] No dead exports or unused imports left behind
