# Quick Start

This page walks you through getting the <SmileText/> starter template running
on your local machine in developer mode.

## Prerequisites

Before you start, install:

- **Node.js** (≥ 22). Check with `node -v`. Download from
  [nodejs.org](https://nodejs.org/) if you don't have it.
- **pnpm** (the package manager <SmileText/> uses). Install with:
  ```bash
  npm install -g pnpm
  ```
  Check with `pnpm -v`.

## 1. Scaffold a new project

Use `pnpm create` to scaffold a new experiment in a new directory:

```bash
pnpm create @nyuccl/smile-nuxt my-experiment
```

Replace `my-experiment` with whatever you want to call your project. The CLI
will ask if you want to install dependencies — say yes, and it will install
[`@nyuccl/smile-nuxt`](https://www.npmjs.com/package/@nyuccl/smile-nuxt) and
everything else the starter needs.

::: tip Other package managers
The same command works with `npm create`, `yarn create`, or `bun create`. The
CLI detects which one you used and tailors the next-step hints accordingly.
:::

## 2. Start the dev server

```bash
cd my-experiment
pnpm dev
```

You should see Nuxt boot up and log a URL — usually
[http://localhost:3000](http://localhost:3000). Open it in your browser and
you should see the welcome page of a working experiment.

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

The default password for `/dev/` and `/presentation/` is `1234`. You can
change it via `SMILE_DEV_PASSWORD` in `.env.local` later.

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
- When you're ready to put your experiment online, see
  [Deploying](/recruit/deploying).
