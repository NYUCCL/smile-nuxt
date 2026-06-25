# Cloud Hosting

To put your experiment in front of participants, you host it on the cloud —
sign up for a couple of free services, point your project at them, and push
your code so the experiment goes live at a public URL.

Local development needs none of this. If you only need to build and test
locally, [Quick Start](/quickstart) is all you need; come back here when you're
ready to recruit real participants.

::: info What you get
Every branch of your repo is treated as a separate **experiment** and deploys
to its own stable, shareable URLs:

- a friendly **codename** URL — e.g. `tiger-brave-castle.vercel.app`
- an explicit **owner-repo-branch** URL — e.g. `nyuccl-myexp-pilot.vercel.app`

Push to `main` and it deploys as your *production* experiment; push any other
branch and it deploys as a *preview*. See
[Branch = experiment](#branch-experiment) below.
:::

## How it fits together

Three services do the work, and the
[GitHub Action](https://github.com/) in the starter
(`.github/workflows/deploy.yml`) ties them together on every push:

| Service                          | Role                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| [**GitHub**](https://github.com) | Stores your code and runs the deploy workflow on every push |
| [**Vercel**](https://vercel.com) | Hosts the live site on a public URL with automatic HTTPS    |
| [**Turso**](https://turso.tech)  | Managed libSQL database that stores your participant data   |

On each push, the workflow builds your experiment, deploys the build to Vercel,
and aliases it to the codename URLs above. Your database migrations run
**automatically** the first time the deployed server starts — there is no
manual migration step.

## One-time setup

You do this section once. After that, every new experiment reuses the same
accounts and tools.

### 1. Install the command-line tools

You'll drive the whole flow from your terminal. Install and sign in to each
tool:

| Tool       | Install                                                    | Sign in            |
| ---------- | --------------------------------------------------------- | ------------------ |
| Node ≥24.13 | [nodejs.org](https://nodejs.org/) (or `nvm install 24`)  | —                  |
| pnpm ≥10   | `npm install -g pnpm`                                      | —                  |
| git        | [git-scm.com](https://git-scm.com/)                       | —                  |
| GitHub CLI | [cli.github.com](https://cli.github.com/) (`brew install gh`) | `gh auth login` |
| Vercel CLI | `pnpm add -g vercel`                                       | `vercel login`     |
| Turso CLI  | [docs.turso.tech/cli](https://docs.turso.tech/cli/installation) (`brew install tursodatabase/tap/turso`) | `turso auth login` |

::: tip
You can do almost everything below in the Vercel, Turso, and GitHub **web
dashboards** instead of the CLIs if you prefer — the CLI steps are just faster
and copy-pasteable. Wherever a CLI command appears, the equivalent dashboard
location is noted.
:::

### 2. Create your accounts

1. **Vercel** — sign up at [vercel.com](https://vercel.com); connecting it to
   your GitHub account makes deploys smoother. The free **Hobby** tier is
   enough for most lab work. If your lab shares infrastructure, create a Vercel
   **Team** and invite labmates.
2. **Turso** — sign up at [turso.tech](https://turso.tech). The free tier
   handles a lot of experiments.
3. **GitHub** — you need a repo for each project. If your lab has multiple
   researchers, create a GitHub
   [organization](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/creating-a-new-organization-from-scratch)
   so experiment repos live under one shared account.

## Deploying an experiment

The walkthrough below takes a freshly
[scaffolded project](/quickstart) all the way to a live, publicly reachable
URL. Run these from inside your project directory.

### Step 1 — Create a Turso database

Create a database and grab its URL and an auth token:

```sh
turso db create my-experiment          # pick any name
turso db show my-experiment --url      # -> libsql://my-experiment-<org>.turso.io
turso db tokens create my-experiment   # -> a long auth token (keep it secret)
```

::: tip One Turso DB or many?
You can use one Turso database per experiment (cleanest separation) or share
one database across several. <SmileText/> namespaces every record by
`project_ref` (`owner-repo-branch`), so sharing is safe — but exports are
simpler with one DB per experiment.
:::

### Step 2 — Test the database locally (recommended)

Before deploying, confirm your app can reach Turso. Copy the example secrets
file and fill in the two Turso values:

```sh
cp .env.local.example .env.local
```

In `.env.local` (which is gitignored — it never gets committed), set:

```sh
TURSO_DATABASE_URL = libsql://my-experiment-<org>.turso.io
TURSO_AUTH_TOKEN   = <the token from step 1>
```

Then start the dev server:

```sh
pnpm dev
```

Watch the startup log. With Turso configured you'll see a line like:

```
[SMILE] Database initialized (Turso: libsql://my-experiment-<org>.turso.io) — applied N new migration(s)
```

If instead it says `Local SQLite`, your `.env.local` values aren't being
picked up — double-check the variable names and restart. You can confirm the
tables landed in Turso with `turso db shell my-experiment ".tables"`.

::: info
The local SQLite file at `.data/experiment.db` is the default when no Turso URL
is set. Remove the two Turso lines (or comment them out) to switch back to the
local file for everyday development.
:::

### Step 3 — Create the Vercel project

Link the project to Vercel. This creates the project on Vercel **without
deploying yet**, and writes the two IDs the deploy workflow needs:

```sh
vercel link
```

Answer the prompts (scope = your account or team; "link to existing project?"
→ **no**; project name → your choice). When it finishes, the IDs are in
`.vercel/project.json`:

```sh
cat .vercel/project.json
# { "projectId": "prj_…", "orgId": "team_…" or "…", "projectName": "…" }
```

Keep these — `orgId` and `projectId` become GitHub secrets in Step 6.

::: warning vercel link edits your project
`vercel link` appends a `VERCEL_OIDC_TOKEN` to `.env.local` and adds `.env*`
and `.vercel` to `.gitignore`. That's harmless — your tracked `.env` stays
tracked because it's already committed.
:::

### Step 4 — Add your app secrets to Vercel {#step-4-secrets}

Your app reads three environment variables in production. Set each for **both
Production and Preview** so that `main` *and* your other experiment branches can
reach the database:

| Variable             | Value                                              |
| -------------------- | -------------------------------------------------- |
| `TURSO_DATABASE_URL` | the `libsql://…` URL from Step 1                   |
| `TURSO_AUTH_TOKEN`   | the auth token from Step 1                         |
| `SMILE_DEV_PASSWORD` | a password for `/dev/` — setting it also turns `/dev/` on; see [Dev & presentation access](#dev-password) |

With the CLI (it prompts for the value, then the environment):

```sh
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_DATABASE_URL preview
vercel env add TURSO_AUTH_TOKEN production
vercel env add TURSO_AUTH_TOKEN preview
vercel env add SMILE_DEV_PASSWORD production
vercel env add SMILE_DEV_PASSWORD preview
vercel env ls                # verify all six entries
```

Or in the dashboard: **Project → Settings → Environment Variables**, adding each
variable with both the **Production** and **Preview** boxes checked.

::: tip Hash the dev password
`SMILE_DEV_PASSWORD` accepts a plaintext value or a bcrypt hash. To avoid
storing the password in the clear, generate a hash and use that as the value
instead:

```sh
pnpm smile:hash-password      # prompts for the password, prints SMILE_DEV_PASSWORD=$2b$...
```

The login handler detects the `$2…` prefix and verifies with bcrypt
automatically.
:::

::: warning Preview matters for branch = experiment
If you only set these for *Production*, every non-`main` branch will deploy but
fail to reach the database (it falls back to an empty, ephemeral local file).
Set them for **Preview** too.
:::

### Step 5 — Make the site public (disable Deployment Protection) {#deployment-protection}

::: danger Do not skip this
By default — especially on Vercel **Team** projects — new projects enable
**Deployment Protection**, which forces every visitor to log in with a Vercel
account. Your own browser is logged in, so the site looks fine **to you**, but
participants get a Vercel login wall and can't take your experiment.
:::

In the Vercel dashboard: **Project → Settings → Deployment Protection →
Vercel Authentication → set to Disabled → Save.**

To verify, open your live URL in a **private/incognito window** (so you're
logged out of Vercel). The experiment — not a login screen — should load.

::: details Automating it (optional)
The Vercel CLI has no command for this. If you want to script it, you can
`PATCH` the project via the
[Vercel REST API](https://vercel.com/docs/rest-api/reference/endpoints/projects/update-an-existing-project)
with `{"ssoProtection": null}` using a token. Most people just use the
dashboard once per project.
:::

### Step 6 — Push to GitHub and add the deploy secrets {#step-6-secrets}

Create the repo and push your project:

```sh
gh repo create <owner>/my-experiment --private --source . --remote origin --push
```

The deploy workflow needs three **repository secrets**. Add them under
**GitHub repo → Settings → Secrets and variables → Actions**, or with the CLI:

```sh
# orgId and projectId come from .vercel/project.json (Step 3)
gh secret set VERCEL_ORG_ID     -R <owner>/my-experiment -b "team_…"
gh secret set VERCEL_PROJECT_ID -R <owner>/my-experiment -b "prj_…"
# Create a token at https://vercel.com/account/tokens — scope it to the
# Vercel account/team that owns the project. This prompts you to paste it:
gh secret set VERCEL_TOKEN      -R <owner>/my-experiment
gh secret list -R <owner>/my-experiment        # verify all three
```

::: tip Token scope
When you create the `VERCEL_TOKEN` at
[vercel.com/account/tokens](https://vercel.com/account/tokens), set its
**scope to the team** that owns the project if you linked under a team — a
personal-scoped token can't deploy a team project.
:::

App secrets (`TURSO_*`, `SMILE_DEV_PASSWORD`) live in **Vercel**, not GitHub —
`vercel pull` downloads them into the build. Only the three `VERCEL_*` secrets
go in GitHub.

### Step 7 — Deploy

If you pushed in Step 6, the deploy already started. Otherwise push any commit:

```sh
git push
```

Watch it run under your **GitHub repo → Actions** tab (or
`gh run watch -R <owner>/my-experiment`). On success the log prints the live
URLs:

```
Deployed: https://my-experiment-….vercel.app
Aliased: tiger-brave-castle.vercel.app
Aliased: owner-my-experiment-main.vercel.app
```

Open the codename URL (in incognito, to be sure) — **that's the link you send
participants.**

## Reusing deploy settings across experiments {#reuse-deploy-config}

You only do the account setup once. For each *new* experiment you still need the
GitHub deploy secrets and a Vercel project — but you shouldn't re-enter the
shared values by hand every time. There are two ways to avoid that, depending on
whether your repos live in a GitHub organization.

### If your repos live in a GitHub organization (lab setup)

Use **inheritance** — set the shared values once and every repo sees them:

- **GitHub → your org → Settings → Secrets and variables → Actions → New
  organization secret:** add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and (if you use
  them) `SLACK_WEBHOOK_URL` / `MAIL_*`, scoped to all repositories.
- **Vercel → your team → Settings → Environment Variables:** add the app config
  (`TURSO_*`, `SMILE_DEV_PASSWORD`, …) as **shared** team variables.

New experiment repos then inherit all of it. The **only** per-repo secret left is
`VERCEL_PROJECT_ID` (each project is unique), which the helper below sets for you.

### If you're a single user (no organization)

GitHub doesn't offer account-wide Actions secrets — only organizations inherit —
so each repo needs its own secrets. Keep the reusable values once in a local,
gitignored file and let the helper push them. This replaces the old
`upload_config` command.

1. Create `~/.smile/deploy.env` (outside any repo, so it's never committed):

   ```sh
   VERCEL_TOKEN=your-vercel-token
   # optional notification channels
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T000/B000/XXXX
   MAIL_USERNAME=you@gmail.com
   MAIL_PASSWORD=your-app-password
   MAIL_TO=lab@example.com
   ```

2. In each new experiment (after pushing it to GitHub), run:

   ```sh
   pnpm smile:setup-deploy
   ```

   It runs `vercel link` (creating the project), then sets `VERCEL_PROJECT_ID`
   and `VERCEL_ORG_ID` from the link plus `VERCEL_TOKEN` and any
   `SLACK_WEBHOOK_URL` / `MAIL_*` from your file — the whole of
   [Step 6](#step-6-secrets) in one command.

::: tip A free org is also an option
Even solo, you can create a free GitHub organization (and a Vercel team) just to
get the inheritance above — worth it once you're juggling several experiments.
:::

App config (`TURSO_*`, the dev/presentation passwords) always lives in **Vercel**,
not GitHub — set it per project with `vercel env add`, or once as Vercel team
shared variables.

## Getting notified of your deploy URL {#notifications}

Because a new commit can change the codename, you'll want the live URL pushed to
you rather than hunting for it. The workflow reports it three ways — the first
needs no setup, the other two are opt-in:

1. **GitHub run summary (always on).** Every deploy writes the shareable
   codename URL (plus a QR-code link) to the run's summary page — open the run
   under your repo's **Actions** tab and it's right at the top.
2. **Slack (optional).** Create an
   [Incoming Webhook](https://api.slack.com/messaging/webhooks) for the channel
   you want (e.g. `#smile-deploy`), then add its URL as a repo secret named
   `SLACK_WEBHOOK_URL`. Each deploy posts the codename URL, alternate URL, and
   QR link — and pings on failures too.
3. **Email (optional).** Add SMTP secrets and each deploy emails you the URL. A
   Gmail account with an [app password](https://support.google.com/accounts/answer/185833)
   works — set repo secrets `MAIL_USERNAME` (the address), `MAIL_PASSWORD` (the
   app password), and `MAIL_TO` (recipient). Override `MAIL_SERVER` / `MAIL_PORT`
   for a non-Gmail provider (defaults: `smtp.gmail.com` / `465`).

```sh
# Slack
gh secret set SLACK_WEBHOOK_URL -R <owner>/my-experiment

# Email (Gmail app password)
gh secret set MAIL_USERNAME -R <owner>/my-experiment   # you@gmail.com
gh secret set MAIL_PASSWORD -R <owner>/my-experiment   # 16-char app password
gh secret set MAIL_TO       -R <owner>/my-experiment   # where to send it
```

::: tip Why not the Vercel GitHub app?
Vercel's GitHub integration can comment deploy URLs, but it only knows Vercel's
own generated URLs — **not** the `<codename>.vercel.app` link, which this
workflow creates with `vercel alias`. It would also start its own auto-deploys,
conflicting with the per-branch deploys here. So the notifications above come
from the workflow itself, which knows the real codename URL.
:::

## Dev & presentation route access {#dev-password}

Your site has two sets of tools that are **for you, not for participants**:

- `/dev/` — the developer bar, data console, route jumper, autofill, and the
  participant-**data dashboard** (plus the API endpoints that read collected
  data).
- `/presentation/` — presentation mode for screenshots and demos.

Each route has its own three-state access setting. **On a deployed site both
default to `disabled`** — they return a 404, as if they don't exist. You opt in
per route:

| Mode | What participants/visitors get | How to set |
| --- | --- | --- |
| `disabled` *(default)* | **404** — the route doesn't exist | leave unset |
| `password` | a login page; access needs the password | set the route's password (or `…_ACCESS = password`) |
| `open` | public, no password — the **extreme case** | set `…_ACCESS = open` |

The two routes use **separate passwords**, so you can hand someone the
presentation password without giving them the dev dashboard:

| Variable | Purpose |
| --- | --- |
| `SMILE_DEV_ACCESS` | `disabled` \| `password` \| `open` for `/dev/` |
| `SMILE_DEV_PASSWORD` | password for `/dev/` when in `password` mode |
| `SMILE_PRESENTATION_ACCESS` | `disabled` \| `password` \| `open` for `/presentation/` |
| `SMILE_PRESENTATION_PASSWORD` | password for `/presentation/` when in `password` mode |

::: tip The quick way to opt in
Just **setting a route's password** puts it in `password` mode — you don't also
need the `…_ACCESS` var. You only set `…_ACCESS` to choose `open`, or to be
explicit. Hash the password rather than storing plaintext with
`pnpm smile:hash-password`.
:::

How it behaves:

- **Locally** (`pnpm dev`) both routes are always open with no password — you
  never log in while developing.
- **Deployed**, a `password` route redirects to `/dev-login`; enter that route's
  password and you get a session cookie (7 days). A dev login does **not** grant
  presentation, and vice versa.

::: warning Disabled by default is the safe default
Because the default is `disabled`, a deploy that collects real data never
accidentally exposes the dashboard. Turn on only what you need: typically
`SMILE_DEV_PASSWORD` (which opts `/dev/` into password mode) set for Production
and Preview in [Step 4](#step-4-secrets). Reserve `open` for the rare case you
truly want a public dev/presentation view.
:::

## Branch = experiment {#branch-experiment}

A research project rarely has just one version. You pilot, then run a
pre-registered design, then follow-ups:

![branching nature of experiments](../images/branchingexps.png)

<SmileText/> maps this onto git: **one repository per project, one branch per
experiment.** Every branch deploys to its own pair of URLs.

```
gureckis/                    <- GitHub owner
└── my_cool_project/         <- repository (one research project)
    ├── main                 <- production experiment
    ├── pilot                <- an experiment branch (preview deploy)
    ├── exp1
    └── exp2b
```

To start a new experiment, just branch and push:

```sh
git switch -c pilot
git push -u origin pilot
```

That triggers a deploy and gives you a fresh codename URL immediately — e.g.
`disaster-skillful-advertising.vercel.app` and
`owner-my_cool_project-pilot.vercel.app`. Don't be shy about branches; `pilot`,
`exp1`, `exp1b`, and `exp1-prepilot` are all fine.

To remove a branch later (locally and on GitHub):

```sh
git branch -d pilot
git push origin --delete pilot
```

### What triggers a deploy?

Every push deploys, **except**:

- pushes that change **only** files under `docs/` (documentation doesn't affect
  the experiment), and
- pushes to branches named `analysis`, `models`, or `docs` — reserved for work
  that shouldn't deploy.

To change these rules, edit the `on:` block at the top of
`.github/workflows/deploy.yml`.

### Why codename URLs?

The `owner-repo-branch` URL leaks your username and project structure. The
**codename** (a deterministic hash like `tiger-brave-castle`) gives you a clean
link you can share publicly — in a paper, a flyer, or a recruitment post —
without exposing where your code lives. Both URLs always point at the same
deployment.

## Deploying a specific past commit

Sometimes you want to share an exact older version (e.g. with a reviewer)
without changing what's live on the branch. Find the commit's full SHA on
GitHub, then trigger the workflow by hand:

```sh
gh workflow run deploy.yml -f github_sha=<full-commit-sha>
```

It builds and deploys that exact commit.

## Debugging deployment issues

If a deploy fails or the live site misbehaves, work through these in order:

1. **Check the Actions tab.** Open **GitHub repo → Actions**, click the failed
   run (red ✗), and read the failing step's log. The error is almost always
   right there.

   ![debugging github actions](../images/githubactions.png)

2. **"I see a Vercel login page, not my experiment."** Deployment Protection is
   still on — revisit [Step 5](#deployment-protection).

3. **Build fails / "No Output Directory named dist".** Make sure you're using
   the starter's `deploy.yml` unmodified — it sets `NITRO_PRESET=vercel` so the
   build emits the format Vercel expects.

4. **Missing or misnamed env vars.** In **Vercel → Settings → Environment
   Variables**, confirm `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and
   `SMILE_DEV_PASSWORD` are present for the environment you're deploying to
   (Production for `main`, **Preview** for other branches). This is the most
   common cause of a site that loads but can't save data.

5. **Reproduce the build locally.** Run `pnpm build` (and `pnpm preview`). If it
   fails on your machine, it'll fail in CI — fix it locally and push.

6. **Wrong codename / data in the wrong place.** The codename and `project_ref`
   are derived from `owner/repo/branch`. If a deploy's codename looks wrong,
   check that the repo's `origin` remote and branch name are what you expect.

## Blocking web crawlers

You usually don't want search engines indexing your experiment. Add a
`robots.txt` to `public/` so it's served at the site root:

```
User-agent: *
Disallow: /
```

## Anonymous deployment

For double-blind submissions you can deploy without lab branding. Set
`VITE_ANONYMOUS_MODE = true` (in `.env`, `.env.local`, or as a Vercel
environment variable) to strip <SmileText/>'s default references to the
organization running the study, then share the codename URL — it already hides
your identity. See [Configuration](/coding/configuration) for related options.
