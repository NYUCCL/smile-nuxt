# @gureckislab/smile

SMILE experiment framework as a Nuxt module. This package provides all core framework functionality (composables, components, stores, Timeline system, dev tools) so that researchers can create lightweight Nuxt projects that consume the module.

## Project Structure

```
packages/nuxt/
├── src/
│   ├── module.ts              # Module entry point — registers plugins,
│   │                          #   composables, components, middleware, etc.
│   └── runtime/               # Runtime code that ships to users
│       ├── composables/       # useAPI, useViewAPI, useStepper, useTimeline
│       ├── components/        # Built-in views, UI kit, dev tools
│       ├── stores/            # Pinia stores (smilestore, log, firestore-db)
│       ├── plugins/           # Client plugins (Firebase, Timeline init)
│       ├── middleware/         # Navigation guards (timeline.global)
│       ├── layouts/           # experiment, development, presentation
│       ├── pages/             # /dev/ and /presentation/ routes
│       ├── core/              # Timeline, Stepper classes
│       └── utils/             # Randomization, helpers
├── playground/                # Test experiment app (like src/user/)
│   ├── nuxt.config.ts         # Consumes @gureckislab/smile as a module
│   ├── app.vue                # Root app component
│   ├── design.js              # Test timeline definition
│   └── components/            # Test experiment components
└── test/                      # Vitest + Playwright tests
```

## Development

All commands run from this directory (`packages/nuxt/`).

### First-time setup

```bash
pnpm run dev:prepare
```

This stubs the module build and generates TypeScript types for both the module and the playground. Run this again whenever you change `src/module.ts`.

### Start the dev server

```bash
pnpm run dev
```

This starts the playground app at http://localhost:3000/. The playground imports `@gureckislab/smile` via a local workspace link, so any changes to files in `src/runtime/` are reflected immediately via HMR.

### Other commands

| Command               | Description                                      |
| --------------------- | ------------------------------------------------ |
| `pnpm run dev`        | Start playground dev server                      |
| `pnpm run dev:prepare`| Regenerate types and stubs (after module.ts changes) |
| `pnpm run dev:build`  | Production build of the playground               |
| `pnpm run test`       | Run Vitest tests                                 |
| `pnpm run test:watch` | Run Vitest in watch mode                         |
| `pnpm run lint`       | Run ESLint                                       |
| `pnpm run prepack`    | Build the module for publishing                  |

### Running from the repo root

If you prefer to work from the monorepo root, use pnpm's filter:

```bash
pnpm --filter @gureckislab/smile dev
pnpm --filter @gureckislab/smile test
```

## How the Module Works

The module entry point (`src/module.ts`) uses `@nuxt/kit` to register everything with Nuxt:

- **`addPlugin()`** — registers client-side plugins (Firebase init, Timeline init)
- **`addImports()`** — auto-imports composables (useAPI, useViewAPI, etc.) so researchers don't need explicit imports
- **`addComponent()`** — registers built-in views (WelcomeView, ConsentView, etc.) and UI components, overridable by the researcher's own components
- **`addLayout()`** — registers layouts for experiment, development, and presentation modes
- **`addRouteMiddleware()`** — registers the global navigation guard that enforces sequential routing
- **`extendPages()`** — adds static `/dev/` and `/presentation/` routes

The playground (`playground/`) is a minimal Nuxt app that consumes the module. It serves as both a development test bed and an example of what a researcher's project looks like. The researcher's equivalent is:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@gureckislab/smile'],
  smile: {
    // module options
  },
})
```

## Routing Architecture

Experiment routes use a **catch-all page** (`[...slug].vue`) that resolves components from the Timeline at runtime. This is necessary because SMILE routes include randomization and conditional branching that can't be known at build time.

- `/` — Production experiment (catch-all, runtime-resolved)
- `/dev/` — Development mode with sidebar, console bar, route jumping
- `/presentation/` — Presentation mode with nav bar, QR code, reset

The `/dev/` and `/presentation/` routes are static and registered via `extendPages` at build time. All three modes coexist in a single build.

## Migration Status

This module is being migrated from the Vue 3 SPA in `src/`. The migration follows a copy-first approach: existing `.js` files are copied verbatim to `src/runtime/`, then minimally modified (import paths, Nuxt wrappers). See `plans/nuxt_migration_251.md` for the full migration plan.
