---
description: "Contributing to the SMILE docs and module: running the docs site locally (pnpm docs:dev), the module's test commands, technical figures, and how changes are published."
---

# Contributing to the documentation

This project takes a "docs first" approach by first planning the development in
the documentation and then working on implementation. Thus, the place to start
is by contributing to the docs. **It's easy and fun.**

The docs are developed with [Vitepress](https://vitepress.vuejs.org) which is
super awesome.

Make sure you have followed the steps on the [Getting started](/gettingstarted)
page.

The documentation lives in the `docs/` folder of the repo.

## Development

To develop the docs in real time type `pnpm docs:dev` in the top level
project folder. You should see something like this:

```
➜ pnpm docs:dev
> smile@0.0.0 docs:dev
> vitepress dev docs

  vitepress v1.6.3

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h to show help
```

In this case, opening `http://localhost:3000/` in your browser (it might be a
different number if port 3000 on your computer is already in use) will let you
see the current documentation website.

Now let's look at the current files in the `docs/` folder:

```
docs/
├── .vitepress
│   └── config.js
├── contributing.md
├── index.md
├── introduction.md
└── ...

```

The docs are written in
[plain markdown](https://vitepress.vuejs.org/guide/markdown.html). Just edit or
add new `.md` files as you like. You can also add new subfolders. To add them to
the side bar or nav bar at the top take a look inside
`docs/.vitepress/config.mjs`. It is mildly self-explanatory (full docs
[here](https://vitepress.vuejs.org/config/introduction.html)).

One cool thing about running `pnpm docs:dev` is the website uses
[hot module reloading](https://vitejs.dev/guide/features.html#hot-module-replacement)
so any changes you save to the markdown or configuration files will
automatically update your browser giving you instant feedback. It is incredibly
fast thanks to Vite.

When you are finished making changes to the docs just use git commands to stage
the files, commit them and (when you are ready) push them to the github repo.
There are several useful tutorials available online for using git and GitHub.

## Testing the module

Changes to the <SmileText/> module itself (`src/`) are covered by several
suites. Run them from the repo root:

| Command               | What it runs                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm test`           | Unit tests (Vitest, happy-dom): stepper, timeline guards, store, composables.                                     |
| `pnpm test:coverage`  | The unit tests with a coverage report.                                                                             |
| `pnpm test:types`     | `vue-tsc` over the module and the playground.                                                                      |
| `pnpm lint`           | ESLint.                                                                                                            |
| `pnpm test:e2e`       | Playwright against the `playground/` dev server (port 3100, or `SMILE_E2E_PORT`). Reuses a dev server already on that port. |
| `pnpm test:overrides` | Packs the module, installs it in a copy of `start/` outside the workspace, and checks component overrides.        |
| `pnpm test:starter`   | Scaffolds a project with the local CLI and template, installs the packed module, runs `nuxt build` and the starter's own e2e suite. |

`test:overrides` and `test:starter` install the module the way a researcher's
project does (a separate `node_modules`, pnpm's strict isolation), which
catches packaging and peer-dependency problems the workspace hides. Both need
network access. After a release, `pnpm test:starter --published <version>`
does the same with the published CLI, the template on GitHub and the version
on npm: exactly what a new user gets.

CI runs lint, unit, types and `test:overrides` (`ci.yml`), and the e2e suite and
`test:starter` (`e2e.yml`) on every push and pull request to `main`.

## Technical Figures

We strongly encourage the use of [Figma](https://www.figma.com)/FigJam for
technical figures and illustrations. A good starting place is the
[Diagram basics in FigJam](https://www.figma.com/file/0CutmCGEhR20glush9sKze/Untitled?node-id=0%3A1).

## What happens next?

Currently, the docs are live at
[http://smile.gureckislab.org](http://smile.gureckislab.org). When you commit
changes to the `docs/` folder in the `main` GitHub branch, a Github Actions
script runs which automatically builds the static website using VitePress and
then syncs the files to the server. **Thus, simply pushing your changes to the
master branch will update the website, there's nothing else to think about.**
This is a core design principle of Smile:
[don't sweat the dumb stuff](/philosophy.html#don-t-sweat-the-dumb-stuff).

If the build fails on the Github Action the website will remain unchanged. You
can get diagnostic information about the auto-deploy process on the
[Github Actions tab](https://github.com/NYUCCL/smile-nuxt/actions) of the repo. If
you suspect your changes to the docs introduced a bug that was not caught by the
development server, you can check the build process locally by running
`pnpm docs:build`.
