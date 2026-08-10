# CareFlow CRM documentation

Hospital patient-relationship dashboard for St. Aurora Medical Center, a fictional 320-bed
hospital in Quezon City. Built with Next.js 16, React 19, and Tailwind v4.

Every record in this repository is fictional demonstration data. No real patient information
exists here.

---

## Start here

| Document | Read it when |
|---|---|
| [PRD.md](PRD.md) | You want the problem, the users, and what shipped |
| [ARCHITECTURE.md](ARCHITECTURE.md) | You are about to add a route, a data module, or a component |
| [DESIGN.md](DESIGN.md) | You are writing UI and need tokens, type, or a component contract |
| [DATABASE.md](DATABASE.md) | You need the domain model, or the proposed schema |
| [API.md](API.md) | You need the data-access layer, or the proposed REST contract |
| [SECURITY.md](SECURITY.md) | Before anything real goes near this |
| [CHANGELOG.md](CHANGELOG.md) | You want what changed and when |
| [ACTIVITY-LOG.md](ACTIVITY-LOG.md) | You want build-time decisions and the defects found along the way |

## What is built

37 routes covering the dashboard, patients, scheduling, pipeline, engagement, experience,
operations, insights, automation, and administration. Full design system. Complete domain model
with seed data across 15 record types.

## What is not

No server, database, API, or working authentication. Data compiles into the bundle, state lives
in memory and resets on reload, and any route is reachable without signing in.

`DATABASE.md`, `API.md`, and `SECURITY.md` each split into what exists today and what a real
deployment requires. Nothing in those second halves is implemented.

## Commands

```bash
npm install
npm run dev         # localhost:3000
npm run typecheck
npm run lint
npm run build
```

## Conventions worth knowing before you edit

The demo clock is fixed at `2026-08-10` in `lib/data/constants.ts`. Every date derives from it
through `day()` or `at()`. Never introduce `new Date()` into seed data or into render.

Status always resolves through a registry in `lib/status.ts`, never a hand-written label or
colour. Adding a value to a status union without adding it to the registry is a type error.

Contact details always render through `Protected`. No screen prints a raw phone number.

Adding a navigation entry to `lib/nav.ts` wires both the rail and the command palette.
