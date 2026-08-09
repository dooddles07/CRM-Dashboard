# CareFlow CRM - activity log

Fictional demonstration data throughout. No real patient information exists in this repo.

---

## Batch 1 - Foundation (complete)

**Goal:** the token layer, app shell, and component vocabulary that all 37 routes inherit.

### Stack as actually installed

| Package | Version | Note |
|---|---|---|
| next | 16.3.0 | Turbopack default. `create-next-app` refused the directory name (capital letters are invalid npm package names), so the scaffold was written by hand. |
| react / react-dom | 19.2.8 | |
| tailwindcss | v4 | `@theme inline` token layer, no `tailwind.config` |
| recharts | 3.10.1 | Native React 19 support, so the documented `react-is` override was not needed |
| typescript | **6.x (pinned)** | `typescript@latest` installs 7.0, which typescript-eslint does not support yet |
| eslint | **9.x (pinned)** | ESLint 10 breaks the `eslint-plugin-react` bundled with eslint-config-next |
| @tanstack/react-table | 9.1.2 | For batch 2 tables |
| @xyflow/react, @dnd-kit/*, zustand, date-fns, cmdk, lucide-react, next-themes | latest | |

ESLint uses eslint-config-next's **native flat config** exports. The `FlatCompat` bridge fails on
ESLint 9+ with a circular-structure error.

### Decisions

- **Brief-pinned visual world, no concept roll.** The brief specifies the palette, typeface family,
  and reference quality bar, so the direction was taken from it directly.
- **Operate mode.** Familiarity is the feature. One sans family, fixed rem type scale, restrained
  colour, 150-250ms state-only motion, no page-load choreography.
- **Signature is functional:** `Protected` values (masked PII, click to reveal, writes an audit
  entry) and the shared record anatomy planned for batch 2.
- **Inter + Geist Mono.** The ui-ux-pro-max tool suggested Fira Code/Fira Sans; the brief names
  Inter/Geist/Plus Jakarta, and the brief wins. Mono is reserved for identifiers, timestamps,
  audit diffs, and keys - never as a "technical" costume.
- **`/` redirects to `/design-system`** as batch-1 scaffolding. Batch 2 replaces it with the
  Command Center dashboard.

### Built

- `app/globals.css` - full semantic token layer, light and dark tuned separately, type scale as
  `@utility` classes, motion and reduced-motion rules, Recharts resets.
- `lib/` - `types.ts` (full domain model), `status.ts` (every status registry), `format.ts`
  (masking, dates, numbers), `store.ts` (zustand + audit writer), `nav.ts`, `hooks.ts`, `utils.ts`.
- `lib/data/` - `constants.ts` (fixed demo clock 2026-08-10), `people.ts` (10 doctors, 12 staff,
  24 patients), `system.ts` (notifications, seed audit trail).
- `components/shell/` - collapsible navy rail (8 sections, badges), top bar, command palette,
  notification drawer, logo mark.
- `components/healthcare/` - `StatusChip`, `ToneDot`, `Protected`, `PersonAvatar`.
- `components/data/` - `Panel`, `PageHeader`, `EmptyState`, `ErrorState`, skeletons.
- Routes: `/login`, `/forgot-password`, `/mfa`, `/design-system`.

### Defects found in the inspection round and fixed

1. **`tailwind-merge` silently dropped the type scale.** `cn("text-h1", "text-ink")` merged both
   into the text-colour group and kept only the colour, so every `cn()`-composed heading rendered
   at body size. Fixed by registering the custom `text-*` utilities as a `font-size` class group
   in `lib/utils.ts`. This also affected `StatusChip` and `PersonAvatar` sizing.
2. **Horizontal overflow at 375px.** `TableSkeleton` used fixed-width cells that inflated its grid
   track and widened the whole page (scrollWidth 386 vs client 365). Rebuilt on `fr` columns with
   percentage fills. Now 0 overflowing elements.
3. **Dark rail lost against the canvas.** `--rail` and `--canvas` were within one step of each
   other. Deepened the rail, lifted the canvas, strengthened `--rail-line`, added a right border.
4. **Destructive button failed contrast in dark.** shadcn hardcodes `text-white`; against the
   lighter dark-mode red that is ~2.7:1. Switched to `text-destructive-foreground`, which resolves
   per theme. Same fix applied to solid `StatusChip` variants.
5. **Amber solids needed a dedicated foreground.** Added `--on-amber`, replacing a raw hex in
   the rail badge.
6. **Login headline** had a hardcoded `<br />` fighting the natural wrap into three ragged lines.
7. **Address masking** returned `••••••••, St` - the last word of the street. Now keeps the city
   so staff can still triage: `••••••••••, Quezon City`.
8. Missing favicon (404), and the `⌘/Ctrl K` hint rendered without a space.

### Verification

- `tsc --noEmit` clean · `eslint` clean, 0 errors 0 warnings · `next build` clean, 6 routes.
- Playwright at 1440x1024 and 375x812, both themes. Zero console errors (only the favicon 404,
  now fixed).
- Interaction proof: revealed a `Protected` value - value unmasked, "recorded" badge rendered,
  toast fired. The audit entry is written in the same `set()` as the reveal; the full loop is
  visible once `/admin/audit` ships in batch 5.
- Overflow probe at 375px: `scrollWidth === clientWidth`, 0 offending elements.

### Notes

- `next dev` (Next 16) generates `AGENTS.md` and `CLAUDE.md` at the repo root on every run. They
  are framework-authored and re-created if deleted.

---

## Batch 2 - Command Center + Patient 360 (not started)

Dashboard (8 KPIs, 6 charts, AI insights, today's operations), patient list, add patient,
Patient 360 with 9 tabs on the Record Spine anatomy.
