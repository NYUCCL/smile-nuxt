# Plan: audit the docs figures for a consistent style

Follows Phase 0 of `plans/docs_in_dev_tools.md`. The first redrawn figure,
`docs/images/storage-statediagram.svg`, sets the style (Todd, 2026-11-03).

## Style to follow

The CCM book's figure conventions:
`~/Dropbox/work/02_teaching/CCM/.claude/skills/book-figures/SKILL.md`.

- Hand-written SVG (editable as text), `viewBox="0 0 760 H"`, no width/height,
  a white background rect first.
- Inter (Helvetica, Arial fallback); 17–18 px titles, 16 px labels, 14 px
  notes, nothing below 14. Code names in a monospace font.
- The book palette only: ink `#050505`, greys `#444444 #6B6B6B #9A9A9A #E6E6E6
  #F2F2F2`, blues `#E7F2F8 #B2D5E8`, pill `#FCEFFA`, highlight `#F9D174`,
  series `#3B6FB6 #F08A24 #2A9D8F #B03A6E #7B5CB8 #D9A520`.
- Ink strokes 1.5–1.6, rounded boxes `rx` 8–9.5, arrowhead markers in the
  line's color.
- Check by rendering with Quick Look (`qlmanage -t -s 1100`, wrapped in
  `perl -e 'alarm 40; exec @ARGV'` since it can hang), then reading the PNG.

## What's there now (2026-11-03)

83 image and video files under `docs/`. **26 are used** by a page, and
**56 (38 MB) aren't referenced anywhere** (checked against every page, the
theme, the examples and the config).

**Diagrams in use (candidates to redraw as SVG):**

| File | Used in | Notes |
|---|---|---|
| `timeline.png` | coding/timeline | **Stale**: shows `/mturk` and `/config` routes. Light-green sketch style, small type. |
| `randomizedflows.png` | coding/timeline | Same light-green style. |
| `timeline-flows.png` | coding/timeline | Same style, transparent background. |
| `steps.png` | overview, steps, concepts | Wireframe on transparent background; dark-mode look. |
| `viewstimeline.png` | overview, views, concepts | Same wireframe style. |
| `components.png` | components, overview | 3D blocks tree; a different style again. |
| `branchingexps.png` | recruit/deploying | Dark background only, tiny labels. |

**Screenshots in use (keep as screenshots; check they're current):**
`prolific-step1..6`, `cloudresearch-step1..2`, `getURL-slack`,
`githubactions`, `presentmode`, `conditionoverride`, `seedoverride`,
`windowsizer`, `withdraw`. The dev-tools screenshots (`presentmode`,
`conditionoverride`, `seedoverride`) likely predate the current dev tools UI
(branch `dev-tools-theme`); retake them after that lands.

**Other:** `vuelogo.png`, `public/images/smile.svg` (logos, keep);
`public/videos/incremental_stepper.mov` (17 MB, used in coding/steps; check
it's current and consider a smaller mp4).

**Unused (delete):** the Gitpod, Firebase, `labconfig-*` (GitHub, Slack,
Firebase setup), font-awesome and GitHub screenshots, `atomicdesign.png`,
`routing.png`, `service-overview.png`, `starting-pathways.png`,
`smiletown.png/svg`, `videos/googlefonts.mp4`, the Firebase and Pinia logos.
Run the reference scan again before deleting.

## Steps

1. ~~Delete the unused files~~ (done: `1188d1a` on `docs-refresh`).
2. ~~Redraw the 7 diagrams as SVG in the book style~~ (done: `3e39fbf`).
3. Check each screenshot against the current UI; retake the dev-tools ones
   after the dev tools theme work merges.
4. ~~Add the unused-file scan to `test/docs/`~~ (done: `test/docs/unused-media.test.js`).
5. Dark mode: done for Docs mode (`9d1c880` on `dev-docs-mode`):
   `src/runtime/server/dev/darkFigures.js` (ported from the CCM book's
   `src/styles/darkFigures.mjs`) derives a dark copy of each book-style figure
   on request; both copies drop the white background so they sit on any dev
   palette. The website (VitePress) still shows the light figures in dark
   mode; the same module could serve `.dark.svg` there, as CCM's plugin does.
