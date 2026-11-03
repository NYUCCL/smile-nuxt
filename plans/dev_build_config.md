# Build & deploy settings page in the dev tools

Status: plan, for review (2026-11-03). Branch `dev-build-config` (from 227ba79).
Related: #38 (SMILE_DEV_TOOLS), #31 (auth secret), #65 (`pnpm smile:check`).

## Goal

One page in the dev tools that lists every setting that changes how a project
builds, deploys and behaves; says what each does; shows its current value and
where that value came from; warns about risky combinations; and lets the
developer edit it. Edits rewrite the project's own config files through
server routes that exist only in `nuxt dev`.

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

## 2. UI

**Where:** a third mode on the dev tools' left rail ("Build & deploy
settings", a `SlidersHorizontal` icon), i.e. `store.dev.mainView = 'config'`,
rendered full-width like presentation mode. The settings popover
(`DevConfigPanel`) is the dev tools' own preferences and too small for ~45
rows; the console's Config tab browses the live `api.config` object and stays
as is. Touching shared files is two small edits: one entry in
`SmileDevAppMenu.vue`'s `modes` array and one `v-else-if` in
`layouts/development.vue`. Everything else is new files in
`src/runtime/components/dev/buildconfig/`.

**Layout** (top to bottom):

1. Header: title, the "local files vs deploy" note, a Reload button.
2. Findings: the risk-rule results, errors then warnings then info. Each names
   the keys involved (click scrolls to the row) and the fix.
3. Sections: Dev access, Database, Data saving, Experiment, Display &
   branding, Recruitment, Generated (collapsed), Deploy.
4. A row: key (mono), one-line description, effective value, source badge,
   phase badge (build / runtime), and an edit control by type: switch (bool),
   select (enum), number input, text input. Edit opens inline with a
   target-file choice (`.env.local` default, `.env`), Save / Cancel, and an
   "Unset" button. Secrets show "set (bcrypt hash)" / "set (plaintext)" / "not
   set" and offer Set password… (a password field, hashed on the server) and
   Clear.
5. After a save: a toast saying what happens next ("the dev server restarts
   now", or "takes effect in the next build; the dev server picks it up after
   restart", or "runtime on deploys: set it in Vercel too").

**Look:** the dev tools' committed tokens and utilities (`bg-sd-bg`,
`border-sd-line`, `text-sd-*`, `sd-selected`, `variant="toolbar"` buttons,
shadcn primitives). The new `.sd-section` / `.sd-label` / `.sd-field` classes
are on the `dev-tools-theme` branch, not here yet, so I'll use local scoped
classes with the same intent and switch them over at merge.

## 3. Server routes and safety

### Registration: dev only, not in any build

Not in `runtime/server/` (that directory is scanned into every Nitro build).
The handler lives in `src/devconfig/` next to `module.ts` and is registered
with `addDevServerHandler()` inside `if (nuxt.options.dev)`. A dev server
handler is an in-process h3 handler on the Nuxt dev server: it runs in the
Nuxt process (where it can see `rootDir`), it is never written into
`.output`, and `SMILE_DEV_TOOLS` has no bearing on it (in dev the tools are
always included; in a build the route doesn't exist at all). A test builds the
playground and checks the route is absent (§4).

### Routes

- `GET /_smile/dev-config`: the settings (inventory metadata + value, source,
  other layers), the findings, which files exist, and a version token per
  file (content hash). Secrets come back as `{ set, kind: 'bcrypt' |
  'plaintext' }`, never a value.
- `POST /_smile/dev-config`: `{ key, value | null, file: '.env' | '.env.local',
  version }`. `null` removes the key. Returns the new GET payload plus
  `{ effect: 'restart' | 'next-build' | 'runtime-on-deploy' }`.
- `POST /_smile/dev-config/password`: `{ scope: 'dev' | 'presentation',
  password }`. Hashes with `bcrypt.hash(password, 12)`, as
  `scripts/hash-password.js` does, and writes `SMILE_*_PASSWORD` to
  `.env.local`.

### Safety

- **Fixed targets.** `file` is an enum mapped to `join(rootDir, '.env')` /
  `join(rootDir, '.env.local')`; no path ever comes from the request.
  `nuxt.config.ts` is read-only in v1 (show `smile.devTools`, suggest the env
  var); editing TS with magicast is possible later if wanted.
- **Key allowlist** from the inventory; generated and unknown keys are
  refused. Secret keys can only be written to `.env.local` (gitignored) and
  only through the password route or a clear.
- **Validation** per key: enum, boolean, integer with a range, `WIDTHxHEIGHT`,
  URL (`libsql://`, `https://`, `file:`), and for every value: no newline, NUL
  or `#`-comment ambiguity (quoted when needed), max 1000 chars.
- **Requests from the page only.** The dev server listens on localhost, so
  any site the developer visits could otherwise POST to it. Require: a
  loopback remote address (refuses LAN requests when `nuxt dev --host`), a
  `Host` of localhost / 127.0.0.1 / [::1] (DNS rebinding), an `Origin`
  matching the Host, `content-type: application/json` and an
  `x-smile-dev-config` header (so cross-site requests need a preflight we never
  answer).
- **Conflicts.** The POST carries the file's version from the GET; if the file
  changed since (Todd edited it in his editor), it's refused and the page
  reloads.
- **Secrets never leave the server**: not in responses, errors or logs. The
  handler doesn't print values at all.

### Editing `.env` files

A small line-based editor (`src/devconfig/envfile.ts`), not a
parse-and-reserialize:

- Finds the last active `KEY = value` line (the one dotenv uses) and replaces
  only the value, keeping that line's spacing style (`KEY   = value` aligned or
  `KEY=value`) and any trailing comment.
- Missing key: inserted after the last active line of the same section in the
  file if there is one, else appended; commented-out examples (`# KEY = …`)
  are left alone.
- Unset: removes the active line only.
- Keeps line endings and the final newline; writes atomically (temp file +
  rename). Creates `.env.local` if missing, with a one-line header.

### What happens after a change

Nuxt restarts the dev server when `.env` changes; I need to confirm whether it
watches `.env.local` too. If it doesn't, the handler calls
`nuxt.callHook('restart')` after writing, so the effect is the same for both
files. The toast says which applies: `VITE_*` and `SMILE_DEV_TOOLS` matter at
build time (the dev server picks them up on restart); the `SMILE_*_ACCESS`,
password, auth and Turso values are runtime on deploys; and local dev ignores
the access settings anyway (`/dev` is always open in `nuxt dev`).

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

Unit (vitest; `// @vitest-environment node` for server code):

- `test/devconfig/envfile.test.ts`: replace keeps comments, order, spacing
  and trailing comments; duplicate keys (last wins); insert into a section;
  append; remove; quoting values with spaces or `#`; CRLF; no final newline.
- `test/devconfig/rules.test.js`: each rule fires and stays quiet on its
  negative case; secrets passed only as `{ set, kind }`.
- `test/devconfig/sources.test.ts`: layer precedence (shell > .env.local >
  .env > generated > default) and "also set in".
- `test/devconfig/handler.test.ts` against a temp project dir: unknown key,
  generated key, bad value, bad `file`, secret into `.env` all refused; Host /
  Origin / header / content-type checks; stale version refused; the password
  route writes a hash that `bcrypt.compare` accepts; the plaintext password and
  the hash never appear in any response body.

Build check: a test that runs `nuxt build playground` and checks that
`.output` has no `/_smile/dev-config` (slow, so it goes in the e2e run or
`test:starter`, not plain `vitest run`).

E2E (`test/e2e/build-config.spec.ts`, playground on `SMILE_E2E_PORT=3100`):
open /dev → the rail button → the page lists settings with sources; edit
`VITE_MAX_STEPS` into `.env.local` and see the file change and the value
update after the restart; set a dev password and see "set (bcrypt hash)" with
no hash in any network response; a risky combination shows its finding. The
spec backs up and restores `playground/.env.local` (gitignored) around the
run.

Also: `pnpm lint`, `pnpm exec vitest run`, the existing dev-mode specs (the
rail gained a button).

## Open questions for Todd

1. A rail mode (proposed) vs. a tab inside the settings popover?
2. Edit `nuxt.config.ts`'s `smile.devTools` too, or show it read-only and
   point to `SMILE_DEV_TOOLS` (proposed)?
3. Default target file for edits: `.env.local` (proposed; per-developer,
   untracked) or `.env` (shared with the team and used by deploys)? A
   non-secret change meant for the deployed study belongs in `.env`, so the
   page may need to suggest `.env` for `VITE_*` keys.
4. OK to put the rules/schema under `src/runtime/shared/` with a package
   export later for #65?
