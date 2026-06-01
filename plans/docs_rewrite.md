# Plan: Rewrite the documentation site for the Nuxt module

## Summary

The `docs/` VitePress site is 45 SPA-era markdown pages. Zero of them mention `@nyuccl/smile-nuxt`, `nuxi init`, Drizzle/Turso, or the Nuxt module architecture. Every page that touches installation, configuration, deployment, data storage, or the project structure is wrong. This plan is the audit + order-of-attack to get docs aligned with reality without trying to rewrite everything at once.

Companion to Phase 18 of `nuxt_migration_251.md` — that section sketches the target structure; this plan does the page-level categorization and sequencing.

## Companion: open GitHub docs issues

These should be folded into the corresponding rewrite work, not done separately:

| Issue | Topic | Maps to new page |
|---|---|---|
| #11 | Dev password setup, hashing, presentation mode | `deployment/dev-auth.md` |
| #12 | How to initialize a new experiment from the starter | `getting-started/installation.md` |
| #13 | `markRaw` requirement for user-space components in design.js | `guide/custom-components.md` |
| #14 | Local component override behavior | `guide/custom-components.md` |
| #29 | Update README.md with Nuxt description + quickstart | `README.md` (separate from docs site) |
| #34 | Serve docs in dev mode + AI chat-with-docs feature | infrastructure (separate) |
| #35 | Data size limits and write-throttling docs | `guide/data-recording.md` |
| #46 | How to use a remote Turso database | `deployment/database.md` |

## Tooling decision: keep VitePress

VitePress is fine. No reason to migrate to Nuxt UI Pro Docs or another tool. The `docs/.vitepress/config.mjs` is already wired with Tailwind, icons, and the existing theme. Re-targeting content is much cheaper than re-platforming.

If issue #34 (AI chat-with-docs in dev mode) ships, that's an add-on (likely an iframe or embed in the dev toolbar), not a docs-tool replacement.

## Current pages — categorization

**Keep mostly as-is** (architecture-agnostic):

| Page | Why kept | Light touch-ups |
|---|---|---|
| `philosophy.md` | Design philosophy, not architecture | Update any `nyuccl/smile` URL refs |
| `qualitycontrol.md` | IRB / QC guidance | Same URL touch-ups |
| `recruit/recruitment.md` | Prolific/MTurk/CloudResearch | Unchanged service integrations |
| `recruit/bonuses.md` | Recruitment service workflow | Same |
| `recruit/ethics.md` | IRB ethics | Same |
| `recruit/dashboard.md` | Recruitment service dashboards | Same |
| `styling/tailwind.md` | Tailwind setup | Verify still accurate |
| `styling/uikit.md` | shadcn-vue components | Mostly current |
| `styling/icons.md` | unplugin-icons | Mostly current |
| `styling/animations.md` | motion/animations | Check examples still work |
| `styling/darkmode.md` | Dark mode | Check `useColorMode` references |
| `styling/forms.md` | Form components | Verify form components |
| `styling/imagesvideo.md` | Image/video handling | **Update for new asset helpers** (commit `9ca0b3c`) |
| `styling/layouts.md` | Layout components | Verify |
| `styling/styleoverview.md` | Style overview | Cross-reference fixes |
| `coding/autofill.md` | Dev-mode autofill | Mostly unchanged |
| `coding/randomization.md` | RNG, conditions | Mostly unchanged |
| `contributing.md` | How to contribute to the module | **Rewrite** — old workflow assumed SPA repo; new workflow uses pnpm workspaces + module-builder |
| `help.md` | Meta / where to get help | Update URLs |

**Major rewrite** (architecture-specific):

| Page | What changes |
|---|---|
| `index.md` | Landing page — must mention `@nyuccl/smile-nuxt`, the npm package, the `nuxi init` flow |
| `introduction.md` | Intro to the project — needs Nuxt module framing |
| `requirements.md` | Node ≥ what version, pnpm, no more Firebase tooling |
| `settingup.md` | Install/setup — was Vite SPA, now `pnpm dlx nuxi init -t gh:nyuccl/smile-nuxt/start` |
| `starting.md` | Starting a new experiment — was clone-the-template, now scaffold-from-starter |
| `gettingstarted.md` | **Confusing name** — currently "getting started CONTRIBUTING", should be user-facing |
| `labconfig.md` | Was Firebase setup; rewrite for Turso (#46) |
| `analysis.md` | Was Firestore export; now Turso/SQLite + Python lib |
| `api.md` | API surface — was old SmileAPI; now `useAPI`/`useViewAPI` composables, server `/api/*` routes |
| `presentation.md` | Presentation mode — paths shifted (`/presentation/*` route) |
| `cheatsheet.md` | Was SPA cheatsheet — refactor for Nuxt module API |
| `problems.md` | Troubleshooting — most old problems no longer apply |
| `concepts.md` | Conceptual — needs Nuxt-aware framing |
| `reactive.md` | Reactivity/timing — verify against current implementation |
| `coding/overview.md` | Overview — needs Nuxt module framing |
| `coding/configuration.md` | Config (env vars) — major env var changes (TURSO_*, SMILE_DEV_PASSWORD) |
| `coding/datastorage.md` | Was Firestore data model; now Drizzle schema + server routes |
| `coding/persistence.md` | Tiered cookie + localStorage now |
| `coding/developing.md` | Dev mode — paths and toolbar changed |
| `coding/views.md` | Built-in views — names mostly same, but component override mechanism is different (priority: -1) — covers #14 |
| `coding/timeline.md` | Timeline API — `pushSeqView`, `registerView`, `markRaw` requirement — covers #13 |
| `coding/steps.md` | Stepper — current implementation |
| `coding/components.md` | Custom components — Nuxt auto-import behavior |
| `coding/testing.md` | Testing — Vitest + Playwright |
| `recruit/deploying.md` | Deployment — was Firebase, now Vercel (#11 dev-auth + general Vercel) |

**Likely delete**:

| Page | Reason |
|---|---|
| `adduser.md` | Firebase user management — no analog in Drizzle/Turso architecture |
| `advanced/notes.md` | Stale notes |

## Target structure (refined from Phase 18 in `nuxt_migration_251.md`)

```
docs/
├── index.md                          # New landing
├── getting-started/
│   ├── introduction.md               # From current introduction.md
│   ├── installation.md               # nuxi init flow (#12)
│   ├── project-structure.md          # What each file does
│   ├── your-first-experiment.md      # Edit design.js + custom component
│   └── running-locally.md            # pnpm dev, three modes
├── guide/
│   ├── design-file.md                # Timeline API + markRaw (#13)
│   ├── custom-components.md          # useViewAPI + component override (#14)
│   ├── built-in-views.md             # All built-in components
│   ├── navigation-guards.md          # Routing/sequencing
│   ├── data-recording.md             # recordPageData + size limits (#35)
│   ├── randomization.md              # Keep from coding/randomization.md
│   ├── configuration.md              # Env vars, runtimeConfig
│   ├── stepper.md                    # useStepper / useViewAPI step API
│   ├── state-persistence.md          # Cookie + localStorage tiers
│   ├── assets.md                     # public/, getStaticUrl, preload config (NEW)
│   └── autofill.md                   # Keep from coding/autofill.md
├── styling/
│   └── (mostly current pages, light updates)
├── deployment/
│   ├── vercel.md                     # Vercel deploy + codename URLs
│   ├── database.md                   # Turso setup (#46)
│   ├── dev-auth.md                   # SMILE_DEV_PASSWORD (#11)
│   └── other-platforms.md            # Brief Netlify/Cloudflare/self-hosted
├── lab-setup/
│   ├── onboarding.md                 # One-time lab setup
│   ├── recruitment.md                # Keep from recruit/recruitment.md
│   ├── monitoring.md                 # Checking data
│   └── ethics.md                     # Keep from recruit/ethics.md
├── api/
│   ├── use-api.md                    # SmileAPI methods
│   ├── use-view-api.md               # ViewAPI methods
│   ├── timeline.md                   # Timeline class
│   ├── stepper.md                    # Stepper / StepState
│   └── server-api.md                 # /api/participants/*, /api/projects/*, etc.
├── migration/
│   └── from-spa.md                   # Guide for labs with existing SPA experiments
├── reference/
│   ├── env-variables.md              # All VITE_* + server env vars
│   ├── module-options.md             # smile: {} in nuxt.config.ts (preloadImages, etc.)
│   └── troubleshooting.md            # Refactor of problems.md
├── contributing.md                   # Updated for Nuxt module workflow
└── philosophy.md                     # Keep
```

## Order of attack

**Tier 1 — landing experience (write first, highest visibility):**

1. **`README.md` rewrite** (#29) — separate from the docs site, but most-seen first impression. Fix broken badge (`deploy.yml` → `ci.yml`), add npm install, add link to docs site
2. **`docs/index.md` + `getting-started/introduction.md`** — landing pages must reflect the Nuxt module reality
3. **`getting-started/installation.md`** (#12) — the `nuxi init -t gh:nyuccl/smile-nuxt/start` flow

**Tier 2 — first-experiment path:**

4. **`getting-started/project-structure.md`** — what each scaffolded file does
5. **`getting-started/your-first-experiment.md`** — design.js edit + custom component
6. **`getting-started/running-locally.md`** — dev modes, dev toolbar
7. **`guide/design-file.md`** (#13) — Timeline API, `markRaw` requirement
8. **`guide/custom-components.md`** (#14) — component override mechanism

**Tier 3 — production-readiness:**

9. **`deployment/database.md`** (#46) — Turso setup
10. **`deployment/vercel.md`** — Vercel deploy with codename URLs
11. **`deployment/dev-auth.md`** (#11) — `SMILE_DEV_PASSWORD`
12. **`guide/configuration.md`** + **`reference/env-variables.md`** — env var reference
13. **`guide/data-recording.md`** (#35) — size limits + write throttling

**Tier 4 — comprehensive references:**

14. **`api/*`** — auto-generate where possible, hand-write where needed
15. **`reference/module-options.md`** — `smile: {}` options
16. **`migration/from-spa.md`** — for labs upgrading from the SPA

**Tier 5 — touch-ups on kept pages:**

17. Light edits across `styling/*`, `recruit/*`, `coding/autofill.md`, `coding/randomization.md` — fix URL refs, update for current reality
18. **`guide/assets.md`** — document the asset helpers we just shipped (commit `9ca0b3c`)

**Tier 6 — meta:**

19. **`contributing.md`** rewrite — pnpm workspace + module-builder workflow
20. **`reference/troubleshooting.md`** — refactor of `problems.md`

## Acceptance criteria

- [ ] A researcher who has never used SMILE can scaffold and run their first experiment using only Tier 1 + Tier 2 docs
- [ ] All commands in install/deploy docs are tested against a real install (not theorized)
- [ ] Zero references to Firebase / Firestore / SPA repo in non-historical pages
- [ ] Every env var the module reads is documented
- [ ] The plan's 8 open docs issues (#11, #12, #13, #14, #29, #34*, #35, #46) are closeable when their corresponding pages ship
- [ ] Old pages in `docs/` that aren't being kept are explicitly deleted (don't leave stubs)

*#34 (chat-with-docs) is an infrastructure feature, not a content rewrite — would close when the chat UI ships, regardless of content state

## What this plan deliberately doesn't do

- Doesn't try to define the exact phrasing of any page — that's the actual writing work
- Doesn't decide on screenshot/asset strategy — defer to when actually writing each page
- Doesn't address #34 chat-with-docs — that's a feature, not a content rewrite
- Doesn't commit to a deadline — this is multi-week work and should not block other product progress
- Doesn't address the live `smile.gureckislab.org` deployment — current docs are deployed somewhere; switching to the new docs is a separate cutover

## Notes for whoever picks this up

- The `docs/.vitepress/config.mjs` has a Vue plugin reordering hack — be careful not to break it during nav-structure changes
- `<SmileText/>` is a custom component used throughout docs (e.g. in `gettingstarted.md`) — check `docs/.vitepress/theme/` for what it renders to
- The `live docs site at smile.gureckislab.org` may still be pointing at the OLD SPA repo. Coordinate the cutover.
- Don't write docs faster than the underlying behavior settles — pages that document unstable APIs (#34 telemetry, #45 data dashboard) should wait until those land
