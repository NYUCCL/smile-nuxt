# Build & deploy settings page in the dev tools

Status: plan agreed, building (2026-11-03). Branch `dev-build-config` (from 227ba79).
Related: #38 (SMILE_DEV_TOOLS), #31 (auth secret), #65 (`pnpm smile:check`).

## Goal

One page in the dev tools that lists every setting that changes how a project
builds, deploys and behaves; says what each does; shows its current value and
where that value came from; warns about risky combinations; and lets the
developer edit it. Read-only for now: the page says where to change each
setting. The data comes from one route that exists only in `nuxt dev`.

## 1. Inventory

**Phase** = when the value is read. *build*: baked in at `nuxt build` (all
`VITE_*`, inlined by Vite into the client bundle, so also **public**, and
`SMILE_DEV_TOOLS`). *runtime*: read from `process.env` per request on the
server, so a deploy can change it in Vercel without a rebuild.

**Default** = what the code does when the key is unset (not what the starter's
`.env` sets).

### Dev & presentation access (server, `utils/dev-auth.ts`, `module.ts`)

| Key | Values | Default | Phase | Risk |
|---|---|---|---|---|
| `SMILE_DEV_TOOLS` | include \| exclude (also true/false/1/0/yes/no/on/off) | exclude (or `smile.devTools` in nuxt.config) | build | Ships /dev and the dev data API |
| `SMILE_DEV_ACCESS` | disabled \| password \| open | disabled; password if a password is set | runtime | `open` = anyone reads all participant data |
| `SMILE_DEV_PASSWORD` | plaintext or bcrypt hash | unset | runtime | **secret** |
| `SMILE_PRESENTATION_ACCESS` | disabled \| password \| open | as above | runtime | `open` is public |
| `SMILE_PRESENTATION_PASSWORD` | plaintext or bcrypt | unset | runtime | **secret** |
| `SMILE_PUBLIC_PRESENTATION` | true | unset | runtime | legacy alias for presentation `open` |
| `SMILE_AUTH_SECRET` | any string | falls back to `TURSO_AUTH_TOKEN`, then `SMILE_DEV_PASSWORD`, then a key published in the package | runtime | **secret**; unset on a deploy = forgeable participant tokens |

Module option in `nuxt.config.ts`: `smile.devTools` (boolean, default false;
`SMILE_DEV_TOOLS` overrides it). Also `smile.preloadImages` / `preloadVideos`
(shown, not risky).

### Database (`utils/db.ts`)

| Key | Default | Phase | Risk |
|---|---|---|---|
| `TURSO_DATABASE_URL` | `file:.data/experiment.db` | runtime | unset on a deploy = no durable storage |
| `TURSO_AUTH_TOKEN` | unset | runtime | **secret** |

### Experiment behavior (`core/config.js`, all build-time and public)

| Key | Default | Notes / risk |
|---|---|---|
| `VITE_ALLOW_REPEATS` | false | true lets a participant run twice |
| `VITE_AUTO_SAVE_DATA` | true (only `'false'` turns it off) | false = nothing saves unless the design calls save |
| `VITE_MAX_WRITES` | 1000 | saves stop after this many per page load |
| `VITE_MIN_WRITE_INTERVAL` | 2000 ms | throttle; 0 = every change is a request |
| `VITE_MAX_STEPS` | 5000 | stepper table cap |
| `VITE_RANDOM_SEED` | unset (random) | |
| `VITE_COLOR_MODE` | light | light \| dark \| system (auto) |
| `VITE_RESPONSIVE_UI` | false | |
| `VITE_WINDOWSIZER_REQUEST` | `0x0` (off) | `WIDTHxHEIGHT` |
| `VITE_WINDOWSIZER_AGGRESSIVE` | false | |
| `VITE_ANONYMOUS_MODE` | false | hides lab branding |
| `VITE_UNPAID_STUDY` | false | |
| `VITE_LAB_URL`, `VITE_BRAND_LOGO_FN` | unset | branding |
| `VITE_GOOGLE_ANALYTICS` | unset | |
| `VITE_DEPLOY_URL`, `VITE_CODE_NAME_DEPLOY_URL` | unset | |

### Recruitment (`utils/utils.js`, build-time, public)

`VITE_SONA_URL`, `VITE_SONA_EXPERIMENT_ID`, `VITE_SONA_CREDIT_TOKEN`, and the
`VITE_SONA_PAID_*` trio. The credit token ends up in the client bundle by
design (it's in the completion URL), so it's shown like any other `VITE_*`
value, with a note that it is public. Prolific/CloudResearch need no env.

### Generated, read-only (`scripts/generate_git_env.sh` → `.env.git.local`)

`VITE_PROJECT_NAME`, `VITE_GIT_HASH`, `VITE_GIT_REPO_NAME`, `VITE_GIT_OWNER`,
`VITE_GIT_BRANCH_NAME`, `VITE_DEPLOY_BASE_PATH`, `VITE_CODE_NAME`,
`VITE_GIT_LAST_MSG`, `VITE_PROJECT_REF`; `VITE_SMILE_VERSION` comes from the
module's package.json. Shown with source "generated", no edit control.

### Deploy (not in project files)

GitHub secrets set by `smile:setup-deploy` (`VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`, `SLACK_WEBHOOK_URL`, `MAIL_*`) and the app env in the
Vercel dashboard. The page can't see these and won't try (no `gh`/`vercel`
calls, no reading `~/.smile/deploy.env`). It shows one fact it can see
(`.vercel/project.json` exists: linked or not), the command to run, and a
standing note: **the values here are your local files; a deploy builds with
the tracked `.env` plus the Vercel environment, not `.env.local`.**

### Where a value comes from

Mirrors how a starter project actually loads env, highest first: shell
environment (in `process.env` and in no file), `.env.local`, `.env`,
`.env.git.local` (generated), module option, code default. The source shown is
the winning layer, and the row lists the other layers that also set it
("also in .env: 1000"). For a `VITE_*` value, the page also compares the file
value with the live `api.config` in the browser: if they differ, it says
"overridden in design.js (`api.setRuntimeConfig`)" or "restart pending".

## Decisions (Todd, 2026-11-03)

- A rail mode in the dev tools, not a tab in the settings popover.
- **Read-only across the board** for now. The page explains each setting and
  says where to change it (which file, or a Vercel env var / GitHub secret);
  it doesn't write anything. Editing can come later on the same data.
- Lead with what a deploy will do: dev tools / presentation available or
  not, passworded or not, with explanations and recommendations.

## 2. UI

**Where:** a third mode on the dev tools' left rail ("Build & deploy
settings", `SlidersHorizontal` icon): `store.dev.mainView = 'config'`,
full-width like presentation mode. Shared files get two small edits (one entry
in `SmileDevAppMenu.vue`'s `modes`, one `v-else-if` in
`layouts/development.vue`); the rest is new files in
`src/runtime/components/dev/buildconfig/`.

**Layout** (top to bottom):

1. **When you deploy.** One line per question, each with a status (ok /
   check / risk), a sentence of explanation, a recommendation, and where to
   change it:
   - Are the dev tools in the build? (`SMILE_DEV_TOOLS` / `smile.devTools`)
   - Who can open /dev? (`SMILE_DEV_ACCESS` + password)
   - Who can open /presentation? (`SMILE_PRESENTATION_ACCESS` + password,
     legacy `SMILE_PUBLIC_PRESENTATION`)
   - Where does data go? (`TURSO_*`)
   - Are participant tokens signed with a real secret? (`SMILE_AUTH_SECRET`)
   - Does data save? (`VITE_AUTO_SAVE_DATA`, write limits)
   Answers are worked out from the files a deploy builds with (the tracked
   `.env`, `.env.production`), and say plainly that Vercel env vars can
   change them ("not set in tracked files; set it in Vercel if…").
   A short line notes that this dev server always has /dev open, no password.
2. **Other findings** from the risk rules not already in the summary.
3. **All settings**, by section: Dev access, Database, Data saving,
   Experiment, Display & branding, Recruitment, Generated (collapsed).
   A row: key (mono), description, current value, source badge (`.env.local`,
   `.env`, environment, generated, nuxt.config, default), phase badge (build /
   runtime), "local only" when it's set only in an untracked file a deploy
   won't see, and a "How to change" line (file for local; Vercel env var for
   deploys; never commit secrets). Secrets show only "set (bcrypt hash)",
   "set (plaintext)" or "not set". For `VITE_*` keys, a mismatch with the
   live `api.config` shows "changed at runtime (design.js
   `api.setRuntimeConfig`)" or "restart the dev server to pick this up".

**Look:** the dev tools' committed tokens and utilities (`bg-sd-bg`,
`border-sd-line`, `text-sd-*`, `sd-selected`, shadcn primitives). The new
`.sd-section` / `.sd-label` / `.sd-field` classes are on `dev-tools-theme`, not
here yet, so local scoped classes with the same intent, swapped at merge.

## 3. Server route and safety

**Registration: dev only, not in any build.** Not in `runtime/server/` (that
directory is scanned into every Nitro build). The handler lives in
`src/devconfig/` next to `module.ts` and is registered with
`addDevServerHandler()` inside `if (nuxt.options.dev)`. It runs in the Nuxt
process on the dev server and is never written into `.output`;
`SMILE_DEV_TOOLS` has no bearing on it. Checked by building the playground
and grepping `.output`.

**One route:** `GET /_smile/dev-config`, read fresh per request (files
change). Returns the settings (schema + value, source, other layers that set
it, local-only flag), the deploy summary, the findings, which env files exist,
`smile.devTools`, and whether `.vercel/project.json` exists.

**Safety:**
- Read-only; no request parameters; reads a fixed list of files in
  `rootDir` (`.env`, `.env.local`, `.env.development[.local]`,
  `.env.production[.local]`, `.env.git.local`, `.vercel/project.json` for
  existence only).
- Secrets never leave the server: `SMILE_*_PASSWORD`, `SMILE_AUTH_SECRET`,
  `TURSO_AUTH_TOKEN` become `{ set, kind }` before anything else sees them;
  the rules get that, not the value. Nothing is logged.
- It still reveals config, so: loopback remote address only, `Host` must be
  localhost / 127.0.0.1 / [::1] (DNS rebinding), and no CORS headers.

### Risk rules (shared with #65)

`src/runtime/shared/config-rules.js`: plain JS, no Nuxt or Node imports, so
the page's server handler and a future `pnpm smile:check` CLI can both use it.
`checkConfig(settings) → Finding[]`, where `settings` maps key → `{ value,
source }` and secrets come in as `{ set, kind }` (rules never see a secret).
A finding is `{ id, level: 'error' | 'warn' | 'info', keys, message, fix }`.
The inventory (descriptions, types, defaults, phase) lives next to it in
`config-schema.js` for the same reason. For #65 we'd add a package export
(`@nyuccl/smile-nuxt/config-rules`) and the CLI reads the files the same way.

First rules:

- error: dev tools included and dev access `open`: anyone can open /dev and
  read all participants' data.
- error: a secret (`*_PASSWORD`, `TURSO_AUTH_TOKEN`, `SMILE_AUTH_SECRET`) in
  `.env`, which is tracked by git.
- warn: dev tools excluded but a dev password or `SMILE_DEV_ACCESS` is set:
  /dev will 404 (the case `module.ts` logs).
- warn: access `password` with no password set: the route 404s.
- warn: dev tools included but access resolves to `disabled`: shipped but
  unreachable.
- warn: presentation access `open` (or `SMILE_PUBLIC_PRESENTATION=true`).
- warn: no `SMILE_AUTH_SECRET`: tokens use the Turso token or dev password
  (rotating either logs participants out) or the published key.
- warn: `VITE_AUTO_SAVE_DATA=false`.
- warn: `TURSO_DATABASE_URL` set without `TURSO_AUTH_TOKEN`, or the reverse.
- info: dev password stored as plaintext (offer to hash it).
- info: `VITE_ALLOW_REPEATS=true`; `VITE_MIN_WRITE_INTERVAL` < 500;
  `TURSO_DATABASE_URL` not set locally ("make sure it's set in Vercel").
- error: any value that fails its key's validation (bad enum, not a number).

`module.ts`'s existing build-time warning stays as is; later it could call
the same rule.

## 4. Tests

Unit (vitest; node environment for server code):
- `test/devconfig/envparse.test.ts`: the dotenv-compatible parser (`KEY =
  value` with alignment, quotes, `export`, inline comments, CRLF, last wins).
- `test/devconfig/sources.test.ts`: layer precedence (environment >
  `.env.local` > `.env` > generated > module option > default), "also set
  in", local-only, secrets redacted.
- `test/devconfig/rules.test.js`: each rule and the deploy summary, positive
  and negative.
- `test/devconfig/handler.test.ts` against a temp project dir: Host and
  remote-address checks; a fixture password, hash and token never appear in
  the response body.

Build check: `nuxt build playground`, then confirm `.output` has no
`/_smile/dev-config`.

E2E (`test/e2e/build-config.spec.ts`, playground on `SMILE_E2E_PORT=3100`):
open /dev, click the rail button, see the deploy summary (playground
defaults: dev tools excluded, /dev disabled, local SQLite) and a settings row
with its source; the route answers 403 to a non-localhost Host.

Also `pnpm lint`, `pnpm exec vitest run`, and the existing dev-mode specs (the
rail gained a button).
