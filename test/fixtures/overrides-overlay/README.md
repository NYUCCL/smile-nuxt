# Override / inheritance regression overlay

These files are **overlaid on top of a copy of `start/`** (the real scaffolded
experiment template) by `scripts/test-overrides.mjs` to verify the override and
resolution rules documented in `docs/coding/organization.md` against a real,
non-workspace consumer install of the packed module.

We overlay rather than ship a hand-built app so the test exercises the actual
starter (its `nuxt.config.ts`, `design.js`, env, etc.) — the same conditions a
researcher hits. Only the override probes live here:

- `components/AdvertisementView.vue` — benign full-view override (the supported
  path); replaces the string-referenced built-in welcome view.
- `components/Button.vue`, `components/Checkbox.vue` — deliberately-bad UI-primitive
  shadows. Per the warn-not-block policy these still apply (and `Button` propagates
  into built-in views), and the module must emit a build warning for each.
- `composables/useOverrideProbe.ts` — a project composable (auto-import, no collision).
- `assets/css/app.css` — overwrites the starter's; theme-token + equal-specificity
  rule overrides.
- `public/test-override.png` — a project public asset (root URL namespace).
- `test/e2e/overrides.spec.ts` + `playwright.config.ts` — the browser assertions.

Run from the repo root with `pnpm test:overrides`.
