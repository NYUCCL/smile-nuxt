# Project Organization

When you scaffold a new experiment with
`pnpm create @nyuccl/smile-nuxt my-experiment`, you get a Nuxt project
pre-wired for SMILE. This page walks through each file and folder so you know
what is yours to edit, what is yours to leave alone, and what is generated.

::: tip Overriding built-ins
Your project and the module share one Nuxt app, so your files can override the
module's components, assets, and styles by name. The precedence rules — and one
important footgun (accidentally shadowing a built-in UI primitive like `Button`
or `Checkbox`) — have their own page: **[Overrides & Resolution](/coding/overrides)**.
:::

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

Anything you build lives here. The starter ships with five examples:

- **`MyTaskView.vue`** — placeholder for your experiment task. Replace this
  with your own logic.
- **`StroopExpView.vue`** — a working color-word Stroop task. Useful as a
  worked example; delete or replace when you don't need it.
- **`InformedConsentText.vue`** — the consent body text. Ships as a
  placeholder; edit it with your IRB-approved language.
- **`InformedConsentTextSample.vue`** — a fully formatted consent template
  you can copy from when filling in `InformedConsentText.vue`. Not wired
  into the experiment.
- **`DebriefText.vue`** — the debrief shown after the experiment finishes.

Components in this folder are **auto-imported** in `.vue` files — use them
directly in templates without `import` statements. In plain `.js` files like
`design.js` you still need explicit imports.

You can also override any built-in view by creating a component with the same
name (e.g., `components/AdvertisementView.vue`) — see
[Overrides & Resolution](/coding/overrides) for the precedence rules and caveats.

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

### `CLAUDE.md` and `.cursor/rules/`

Context files for AI coding assistants. `CLAUDE.md` is read by Claude Code,
`.cursor/rules/smile.mdc` is read by Cursor. They describe project
conventions, auto-imports, and the SMILE API so AI tools can help you write
experiment code more accurately.

Safe to edit, customize, or delete if you don't use AI assistants.

## Generated and gitignored

You'll see these appear after you run `pnpm install` and `pnpm dev`. They are
all in `.gitignore` — never commit them.

| Path                 | What it is                                                       |
| -------------------- | ---------------------------------------------------------------- |
| `node_modules/`      | Installed npm packages                                           |
| `.nuxt/`             | Nuxt's build cache and generated types                           |
| `.output/`           | Production build artifacts (created by `pnpm build`)             |
| `.data/`             | Local SQLite database for dev (`experiment.db`)                  |
| `.env.git.local`     | Auto-generated git-derived env vars (regenerated each dev start) |
| `test-results/`      | Playwright test artifacts                                        |
| `playwright-report/` | Playwright HTML reports                                          |
| `.vercel/`           | Vercel CLI metadata if you've linked the project locally         |

## Next steps

- [Overrides & Resolution](/coding/overrides) — precedence rules for components, assets, and CSS.
- The [Timeline](/coding/timeline) doc explains `design.js` in depth.
- [Components](/coding/components) walks through building custom views.
- [Configuration](/coding/configuration) is the env-var reference.
