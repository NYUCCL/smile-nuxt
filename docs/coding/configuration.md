# Configuration

Every experiment needs configuration — UI defaults, database credentials,
branding, data-saving limits, and so on. <SmileText/> organizes these into
three clear buckets and gives you a strong preferred place to set most of
them. This page describes the system end-to-end.

## Quick start

The starter ships with sensible defaults. For local development you usually
don't have to configure anything — `pnpm dev` just works. To deploy, the one
thing you need is your **Turso database credentials** (`TURSO_DATABASE_URL` +
`TURSO_AUTH_TOKEN`) — see [Cloud Hosting](/recruit/deploying) for the full setup.

On a deployed site, `/dev/` and `/presentation/` default to **disabled** (they
404). If you want them on the live site, opt in per route — each has its own
password and access mode (`SMILE_DEV_PASSWORD` / `SMILE_DEV_ACCESS` and
`SMILE_PRESENTATION_PASSWORD` / `SMILE_PRESENTATION_ACCESS`); see the
[server secrets](#server-secrets) table below.

Everything else in this guide is optional — read it when you want to tune
the experiment's behavior, branding, or data limits.

## How configuration is organized

<SmileText/> has three categories of config. Knowing which bucket a value
lives in tells you where to set it and who can read it.

| Category                       | Lives in                                              | Visible to browser? | When to touch                                            |
| ------------------------------ | ----------------------------------------------------- | :-----------------: | -------------------------------------------------------- |
| **Server-only secrets**        | `.env.local` (dev) / hosting provider env vars (prod) |         No          | Database creds, dev password                             |
| **Client-visible settings**    | `design.js` via `setRuntimeConfig`, or `.env`         |         Yes         | UI, branding, data-save throttling, experiment defaults  |
| **Auto-generated git metadata**| `.env.git.local` (do not edit)                        |         Yes         | Never — regenerated on every Nuxt startup                |

The recommended way to set client-visible settings is **in `design.js`** using
`api.setRuntimeConfig()`. The `.env` files are treated as a defaults layer that
`setRuntimeConfig` overrides. This means your experiment configuration lives
with your code, ships in your repo, and is portable across machines.

## Setting experiment options in `design.js`

`api.setRuntimeConfig(key, value)` sets a configuration value at app startup.
Use it at the top of `design.js` to tune the experiment's behavior. The most
common knobs:

```js
api.setRuntimeConfig('allowRepeats', false)

api.setRuntimeConfig('colorMode', 'light')
api.setRuntimeConfig('responsiveUI', true)

api.setRuntimeConfig('windowsizerRequest', { width: 800, height: 600 })
api.setRuntimeConfig('windowsizerAggressive', true)

api.setRuntimeConfig('anonymousMode', false)
api.setRuntimeConfig('labURL', 'https://gureckislab.org')
api.setRuntimeConfig('brandLogoFn', 'universitylogo.png')

api.setRuntimeConfig('maxWrites', 1000)
api.setRuntimeConfig('minWriteInterval', 2000)
api.setRuntimeConfig('autoSave', true)
```

You can also add **your own** keys here. For example, a pay rate string:

```js
api.setRuntimeConfig(
  'payrate',
  '$15USD/hour prorated for estimated completion time plus performance bonus'
)
```

Then read it anywhere in your views:

```js
const payrate = api.getRuntimeConfig('payrate')
```

::: info Where the value goes
Built-in keys mutate the matching field on the smile config store. Novel keys
are stored under `store.config.runtime.<key>`. Either way they're included in
the participant's `smileConfig` data export, so the exact configuration that
produced any given record is recoverable from the data itself.
:::

::: danger Overrides
Calling `setRuntimeConfig('foo', value)` overrides any `.env`-provided default
with the same meaning. Treat `.env` as a floor and `design.js` as the source
of truth.
:::

## Environment variables you might edit

Two prefixes exist, and the key difference is *when* each is read — which
matters a lot once you deploy:

- **`SMILE_*`** and **`TURSO_*`** — server-only secrets, read directly from
  `process.env` at **runtime** inside Nitro server routes (the same way the
  database reads `TURSO_DATABASE_URL`). Never bundled into the browser.
  Because they're read per request, changing one in your host's dashboard takes
  effect on the next request — **no rebuild needed**.
- **`VITE_*`** — read at **build time** and embedded in the client bundle.
  Visible to participants via the source, so don't put secrets here. Changing
  one means rebuilding and redeploying.

For local development, put values in `.env.local` (gitignored). The starter
ships with `.env.local.example` — copy it to `.env.local` and fill in your
values. For production, set the same variables in your hosting provider's
dashboard (e.g., Vercel: Project Settings → Environment Variables).

::: tip Restart after editing env files
Nuxt reads `.env` files once at startup. If you change a value locally, stop
and restart the dev server (`pnpm dev`) to pick it up.
:::

::: info Build-time vs runtime on a deployed site
The same split applies after you deploy: `VITE_*` values are frozen into the
build, so changing one requires a fresh deploy. The server secrets (`TURSO_*`,
`SMILE_DEV_ACCESS` / `SMILE_DEV_PASSWORD`, `SMILE_PRESENTATION_ACCESS` /
`SMILE_PRESENTATION_PASSWORD`) are read at request time, so updating them in the
host dashboard takes effect on the next request without rebuilding.
:::

### Server secrets

| Variable                    | What it does                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `TURSO_DATABASE_URL`         | libSQL/Turso database URL for production. If unset, falls back to local SQLite at `.data/experiment.db`.                      |
| `TURSO_AUTH_TOKEN`           | Auth token for the Turso database.                                                                                            |
| `SMILE_DEV_ACCESS`           | `/dev/` access on deployed sites: `disabled` (default) \| `password` \| `open`. Local dev is always open.                     |
| `SMILE_DEV_PASSWORD`         | Password for `/dev/` in `password` mode. Setting it also opts `/dev/` into `password` mode.                                   |
| `SMILE_PRESENTATION_ACCESS`  | `/presentation/` access: `disabled` (default) \| `password` \| `open`.                                                       |
| `SMILE_PRESENTATION_PASSWORD`| Password for `/presentation/` in `password` mode (separate from the dev password).                                           |

On a deployed site, `/dev/` and `/presentation/` default to **disabled** (they
404). See [Cloud Hosting → Dev & presentation route access](/recruit/deploying#dev-password)
for the full model, and [Vercel + Turso wiring](/recruit/deploying).

### Client-visible defaults (UI, branding, data saving)

These can equivalently be set via `setRuntimeConfig` in `design.js` — the
runtime call wins. They exist as env vars mainly for CI scenarios where you
want to ship two builds of the same experiment with different defaults.

| Variable                       | Default                     | What it does                                                                                                                                       |
| ------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_ALLOW_REPEATS`           | `false`                     | Try to prevent participants from taking the task more than once.                                                                                   |
| `VITE_COLOR_MODE`              | `light`                     | UI color mode: `light` / `dark` / `system`.                                                                                                        |
| `VITE_RESPONSIVE_UI`           | `true`                      | Whether the default layout responds to window resizes.                                                                                             |
| `VITE_WINDOWSIZER_REQUEST`     | `800x600`                   | Requested content area size (`WIDTHxHEIGHT`).                                                                                                      |
| `VITE_WINDOWSIZER_AGGRESSIVE`  | `true`                      | If `true`, re-trigger the window sizer when the user shrinks the window.                                                                           |
| `VITE_ANONYMOUS_MODE`          | `false`                     | Hide default lab/branding text — useful for double-blind paper submissions.                                                                        |
| `VITE_LAB_URL`                 | `https://gureckislab.org`   | Lab homepage URL used in headers.                                                                                                                  |
| `VITE_BRAND_LOGO_FN`           | `universitylogo.png`        | Filename of the brand logo. Place the file in `public/`.                                                                                           |
| `VITE_AUTO_SAVE_DATA`          | `true`                      | Auto-call `saveData()` between View transitions.                                                                                                   |
| `VITE_MAX_WRITES`              | `1000`                      | Cap on participant data writes per session. Guards against runaway loops more than against hosting cost.                                           |
| `VITE_MIN_WRITE_INTERVAL`      | `2000`                      | Minimum milliseconds between writes.                                                                                                               |
| `VITE_MAX_STEPS`               | `5000`                      | Maximum number of steps any one View component can contain.                                                                                        |
| `VITE_RANDOM_SEED`             | `100012`                    | Seed for the deterministic PRNG used in condition assignment and randomization. The dev sidebar's seed control is easier during interactive work.  |
| `VITE_GOOGLE_ANALYTICS`        | _(unset)_                   | Google Analytics ID, if you want analytics on the deployed site.                                                                                   |

### Recruitment service variables (SONA)

If you use [SONA](https://www.sona-systems.com/) as a recruitment service, set
these in `.env.local` so the credit redirect URLs resolve correctly. See
[Recruitment](/recruit/recruitment) for the full SONA integration story.

| Variable                        | What it does                                                            |
| ------------------------------- | ----------------------------------------------------------------------- |
| `VITE_SONA_URL`                 | Base URL of your SONA installation (e.g., `https://yourlab.sona-systems.com`). |
| `VITE_SONA_EXPERIMENT_ID`       | SONA experiment ID for the unpaid (credit) study.                       |
| `VITE_SONA_CREDIT_TOKEN`        | Credit-granting token issued by SONA.                                   |
| `VITE_SONA_PAID_URL`            | Base URL of the paid SONA installation (if separate from the credit one).|
| `VITE_SONA_PAID_EXPERIMENT_ID`  | SONA experiment ID for the paid study.                                  |
| `VITE_SONA_PAID_CREDIT_TOKEN`   | Credit-granting token for the paid study.                               |

## Auto-generated git metadata

When the dev server starts, `scripts/generate_git_env.sh` reads your local
git checkout and writes a `.env.git.local` file with values like:

```sh
VITE_PROJECT_NAME
VITE_GIT_OWNER
VITE_GIT_REPO_NAME
VITE_GIT_BRANCH_NAME
VITE_GIT_HASH
VITE_GIT_LAST_MSG
VITE_CODE_NAME
VITE_PROJECT_REF
VITE_DEPLOY_BASE_PATH
```

::: warning Don't edit `.env.git.local`
The file is regenerated on every Nuxt startup. Local edits are overwritten.
It's also gitignored — you can't share values by committing it.
:::

These power <SmileText/>'s
[data provenance](/analysis.html#data-provenance) features. Every participant
record carries the git hash that produced it, so you can recover the exact
code that ran any given session by checking out the same commit.

## Adding your own configuration option

You have three options, ordered from easiest to most involved.

### 1. Runtime config in `design.js` (recommended)

```js
api.setRuntimeConfig('myKey', value)
// ...later, in a view:
const myValue = api.getRuntimeConfig('myKey')
```

Stored in the Pinia store, exported with the participant's `smileConfig`.
This is the right answer for almost everything experiment-related.

### 2. A `VITE_*` env var

Useful when you want CI to pass different values per build, or when a value
genuinely differs by environment (dev vs. staging vs. prod).

1. Add `VITE_MY_OPTION` to `.env` (tracked default) or `.env.local`
   (machine-specific).
2. Surface it on the global config map by adding a line to
   `src/runtime/core/config.js`.
3. Read it via the same `api.getRuntimeConfig('myOption')` call (the runtime
   config layer reads from the global config map as its floor).

### 3. A server-only secret

For credentials and other values that **must not** reach the browser.

1. Add `MY_SECRET` to `.env.local` (and to your hosting provider's env vars
   for production — set it for every environment you deploy).
2. Read it directly from `process.env` at **runtime**, inside a server route
   you add under `server/` in your project:

   ```ts
   // server/api/my-thing.ts
   export default defineEventHandler(() => {
     const secret = process.env.MY_SECRET || ''
     // ...use the secret server-side only
   })
   ```

::: warning Read secrets from `process.env`, not `runtimeConfig`
Always reach for `process.env` at request time rather than Nuxt's build-time
`runtimeConfig`. On serverless hosts (e.g. Vercel) env vars are only reliably
present at runtime, so a value read while *building* comes back empty in
production — the trap that can silently disable a security check. This is why
<SmileText/> reads `SMILE_DEV_PASSWORD` and the Turso credentials straight from
`process.env`.
:::

Never reference a server secret from a Vue component — it isn't bundled.

## Reference: where things live

| Path                                                              | Purpose                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `design.js`                                                       | Recommended place to set most experiment-level config via `setRuntimeConfig`.    |
| `.env`                                                            | Tracked defaults for `VITE_*` UI/branding/data-saving values.                    |
| `.env.local`                                                      | Gitignored secrets and machine-specific overrides. Copy from `.env.local.example`. |
| `.env.git.local`                                                  | Auto-generated git metadata. Don't edit, don't commit.                           |
| `src/runtime/core/config.js`                                      | The runtime config map consumed by the app. Add new `VITE_*` surfaces here.      |
| `server/` routes in your project                                  | Where to read your own server secrets — from `process.env` at runtime, never build-time `runtimeConfig`. |
| Hosting provider dashboard (e.g., Vercel Project → Env Variables) | Where the same env vars go for production deployment.                            |
