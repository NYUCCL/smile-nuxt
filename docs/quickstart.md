# Quick Start

This page walks you through getting a basic <SmileText/> starter template running
on your local machine in developer mode. Start here if you are just exploring
for the first time or starting a new project.

## Prerequisites

Before you start, install:

- **Node.js 24.13 or newer.** <SmileText/> requires Node ≥ 24.13 — older
  versions will fail to install or build. Check your version with `node -v`,
  and download a current release from [nodejs.org](https://nodejs.org/) (pick
  the LTS line that is 24 or higher). If you juggle multiple Node versions,
  [nvm](https://github.com/nvm-sh/nvm) (`nvm install 24 && nvm use 24`) is the
  easiest way to switch.
- **pnpm** (the package manager <SmileText/> recommends). Install with:
  ```bash
  npm install -g pnpm
  ```
  Check with `pnpm -v` — you want pnpm 10 or newer.

## 1. Scaffold a new project

Use your preferred package manager's `create` command:

::: code-group

```sh [pnpm]
pnpm create @nyuccl/smile-nuxt my-experiment
```

```sh [npm]
npm create @nyuccl/smile-nuxt my-experiment
```

```sh [yarn]
yarn create @nyuccl/smile-nuxt my-experiment
```

```sh [bun]
bun create @nyuccl/smile-nuxt my-experiment
```

:::

Replace `my-experiment` with whatever you want to call your project. The CLI
will ask whether to install dependencies and whether to initialize a git
repository — say yes to both. It will install
[`@nyuccl/smile-nuxt`](https://www.npmjs.com/package/@nyuccl/smile-nuxt) and
everything else the starter needs, and leave you with a fresh git repo
containing the initial scaffold.

## 2. Start the dev server

```sh
cd my-experiment
```

::: code-group

```sh [pnpm]
pnpm dev
```

```sh [npm]
npm run dev
```

```sh [yarn]
yarn dev
```

```sh [bun]
bun dev
```

:::

You should see Nuxt boot up and log a URL — usually
`http://localhost:3000`. Open it in your browser and
you should see the welcome page of a working experiment. (The first load can be
slow as it pre-bundles dependencies.)

::: info What just happened?
On first run, <SmileText/> creates a local SQLite database at
`.data/experiment.db` and runs migrations against it. Participant records,
trial data, and route history will be written there as you walk through the
experiment.
:::

## 3. Explore the three modes

The same dev server exposes three views of your experiment:

| URL                                   | What it is                                                           |
| ------------------------------------- | -------------------------------------------------------------------- |
| `http://localhost:3000/`              | The production experiment flow — what a participant would see.       |
| `http://localhost:3000/dev/`          | Dev mode with the sidebar, route jumper, autofill, and data console. |
| `http://localhost:3000/presentation/` | Presentation mode for screenshots, demos, and lab meetings.          |

In local development, the `/dev/` and `/presentation/` routes are open — no
password required. When you deploy to production/the cloud you and choose to
password protect or omit the functionality of those extra tools so they are not
inadvertently available to participants.

## 4. Make your first edit

Open the project in your editor of choice. The two files you'll touch first:

- **`design.js`** — the experiment timeline. Add, remove, and reorder pages
  here.
- **`components/MyTaskView.vue`** — your custom task. Replace it with whatever
  experiment you're building.

Saving a file triggers a hot-reload — the browser updates without losing your
place in the experiment.

## Next steps

- Read [Key Concepts](/concepts) for the mental model behind <SmileText/>.
- Skim the [Developing](/coding/developing) guide for the dev-mode tools.
- When you're ready to put your experiment online
  in a publicly available spot see [Cloud Hosting](/recruit/deploying).
