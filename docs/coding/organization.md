# Project Organization

When you scaffold a new experiment with
`pnpm create @nyuccl/smile-nuxt my-experiment`, you get a Nuxt project
pre-wired for SMILE. This page walks through each file and folder so you know
what is yours to edit, what is yours to leave alone, and what is generated.

## At a glance

```
my-experiment/
├── app.vue              # Root Vue component (just renders <NuxtPage />)
├── design.js            # Experiment timeline — page sequence
├── nuxt.config.ts       # Nuxt config — loads @nyuccl/smile-nuxt, icons, CSS
├── package.json         # npm dependencies and scripts
├── tsconfig.json        # TypeScript config (extends Nuxt's)
├── playwright.config.ts # End-to-end test config
│
├── components/          # Your custom Vue components (auto-imported)
├── assets/css/          # Global styles and Tailwind customizations
├── public/              # Static assets (images, stimuli, logos)
├── test/e2e/            # Playwright end-to-end tests
├── analysis/            # Python data analysis (uv-managed)
├── scripts/             # Build-time helper scripts
│
├── .env                 # Tracked config defaults (safe to commit)
├── .env.local.example   # Template to copy to .env.local for secrets
├── .gitignore           # Files git should ignore
├── .npmrc               # pnpm settings (shamefully-hoist=true)
│
├── .github/workflows/   # CI/CD (Vercel deploy on push to main)
├── .cursor/rules/       # Cursor IDE editor rules
├── CLAUDE.md            # Context file for Claude Code
└── README.md            # Per-project README
```

Generated at runtime (you can ignore these — they're in `.gitignore`):

```
node_modules/            # Installed dependencies
.nuxt/                   # Nuxt build cache
.output/                 # Production build output
.data/                   # Local SQLite database (dev only)
test-results/            # Playwright run artifacts
playwright-report/       # Playwright HTML reports
```

## Files you'll edit often

### `design.js` — your experiment timeline

The single most important file. It exports `createTimeline(api)`, which builds
the ordered list of pages (called **views**) that participants see.

```js
timeline.pushSeqView({
  name: 'task',
  component: markRaw(MyTaskView),
})
```

Built-in views like `InformedConsentView`, `DemographicSurveyView`,
`WindowSizerView`, and `DebriefView` are referenced by string name and resolved
by the module. Your own views are imported from `components/` and wrapped in
`markRaw()`.

See [Timeline and Design File](/coding/timeline) for the full reference.

### `components/` — your custom views and UI

Anything you build lives here. The starter ships with four examples:

- **`MyTaskView.vue`** — placeholder for your experiment task. Replace this
  with your own logic.
- **`StroopExpView.vue`** — a working color-word Stroop task. Useful as a
  worked example; delete or replace when you don't need it.
- **`InformedConsentText.vue`** — the consent body text. Edit to match your
  IRB protocol.
- **`DebriefText.vue`** — the debrief shown after the experiment finishes.

Components in this folder are **auto-imported** in `.vue` files — use them
directly in templates without `import` statements. In plain `.js` files like
`design.js` you still need explicit imports.

You can also override any built-in view by creating a component with the same
name (e.g., `components/AdvertisementView.vue`).

### `public/` — static assets

Anything participants need to download — stimulus images, audio files,
videos, branding logos. Served at the URL root: a file at
`public/cat.jpg` is requested as `/cat.jpg`. Use the
[`api.getPublicUrl()`](/api) helper to build correctly-prefixed URLs in your
components.

### `assets/css/app.css` — global styles

Empty by default. Add Tailwind plugins, CSS custom properties, or global
overrides here. SMILE's own styles are loaded automatically by the module.

### `.env`, `.env.local`, and `.env.local.example`

`.env` holds non-secret defaults like UI mode, randomization seed, and
branding — safe to commit.

`.env.local` is gitignored and is where you put secrets: database tokens,
the dev/presentation password, analytics keys. Values here override values
in `.env`.

`.env.local.example` is a tracked template that documents every variable
you might want to put in `.env.local`. Copy it when you need to add secrets:

```bash
cp .env.local.example .env.local
```

Local dev doesn't require any secrets out of the box — SMILE uses a local
SQLite database and the `/dev/` route skips its password gate when running
via `pnpm dev`. You only need `.env.local` when you want to connect to a
remote Turso database locally or test the production auth flow.

For deployed experiments, put these same secrets in the **Vercel dashboard**
(Settings → Environment Variables), not in any committed file.

See [Configuration](/coding/configuration) for the full env-var reference.

## Files that just work — leave alone unless you have a reason

### `app.vue`

The Vue root. It contains exactly:

```vue
<template>
  <NuxtPage />
</template>
```

Nuxt routes traffic into the right view based on the URL. You almost never
need to touch this.

### `nuxt.config.ts`

Loads the `@nyuccl/smile-nuxt` module, sets up icons and CSS, and injects
git-derived env vars into `process.env` for server-side use.

You will edit this when you want to:

- Add module options (`smile: { ... }`)
- Add another Nuxt module to your project
- Configure Vite or build settings

### `package.json`

Your project's dependencies and scripts. Most likely edits:

- `pnpm add <pkg>` to add a new dependency (don't hand-edit)
- Tweaking the `scripts:` section if you add custom build/test commands

### `playwright.config.ts`

End-to-end test config. Tells Playwright to start the dev server before
running tests. Rarely changed.

### `tsconfig.json`

Just extends Nuxt's auto-generated config. Don't modify unless you're doing
something unusual with TypeScript paths.

## Folders for testing and analysis

### `test/e2e/`

Playwright tests that walk through your experiment as a real participant.
The starter ships with `experiment.spec.ts` covering welcome → consent →
demographics → guards → database verification, plus a `helpers.ts` with
reusable utilities (`clearState`, `fillDemographicsPage1`, etc.).

Add your own `.spec.ts` files here as you build your task — testing the
specific interactions and data recording for your experiment.

Run with `pnpm test:e2e` (or `pnpm test:e2e:ui` for the Playwright UI).

### `analysis/`

A self-contained Python project (uv-managed) for analyzing the data your
experiment collects. Lives alongside your experiment code so that the
analysis is versioned with the code that produced the data.

- **`pyproject.toml`** — Python dependencies
- **`lib/smiledata/`** — the SMILE data-analysis library
- **`tests/`** — pytest tests for your analysis code
- **`data/`** — where exported experiment data lands

See [Analyzing data](/analysis) for the workflow.

## Build, deploy, and tooling

### `scripts/`

- **`generate_git_env.sh`** — runs on every `pnpm install` and before every
  `pnpm dev`/`pnpm build`. Writes git info (commit hash, branch, owner, deploy
  path, codename) into `.env.git.local` so the experiment can stamp recorded
  data with the exact code version that produced it.
- **`codenamize.cjs`** — generates the deterministic codename URL (e.g.
  `tiger-brave-castle`) for sharing your deployment.

You shouldn't need to edit these.

### `.github/workflows/deploy.yml`

GitHub Action that auto-deploys to Vercel on every push to `main`. Edit this
when you change your deployment target or add additional CI steps.

See [Deploying](/recruit/deploying) for setup.

### `.npmrc`

```ini
shamefully-hoist=true
auto-install-peers=true
```

Tells pnpm to flatten `node_modules` so Nuxt's auto-imports resolve correctly.
Don't remove this — without it, things like Vue and Pinia won't be found by
the module.

### `CLAUDE.md` and `.cursor/rules/`

Context files for AI coding assistants. `CLAUDE.md` is read by Claude Code,
`.cursor/rules/smile.mdc` is read by Cursor. They describe project
conventions, auto-imports, and the SMILE API so AI tools can help you write
experiment code more accurately.

Safe to edit, customize, or delete if you don't use AI assistants.

## Generated and gitignored

You'll see these appear after you run `pnpm install` and `pnpm dev`. They are
all in `.gitignore` — never commit them.

| Path                  | What it is                                                       |
| --------------------- | ---------------------------------------------------------------- |
| `node_modules/`       | Installed npm packages                                           |
| `.nuxt/`              | Nuxt's build cache and generated types                           |
| `.output/`            | Production build artifacts (created by `pnpm build`)             |
| `.data/`              | Local SQLite database for dev (`experiment.db`)                  |
| `.env.git.local`      | Auto-generated git-derived env vars (regenerated each dev start) |
| `test-results/`       | Playwright test artifacts                                        |
| `playwright-report/`  | Playwright HTML reports                                          |
| `.vercel/`            | Vercel CLI metadata if you've linked the project locally         |

## Overrides & resolution

Your code and the `@nyuccl/smile-nuxt` module both contribute components,
assets, and styles to the same Nuxt application. This section explains the
precedence rules — who wins when names collide.

The short version:

| Layer                        | Project wins? | Mechanism                                                                |
| ---------------------------- | ------------- | ------------------------------------------------------------------------ |
| Vue components               | ✅ Yes        | Local `components/` has higher priority than module dirs (`priority: -1`) |
| Public assets                | N/A           | No collision — different URL namespaces (`/` vs `/_smile/`)               |
| CSS rules                    | ✅ Yes        | Module's `main.css` loads first; your `app.css` wins at equal specificity |
| CSS variables (theme tokens) | ✅ Yes        | Same as above — redefine `--primary` etc. in your `app.css`               |
| Composables / API            | N/A           | Module exposes `useAPI()` etc.; project doesn't redefine these            |

### Vue components

Any time the module registers a component (via `addComponentsDir`), it does
so with `priority: -1`. Nuxt's component resolver uses priority to break
name collisions: higher priority wins.

Your local `components/` is registered by Nuxt itself with the default
priority (effectively `1`), so **a file in your `components/` with the same
name as a module component replaces it everywhere**.

The module registers four directories at `priority: -1`:

- `components/ui/` — shadcn-vue primitives (`Button`, `Card`, `Input`, …)
- `components/forms/` — form pieces (survey scaffolding, demographic widgets)
- `components/layouts/` — `ConstrainedTaskWindow`, `TwoCol`, etc.
- `components/builtins/` — full views (`InformedConsentView`,
  `DemographicSurveyView`, `WindowSizerView`, `DebriefView`, …)

So if you want a custom welcome page, just drop
`components/AdvertisementView.vue` into your project. Your version replaces
the built-in everywhere — including inside `design.js` where the timeline
still references `'AdvertisementView'` as a string.

::: info Why string references still work after an override
When Nuxt detects that your local component shadows a global module
component, the module's `components:extend` hook promotes your local
component to `global: true` automatically. This means
`<component :is="'AdvertisementView'">` and string references in
`design.js` resolve to your override, not the module's original.
:::

#### Customizing without overriding the whole view

For the most common customizations — consent body text, debrief body text,
welcome ad text — you don't need to override the full view. The built-in
views accept "text" components as registered app components:

```js
api.setAppComponent('informed_consent_text', InformedConsentText)
```

This is set in `design.js`, with `InformedConsentText` being a regular
component in your project's `components/` folder. The built-in
`InformedConsentView` consumes this and renders your text inside its own
layout. Less destructive than replacing the whole view.

### Public assets (images, videos, stimuli)

There's no override system here because **there's nothing to override**.
The module's static assets and your project's static assets live at
completely separate URLs.

| What                  | URL prefix          | How to reference                    |
| --------------------- | ------------------- | ----------------------------------- |
| Your `public/cat.png` | `/cat.png`          | `api.getPublicUrl('cat.png')`       |
| Module's `smile.svg`  | `/_smile/smile.svg` | `api.getCoreStaticUrl('smile.svg')` |

If you put `public/smile.svg` in your project, it does **not** replace the
module's `/_smile/smile.svg`. It just becomes a separate file available at
`/smile.svg`.

To swap the university logo shown by the welcome page, set
`VITE_BRAND_LOGO_FN` in `.env` and put your image in `public/`:

```ini
VITE_BRAND_LOGO_FN = mylogo.png
```

This is a configuration override, not an asset override.

### CSS

The module loads its global stylesheet (`runtime/css/main.css`) at the
front of Nuxt's CSS array. Your project's `assets/css/app.css` is then
registered after, so the final load order is:

1. Module's `runtime/css/main.css`
2. Your `assets/css/app.css`

This means **your `app.css` wins at equal specificity** — the natural
expectation for module-vs-project styling. Tailwind utility classes are
unaffected by load order (they're processed at compile time).

To rebrand the experiment, redefine the theme tokens you care about in
your `app.css`:

```css
/* assets/css/app.css */

:root,
.light {
  --primary: oklch(0.55 0.2 250);
  --primary-button: oklch(0.55 0.2 250);
  --primary-button-foreground: oklch(0.985 0 0);
}

.dark {
  --primary: oklch(0.7 0.18 250);
}
```

Theme tokens are defined twice in the module's `main.css` — once in
`:root, .light` and once in `.dark`. Override the relevant block(s) in
your `app.css` using the matching selector.

### Composables and API

The module exposes a handful of auto-imported composables (`useAPI`,
`useViewAPI`, `useTimeline`, `useStepper`, `useSmileStore`, `useLog`,
`useSmileColorMode`, plus the `Timeline` class). These don't have an
override system — you use them as-is in your `.vue` files.

You **can** create your own composables in a project-level `composables/`
directory and Nuxt will auto-import them alongside the module's. They
live in a separate namespace; nothing collides.

### Building a library of SMILE-based components

Two patterns work here.

**A reusable component library as a separate Nuxt module.** If you want
to publish a set of SMILE-based components for other labs to install
(e.g., `@yourlab/smile-stroop` with a polished Stroop task), publish it
as a Nuxt module that calls `addComponentsDir` for its components.
Register at `priority: -1` (matching `@nyuccl/smile-nuxt`) so the
consumer's local `components/` still wins. The resolution chain becomes:

```
user components/  >  @yourlab/smile-stroop  >  @nyuccl/smile-nuxt
(default priority)   (priority: -1)              (priority: -1)
```

If two libraries register components at equal priority with the same
name, the last one to register wins — order modules in `nuxt.config.ts`
deliberately.

**A simple npm package of `.vue` files.** For something lighter, publish
plain Vue SFCs in an npm package and have consumers import them
explicitly in `design.js`:

```js
import { TrustGameView } from '@yourlab/smile-economic-tasks'

timeline.pushSeqView({
  name: 'trust-game',
  component: markRaw(TrustGameView),
})
```

No module needed; no auto-import; no precedence questions. The trade-off
is that consumers can't override your components by dropping a same-named
file in their `components/`.

### Cheat sheet

```
                Vue component        Public asset        CSS rule
                ─────────────        ────────────        ────────
user wins?      ✅ always            n/a (separate URLs) ✅ at equal
                (priority 1 > -1)                          specificity

module path     module dirs at       /_smile/*           main.css (loads first)
                priority: -1

user path       components/          public/             assets/css/app.css
                                                         (loads after main.css)

shadowing       drop same-named      no override —       redefine the
                file in              they coexist        rule / variable
                components/                              in app.css
```

## Next steps

- The [Timeline](/coding/timeline) doc explains `design.js` in depth.
- [Components](/coding/components) walks through building custom views.
- [Configuration](/coding/configuration) is the env-var reference.
