# Design system

The token layer, type scale, and component vocabulary every CareFlow screen inherits.

Source of truth is `app/globals.css`. A live reference renders at `/design-system`.

---

## 1. Direction

CareFlow is an operate-mode product. Staff use it between patients, glancing at a table while a
phone rings. That sets every decision below.

One sans family. A fixed rem type scale, never fluid. Colour reserved for status and action.
Motion that conveys state and nothing else, 150 to 250ms, with no page-load choreography. Depth
carried by real offset shadows instead of zero-offset halos.

The signature is functional rather than decorative: masked values that unmask on a deliberate
click and write to the audit log, and one record anatomy repeated across every entity.

---

## 2. Colour

Semantic tokens only. Components never reference a raw hex value.

Light and dark are tuned as separate value sets, not derived by inversion. A mechanical flip put
the navy rail within one step of the canvas and the rail stopped reading as its own surface.

### Surfaces

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `#f4f6fa` | `#0b1521` | Page background |
| `--surface` | `#ffffff` | `#111c29` | Panels, tables, cards |
| `--surface-2` | `#f7f9fc` | `#16222f` | Table headers, hover, insets |
| `--surface-3` | `#eef2f7` | `#1c2a39` | Progress tracks, skeletons |
| `--overlay` | `rgb(9 20 33 / .44)` | `rgb(3 8 14 / .66)` | Modal scrim |

### The rail

The navigation rail is its own colour world, dark in both themes.

| Token | Light | Dark |
|---|---|---|
| `--rail` | `#0b1f38` | `#050a12` |
| `--rail-fg` | `#ffffff` | `#f0f5fb` |
| `--rail-fg-muted` | `#9db0c9` | `#8fa3bc` |
| `--rail-active` | `#133d6b` | `#163a63` |
| `--rail-hover` | `#122c4c` | `#101f31` |
| `--rail-line` | `#1b3454` | `#1d3047` |

In dark mode the rail sits a clear step below the canvas, which keeps it reading as a distinct
surface rather than more background.

### Ink

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink` | `#0c1a2b` | `#e6edf6` | Primary text |
| `--ink-2` | `#475a70` | `#9dafc4` | Secondary text |
| `--ink-3` | `#5a6d86` | `#7c8fa6` | Labels, metadata |
| `--ink-inverse` | `#ffffff` | `#06121f` | Text on solid fills |

### Action and status

Each status carries four values. `fg` is text on a surface, `solid` fills dots and bars, `soft`
grounds a chip, `line` bounds it.

| Family | Light fg | Dark fg | Meaning |
|---|---|---|---|
| `primary` | `#1257be` | `#4e90f0` | Action |
| `success` | `#0f7a4d` | `#2fa46e` | Completed, healthy |
| `warning` | `#a15c07` | `#e0a03a` | Attention, approaching a threshold |
| `danger` | `#be2a24` | `#ee6a64` | Overdue, breached, failing |
| `info` | `#1257be` | `#4e90f0` | Scheduled, in progress |
| `ai` | `#6741c9` | `#9b7bf0` | Machine-generated, revealed PII |
| `neutral` | `#475a70` | `#9dafc4` | Inactive, cancelled |

Amber solids stay light in both themes, so `--on-amber` (`#2a1a06`) supplies their foreground.
Reusing `--ink-inverse` there would fail contrast in light mode.

Purple carries two meanings that never collide on screen: AI output, and a value the current
session has revealed.

### Charts

Six series ordered for lightness separation rather than hue alone, so they hold up in greyscale
and for colour-blind viewers.

`--chart-1` `#1257be` · `--chart-2` `#0b7c86` · `--chart-3` `#6741c9` · `--chart-4` `#e8940c` ·
`--chart-5` `#0f7a4d` · `--chart-6` `#8a94a6`

Grid lines use `--chart-grid`, a full step lighter than `--line`.

### Contrast

Every text and surface pair meets 4.5:1. UI edges meet 3:1. Both themes were verified
independently.

---

## 3. Type

Inter for the interface, Geist Mono for identifiers. Mono is reserved for patient IDs,
timestamps, audit diffs, and keys, never used as a technical costume.

The scale lives as `@utility` classes at fixed rem sizes with a roughly 1.15 ratio. This is
product UI, not display type, so nothing scales with the viewport.

| Class | Size | Line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `text-display` | 1.75rem | 2.125rem | 700 | -0.021em | Auth headlines |
| `text-h1` | 1.375rem | 1.75rem | 650 | -0.017em | Page titles |
| `text-h2` | 1.125rem | 1.5rem | 600 | -0.011em | Section headings |
| `text-h3` | 1rem | 1.375rem | 600 | -0.006em | Panel titles |
| `text-body-lg` | 0.9375rem | 1.4375rem | 400 | | Lead paragraphs |
| `text-body` | 0.875rem | 1.3125rem | 400 | | Default |
| `text-body-sm` | 0.8125rem | 1.125rem | 400 | | Tables, dense UI |
| `text-caption` | 0.75rem | 1rem | 400 | | Metadata |
| `text-label` | 0.6875rem | 0.875rem | 600 | 0.062em, upper | Field and column labels |
| `text-ident` | 0.75rem | 1rem | mono | -0.012em | IDs, timestamps, diffs |

`tabular-nums` applies globally to tables and `<time>`, so figures align down a column.

Running prose uses `measure` (68ch). Nothing else needs it.

### One trap worth knowing

`tailwind-merge` treats unknown `text-*` classes as colour utilities. Before the custom scale was
registered as a font-size group in `lib/utils.ts`, `cn("text-h1", "text-ink")` kept only the
colour and every composed heading silently rendered at body size. Adding a size utility means
registering it there too.

---

## 4. Space, radius, depth

Spacing follows a 4px base through Tailwind's scale. Panels use `p-4`, panel headers `px-4 py-3`,
table cells `px-3 py-2.5` at comfortable density and `px-3 py-1.5` at compact.

Radius derives from `--radius` at `0.375rem`. Chips take `sm`, buttons and inputs `md`, panels
and cards `lg`, dialogs `xl`.

Three shadows, all with real vertical offset:

| Token | Use |
|---|---|
| `--shadow-card` | Panels and cards at rest |
| `--shadow-raised` | Dropdowns, popovers, dragged cards |
| `--shadow-overlay` | Dialogs and sheets |

---

## 5. Motion

Transitions run 150ms for colour and 200 to 250ms for layout, and only when they convey a state
change. Nothing animates on load.

`prefers-reduced-motion: reduce` collapses every duration to 0.01ms and disables smooth
scrolling.

One deliberate exception: the skeleton sweep loops while content is pending, because it is
signalling ongoing work rather than a completed change.

---

## 6. Components

### Status

`StatusChip` renders an icon, a label, and a tone together. Colour never carries meaning alone,
which keeps status readable in greyscale and for colour-blind users.

Every status resolves through a registry in `lib/status.ts`. Screens never hand-write a label or
pick a colour:

```tsx
<StatusChip meta={appointmentStatus[appointment.status]} />
```

Registries exist for appointments, patients, doctors, lead stages, referrals, follow-ups, tasks,
cases, priority, campaigns, workflows, integrations, users, and feedback. `noShowRisk(rate)` and
`trendTone(change, invert)` map numbers onto tones.

Variants: `soft` (default, tinted ground with a border), `plain` (text only, for dense rows),
`solid` (filled, for the rail badge). `ToneDot` handles legends and dense lists, always beside
text.

### Panel

The single card surface. `Panel`, `PanelHeader`, `PanelBody`, `PanelFooter`. Never nested inside
itself, because a card inside a card reads as a rendering mistake.

### PageHeader

Title, description, actions, and a slot underneath for saved views or filters. Every screen
opens with one.

### DataTable

One table for every list. Sorting with `aria-sort`, pagination, row selection with bulk actions,
a toolbar slot, and an empty state that says what to do next. Wide tables take `minWidth` and
scroll inside their own container rather than widening the page.

Density defaults to the store, which is how the Appearance setting reaches every table.

### RecordHeader

The entity detail anatomy: breadcrumb, avatar, title, identifier, status chips, a fact grid, and
tabs. Facts answer what you need before acting. Tabs are links carrying `?tab=`, so a tab is
shareable and survives reload.

Learn it on a patient and the doctor, lead, appointment, campaign, complaint, and workflow
records need no relearning.

### Spine

One chronological column with a continuous rule through the marker centres. Every record type a
patient touches collapses into it, so history reads in the order it happened instead of by
hunting through tabs.

The geometry is exact and easy to break: the rule sits at `left-3`, markers at `-left-9` to
cancel the list's `pl-9`, with `ring-4 ring-surface` punching a gap where each marker crosses.

### Protected

Masked PII that unmasks on click and writes an audit entry naming the field, the record, and the
time. A revealed value carries a purple badge marking it as recorded.

Masks keep what staff need to triage and drop the rest. Phone keeps the last two digits, email
the first two characters and the TLD, address the city, date of birth the year.

### PersonAvatar

Initials on a tinted ground, with the tint hashed from the record id so a person always looks
the same. No photographs.

### KpiCard and Sparkline

A KPI shows value, change, comparison period, a trend trace, and one line of context. The
sparkline is hand-drawn SVG, roughly 40 lines, because eight Recharts instances for 12-point
traces is waste.

### Empty and error states

`EmptyState` names what to do next. "No patients match these filters" plus a way to clear them,
never "No data". `ErrorState` adds a reference id staff can quote to support.

---

## 7. Layout

The rail is 15rem expanded, 3.75rem collapsed, fixed on large screens and a sheet below `lg`.
Content sits under a 3.5rem top bar and inside `max-w-[100rem]`.

Panels sit in independently flowing columns rather than a single grid row. A shared row forces
every panel to the tallest one's height, which put roughly 340px of dead space on the dashboard
before the split.

Wide tables scroll inside their container. The page itself never scrolls horizontally, verified
at 375px.

---

## 8. Charts

Recharts inherits the token palette through CSS variables. `app/globals.css` overrides the
library's defaults so ticks use `--ink-3` at 0.6875rem and grid lines use `--chart-grid`.

Chart choices favour reading the number over shape:

The lead funnel is proportional bars, not a taper. The drop between two stages is the number
staff act on, and a taper hides it, so each row carries its own drop-off percentage.

The department donut puts its legend below the chart at full width. Beside a third-width panel
every department truncated to "General…".

The acquisition chart sets `interval={0}`, because Recharts silently dropped three of seven
category labels.

---

## 9. Voice

Sentence case everywhere. Title Case belongs to proper nouns.

Write what happened, not what the system did. "5 overdue follow-ups, oldest is 9 days past due"
beats "You have outstanding items".

Confirmations say what changed and where it went. Destructive dialogs say what survives, because
"Archive patient?" leaves staff guessing whether history disappears with it.

Numbers carry their unit and comparison. "11.8% no-show rate against an 8% threshold" beats
"High no-show rate".
