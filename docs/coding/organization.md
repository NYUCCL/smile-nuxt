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
├── .env.example         # Reference for all available env vars
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

### `.env` and `.env.local`

`.env` holds non-secret defaults like UI mode, randomization seed, and
branding — safe to commit.

`.env.local` is gitignored and is where you put secrets: database tokens,
the dev/presentation password, analytics keys. Values here override values
in `.env`.

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

## Next steps

- The [Timeline](/coding/timeline) doc explains `design.js` in depth.
- [Components](/coding/components) walks through building custom views.
- [Configuration](/coding/configuration) is the env-var reference.
