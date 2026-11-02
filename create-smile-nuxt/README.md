# @nyuccl/create-smile-nuxt

Scaffold a new SMILE experiment project.

## Usage

```bash
pnpm create @nyuccl/smile-nuxt my-experiment
```

or with npm / yarn / bun:

```bash
npm create @nyuccl/smile-nuxt my-experiment
yarn create @nyuccl/smile-nuxt my-experiment
bun create @nyuccl/smile-nuxt my-experiment
```

Then:

```bash
cd my-experiment
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## What you get

The template is the `start/` folder of [nyuccl/smile-nuxt](https://github.com/nyuccl/smile-nuxt) at the release tag of the latest `@nyuccl/smile-nuxt` on npm, so it always matches the module version it installs. A ready-to-run Nuxt project pre-wired with [`@nyuccl/smile-nuxt`](https://www.npmjs.com/package/@nyuccl/smile-nuxt), a local SQLite database (zero-config dev), example components, and a sensible experiment timeline.

## Options

```
pnpm create @nyuccl/smile-nuxt <project-name> [options]

  --no-install    Skip installing dependencies
  --no-git        Skip initializing a git repository
  --git           Initialize a git repository (skip the prompt)
  --force, -f     Overwrite an existing non-empty directory
  --template-ref  Use the template from this git ref instead of the latest release (e.g. main)
  --help, -h      Show help
```

## Links

- [SMILE docs](https://smile.gureckislab.org)
- [@nyuccl/smile-nuxt on npm](https://www.npmjs.com/package/@nyuccl/smile-nuxt)
- [Source on GitHub](https://github.com/nyuccl/smile-nuxt)
