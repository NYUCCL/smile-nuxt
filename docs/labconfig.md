# Set up for a new lab (or solo researcher)

If you're starting fresh — either setting <SmileText/> up for a new lab or
just for yourself — this page walks through the small set of accounts you'll
need. It's much shorter than it used to be: <SmileText/> now runs as a
[Nuxt](https://nuxt.com) module on standard cloud services, so most of the
old bespoke setup is gone.

:::tip First-time user of an existing lab?
If your lab is already running experiments with <SmileText/>, you can skip
this page entirely. Just follow the [Quick Start](/quickstart) — there's no
lab-wide repo to be added to anymore. The only thing you might need from a
lab admin is shared credentials for Vercel and Turso (covered below), and
those can simply be shared via team invites.
:::

## What you actually need

It depends on what stage you're at:

| Goal                                  | Services required                          |
| ------------------------------------- | ------------------------------------------ |
| Develop and test locally              | Just [Node.js](https://nodejs.org) + [pnpm](https://pnpm.io) (see [Quick Start](/quickstart)) |
| Deploy your experiment online         | [Vercel](https://vercel.com) account       |
| Collect data from real participants   | [Turso](https://turso.tech) database       |
| Share code with collaborators         | [GitHub](https://github.com) account, optionally an org |

That's it. Local development is **zero-config** — `pnpm create
@nyuccl/smile-nuxt my-experiment && pnpm dev` works without signing up for
anything beyond Node and pnpm. The other accounts come in when you're ready
to put your experiment online.

::: info What's no longer required
Previous versions of <SmileText/> required setting up Firebase/Firestore, a
self-hosted SSL web server (e.g., Dreamhost), a Slack notification bot, a
forked "base repo" per lab, and uploading secrets to GitHub via
`npm run upload_config`. **None of that applies anymore.** Vercel handles
hosting + SSL, Turso replaces Firebase, secrets go in the Vercel dashboard,
and each experiment is scaffolded fresh from npm — there's no longer a base
repo to inherit from.
:::

## 1. GitHub (optional but recommended)

You don't strictly need GitHub to develop a <SmileText/> experiment, but it's
the easiest way to:

- Version-control your experiment code and back it up
- Trigger auto-deploys to Vercel on every push
- Collaborate with labmates

If your lab will have multiple people contributing, create a
[GitHub organization](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/creating-a-new-organization-from-scratch)
so experiment repos live under a shared account. Researchers can apply for a
free [GitHub Education for Teachers](https://education.github.com/teachers)
upgrade to unlock team features at no cost.

There is **no longer a base SMILE repo to fork.** Every new experiment is
scaffolded fresh via `pnpm create @nyuccl/smile-nuxt`, which always pulls
the latest version of the starter template.

## 2. Vercel (required for deployment)

[Vercel](https://vercel.com) hosts your experiment and gives it a public URL
with automatic HTTPS. The free "Hobby" tier is enough for most lab use.

1. Sign up at [vercel.com](https://vercel.com) — connecting it to your GitHub
   account makes deploys one-click later.
2. If you want a shared lab account, create a Vercel **Team** and invite
   labmates. Otherwise, your personal account is fine.
3. When you push your first experiment, you can either:
   - Import the repo via the Vercel dashboard ("Add New Project") and let
     Vercel auto-deploy on push, **or**
   - Use the GitHub Action included in the starter (`.github/workflows/deploy.yml`),
     which gives you stable codename URLs.

The starter README and [Deploying](/recruit/deploying) page walk through
either path.

## 3. Turso (required for production data)

[Turso](https://turso.tech) provides a managed [libSQL](https://github.com/tursodatabase/libsql)
database (a fork of SQLite with replication). <SmileText/> uses it to record
participant data, route history, and trial results. The free tier is more
than enough for most experiments.

1. Sign up at [turso.tech](https://turso.tech).
2. Create a new database (the dashboard walks you through it).
3. Copy the **database URL** (`libsql://your-db.turso.io`) and the **auth
   token** from the database's "Connect" tab.
4. Paste both into your Vercel project's environment variables (Settings →
   Environment Variables):
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`

::: info Why not use Vercel's own database?
You can — `@vercel/postgres` and friends are supported by Nitro, and you
could swap the database adapter. But Turso is libSQL-compatible with the
local SQLite file <SmileText/> uses in dev, which means the same Drizzle
schema and queries work in both environments with no code changes.
:::

For local development you don't need Turso at all — <SmileText/> writes to a
local SQLite file at `.data/experiment.db` by default. Turso only kicks in
when you set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (which you typically
only do in production).

## 4. Slack notifications (optional)

The old Slack-bot deploy-notification system is no longer built in. If you
want push notifications when a deploy completes, add a step to your GitHub
Action that posts to a Slack webhook. The
[Slack GitHub Action](https://github.com/slackapi/slack-github-action) makes
this a few-line change to `.github/workflows/deploy.yml`. Email,
[ntfy.sh](https://ntfy.sh), and Discord work the same way.

## Lab-wide customization

Since there is no longer a base repo, lab-wide customizations (logo, consent
form text, default branding) happen per experiment. After scaffolding a new
project, the files you'll typically swap to match your lab are:

- **`public/universitylogo.png`** — the branding image shown on the welcome
  and consent pages
- **`components/InformedConsentText.vue`** — your IRB-approved consent body
- **`.env`** — `VITE_LAB_URL`, `VITE_BRAND_LOGO_FN`, color mode, etc.

A common workflow is to keep these as a small reference repo or gist that
your lab maintains, and copy them in after running
`pnpm create @nyuccl/smile-nuxt`. A future version of the CLI may support
applying a "lab overlay" automatically — track
[this issue](https://github.com/nyuccl/smile-nuxt/issues) for updates.

## All done!

That's the entire lab setup. Once you (or someone in your lab) has the
Vercel + Turso accounts in place, every new experiment is just:

```bash
pnpm create @nyuccl/smile-nuxt my-experiment
```

See [Adding a new user](/adduser) for onboarding labmates, or
[Starting a new project](/starting) if you're ready to begin.
