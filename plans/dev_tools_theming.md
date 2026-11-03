# Dev tools theming: audit and plan

Status: proposed (2026-11-03). Follows #32 / #44 (participant color mode and
contrast), which are done.

## Goal

The dev tools get their own themeable color system:

- Every dev tools color comes from a named dev token, none hard-coded and none
  borrowed from tokens that mean something else (chart colors, button colors).
- A theme picker in the dev tools: mode (system / light / dark, default system)
  and a palette (default plus a few established ones: nord, solarized,
  catppuccin), like tentacle's.
- Dev tools classes and tokens are prefixed so they can't collide with a
  project's own task code, and the dev tools' theme never reaches the
  experiment preview or participants.

The participant theme is out of scope: it stays the default light/dark set
from #32/#44.

## Audit (2026-11-03)

39 dev components (`src/runtime/components/dev`).

**The good news:** no Tailwind palette classes (`text-blue-500` …), no `dark:`
utilities, and only 11 raw color literals (3 files). Nearly everything already
goes through CSS variables. The problems are which variables, and where they
live:

1. **Borrowed tokens that change hue between modes.** The dev tools use
   tokens meant for other things, and those tokens were tuned separately per
   mode, so hues jump:
   - Selected tab / view (app menu, console tabs): `bg-chart-4`. A chart color:
     amber in light, purple in dark.
   - Brand button (smile logo): `--dev-brand-bg`: blue in light, green in dark.
   - Known user / record created / unsaved changes meter: `--status-*` plus
     `--chart-*`-like hues; orange and green on near-black reads as Halloween.
2. **Ad-hoc, flat token names in the shared stylesheet.** About 50 tokens are
   used only by the dev tools but live in `main.css` next to the participant
   theme, with no common prefix: `--step-path-color`, `--step-label-color`,
   `--step-index-color`, `--step-leaf-color`, `--step-home-color`,
   `--step-selected-bg(-hover)`, `--data-key-color`, `--data-value-color`,
   `--recruit-*` (11), `--status-*`, `--log-*`, `--error-notif-*`,
   `--scrollbar-*`, `--resize-handle(-hover)`, `--pinned-route`,
   `--dev-lines`, `--dev-text`, `--dev-contrast-text`, `--dev-bar-bg`,
   `--spinner-*`. Each was picked on its own, per mode, so there is no palette
   holding them together. They also ship to participants.
3. **Theme is applied to `<html>`.** The dev tools' mode class sits on the
   document root. The experiment preview resets the tokens with its own
   `.light`/`.dark` container, and since #44 the `dark:` variant follows the
   nearest container. But anything keyed off the root still leaks (e.g.
   palette remaps, `color-scheme`), and portaled menus need a
   MutationObserver hack (`useColorMode.js`) to pick a side.
4. **Generic class names.** Dev styles define `.device-wrapper`,
   `.device-container`, `.device-controls`, `.resize-handle*`, `.tree-node`,
   `.list-item`, `.icon-btn`, `.notification`, `.project-card`, `.join`, `.map`
   … 20 of 21 style blocks are `scoped`, but `useColorMode.js` queries
   `.device-container` / `.device-wrapper` / `.dev-color-mode` globally, one
   block (`RecruitmentChooserView.vue`) is global, and `smile.css` defines
   global `.table-*` classes. A project with its own `.device-wrapper` or
   `.table-row-base` would collide.
5. **Specific complaints (Todd, 2026-11-03):** switch knobs too stark in
   dark (softened in #44's follow-up); window size inputs drew white native
   spinners (fixed: `color-scheme`); checkboxes (Aggressive, Resp. UI) too
   bright; step panel colors (`.persist` / `.stepData` labels, selected step,
   icons, ids) are a grab bag; status meter too saturated.

## Design

Modeled on tentacle's palettes (`tentacle/app/assets/css/themes.css`,
`app/utils/palettes.ts`, `app/plugins/apply-theme.client.ts`).

### Two layers of tokens, all prefixed `--sd-` (smile dev)

1. **Palette primitives** `--sd-p-*`, set per palette and per mode (~20):
   `bg`, `surface`, `surface-2`, `card`, `border`, `fg`, `fg-muted`,
   `selection`, `primary`, `primary-fg`, and eight named hues (`red`,
   `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`). A palette's
   light and dark halves must set the same keys.
2. **Semantic dev tokens** `--sd-*`, defined once in terms of primitives,
   never per mode:
   - chrome: `--sd-bg`, `--sd-panel`, `--sd-line`, `--sd-text`,
     `--sd-text-muted`, `--sd-selected-bg`, `--sd-selected-fg`, `--sd-hover`,
     `--sd-brand`
   - status: `--sd-ok`, `--sd-warn`, `--sd-error`, `--sd-info` (+ `-bg`, `-fg`)
   - data viewer: `--sd-key`, `--sd-string`, `--sd-number`, `--sd-bool`,
     `--sd-null`, `--sd-id`
   - stepper: `--sd-step-path`, `--sd-step-label`, `--sd-step-index`,
     `--sd-step-leaf`, `--sd-step-selected`
   - console: `--sd-log-error`, `--sd-log-warn`, `--sd-log-info`, `--sd-log-debug`
   - recruitment tiles: `--sd-tile-1` … `--sd-tile-8` (from the eight hues)
   - misc: `--sd-scrollbar*`, `--sd-resize-handle*`, `--sd-pinned`

   Because hues come from one palette, the brand stays blue and the selection
   keeps its hue in both modes; only lightness changes.

The dev tools' shadcn components (buttons, inputs, switches, checkboxes) keep
using the shadcn tokens, but inside the dev scope those are remapped from the
primitives (tentacle's `.palette` block), so they follow the palette too. That
also covers the checkbox and switch brightness.

### Scope: the dev chrome, not `<html>`

- One root element for the dev tools chrome (`.sd-root`), carrying
  `.sd-light`/`.sd-dark` and `.sd-theme-<palette>`. The tokens are defined on
  it, not on `:root`.
- The experiment preview container stays outside the dev token scope (it uses
  the participant tokens and its own experiment mode).
- Portals: reka-ui portals render at the end of `<body>`. Dev tools popovers
  either portal into an element inside `.sd-root` (reka's `to` prop), or get
  the scope classes when they're created. This replaces the MutationObserver
  in `useColorMode.js`.

### Naming

- All dev-only classes: `sd-` prefix (`.sd-device-wrapper`, `.sd-tree-node`,
  …). All dev-only tokens: `--sd-`.
- `smile.css` `.table-*` classes: become `.sd-table-*` if only the dev tools
  use them, otherwise stay as documented module classes.
- `useColorMode.js` stops querying generic global selectors.

### Ships only with the dev tools

Dev tokens and palettes move from `main.css` to `src/runtime/css/dev.css`,
added only when the dev tools are built (the `SMILE_DEV_TOOLS` switch from
#38). Participants stop downloading about 50 dev-only tokens.

### Picker

In the dev tools settings popover: Mode (System / Light / Dark) and Palette
(Default, Nord, Solarized, Catppuccin). Saved in `store.dev` (the dev cookie)
like the other dev settings. The lower-left button keeps cycling the mode.

## Guard rails (tests)

- Extend `test/css/contrast.test.js`: every palette × mode, for the dev text
  pairs (text on panel, muted text on panel, selected fg on selected bg, status
  fg on status bg, log colors on the console background), at AA.
- A unit test that fails if a dev component contains a raw color (`#hex`,
  `rgb(`, `oklch(`), a Tailwind palette class, or a borrowed token
  (`chart-*`, `*-button*`), or defines a class in a `<style>` block without the
  `sd-` prefix.
- e2e: palette and mode switch in the dev tools leave the experiment preview's
  computed colors unchanged (extends the leak test in
  `test/e2e/dev-theme.spec.ts`).

## Phases

1. **Tokens** — define `--sd-p-*` (default palette only) and `--sd-*`; move
   every dev component onto them; drop the borrowed `chart-*`/button tokens and
   the old flat names. Fixes the hue jumps (brand, selection), the status
   meter, step panel colors and checkbox brightness. Add the contrast cases and
   the no-raw-colors test. Screenshot every dev panel in both modes.
2. **Scope and names** — `.sd-root`, theme classes off `<html>`, portals,
   `sd-` class prefix, `dev.css` loaded only with the dev tools. Leak e2e test.
3. **Palettes and picker** — nord, solarized, catppuccin (light + dark each),
   the picker, persistence.
4. **Docs** — `docs/styling/darkmode.md` (dev tools section) and a short
   "theming the dev tools" note for contributors (how to add a palette, the
   token list).

Phase 1 is the bulk of the visible improvement; each phase is a separate PR.

## Open questions

- Which palettes? Proposal: default, nord, solarized, catppuccin (tentacle's
  set, so values can be reused). Others (gruvbox, tokyo night, github) are easy
  to add later.
- Should the default palette's dark mode be neutral gray (today) or slightly
  tinted (nord-like)?
- Should presentation mode use the dev palette, or stay on the participant
  theme? (It shows participant views, so probably participant theme with the
  dev chrome bar themed.)
