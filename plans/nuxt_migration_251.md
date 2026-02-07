# Plan: Migrate Vue SPA to Nuxt Module

## Summary

Migrate the SMILE experiment framework from a Vue 3 SPA to a **publishable Nuxt module** (`@gureckislab/smile`). This approach builds the module architecture from day one, avoiding a two-step migration. The module will provide all framework functionality (composables, components, stores, Timeline system, dev tools) while researchers create lightweight Nuxt projects that extend the module.

**End result:** Researchers run `pnpm add @gureckislab/smile` and get the full framework, then customize via `design.ts` and custom components.

## Motivation

### Why Nuxt?

- **SSR Capabilities**: Server-side rendering for faster initial loads and better SEO (useful for landing pages)
- **API Routes**: Built-in server routes for handling webhooks, completion callbacks, and server-side Firebase operations
- **Middleware System**: Cleaner implementation of navigation guards
- **Auto-imports**: Automatic importing of composables and components
- **Improved DX**: Better development experience with Nuxt DevTools
- **Hybrid Rendering**: Flexibility to choose between SPA, SSR, or static generation per route

### Why Module-First?

- **Clean separation**: Framework code vs experiment code enforced by structure
- **Easy updates**: Researchers update via `pnpm update @gureckislab/smile`
- **Versioning**: Semantic versioning with changelogs
- **Multiple experiments**: Share one module installation across projects
- **Playground**: Module's `playground/` directory serves as live test experiment

## Key Architectural Decisions

### 1. Module-First Architecture

- **Core as module**: All framework code lives in `src/runtime/`
- **Playground as test**: `playground/` is the development test experiment
- **Publishable**: Module can be published to npm as `@gureckislab/smile`

### 2. Rendering Strategy

- **Hybrid Mode**: SPA mode for experiment routes (client-side only), SSR for landing/recruitment pages
- **Rationale**: Experiments must maintain client state; SSR would break the reactive flow

### 3. Routing Approach

- **Catch-all route with runtime resolution**: A single `[...slug].vue` page resolves components from the Timeline at runtime via `$timeline.getViewForPath(path)`. This is necessary because SMILE's routes include runtime-dependent features (randomization, conditional branching) that can't be fully known at build time.
- **Timeline remains the source of truth**: The Timeline class keeps its sequence graph (`meta.next`/`meta.prev` chain) and component mapping. It stops owning the Vue Router instance; Nuxt manages routing internally.
- **Global middleware enforces ordering**: The current `beforeEach` guard logic ports nearly 1:1 into a single `defineNuxtRouteMiddleware()`.
- **Route-based modes**: `/dev/` and `/presentation/` routes (known at build time) are registered via `extendPages` and coexist with production routes.
- **Rationale**: Single build serves all modes; no rebuild to switch. Catch-all route handles dynamic experiment flows while static mode routes use conventional Nuxt routing.

### 4. Researcher Customization

- **Extend the module**: Researchers create Nuxt projects that `extends: ['@gureckislab/smile']`
- **Override components**: Create same-named component to override built-ins
- **design.ts**: Timeline definition stays in researcher's project

### 5. State Management

- **Pinia**: Built into Nuxt, stores provided by module
- **Client-only persistence**: localStorage + Firestore sync

### 6. Firebase Integration

- **Client-side Only**: Firebase SDK in client plugin (anonymous auth, Firestore)
- **Optional Server Routes**: Firebase Admin SDK for advanced features

---

## Migration Philosophy

### Core Principles

This migration follows a **copy-first, verify-often** approach to minimize risk:

1. **ALWAYS copy existing files — NEVER reimplement**: When moving functionality to the Nuxt module, **always start by copying the existing source file verbatim** to its new location. Do not rewrite, redesign, or reimplement from scratch — even if you think you could write it "better." The existing code is battle-tested and known to work. Reimplementation introduces subtle bugs. If a file needs changes to work in Nuxt, make those changes **on top of the copied file**, not by writing a new one. The code examples later in this plan show the *target structure* for reference; they are NOT code to write from scratch — always start from the actual existing source file.

2. **Keep JavaScript initially**: All `.js` files remain as `.js` during migration. TypeScript conversion is a **final, optional step** after the migration is complete and verified working.

3. **Minimal changes only**: When copying files, only change what's strictly necessary:
   - Import paths (`@/` → `#imports` or relative paths)
   - Module exports (if needed for Nuxt auto-imports)
   - Remove explicit imports that Nuxt auto-imports
   - Nuxt-specific wrappers (e.g., `defineNuxtPlugin`, `defineNuxtRouteMiddleware`)

4. **Verify at every step**: Each milestone must be verified working before proceeding. Don't accumulate changes—test incrementally.

5. **Nuxt infrastructure first**: Get the bare Nuxt module working with a "Hello World" playground before adding any SMILE code.

6. **Build up minimal working examples at each stage**: After each phase, the playground should have a small but **complete and understandable** working example that demonstrates the newly added functionality. Don't just copy files silently — update the playground to exercise them. Each stage should feel like a self-contained demo: "here's what the module can do now." This makes it easy to understand what each phase accomplished and to debug issues in isolation.

### What NOT to Do During Migration

- ❌ Rewrite or reimplement a file from scratch instead of copying it
- ❌ Convert JavaScript to TypeScript (save for later)
- ❌ Refactor or "clean up" code while moving it
- ❌ Add new features or improvements
- ❌ Change function signatures or APIs
- ❌ Rename variables or functions
- ❌ Add type annotations
- ❌ Restructure logic "while we're at it"
- ❌ Write new code when existing code already does the job

### What TO Do During Migration

- ✅ **Start every step by copying the existing source file** to its new location
- ✅ Make minimal edits on top of the copied file (import paths, Nuxt wrappers)
- ✅ Update import paths as needed
- ✅ Add Nuxt-specific wrappers where required (e.g., `defineNuxtPlugin`)
- ✅ Test that existing functionality works identically
- ✅ Document any necessary changes in commit messages
- ✅ When in doubt, copy verbatim first, then adjust

### TypeScript Conversion (Final Phase)

After the migration is complete and all functionality verified:

1. Rename `.js` files to `.ts` one at a time
2. Add type annotations incrementally
3. Fix any type errors that surface
4. This phase is **optional** and can be done gradually over time

---

## Project Structure Overview

**Note**: During migration, all runtime files remain as `.js`. TypeScript conversion is a final, optional step.

```text
smile/                              # Monorepo root
├── packages/
│   └── nuxt/                       # The Nuxt module (@gureckislab/smile)
│       ├── src/
│       │   ├── module.ts           # Module entry point (only TS file initially)
│       │   └── runtime/            # Runtime code (ships to users)
│       │       ├── composables/    # useAPI.js, useViewAPI.js, etc. (keep as .js)
│       │       ├── components/     # Built-in views, UI kit (.vue files)
│       │       ├── stores/         # smilestore.js, log.js (keep as .js)
│       │       ├── plugins/        # firebase.client.js, timeline.client.js
│       │       ├── middleware/     # timeline.global.js (keep as .js)
│       │       ├── layouts/        # experiment.vue, development.vue, etc.
│       │       ├── pages/          # /dev/, /presentation/ routes
│       │       ├── core/           # Timeline.js, Stepper.js, etc. (keep as .js)
│       │       └── utils/          # randomization.js, utils.js (keep as .js)
│       ├── playground/             # Test experiment (like current src/user)
│       │   ├── nuxt.config.ts      # extends '../src/module'
│       │   ├── design.js           # Test timeline (keep as .js)
│       │   └── components/         # Test custom components
│       └── test/                   # Vitest + Playwright tests
├── docs/                           # VitePress documentation (keep existing)
├── analysis/                       # Python analysis tools (keep existing)
└── scripts/                        # Build/deploy scripts
```

---

## Phase 1: Module Scaffolding ✅

> **Status: COMPLETED** (commit `3f6cb08` on `nuxt` branch)
>
> Deviations from original plan:
> - Removed `engine-strict=true` from `.npmrc` — `firebase-tools` doesn't support Node 24 yet
> - `pnpm-workspace.yaml` includes `packages/*/playground` in addition to `packages/*`
> - Root `package.json` retains existing SPA deps/scripts (not replaced with minimal monorepo root yet)
> - Package named `@gureckislab/smile` (not `@smile/nuxt`)

### 1.1 Package Manager: pnpm with Workspaces

Use pnpm with workspaces to manage the monorepo structure:

```bash
# Using fnm for Node version management (already installed)
fnm use 24

# Enable corepack (bundled with Node) and activate pnpm
corepack enable
corepack prepare pnpm@latest --activate
```

Create root `package.json` for the monorepo:

```json
{
  "name": "smile",
  "private": true,
  "packageManager": "pnpm@10.15.1",
  "engines": {
    "node": ">=24.13.0"
  },
  "scripts": {
    "dev": "pnpm --filter @gureckislab/smile dev",
    "build": "pnpm --filter @gureckislab/smile build",
    "test": "pnpm --filter @gureckislab/smile test",
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'docs'
```

Create `.npmrc`:

```ini
# .npmrc
engine-strict=true
auto-install-peers=true
shamefully-hoist=true
```

### 1.2 Initialize Nuxt Module

> **Manual step**: The `nuxi init` command has interactive menus, so **the user must run this command manually** (not via Claude). Run the following in a terminal:

```bash
# Create the module structure
mkdir -p packages/nuxt
cd packages/nuxt

# Initialize with Nuxt module template (INTERACTIVE — run manually)
pnpm dlx nuxi@latest init -t module .
```

After the interactive setup completes, verify the scaffolded structure exists (`src/module.ts`, `playground/`, etc.) and then proceed to the next step.

### 1.3 Module Package Configuration

```json
// packages/nuxt/package.json
{
  "name": "@gureckislab/smile",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/types.d.ts",
      "import": "./dist/module.mjs",
      "require": "./dist/module.cjs"
    }
  },
  "main": "./dist/module.cjs",
  "types": "./dist/types.d.ts",
  "files": ["dist"],
  "scripts": {
    "dev": "nuxi dev playground",
    "dev:build": "nuxi build playground",
    "dev:prepare": "nuxt-module-build build --stub && nuxt-module-build prepare && nuxi prepare playground",
    "build": "nuxt-module-build build",
    "prepublishOnly": "pnpm run build",
    "test": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@nuxt/kit": "latest",
    "@pinia/nuxt": "latest",
    "@vueuse/nuxt": "latest",
    "pinia": "latest"
  },
  "devDependencies": {
    "@nuxt/module-builder": "latest",
    "@nuxt/test-utils": "latest",
    "@playwright/test": "latest",
    "nuxt": "latest",
    "vitest": "latest"
  }
}
```

### 1.4 Module Directory Structure

**Note**: All `.js` files are copied from the current codebase without conversion. TypeScript conversion is optional and done later.

```text
packages/nuxt/
├── src/
│   ├── module.ts                    # Module entry point (only TS file initially)
│   └── runtime/                     # Ships to users (auto-imported)
│       ├── composables/
│       │   ├── useAPI.js            # COPIED from src/core/composables/
│       │   ├── useViewAPI.js        # COPIED from src/core/composables/
│       │   ├── useStepper.js        # COPIED from src/core/composables/
│       │   ├── useTimeline.js       # COPIED from src/core/composables/
│       │   └── useDevNavigation.js  # New file (small, can be JS)
│       ├── components/
│       │   ├── builtins/            # COPIED from src/builtins/
│       │   │   ├── WelcomeView.vue
│       │   │   ├── ConsentView.vue
│       │   │   ├── DemographicsView.vue
│       │   │   ├── InstructionsView.vue
│       │   │   ├── DebriefView.vue
│       │   │   ├── ThanksView.vue
│       │   │   └── WithdrawView.vue
│       │   ├── ui/                  # COPIED from src/uikit/
│       │   │   ├── Button.vue
│       │   │   ├── Card.vue
│       │   │   └── ...
│       │   └── dev/                 # COPIED from src/dev/
│       │       ├── ConsoleBar.vue
│       │       ├── Sidebar.vue
│       │       ├── DevToolbar.vue
│       │       └── PresentationNavBar.vue
│       ├── stores/
│       │   ├── smilestore.js        # COPIED from src/core/stores/
│       │   ├── log.js               # COPIED from src/core/stores/
│       │   └── firestore-db.js      # COPIED from src/core/stores/
│       ├── plugins/
│       │   ├── firebase.client.js   # Wraps existing Firebase init
│       │   └── timeline.client.js   # Wraps existing Timeline init
│       ├── middleware/
│       │   └── timeline.global.js   # COPIED logic from src/core/router.js
│       ├── layouts/
│       │   ├── experiment.vue       # Production layout
│       │   ├── development.vue      # Dev mode layout
│       │   └── presentation.vue     # Presentation layout
│       ├── pages/
│       │   ├── dev/
│       │   │   └── [...slug].vue    # Dev mode routes
│       │   └── presentation/
│       │       └── [...slug].vue    # Presentation routes
│       ├── server/
│       │   └── api/                 # Optional server routes (later)
│       │       ├── completion.post.js
│       │       └── webhook.post.js
│       ├── core/
│       │   ├── timeline/
│       │   │   └── Timeline.js      # COPIED from src/core/timeline/
│       │   └── stepper/
│       │       ├── Stepper.js       # COPIED from src/core/stepper/
│       │       ├── StepState.js     # COPIED from src/core/stepper/
│       │       ├── StepperProxy.js  # COPIED from src/core/stepper/
│       │       └── Serializer.js    # COPIED from src/core/stepper/
│       └── utils/
│           ├── randomization.js     # COPIED from src/core/utils/
│           └── utils.js             # COPIED from src/core/utils/
├── playground/                       # Test experiment
│   ├── nuxt.config.ts               # Extends the module
│   ├── app.vue
│   ├── design.js                    # Test timeline (keep as .js)
│   ├── components/                  # Test custom components
│   │   └── MyTaskView.vue
│   └── assets/
└── test/
    ├── setup/
    │   └── mocks.js                 # COPIED from tests/vitest/setup/mocks.js
    ├── core/
    │   ├── composables/             # COPIED from tests/vitest/core/composables/
    │   │   ├── useAPI.test.js
    │   │   ├── useStepper.test.js
    │   │   ├── useTimeline.test.js
    │   │   ├── useViewAPI.test.js
    │   │   └── useViewAPI.dev.test.js
    │   ├── stepper/                 # COPIED from tests/vitest/core/stepper/
    │   │   ├── Stepper.test.js
    │   │   ├── StepperProxy.test.js
    │   │   ├── StepperSerializer.test.js
    │   │   └── StepState.test.js
    │   ├── stores/                  # COPIED from tests/vitest/core/stores/
    │   │   └── firestore-db.test.js
    │   ├── timeline/                # COPIED from tests/vitest/core/timeline/
    │   │   └── Timeline.test.js
    │   ├── utils/                   # COPIED from tests/vitest/core/utils/
    │   │   ├── randomization.test.js
    │   │   └── utils.test.js
    │   ├── router.test.js           # COPIED (will need middleware adaptation)
    │   └── seed.test.js             # COPIED from tests/vitest/core/
    ├── builtins/                    # COPIED from tests/vitest/builtins/
    │   └── advertisement/
    │       └── AdvertisementView.test.js
    └── e2e/                         # Playwright tests (converted from Cypress)
```

### 1.5 Module Entry Point

```typescript
// packages/nuxt/src/module.ts
import { defineNuxtModule, addComponent, addImports, addPlugin, addLayout,
         addRouteMiddleware, createResolver, extendPages } from '@nuxt/kit'
import { fileURLToPath } from 'url'

export interface SmileModuleOptions {
  /** Path to the design file (default: ./design.ts) */
  designFile?: string
  /** Enable dev tools routes at /dev */
  devTools?: boolean
  /** Enable presentation mode routes at /presentation */
  presentationMode?: boolean
  /** Require authentication for /dev in production */
  devAuthRequired?: boolean
}

export default defineNuxtModule<SmileModuleOptions>({
  meta: {
    name: '@gureckislab/smile',
    configKey: 'smile',
    compatibility: { nuxt: '>=3.14.0' },
  },

  defaults: {
    designFile: './design.ts',
    devTools: true,
    presentationMode: true,
    devAuthRequired: true,
  },

  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtimeDir = fileURLToPath(new URL('./runtime', import.meta.url))

    // Transpile runtime directory
    nuxt.options.build.transpile.push(runtimeDir)

    // ========================================
    // Register composables (auto-imported)
    // ========================================
    addImports([
      { name: 'useAPI', from: resolver.resolve('./runtime/composables/useAPI') },
      { name: 'useViewAPI', from: resolver.resolve('./runtime/composables/useViewAPI') },
      { name: 'useStepper', from: resolver.resolve('./runtime/composables/useStepper') },
      { name: 'useTimeline', from: resolver.resolve('./runtime/composables/useTimeline') },
      { name: 'useSmileStore', from: resolver.resolve('./runtime/stores/smilestore') },
      { name: 'useDevNavigation', from: resolver.resolve('./runtime/composables/useDevNavigation') },
    ])

    // ========================================
    // Register built-in components
    // ========================================
    const builtinViews = [
      'WelcomeView', 'ConsentView', 'DemographicsView', 'InstructionsView',
      'InstructionsQuizView', 'DebriefView', 'ThanksView', 'WithdrawView',
      'TaskFeedbackView', 'WindowSizerView',
    ]

    for (const name of builtinViews) {
      addComponent({
        name,
        filePath: resolver.resolve(`./runtime/components/builtins/${name}.vue`),
        priority: -1,  // Can be overridden by user components
      })
    }

    // Register UI kit components
    const uiComponents = ['Button', 'Card', 'Input', 'Checkbox', 'Radio', 'Select', /* ... */]
    for (const name of uiComponents) {
      addComponent({
        name: `Smile${name}`,  // Prefixed to avoid conflicts
        filePath: resolver.resolve(`./runtime/components/ui/${name}.vue`),
      })
    }

    // Register dev tools components (always included for /dev routes)
    addComponent({ name: 'SmileConsoleBar', filePath: resolver.resolve('./runtime/components/dev/ConsoleBar.vue') })
    addComponent({ name: 'SmileSidebar', filePath: resolver.resolve('./runtime/components/dev/Sidebar.vue') })
    addComponent({ name: 'SmileDevToolbar', filePath: resolver.resolve('./runtime/components/dev/DevToolbar.vue') })
    addComponent({ name: 'PresentationNavBar', filePath: resolver.resolve('./runtime/components/dev/PresentationNavBar.vue') })

    // ========================================
    // Register plugins
    // ========================================
    addPlugin({ src: resolver.resolve('./runtime/plugins/firebase.client'), mode: 'client' })
    addPlugin({ src: resolver.resolve('./runtime/plugins/timeline.client'), mode: 'client' })

    // ========================================
    // Register layouts
    // ========================================
    addLayout({ name: 'experiment', src: resolver.resolve('./runtime/layouts/experiment.vue') })
    addLayout({ name: 'development', src: resolver.resolve('./runtime/layouts/development.vue') })
    addLayout({ name: 'presentation', src: resolver.resolve('./runtime/layouts/presentation.vue') })

    // ========================================
    // Register middleware
    // ========================================
    addRouteMiddleware({
      name: 'smile-timeline',
      path: resolver.resolve('./runtime/middleware/timeline.global'),
      global: true,
    })

    // ========================================
    // Extend pages for /dev and /presentation routes
    // ========================================
    if (options.devTools) {
      extendPages((pages) => {
        pages.push({
          name: 'dev-catchall',
          path: '/dev/:slug(.*)*',
          file: resolver.resolve('./runtime/pages/dev/[...slug].vue'),
        })
      })
    }

    if (options.presentationMode) {
      extendPages((pages) => {
        pages.push({
          name: 'presentation-catchall',
          path: '/presentation/:slug(.*)*',
          file: resolver.resolve('./runtime/pages/presentation/[...slug].vue'),
        })
      })
    }

    // ========================================
    // Add Pinia module if not already added
    // ========================================
    if (!nuxt.options.modules.includes('@pinia/nuxt')) {
      nuxt.options.modules.push('@pinia/nuxt')
    }

    // ========================================
    // Configure runtime config defaults
    // ========================================
    nuxt.options.runtimeConfig.public.smile = {
      designFile: options.designFile,
      devTools: options.devTools,
      presentationMode: options.presentationMode,
    }
  },
})
```

### 1.6 Playground Configuration

The playground serves as both a development environment and example experiment:

```typescript
// packages/nuxt/playground/nuxt.config.ts
export default defineNuxtConfig({
  // Extend the local module
  extends: ['..'],

  // Or when published: extends: ['@gureckislab/smile']

  // SPA mode for experiments
  ssr: false,

  // Module configuration
  smile: {
    designFile: './design.ts',
    devTools: true,
    presentationMode: true,
  },

  // Firebase configuration (from env)
  runtimeConfig: {
    public: {
      firebase: {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
      },
    },
  },

  // Dev server
  devServer: {
    port: 3000,
  },
})
```

```typescript
// packages/nuxt/playground/design.ts
import { Timeline } from '#smile/timeline'

export default function createTimeline() {
  const timeline = new Timeline()

  // Example experiment flow
  timeline.pushSeqView({
    path: '/',
    name: 'welcome',
    component: 'WelcomeView',  // Resolved from module
    meta: { allowAlways: true },
  })

  timeline.pushSeqView({
    path: '/consent',
    name: 'consent',
    component: 'ConsentView',
    meta: { setConsented: true },
  })

  timeline.pushSeqView({
    path: '/task',
    name: 'task',
    component: 'MyTaskView',  // From playground/components/
    meta: { requiresConsent: true },
  })

  timeline.pushSeqView({
    path: '/thanks',
    name: 'thanks',
    component: 'ThanksView',
    meta: { requiresConsent: true, setDone: true },
  })

  timeline.build()
  return timeline
}
```

### 1.7 Development Workflow

```bash
# From monorepo root
cd packages/nuxt

# Prepare the module (generates types, stubs)
pnpm run dev:prepare

# Start playground in dev mode
pnpm run dev

# Now accessible at:
# http://localhost:3000/          - Production experiment
# http://localhost:3000/dev/      - Development mode with tools
# http://localhost:3000/presentation/  - Presentation mode

# Build the module for publishing
pnpm run build

# Run tests
pnpm run test
pnpm run test:e2e
```

---

## Phase 2: Core Runtime Migration ✅

> **Status: COMPLETED** (on `nuxt` branch)
>
> **What was done**: Copied 12 JS files (~4,160 lines) to `packages/nuxt/src/runtime/` following the dependency graph bottom-up. All `@/` import paths were updated to relative paths. The `getViewForPath()` method was added to Timeline.js. Playground was updated with a working StepState + randomization demo.
>
> **Files copied (verbatim except import paths)**:
> - Zero-dep: `config.js`, `randomization.js`, `StepState.js`, `StepperProxy.js`, `StepperSerializer.js`
> - Stores (copied together due to circular dep): `smilestore.js`, `log.js`, `firestore-db.js`
> - Depend on stores: `utils.js`, `Stepper.js`
> - Timeline: `Timeline.js` (Vue component imports commented out — handled by route-based modes; `getViewForPath()` added)
>
> **Import path changes**: All `@/core/...` → relative paths (e.g., `../core/config.js`, `./log.js`)
>
> **Known issue**: Playground uses relative imports (`../src/runtime/...`) which won't work for published package consumers. To be addressed in Phase M (Build & Publish) via auto-imports, `exports` map, or Nuxt aliases.
>
> **Deviations from plan**: Phase 2 as written in the plan covers stores, Firebase plugin, Timeline plugin, catch-all route, and middleware. We completed the file-copying portion here. The plugins, catch-all route, and middleware are addressed in the detailed implementation steps (Phases B-F below).

> **⚠️ Important: Copy-First Approach — ALWAYS copy, NEVER reimplement**
>
> The code examples in Phases 2-4 show the **target API and structure** for reference only. **They are NOT code to write from scratch.** The actual migration approach is:
>
> 1. **COPY** the actual existing `.js` file from `src/` to its new location under `runtime/`
> 2. **Update import paths** on the copied file as needed (e.g., `@/` → relative paths)
> 3. **Wrap in Nuxt helpers** where required (e.g., `defineNuxtPlugin`)
> 4. **Do not rewrite** or convert to TypeScript during migration
>
> If you find yourself writing more than a few lines of new code for any step (other than Nuxt wrappers or the `getViewForPath()` method), you are likely reimplementing instead of copying. Stop and find the existing source file to copy from.

### 2.1 Pinia Store Migration

**Approach**: Copy `src/core/stores/smilestore.js` to `runtime/stores/smilestore.js` with minimal changes.

The existing store already uses Pinia's composition API, so it should work with minimal modifications:

```typescript
// app/stores/smilestore.ts
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'

export const useSmileStore = defineStore('smilestore', () => {
  // Same structure, but use Nuxt's useState for SSR compatibility
  const browserPersisted = useStorage('smile-persisted', {
    knownUser: false,
    lastRoute: '',
    consented: false,
    // ... rest of persisted state
  })

  const browserEphemeral = ref({
    forceNavigate: false,
    tooSmall: false,
    // ... ephemeral state
  })

  // ... rest of store implementation

  return {
    browserPersisted,
    browserEphemeral,
    // ... methods
  }
})
```

### 2.2 Firebase Plugin (Client-Side)

```typescript
// app/plugins/firebase.client.ts
import { initializeApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getAuth, connectAuthEmulator } from 'firebase/auth'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  const firebaseConfig = {
    apiKey: config.public.firebase.apiKey,
    authDomain: config.public.firebase.authDomain,
    projectId: config.public.firebase.projectId,
    storageBucket: config.public.firebase.storageBucket,
    messagingSenderId: config.public.firebase.messagingSenderId,
    appId: config.public.firebase.appId,
  }

  const app = initializeApp(firebaseConfig)
  const db = getFirestore(app)
  const auth = getAuth(app)

  // Connect to emulators in development
  if (import.meta.dev) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099')
  }

  return {
    provide: {
      firebase: app,
      firestore: db,
      auth: auth,
    }
  }
})
```

### 2.3 Timeline Plugin & Route Generation

The Timeline system needs to generate Nuxt routes dynamically:

```typescript
// app/plugins/timeline.ts
import { Timeline } from '~/core/timeline/Timeline'
import design from '~/user/design'

export default defineNuxtPlugin((nuxtApp) => {
  // Initialize timeline with design configuration
  const timeline = design()

  return {
    provide: {
      timeline,
    }
  }
})
```

#### Why catch-all route, not `extendPages`?

SMILE's experiment routes include runtime-dependent features — `pushRandomizedNode()` selects routes based on per-participant randomization seeds, and `pushConditionalNode()` branches based on assigned conditions. These routes **cannot be known at build time**, so the `pages:extend` / `extendPages` hook (which runs at build time) cannot generate them. A catch-all route with runtime resolution is the correct approach.

> **Note**: `extendPages` IS still used for `/dev/` and `/presentation/` mode routes, which are static and known at build time (see Section 1.5 Module Entry Point).

#### Catch-all route for experiment flow:

```vue
<!-- runtime/pages/[...slug].vue -->
<script setup>
const route = useRoute()
const { $timeline } = useNuxtApp()

// Resolve component from timeline based on current path
const currentView = computed(() => {
  return $timeline.getViewForPath(route.path)
})

// If no matching view, the middleware will handle redirect
</script>

<template>
  <NuxtLayout name="experiment">
    <component
      v-if="currentView"
      :is="currentView.component"
      v-bind="currentView.props"
    />
  </NuxtLayout>
</template>
```

#### Timeline.getViewForPath() — new method

The Timeline class needs one new method to support the catch-all pattern. This looks up a route config from the existing `routes` array by path — essentially what Vue Router was doing internally:

```javascript
// Added to Timeline.js (the only meaningful change to the class)
getViewForPath(path) {
  // Normalize path (strip trailing slash, etc.)
  const normalized = path === '' ? '/' : path.replace(/\/$/, '') || '/'
  const match = this.routes.find(r => r.path === normalized)
  if (!match) return null
  return {
    component: match.component,
    props: match.props || {},
    meta: match.meta,
    name: match.name,
  }
}
```

Everything else about the Timeline class — `pushSeqView()`, `registerView()`, `buildGraph()`, the `meta.next`/`meta.prev` chain — stays exactly the same.

### 2.4 Middleware Migration (Navigation Guards)

The current `beforeEach` guard in `src/core/router.js` (lines 26–255) ports nearly 1:1 into Nuxt middleware. The main mechanical changes are:

- `next(to)` → `return navigateTo(to)`
- `next(false)` → `return abortNavigation()`
- `next()` → `return` (allow navigation)
- Access timeline via `useNuxtApp().$timeline` instead of closure variable
- Access store via `useSmileStore()` (auto-imported)

Convert the guards to Nuxt middleware:

```typescript
// app/middleware/timeline.global.ts
export default defineNuxtRouteMiddleware((to, from) => {
  const store = useSmileStore()
  const { $timeline } = useNuxtApp()

  // Reset app check
  if (store.browserPersisted.resetApp) {
    store.resetLocalState()
    return navigateTo('/')
  }

  // Consent state management
  if (from.meta.setConsented && !store.browserPersisted.consented) {
    store.completeConsent()
  }

  // Completion state management
  if (from.meta.setDone && !store.browserPersisted.done) {
    store.setDone()
  }

  // Sequential route validation
  if (!store.browserEphemeral.forceNavigate) {
    const expectedNext = $timeline.nextView(from.name)
    if (expectedNext && to.name !== expectedNext.name) {
      return navigateTo({ name: expectedNext.name })
    }
  }

  // Consent requirement
  if (to.meta.requiresConsent && !store.browserPersisted.consented) {
    return navigateTo('/consent')
  }

  // ... additional guard logic
})
```

**Important**: Keep all guards in a single middleware file rather than splitting into multiple files. This mirrors the current `router.js` structure and avoids fragile ordering dependencies (e.g., numbered filename prefixes). The guard execution order is controlled within the single file, making it easy to modify without renaming files.

The complete middleware file should include all guard logic from the current `beforeEach`:

```typescript
// app/middleware/timeline.global.ts (complete implementation)
export default defineNuxtRouteMiddleware((to, from) => {
  const store = useSmileStore()
  const { $timeline } = useNuxtApp()

  // 1. Reset app check
  if (store.browserPersisted.resetApp) {
    store.resetLocalState()
    return navigateTo('/')
  }

  // 2. Consent state management (on leaving consent view)
  if (from.meta.setConsented && !store.browserPersisted.consented) {
    store.completeConsent()
  }

  // 3. Completion state management (on leaving final view)
  if (from.meta.setDone && !store.browserPersisted.done) {
    store.setDone()
  }

  // 4. Allow-always routes bypass remaining checks
  if (to.meta.allowAlways) {
    return
  }

  // 5. Withdrawal redirect
  if (store.browserPersisted.withdrawn && !to.meta.requiresWithdraw) {
    return navigateTo('/withdraw')
  }

  // 6. Consent requirement
  if (to.meta.requiresConsent && !store.browserPersisted.consented) {
    return navigateTo('/consent')
  }

  // 7. Completion requirement
  if (to.meta.requiresDone && !store.browserPersisted.done) {
    return abortNavigation()
  }

  // 8. Sequential route validation (skip if force navigate)
  if (!store.browserEphemeral.forceNavigate) {
    const expectedNext = $timeline.nextView(from.name)
    if (expectedNext && to.name !== expectedNext.name) {
      return navigateTo({ name: expectedNext.name })
    }
  } else {
    // Reset force navigate flag after use
    store.browserEphemeral.forceNavigate = false
  }

  // 9. Dev mode overrides (pinned routes, etc.)
  if (import.meta.dev && store.dev.pinnedRoute) {
    // Handle pinned route logic
  }
})
```

---

## Phase 3: Composables Migration

**Approach**: Copy existing composables from `src/core/composables/` to `runtime/composables/` with these minimal changes:

1. Update import paths (e.g., `@/core/stores/smilestore` → `../stores/smilestore.js`)
2. Replace `import.meta.env.VITE_*` with `useRuntimeConfig().public.*`
3. Replace `useRouter().push()` with `navigateTo()`
4. Keep files as `.js` - do not convert to TypeScript

### 3.1 useAPI Migration

The existing `useAPI.js` structure should be preserved. Key changes needed:

```javascript
// runtime/composables/useAPI.js (COPIED from src/core/composables/useAPI.js)
export function useAPI() {
  const store = useSmileStore()
  const router = useRouter()
  const route = useRoute()
  const { $timeline, $firestore } = useNuxtApp()
  const config = useRuntimeConfig()

  // Navigation
  const goNextView = () => {
    const next = $timeline.nextView(route.name)
    if (next) {
      navigateTo({ name: next.name })
    }
  }

  const goPrevView = () => {
    const prev = $timeline.prevView(route.name)
    if (prev) {
      navigateTo({ name: prev.name })
    }
  }

  const goToView = (name: string, force = false) => {
    if (force) {
      store.browserEphemeral.forceNavigate = true
    }
    navigateTo({ name })
  }

  // Data recording
  const recordPageData = async (data: Record<string, any>) => {
    const routeName = route.name as string
    const visitIndex = store.getVisitIndex(routeName)
    const fieldName = `pageData_${routeName}`

    // Update store
    store.recordPageData(routeName, visitIndex, data)

    // Sync to Firebase
    if (config.public.autoSaveData) {
      await saveData()
    }
  }

  const saveData = async () => {
    // Firebase save logic
  }

  // Randomization
  const randomInt = (min: number, max: number) => {
    return Math.floor(store.rng() * (max - min + 1)) + min
  }

  const shuffle = <T>(array: T[]): T[] => {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(store.rng() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }

  // Stepper access
  const steps = computed(() => store.getCurrentStepper(route.name as string))

  return {
    // Store access
    store,
    config: config.public,

    // Navigation
    goNextView,
    goPrevView,
    goToView,

    // Data
    recordPageData,
    saveData,

    // Randomization
    randomInt,
    shuffle,
    randomAssignCondition: store.randomAssignCondition,

    // Stepper
    steps,

    // Timeline
    timeline: $timeline,
  }
}
```

### 3.2 useViewAPI Migration

```typescript
// app/composables/useViewAPI.ts
export function useViewAPI() {
  const api = useAPI()
  const route = useRoute()

  // Step-specific functionality
  const stepData = computed(() => api.steps.value?.current?.data)
  const stepIndex = computed(() => api.steps.value?.currentIndex)

  const goNextStep = () => {
    if (api.steps.value) {
      api.steps.value.next()
    }
  }

  const goPrevStep = () => {
    if (api.steps.value) {
      api.steps.value.prev()
    }
  }

  const recordStep = async (data: Record<string, any>) => {
    if (api.steps.value) {
      api.steps.value.recordCurrent(data)
    }
    await api.recordPageData(data)
  }

  const isLastStep = () => {
    return api.steps.value?.isLast() ?? true
  }

  return {
    ...api,

    // Step data
    stepData,
    stepIndex,

    // Step navigation
    goNextStep,
    goPrevStep,
    recordStep,
    isLastStep,
  }
}
```

---

## Phase 4: User Layer Migration

### 4.1 design.js → design.ts Conversion

The user's design file needs minimal changes:

```typescript
// user/design.ts
import { Timeline } from '~/core/timeline/Timeline'

// Import built-in views
import WelcomeView from '~/builtins/advertisement/WelcomeView.vue'
import ConsentView from '~/builtins/informedConsent/ConsentView.vue'
import DemographicsView from '~/builtins/demographicSurvey/DemographicSurvey.vue'
// ... other imports

// Import user components
import MyTaskView from './components/MyTaskView.vue'

export default function createTimeline() {
  const timeline = new Timeline()

  // Configure runtime options
  timeline.setConfig({
    allowRepeats: false,
    requireConsent: true,
  })

  // Define experiment flow
  timeline.pushSeqView({
    path: '/',
    name: 'welcome',
    component: WelcomeView,
    meta: { allowAlways: true },
  })

  timeline.pushSeqView({
    path: '/consent',
    name: 'consent',
    component: ConsentView,
    meta: { setConsented: true },
  })

  timeline.pushSeqView({
    path: '/demographics',
    name: 'demographics',
    component: DemographicsView,
    meta: { requiresConsent: true },
  })

  timeline.pushSeqView({
    path: '/task',
    name: 'task',
    component: MyTaskView,
    meta: { requiresConsent: true },
  })

  // ... rest of timeline definition

  timeline.build()

  return timeline
}
```

### 4.2 User Components Migration

User components need minimal changes - primarily import path updates:

```vue
<!-- user/components/MyTaskView.vue -->
<script setup>
// Change: import paths
const api = useViewAPI() // Auto-imported in Nuxt

// Rest of component logic remains the same
const { stepData, goNextStep, recordStep, isLastStep } = api

const handleResponse = async (response) => {
  await recordStep({
    response,
    rt: Date.now() - startTime,
  })

  if (isLastStep()) {
    api.goNextView()
  } else {
    goNextStep()
  }
}
</script>

<template>
  <!-- Template unchanged -->
</template>
```

### 4.3 Nuxt Layer Configuration

User folder as a Nuxt layer:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  extends: [
    './user' // User customization layer
  ],
})
```

```typescript
// user/nuxt.config.ts (layer config)
export default defineNuxtConfig({
  components: [
    { path: './components', pathPrefix: false }
  ],

  imports: {
    dirs: ['./composables']
  }
})
```

---

## Phase 5: Build & Development Tools

In the module architecture, build configuration is split between:

- **Module (`packages/nuxt/`)**: QR code generation, dev tools, route-based modes, component registration
- **Playground/User project**: Environment variables, Firebase config, base URL, deployment settings

### 5.1 Vite Configuration Migration Reference

Current `vite.config.js` has significant customization that must be preserved:

| Current Feature | Nuxt Migration Approach |
|-----------------|------------------------|
| `loadEnv()` from `env/` folder | `runtimeConfig` + `dotenv` in nuxt.config |
| `generate_git_env.sh` script | Keep as `postinstall` hook or Nuxt build hook |
| `stripDevToolPlugin` | Nuxt layouts system (see 5.3) |
| `generateQRCode` plugin | Nuxt module with `nitro:init` hook |
| `handlebars` for index.html | `useHead()` or `app.head` config |
| `unplugin-icons` | `@nuxt/icon` module |
| `unplugin-vue-components` | Built into Nuxt (auto-imports) |
| `@tailwindcss/vite` | `@nuxtjs/tailwindcss` module |
| `@` alias → `./src` | Nuxt default `~` and `@` aliases |
| `vue` alias → esm-bundler | Usually not needed in Nuxt |
| `VITE_DEPLOY_BASE_PATH` | `app.baseURL` in nuxt.config |
| `__BUILD_TIME__` define | `runtimeConfig.public.buildTime` |
| `VITE_SMILE_VERSION` define | `runtimeConfig.public.smileVersion` |
| Vitest config | Separate `vitest.config.ts` |

### 5.2 Environment Variable Migration

The current setup loads env files from `env/` directory and runs `generate_git_env.sh` at build time:

```typescript
// nuxt.config.ts
import { execSync } from 'child_process'
import { config } from 'dotenv'
import { expand } from 'dotenv-expand'
import { resolve } from 'path'

// Run git env generation (same as current vite.config.js)
execSync('sh scripts/generate_git_env.sh', { stdio: 'inherit' })

// Load env files in same order as current vite config
const envDir = resolve(__dirname, 'env')
const baseEnv = config({ path: resolve(envDir, '.env') })
const modeEnv = config({ path: resolve(envDir, `.env.${process.env.NODE_ENV}`) })
const deployEnv = config({ path: resolve(envDir, '.env.deploy') })
const gitEnv = config({ path: resolve(envDir, '.env.git.local') })

// Expand variable references (e.g., ${VITE_PROJECT_NAME})
expand(baseEnv)
expand(modeEnv)
expand(deployEnv)
expand(gitEnv)

export default defineNuxtConfig({
  // Base URL from git-generated env
  app: {
    baseURL: process.env.VITE_DEPLOY_BASE_PATH || '/',
  },

  // Runtime config (replaces import.meta.env.VITE_*)
  runtimeConfig: {
    public: {
      // Build info
      buildTime: new Date().toLocaleDateString(),
      smileVersion: require('./package.json').version,

      // Project info (from generate_git_env.sh)
      projectName: process.env.VITE_PROJECT_NAME,
      codeName: process.env.VITE_CODE_NAME,
      deployBasePath: process.env.VITE_DEPLOY_BASE_PATH,
      deployUrl: process.env.VITE_DEPLOY_URL,
      codeNameDeployUrl: process.env.VITE_CODE_NAME_DEPLOY_URL,

      // Git info
      gitHash: process.env.VITE_GIT_HASH,
      gitOwner: process.env.VITE_GIT_OWNER,
      gitRepoName: process.env.VITE_GIT_REPO_NAME,
      gitBranchName: process.env.VITE_GIT_BRANCH_NAME,
      gitLastMsg: process.env.VITE_GIT_LAST_MSG,

      // Firebase (from .env)
      firebase: {
        apiKey: process.env.VITE_FIREBASE_APIKEY,
        authDomain: process.env.VITE_FIREBASE_AUTHDOMAIN,
        projectId: process.env.VITE_FIREBASE_PROJECTID,
        storageBucket: process.env.VITE_FIREBASE_STORAGEBUCKET,
        messagingSenderId: process.env.VITE_FIREBASE_MESSAGINGSENDERID,
        appId: process.env.VITE_FIREBASE_APPID,
      },

      // Experiment settings
      allowRepeats: process.env.VITE_ALLOW_REPEATS === 'true',
      autoSaveData: process.env.VITE_AUTO_SAVE_DATA === 'true',
      maxWrites: parseInt(process.env.VITE_MAX_WRITES || '100'),

      // UI
      colorMode: process.env.VITE_COLOR_MODE,
      responsiveUi: process.env.VITE_RESPONSIVE_UI === 'true',
    }
  },

  devServer: {
    port: parseInt(process.env.VITE_DEV_PORT_NUM || '3000'),
  },
})
```

### 5.3 Route-Based Dev/Presentation Modes (stripDevToolPlugin replacement)

Instead of build-time mode switching, use **separate route prefixes** that coexist in a single build:

| Route | Purpose | Features |
| ----- | ------- | -------- |
| `/` | Production experiment | Clean UI, no dev tools |
| `/dev/` | Development mode | Console bar, sidebar, route jumping, data browser |
| `/presentation/` | Presentation mode | Nav bar, QR code, reset button, presenter controls |

**Benefits over build-time switching:**

- Single build serves all modes
- Switch between modes without rebuilding
- Dev tools accessible even in production (can be auth-protected)
- Easier debugging of production issues

**Directory structure:**

```
app/pages/
├── index.vue                    # Redirects to first timeline route
├── [...slug].vue                # Production experiment routes
├── dev/
│   ├── index.vue                # Dev mode recruitment chooser
│   └── [...slug].vue            # Dev mode experiment with tooling
└── presentation/
    ├── index.vue                # Presentation landing
    └── [...slug].vue            # Presentation mode experiment
```

**Production routes (`app/pages/[...slug].vue`):**

```vue
<script setup>
const route = useRoute()
const { $timeline } = useNuxtApp()

// Resolve view from timeline
const currentView = computed(() => $timeline.getViewForPath(route.path))
</script>

<template>
  <NuxtLayout name="experiment">
    <component :is="currentView.component" v-bind="currentView.props" />
  </NuxtLayout>
</template>
```

**Dev mode routes (`app/pages/dev/[...slug].vue`):**

```vue
<script setup>
const route = useRoute()
const { $timeline } = useNuxtApp()

// Get the actual experiment path (strip /dev prefix)
const experimentPath = computed(() => route.path.replace(/^\/dev/, '') || '/')
const currentView = computed(() => $timeline.getViewForPath(experimentPath.value))
</script>

<template>
  <NuxtLayout name="development">
    <!-- Dev tooling wraps the experiment -->
    <SmileDevToolbar />
    <div class="flex">
      <SmileSidebar />
      <main class="flex-1">
        <component :is="currentView.component" v-bind="currentView.props" />
      </main>
    </div>
    <SmileConsoleBar />
  </NuxtLayout>
</template>
```

**Presentation mode routes (`app/pages/presentation/[...slug].vue`):**

```vue
<script setup>
const route = useRoute()
const { $timeline } = useNuxtApp()

const experimentPath = computed(() => route.path.replace(/^\/presentation/, '') || '/')
const currentView = computed(() => $timeline.getViewForPath(experimentPath.value))
</script>

<template>
  <NuxtLayout name="presentation">
    <PresentationNavBar />
    <component :is="currentView.component" v-bind="currentView.props" />
  </NuxtLayout>
</template>
```

**Layouts:**

```vue
<!-- app/layouts/experiment.vue (production - minimal) -->
<template>
  <div class="experiment-container">
    <slot />
  </div>
</template>
```

```vue
<!-- app/layouts/development.vue -->
<template>
  <div class="dev-mode">
    <slot />
  </div>
</template>

<style>
.dev-mode {
  /* Dev-specific styling, e.g., visible grid, borders */
}
</style>
```

```vue
<!-- app/layouts/presentation.vue -->
<template>
  <div class="presentation-mode">
    <slot />
  </div>
</template>
```

**Navigation helper composable:**

```typescript
// app/composables/useDevNavigation.ts
export function useDevNavigation() {
  const route = useRoute()

  // Detect current mode from route
  const mode = computed(() => {
    if (route.path.startsWith('/dev')) return 'development'
    if (route.path.startsWith('/presentation')) return 'presentation'
    return 'production'
  })

  // Navigate to same experiment route in different mode
  const switchMode = (newMode: 'production' | 'development' | 'presentation') => {
    const basePath = route.path
      .replace(/^\/dev/, '')
      .replace(/^\/presentation/, '')

    const prefix = {
      production: '',
      development: '/dev',
      presentation: '/presentation',
    }[newMode]

    navigateTo(prefix + basePath)
  }

  // Get the equivalent route in another mode
  const getModeUrl = (targetMode: string) => {
    const basePath = route.path
      .replace(/^\/dev/, '')
      .replace(/^\/presentation/, '')

    const prefix = {
      production: '',
      development: '/dev',
      presentation: '/presentation',
    }[targetMode] || ''

    return prefix + basePath
  }

  return { mode, switchMode, getModeUrl }
}
```

**Optional: Protect dev routes in production:**

```typescript
// app/middleware/dev-auth.ts
export default defineNuxtRouteMiddleware((to) => {
  // Only apply to /dev routes
  if (!to.path.startsWith('/dev')) return

  // In production, require auth or secret param
  if (!import.meta.dev) {
    const config = useRuntimeConfig()
    const devSecret = to.query.secret

    if (devSecret !== config.public.devSecret) {
      return abortNavigation()  // Or redirect to login
    }
  }
})

### 5.4 QR Code Generation (Built into Module)

QR code generation is built directly into `@gureckislab/smile`. Add to the module's setup function:

```typescript
// packages/nuxt/src/module.ts (add to setup function)
import QRCode from 'qrcode-svg'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

// Inside setup():
nuxt.hook('build:before', () => {
  const config = nuxt.options.runtimeConfig.public

  // Generate QR code pointing to experiment URL
  const deployUrl = config.smile?.deployUrl || config.codeNameDeployUrl || 'http://localhost:3000'

  const qrcode = new QRCode({
    content: deployUrl,
    padding: 4,
    width: 256,
    height: 256,
    color: '#000000',
    background: '#ffffff',
    xmlDeclaration: false,
    ecl: 'M',
  })

  const publicDir = resolve(nuxt.options.rootDir, 'public')
  mkdirSync(publicDir, { recursive: true })
  writeFileSync(resolve(publicDir, 'qr.svg'), qrcode.svg())
  console.log('  ➜  Generated QR code at public/qr.svg')
})
```

The QR code is automatically generated during build based on the user's `runtimeConfig.public.smile.deployUrl` setting.

### 5.5 Icon and Component Auto-Import

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    '@nuxt/icon',  // Replaces unplugin-icons
    // unplugin-vue-components is built into Nuxt
  ],

  // Icon configuration
  icon: {
    serverBundle: 'remote',  // or 'local' for offline
    customCollections: [
      // Add custom icon collections if needed
    ],
  },

  // Component auto-import is automatic, but can customize:
  components: {
    dirs: [
      '~/components',
      '~/uikit',
      '~/builtins',
    ]
  },
})
```

### 5.6 Development Tools Module

With route-based modes, dev tools are always included in the build (accessible via `/dev/` routes). The module registers all components and layouts:

```typescript
// modules/smile-devtools/index.ts
import { defineNuxtModule, addComponent, addLayout, extendPages } from '@nuxt/kit'
import { resolve } from 'path'

export default defineNuxtModule({
  meta: {
    name: 'smile-devtools',
    configKey: 'smileDevtools',
  },

  defaults: {
    enabled: true,
    requireAuth: true,  // Require auth for /dev in production
  },

  setup(options, nuxt) {
    if (!options.enabled) return

    // Register dev mode components (always included for /dev routes)
    addComponent({
      name: 'SmileDevToolbar',
      filePath: '~/dev/developer_mode/DevToolbar.vue',
    })

    addComponent({
      name: 'SmileConsoleBar',
      filePath: '~/dev/developer_mode/ConsoleBar.vue',
    })

    addComponent({
      name: 'SmileSidebar',
      filePath: '~/dev/developer_mode/Sidebar.vue',
    })

    // Register presentation mode components
    addComponent({
      name: 'PresentationNavBar',
      filePath: '~/dev/presentation_mode/PresentationNavBar.vue',
    })

    // Register layouts
    addLayout({
      name: 'experiment',
      filePath: '~/layouts/experiment.vue',
    })

    addLayout({
      name: 'development',
      filePath: '~/dev/developer_mode/DevelopmentLayout.vue',
    })

    addLayout({
      name: 'presentation',
      filePath: '~/dev/presentation_mode/PresentationLayout.vue',
    })

    // Add middleware for dev route protection in production
    if (options.requireAuth && !nuxt.options.dev) {
      nuxt.hook('pages:extend', (pages) => {
        // Middleware is applied via page meta in the /dev routes
      })
    }
  }
})
```

### 5.7 Scripts Migration

Update scripts in `package.json` (use with `pnpm run <script>`):

```json
{
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "preview": "nuxt preview",
    "generate": "nuxt generate",
    "postinstall": "nuxt prepare && sh scripts/generate_git_env.sh",

    "firebase:emulators": "firebase emulators:start",
    "test": "vitest",
    "test:e2e": "playwright test"
  }
}
```

**Note:** Separate `dev:presentation` and `build:presentation` scripts are no longer needed. With route-based modes, a single build includes all modes:

- `http://localhost:3000/` → Production experiment
- `http://localhost:3000/dev/` → Development mode with tooling
- `http://localhost:3000/presentation/` → Presentation mode

```

### 5.8 Complete nuxt.config.ts Example

```typescript
// nuxt.config.ts
import { execSync } from 'child_process'
import { resolve } from 'path'

// Generate git env file
execSync('sh scripts/generate_git_env.sh', { stdio: 'inherit' })

export default defineNuxtConfig({
  // SPA mode for experiment (can enable SSR for specific routes later)
  ssr: false,

  // Modules
  modules: [
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss',
    '@vueuse/nuxt',
    '@nuxt/icon',
    '~/modules/qrcode',
    '~/modules/smile-devtools',
  ],

  // App configuration
  app: {
    baseURL: process.env.VITE_DEPLOY_BASE_PATH || '/',
    head: {
      title: process.env.VITE_PROJECT_NAME || 'SMILE Experiment',
      // Replaces handlebars template vars
    }
  },

  // Runtime config (see 5.2 for full example)
  runtimeConfig: {
    public: {
      // ... all env vars
    }
  },

  // Dev server
  devServer: {
    port: parseInt(process.env.VITE_DEV_PORT_NUM || '3000'),
  },

  // Component directories
  components: {
    dirs: [
      '~/components',
      '~/uikit',
      '~/builtins',
      '~/user/components',
    ]
  },

  // Vite-specific config (for anything that can't be done via Nuxt)
  vite: {
    resolve: {
      alias: {
        // Usually not needed, but just in case
        'vue': 'vue/dist/vue.esm-bundler.js',
      }
    }
  },

  // TypeScript
  typescript: {
    strict: true,
  },
})

---

## Phase 6: Server-Side Features (New Capabilities)

### 6.1 API Routes

```typescript
// server/api/completion.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { participantId, completionCode, platform } = body

  // Handle completion callback (e.g., for Prolific)
  if (platform === 'prolific') {
    // Validate and process completion
  }

  return { success: true }
})
```

### 6.2 Server Middleware

```typescript
// server/middleware/logging.ts
export default defineEventHandler((event) => {
  console.log(`[${new Date().toISOString()}] ${event.method} ${event.path}`)
})
```

### 6.3 Webhook Handlers

```typescript
// server/api/webhook/prolific.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Handle Prolific webhooks (study completion, participant updates)

  return { received: true }
})
```

---

## Phase 7: Testing Migration

### 7.1 Current Test Structure

The existing tests use:

- **Vitest** with `@vue/test-utils` for unit/component tests
- **`@pinia/testing`** for Pinia store testing
- **`vi.mock()`** for mocking Firebase, axios, log store, etc.
- **`happy-dom`** as DOM environment
- **Cypress** for E2E tests (recruitment flows, smoke tests)

Test files:

```
tests/
├── vitest/
│   ├── setup/mocks.js           # Shared mocks (Firebase, axios, log)
│   ├── core/
│   │   ├── composables/         # useAPI, useViewAPI, useStepper, useTimeline
│   │   ├── stepper/             # Stepper, StepState, StepperProxy, Serializer
│   │   ├── stores/              # firestore-db
│   │   ├── timeline/            # Timeline
│   │   └── utils/               # randomization, utils
│   └── builtins/                # Component tests
└── cypress/
    └── e2e/                     # prolific, mturk, cloudresearch, smoke
```

### 7.2 Vitest Migration Strategy

Most Vitest tests will work with minor changes:

| Current Pattern | Nuxt Change |
|-----------------|-------------|
| `import X from '@/core/...'` | `import X from '~/core/...'` (path alias) |
| `import.meta.env.VITE_*` | Mock `useRuntimeConfig()` |
| `createRouter()` manual | Use `mockNuxtImport('useRouter')` or Nuxt test context |
| `@pinia/testing` | Still works, Nuxt adds helpers |

### 7.3 Vitest Configuration for Nuxt

```typescript
// vitest.config.ts
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    environmentOptions: {
      nuxt: {
        domEnvironment: 'happy-dom',  // Keep happy-dom (current setup)
        mock: {
          intersectionObserver: true,
          indexedDb: true,
        }
      }
    },
    setupFiles: ['./tests/vitest/setup/mocks.ts'],
    globals: true,
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  }
})
```

### 7.4 Migrating Mock Setup

```typescript
// tests/vitest/setup/mocks.ts (migrated from mocks.js)
import { vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

export const DEBUG = false

// Mock Firebase (same as before, path change)
vi.mock('~/core/stores/firestore-db', () => ({
  createDoc: vi.fn().mockResolvedValue({ id: 'test-doc-id' }),
  createPrivateDoc: vi.fn().mockResolvedValue({ id: 'test-private-doc-id' }),
  updateSubjectDataRecord: vi.fn().mockResolvedValue(true),
  updatePrivateSubjectDataRecord: vi.fn().mockResolvedValue(true),
  loadDoc: vi.fn().mockResolvedValue({ data: () => ({ test: 'data' }) }),
  fsnow: vi.fn().mockReturnValue(new Date().toISOString()),
}))

// Mock log store (same pattern)
vi.mock('~/core/stores/log', () => ({
  default: vi.fn().mockReturnValue({
    history: [],
    log: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}))

// Mock runtime config (replaces import.meta.env mocking)
mockNuxtImport('useRuntimeConfig', () => () => ({
  public: {
    deployBasePath: '/test/',
    projectName: 'test-project',
    firebase: {
      apiKey: 'test-key',
      projectId: 'test-project',
    },
    allowRepeats: false,
    autoSaveData: true,
  }
}))

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { ip: '127.0.0.1' } }),
  },
}))
```

### 7.5 Migrating Component Tests

```typescript
// tests/vitest/core/composables/useAPI.test.ts (migrated)
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { createTestingPinia } from '@pinia/testing'
import { describe, beforeEach, it, expect, vi } from 'vitest'
import { defineComponent, h } from 'vue'

// Import mocks
import '../../setup/mocks'

// Test component that uses the composable
const TestComponent = defineComponent({
  setup() {
    const api = useAPI()  // Auto-imported in Nuxt context
    return { api }
  },
  render() {
    return h('div')
  },
})

describe('useAPI composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provides store access', async () => {
    const wrapper = await mountSuspended(TestComponent, {
      global: {
        plugins: [createTestingPinia({ stubActions: false, createSpy: vi.fn })],
      },
    })

    expect(wrapper.vm.api.store).toBeDefined()
  })

  it('provides navigation methods', async () => {
    const wrapper = await mountSuspended(TestComponent, {
      global: {
        plugins: [createTestingPinia({ stubActions: false, createSpy: vi.fn })],
      },
    })

    expect(typeof wrapper.vm.api.goNextView).toBe('function')
    expect(typeof wrapper.vm.api.goPrevView).toBe('function')
    expect(typeof wrapper.vm.api.goToView).toBe('function')
  })
})
```

### 7.6 Playwright Setup (Replacing Cypress)

Install Playwright with Nuxt integration:

```bash
pnpm add -D @playwright/test @nuxt/test-utils
pnpm dlx playwright install
```

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'
import type { ConfigOptions } from '@nuxt/test-utils/playwright'

export default defineConfig<ConfigOptions>({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    nuxt: {
      rootDir: '.',
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile viewports
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'pnpm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
})
```

### 7.7 Converting Cypress Tests to Playwright

**Before (Cypress - prolific.cy.js):**

```javascript
describe('Prolific recruitment flow', () => {
  it('handles prolific query parameters', () => {
    cy.visit('/?PROLIFIC_PID=test123&STUDY_ID=study456&SESSION_ID=sess789')
    cy.get('[data-test="welcome"]').should('be.visible')
    cy.get('[data-test="continue-btn"]').click()
    cy.url().should('include', '/consent')
  })
})
```

**After (Playwright - prolific.spec.ts):**

```typescript
// tests/e2e/prolific.spec.ts
import { test, expect } from '@nuxt/test-utils/playwright'

test.describe('Prolific recruitment flow', () => {
  test('handles prolific query parameters', async ({ page, goto }) => {
    await goto('/?PROLIFIC_PID=test123&STUDY_ID=study456&SESSION_ID=sess789')

    await expect(page.locator('[data-test="welcome"]')).toBeVisible()
    await page.click('[data-test="continue-btn"]')
    await expect(page).toHaveURL(/\/consent/)
  })

  test('stores recruitment info in store', async ({ page, goto }) => {
    await goto('/?PROLIFIC_PID=P123&STUDY_ID=S456&SESSION_ID=X789')

    // Can evaluate JS in page context
    const recruitmentInfo = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('smile-persisted') || '{}')
    })

    expect(recruitmentInfo.recruitmentService).toBe('prolific')
  })
})
```

### 7.8 Cypress to Playwright Command Mapping

| Cypress | Playwright |
|---------|------------|
| `cy.visit(url)` | `await goto(url)` or `await page.goto(url)` |
| `cy.get(selector)` | `page.locator(selector)` |
| `.should('be.visible')` | `await expect(locator).toBeVisible()` |
| `.should('have.text', 'x')` | `await expect(locator).toHaveText('x')` |
| `.click()` | `await locator.click()` |
| `.type('text')` | `await locator.fill('text')` |
| `cy.url().should('include', x)` | `await expect(page).toHaveURL(/x/)` |
| `cy.wait(ms)` | `await page.waitForTimeout(ms)` |
| `cy.intercept()` | `await page.route()` |
| `cy.fixture()` | Import JSON directly |

### 7.9 Test Scripts Update

```json
{
  "scripts": {
    "test": "vitest",
    "test:gui": "vitest --ui --coverage.enabled=true",
    "coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:codegen": "playwright codegen localhost:3000",
    "test:python": "cd analysis && uv run pytest",
    "test:all": "vitest run && playwright test && cd analysis && uv run pytest"
  }
}
```

### 7.10 Migration Steps for Tests

1. **Setup phase:**
   - Install `@nuxt/test-utils` and `@playwright/test`
   - Create `vitest.config.ts` with Nuxt environment
   - Create `playwright.config.ts`
   - Run `npx playwright install` for browsers

2. **Migrate mocks:**
   - Convert `mocks.js` to `mocks.ts`
   - Update import paths (`@/` → `~/`)
   - Replace `import.meta.env` mocks with `mockNuxtImport('useRuntimeConfig')`

3. **Migrate unit tests:**
   - Update import paths
   - Replace `mount()` with `mountSuspended()` for async components
   - Keep `@pinia/testing` (still compatible)

4. **Migrate E2E tests:**
   - Convert Cypress tests to Playwright syntax
   - Use `@nuxt/test-utils/playwright` for Nuxt integration
   - Add mobile viewport tests (Playwright makes this easy)

5. **Verify parity:**
   - Run both test suites during migration
   - Ensure same coverage and behavior

---

## Implementation Order

This implementation order follows a **one-thing-at-a-time** philosophy. Each step introduces exactly one new concept or one new file, then verifies it works before moving on. Steps are ordered by dependency — you can't start a step until its dependencies are verified working.

> **Rule**: If a step's verification fails, **stop**. Debug and fix before moving on. Never skip a verification checkpoint. Every step should leave the playground in a working state.

### Agent Session Strategy

Each phase should be executed in a **fresh Claude Code agent session** so the agent gets a clean context window focused on the task at hand. The plan document itself is the shared context between sessions — every agent reads it and knows exactly what step it's on. Git history captures the state from prior sessions.

**Session boundaries:**

| Session | Phase & Steps | Focus |
| --- | --- | --- |
| 1 | Phase A (1–2) | Monorepo scaffolding + bare Nuxt module |
| 2 | Phase B (3–6) | Copy leaf files + their tests (config, Timeline, utils, stepper deps) |
| 3 | Phase C (7–9) | Copy stores + tests, resolve circular dependency |
| 4 | Phase D (10) | Copy Stepper class + tests |
| 5 | Phase E (11–15) | Copy composables + tests, register auto-imports |
| 6 | Phase F (16–17) | Timeline plugin + catch-all page (no guards) |
| **7** | **Phase F (18–20)** | **Port navigation guards + copy router tests — hardest step, deserves focused context** |
| 8 | Phase G (21–23) | Layouts + `/dev/` + `/presentation/` routes |
| 9 | Phase H (24–27) | Tailwind + UI kit + first 2 real components + tests |
| 10 | Phase H (28–33) | Remaining builtin components |
| 11 | Phase I (34–37) | Dev tools components |
| 12 | Phase J (38–39) | Firebase integration |
| 13 | Phase K (40) | Full integration test |
| 14 | Phase L (41–43) | Wire up test infrastructure, make copied tests pass |
| 15+ | Phases M–N | Build, publish, TypeScript |

**Why phase-level, not step-level**: Individual steps (e.g., "copy one file") are too small for a full session spin-up. But steps within a phase share context that the agent benefits from (e.g., Steps 7–9 need to understand the circular dependency together; Steps 18–20 need to understand the guard logic holistically).

**Why Phase F is split into two sessions**: Steps 16–17 (plugin + catch-all page) are straightforward wiring. Steps 18–20 (porting the ~230-line `beforeEach` guard one rule at a time) are the hardest, most error-prone work in the entire migration. A clean context window lets the agent focus entirely on the mechanical guard translation.

**Prompt template for each session:**

> Execute **Phase X (Steps N–M)** of the migration plan at `plans/nuxt_migration_251.md`.
> Previous phases are already complete — check `git log` to confirm.
> Do one step at a time. Verify each step's checkboxes pass before moving to the next.
> Commit after each passing step. Do not proceed past a failing verification.

**Handoff protocol:**
1. Each session checks `git log` to confirm prior phases are committed
2. Each session reads the plan to understand its steps
3. Each session runs VERIFY checkboxes before committing
4. Each session commits after each passing step
5. If a step fails, the session stops and reports the issue — it does NOT skip ahead

### Dependency Graph Reference

This is the internal import dependency order for SMILE's core files. Steps below follow this bottom-up:

```text
Level 0 (no internal deps):  config.js, Timeline.js, utils.js, randomization.js
Level 1 (deps on L0):        log.js → config
                              firestore-db.js → config, log
                              StepState.js, StepperProxy.js, StepperSerializer.js (no deps)
Level 2 (deps on L0-1):      smilestore.js → config, log, firestore-db
                              Stepper.js → StepState, StepperProxy, StepperSerializer, config, log
Level 3 (deps on L0-2):      useTimeline.js → smilestore, log
                              useStepper.js → Stepper, smilestore, log
Level 4 (deps on L0-3):      useAPI.js → smilestore, log, useTimeline, randomization
Level 5 (deps on L0-4):      useViewAPI.js → useAPI, smilestore, useStepper, useTimeline, log, config
Level 6 (REPLACED):          router.js → replaced by catch-all route + middleware
```

**Circular dependency warning**: `log.js` imports `smilestore.js` and `smilestore.js` imports `log.js`. These two files must be copied together and tested as a pair.

---

### Phase A: Bare Infrastructure (No SMILE Code)

#### Step 1: Create monorepo skeleton

**Goal**: pnpm workspace exists, no code yet.

1. Create root `pnpm-workspace.yaml`
2. Create root `package.json` (private, workspace scripts)
3. Create `.npmrc`

**What was done**: Created the monorepo root with `pnpm-workspace.yaml`, root `package.json`, and `.npmrc`. No SMILE code yet — just the workspace infrastructure.

**How to test**:

1. Run `pnpm install` from the repo root
   - Should complete with no errors and create a `pnpm-lock.yaml`
2. Run `ls packages/` — directory should exist but be empty (or not yet created, depending on order)
3. Open `package.json` and confirm `"private": true` and `"packageManager"` is set

**VERIFY**:
- [ ] `pnpm install` runs without errors from the root
- [ ] No SMILE code has been added

#### Step 2: Initialize bare Nuxt module

**Goal**: Empty Nuxt module with a playground that renders "Hello World".

1. Initialize module:

   ```bash
   mkdir -p packages/nuxt
   cd packages/nuxt
   pnpm dlx nuxi@latest init -t module .
   ```

2. Create minimal playground:
   - `playground/nuxt.config.ts` that extends the module
   - `playground/app.vue` with just `<template><h1>Hello World</h1></template>`

3. Create minimal `src/module.ts` (empty setup function — registers nothing yet)

**What was done**: Scaffolded a bare Nuxt module in `packages/nuxt/` using the official template. The playground renders a static "Hello World" page — no SMILE code yet.

**How to test**:

1. Run `pnpm run dev` from the repo root (or `cd packages/nuxt && pnpm run dev`)
2. Open `http://localhost:3000` in the browser — you should see "Hello World"
3. Open browser DevTools console — no errors should appear
4. Open Nuxt DevTools (click the Nuxt icon at bottom of page or press Shift+Alt+D) — should open without crashing
5. Stop the dev server (Ctrl+C)

**VERIFY**:
- [ ] `pnpm run dev` starts the playground without errors
- [ ] "Hello World" renders at `http://localhost:3000`
- [ ] No SMILE code has been added yet
- [ ] Nuxt DevTools open without errors

---

### Phase B: Copy Leaf-Level Files (No Dependencies)

Each step copies exactly one file (or one tightly-coupled group), updates import paths, and verifies it loads in the playground.

> **Tests move with the code**: When copying a source file that has a corresponding test file in `tests/vitest/`, copy the test file too (to `test/` inside the module). Update import paths in the test. The test doesn't need to pass yet (test infrastructure isn't set up until Phase L), but it should be present so nothing is left behind.

#### Step 3: Copy config.js

**Goal**: The base configuration file is available.

1. **COPY** `src/core/config.js` → `runtime/core/config.js`
2. No changes needed (no internal imports)
3. Test in playground:

   ```vue
   <!-- playground/app.vue -->
   <script setup>
   import config from '../src/runtime/core/config.js'
   console.log('Config loaded:', config)
   </script>
   <template><h1>Hello World</h1></template>
   ```

**What was done**: Copied `config.js` (the base configuration file) into the module. This file has no internal dependencies, so it's the simplest starting point.

**How to test**:

1. Run `pnpm run dev`
2. Open `http://localhost:3000` in the browser
3. Open browser DevTools → Console tab
4. Look for `Config loaded:` followed by an object — it should have keys like `mode`, `project_name`, etc.
5. If you see the config object printed, the file loaded correctly

**VERIFY**:
- [ ] Playground starts without errors
- [ ] Config object appears in console with expected keys

#### Step 4: Copy Timeline.js

**Goal**: Timeline class can be instantiated.

1. **COPY** `src/core/timeline/Timeline.js` → `runtime/core/timeline/Timeline.js`
2. **COPY** `tests/vitest/core/timeline/Timeline.test.js` → `test/core/timeline/Timeline.test.js`
3. Update import paths if needed (Timeline has no internal imports, but check for any `@/` references)
4. Update import paths in the test file (`@/` → relative paths to new location)
5. **Add `getViewForPath(path)` method** (see Section 2.3) — the only new code
4. Test in playground:

   ```vue
   <script setup>
   import config from '../src/runtime/core/config.js'
   import Timeline from '../src/runtime/core/timeline/Timeline.js'
   const t = new Timeline()
   console.log('Timeline created:', t)
   console.log('getViewForPath test:', t.getViewForPath('/'))  // should be null
   </script>
   <template><h1>Hello World</h1></template>
   ```

**What was done**: Copied `Timeline.js` (the core sequencing class) and its test file into the module. Added the new `getViewForPath(path)` method needed for the catch-all route architecture.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000`
2. Open browser DevTools → Console
3. Confirm `Timeline created:` shows a Timeline object — expand it and look for `pushSeqView` in the prototype
4. Confirm `getViewForPath test: null` appears — this is expected since no routes are registered on this bare instance

**VERIFY**:
- [ ] Timeline instantiates without errors
- [ ] `getViewForPath('/')` returns null (no routes registered — expected)
- [ ] `pushSeqView()` method exists on the instance

#### Step 5: Copy utility files

**Goal**: Utility functions are available.

1. **COPY** `src/core/utils/utils.js` → `runtime/utils/utils.js`
2. **COPY** `src/core/utils/randomization.js` → `runtime/utils/randomization.js`
3. **COPY** `tests/vitest/core/utils/utils.test.js` → `test/core/utils/utils.test.js`
4. **COPY** `tests/vitest/core/utils/randomization.test.js` → `test/core/utils/randomization.test.js`
5. **COPY** `tests/vitest/core/seed.test.js` → `test/core/seed.test.js`
6. Update any `@/` import paths to relative paths (both source and test files)
7. Test in playground — import and call a simple utility function

**What was done**: Copied `utils.js`, `randomization.js`, and their test files. These are pure utility functions with no internal dependencies.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000`
2. Open browser DevTools → Console
3. Look for output from the utility function call in the playground test snippet
4. Confirm no import errors — if the console shows a result from `getQueryParams()` or a randomization call, the files loaded correctly

**VERIFY**:
- [ ] Utility functions import without errors
- [ ] A simple call (e.g., `getQueryParams()` or a randomization function) returns expected output

#### Step 6: Copy stepper leaf files

**Goal**: Stepper's dependency files are available (these have no internal imports).

1. **COPY** these three files (they don't depend on each other):
   - `src/core/stepper/StepState.js` → `runtime/core/stepper/StepState.js`
   - `src/core/stepper/StepperProxy.js` → `runtime/core/stepper/StepperProxy.js`
   - `src/core/stepper/Serializer.js` → `runtime/core/stepper/Serializer.js`
2. **COPY** their corresponding test files:
   - `tests/vitest/core/stepper/StepState.test.js` → `test/core/stepper/StepState.test.js`
   - `tests/vitest/core/stepper/StepperProxy.test.js` → `test/core/stepper/StepperProxy.test.js`
   - `tests/vitest/core/stepper/StepperSerializer.test.js` → `test/core/stepper/StepperSerializer.test.js`
3. Update `@/` imports to relative paths (both source and test files)

**What was done**: Copied the three stepper leaf files (`StepState.js`, `StepperProxy.js`, `Serializer.js`) and their tests. These have no internal dependencies and are needed by `Stepper.js` in Phase D.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000`
2. Open browser DevTools → Console
3. Confirm `new StepState()` creates an instance without errors (add a console.log in the playground snippet)
4. Check for any import resolution errors — there should be none since these files are standalone

**VERIFY**:
- [ ] Each file imports without errors in playground
- [ ] `new StepState()` can be instantiated

---

**Playground state after Phase B**: The playground app.vue should import and exercise each copied module — create a Timeline instance, call utility functions, instantiate a StepState — and print results to the page. This serves as both a smoke test and a readable reference for what these leaf modules do.

---

### Phase C: Copy Stores (Dependency Level 1–2)

#### Step 7: Copy log.js store

**Goal**: Log store is available. Note: `log.js` has a circular dependency with `smilestore.js`. For now, mock or stub the smilestore import so log.js can load in isolation.

1. **COPY** `src/core/stores/log.js` → `runtime/stores/log.js`
2. Update imports: `@/core/config` → relative path to `../core/config.js`
3. The import of `smilestore` will fail because smilestore isn't copied yet. **Temporarily** stub this import or skip the test until Step 9.

**What was done**: Copied `log.js` store into the module. The smilestore import is temporarily stubbed because of the circular dependency (resolved in Step 9).

**How to test**:

1. Check that the file exists at `runtime/stores/log.js` with no syntax errors
2. Open the file and confirm `@/core/config` has been changed to a relative path
3. The smilestore import should be stubbed/commented — this is intentional and will be fixed in Step 9
4. No playground test needed yet — this file can't fully work until Step 9

**VERIFY**:
- [ ] File copies without syntax errors
- [ ] Import paths are updated

#### Step 8: Copy firestore-db.js store

**Goal**: Firestore database helpers are available.

1. **COPY** `src/core/stores/firestore-db.js` → `runtime/stores/firestore-db.js`
2. **COPY** `tests/vitest/core/stores/firestore-db.test.js` → `test/core/stores/firestore-db.test.js`
3. Update imports: `@/core/config` → relative, `@/core/stores/log` → relative
4. Update import paths in test file
5. Firebase SDK imports will need the package installed: `pnpm add firebase` in the module

**What was done**: Copied `firestore-db.js` store and its test file. Installed the Firebase SDK package. Updated import paths.

**How to test**:

1. Confirm `pnpm add firebase` completed without errors inside the module package
2. Open `runtime/stores/firestore-db.js` and confirm `@/` imports are replaced with relative paths
3. Check the test file has updated import paths too
4. Run `pnpm run dev` — should start without crashing (the Firebase code won't actually connect yet, but the imports should resolve)

**VERIFY**:
- [ ] File copies without syntax errors
- [ ] Import paths are updated
- [ ] Firebase package resolves

#### Step 9: Copy smilestore.js + register Pinia (resolves circular dep)

**Goal**: The main store works. This resolves the circular dependency between log.js and smilestore.js — they must both be present for either to work.

1. **COPY** `src/core/stores/smilestore.js` → `runtime/stores/smilestore.js`
2. Update all `@/` imports to relative paths
3. Register Pinia in `src/module.ts`:

   ```typescript
   if (!nuxt.options.modules.includes('@pinia/nuxt')) {
     nuxt.options.modules.push('@pinia/nuxt')
   }
   ```

4. Test the store **and** log together in playground:

   ```vue
   <script setup>
   import { useSmileStore } from '../src/runtime/stores/smilestore.js'
   const store = useSmileStore()
   console.log('Store loaded:', store)
   console.log('isKnownUser:', store.isKnownUser)
   </script>
   <template><h1>Hello World</h1></template>
   ```

**What was done**: Copied `smilestore.js`, registered Pinia in the module, and removed the temporary stub from `log.js`. This resolves the circular dependency — both stores can now import each other.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000`
2. Open browser DevTools → Console
   - Look for `Store loaded:` followed by the store object
   - Look for `isKnownUser:` — should show `false` for a fresh session
3. Test reactivity: In the Console, run `document.querySelector(...)` or use Vue DevTools to modify a store value — the page should update
4. Test persistence: Refresh the page — if localStorage is working, the store state should survive the reload
5. Open DevTools → Application → Local Storage → look for an entry from the smile store
6. Check Console for any warnings about circular imports — there should be none

**VERIFY**:
- [ ] `useSmileStore()` instantiates without errors
- [ ] Store state is reactive (change a value, see it update)
- [ ] `useLogStore()` instantiates without errors (circular dep resolved)
- [ ] localStorage persistence works (reload page, state persists)
- [ ] No console warnings about circular imports

---

**Playground state after Phase C**: The playground should demonstrate the Pinia store working — show a reactive counter or state value on the page, persist it to localStorage, and prove it survives a page refresh. This is the first "real" interactive demo.

---

### Phase D: Copy Stepper (Dependency Level 2)

#### Step 10: Copy Stepper.js

**Goal**: Full Stepper class works (depends on StepState, StepperProxy, Serializer from Step 6, plus config and log from Steps 3/7).

1. **COPY** `src/core/stepper/Stepper.js` → `runtime/core/stepper/Stepper.js`
2. **COPY** `tests/vitest/core/stepper/Stepper.test.js` → `test/core/stepper/Stepper.test.js`
3. Update `@/` imports to relative paths (both source and test files)
3. Test in playground:

   ```vue
   <script setup>
   import Stepper from '../src/runtime/core/stepper/Stepper.js'
   const s = new Stepper({ id: '/', parent: null, data: {} })
   s.append([{ stimulus: 'A' }, { stimulus: 'B' }, { stimulus: 'C' }])
   console.log('Stepper length:', s.length)  // should be 3
   console.log('First step data:', s.data)
   </script>
   <template><h1>Hello World</h1></template>
   ```

**What was done**: Copied `Stepper.js` and its test file. This is the class that manages step-by-step navigation within a single view (e.g., a multi-trial task). It depends on StepState, StepperProxy, Serializer (Step 6), config (Step 3), and log (Step 7).

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000`
2. Open browser DevTools → Console
3. Look for `Stepper length: 3` — confirms `append()` worked with 3 items
4. Look for `First step data:` — should show `{ stimulus: 'A' }`
5. Interact further in the console: try `s.next()` and check that the stepper advances (the step index increments)
6. Try `s.shuffle()` — should not throw an error

**VERIFY**:
- [ ] Stepper instantiates without errors
- [ ] `append()` adds steps correctly
- [ ] `next()` advances to next step
- [ ] `shuffle()` works without errors
- [ ] Step data is accessible

---

**Playground state after Phase D**: The playground should show a Stepper demo — create a stepper with a few steps, display the current step, and provide next/prev buttons. This demonstrates the Stepper class working end-to-end.

---

### Phase E: Copy Composables (Dependency Levels 3–5)

Each composable is added one at a time, in dependency order.

#### Step 11: Copy useTimeline.js composable

**Goal**: Timeline navigation composable works.

1. **COPY** `src/core/composables/useTimeline.js` → `runtime/composables/useTimeline.js`
2. **COPY** `tests/vitest/core/composables/useTimeline.test.js` → `test/core/composables/useTimeline.test.js`
3. Update imports:
   - `@/core/stores/smilestore` → relative path
   - `@/core/stores/log` → relative path
   - `router.push()` → `navigateTo()`
3. **Do NOT register as auto-import yet** — test with explicit import first

**What was done**: Copied `useTimeline.js` composable and its test file. Updated imports to use relative paths and replaced `router.push()` with `navigateTo()`. Not yet registered as an auto-import — using explicit import for now.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000`
2. Open browser DevTools → Console
3. Confirm no import errors related to `useTimeline`
4. If the playground snippet calls `useTimeline()`, expand the returned object in console — look for methods `nextView()`, `prevView()`, `goToView()`

**VERIFY**:
- [ ] File imports without errors
- [ ] Functions like `nextView()`, `prevView()`, `goToView()` exist on the returned object

#### Step 12: Copy useStepper.js composable

**Goal**: Per-view stepper management composable works.

1. **COPY** `src/core/composables/useStepper.js` → `runtime/composables/useStepper.js`
2. **COPY** `tests/vitest/core/composables/useStepper.test.js` → `test/core/composables/useStepper.test.js`
3. Update imports:
   - `@/core/stepper/Stepper` → relative path
   - `@/core/stores/smilestore` → relative path
   - `@/core/stores/log` → relative path

**What was done**: Copied `useStepper.js` composable and its test file. This composable manages per-view stepper instances (for multi-trial tasks within a single route).

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000`
2. Open browser DevTools → Console — confirm no import resolution errors
3. If the playground snippet calls `useStepper('test')`, confirm it returns an object without throwing

**VERIFY**:
- [ ] File imports without errors
- [ ] Can create a stepper for a named view

#### Step 13: Copy useAPI.js composable

**Goal**: Main API composable works.

1. **COPY** `src/core/composables/useAPI.js` → `runtime/composables/useAPI.js`
2. **COPY** `tests/vitest/core/composables/useAPI.test.js` → `test/core/composables/useAPI.test.js`
3. Update imports:
   - `@/core/stores/smilestore` → relative path
   - `@/core/stores/log` → relative path
   - `@/core/composables/useTimeline` → relative path
   - `@/core/utils/randomization` → relative path
   - `import.meta.env.VITE_*` → `useRuntimeConfig().public.*`
   - `router.push()` → `navigateTo()`
   - Timeline access → `useNuxtApp().$timeline`

**What was done**: Copied `useAPI.js` composable and its test file. This is the main API composable researchers interact with. Updated `import.meta.env.VITE_*` → `useRuntimeConfig().public.*`, `router.push()` → `navigateTo()`, and Timeline access → `useNuxtApp().$timeline`.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000`
2. Open browser DevTools → Console
3. Confirm no import resolution errors — the file should load even though `$timeline` isn't provided yet (it's provided in Phase F)
4. If calling `useAPI()`, it may partially fail because the timeline plugin isn't set up yet — that's OK at this stage, just confirm the import itself works

**VERIFY**:
- [ ] File imports without errors
- [ ] `SmileAPI` class can be instantiated (even if not all methods work yet — timeline isn't provided yet)

#### Step 14: Copy useViewAPI.js composable

**Goal**: View-specific API composable works. This is the top of the composable dependency chain.

1. **COPY** `src/core/composables/useViewAPI.js` → `runtime/composables/useViewAPI.js`
2. **COPY** `tests/vitest/core/composables/useViewAPI.test.js` → `test/core/composables/useViewAPI.test.js`
3. **COPY** `tests/vitest/core/composables/useViewAPI.dev.test.js` → `test/core/composables/useViewAPI.dev.test.js`
4. Update imports:
   - `@/core/composables/useAPI` → relative path
   - `@/core/stores/smilestore` → relative path
   - `@/core/composables/useStepper` → relative path
   - `@/core/composables/useTimeline` → relative path
   - `@/core/stores/log` → relative path
   - `@/core/config` → relative path

**What was done**: Copied `useViewAPI.js` (the top of the composable dependency chain) and its test files. This composable extends `useAPI` with per-view stepper management.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000`
2. Open browser DevTools → Console — confirm no import resolution errors
3. Like Step 13, full functionality requires the timeline plugin (Phase F), but the file should import and parse without errors

**VERIFY**:
- [ ] File imports without errors
- [ ] `useViewAPI()` returns an object that extends useAPI's shape (has stepper methods)

#### Step 15: Register composables as auto-imports

**Goal**: All composables work via Nuxt auto-import (no explicit import needed).

1. Add to `src/module.ts`:

   ```typescript
   addImports([
     { name: 'useAPI', from: resolver.resolve('./runtime/composables/useAPI.js') },
     { name: 'useViewAPI', from: resolver.resolve('./runtime/composables/useViewAPI.js') },
     { name: 'useStepper', from: resolver.resolve('./runtime/composables/useStepper.js') },
     { name: 'useTimeline', from: resolver.resolve('./runtime/composables/useTimeline.js') },
     { name: 'useSmileStore', from: resolver.resolve('./runtime/stores/smilestore.js') },
   ])
   ```

2. Test in playground — remove all explicit imports, use auto-imported names:

   ```vue
   <script setup>
   const store = useSmileStore()  // no import needed
   console.log('Auto-imported store:', store)
   </script>
   <template><h1>Hello World</h1></template>
   ```

**What was done**: Registered all composables and `useSmileStore` as Nuxt auto-imports via `addImports()` in `module.ts`. Removed explicit imports from the playground to confirm auto-import works.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000`
2. Open browser DevTools → Console
   - Look for `Auto-imported store:` with the store object — proves `useSmileStore()` resolved without an import statement
   - No `ReferenceError: useSmileStore is not defined` or similar errors
3. Open Nuxt DevTools → Imports tab (or Components tab) — the registered auto-imports should appear in the list
4. Try removing any remaining explicit `import` lines in playground and confirm the composable names still resolve

**VERIFY**:
- [ ] `useSmileStore()` works without explicit import
- [ ] `useAPI()` works without explicit import (may partially fail if timeline not provided yet — that's OK)
- [ ] No "not defined" errors for any composable name
- [ ] Nuxt DevTools shows the auto-imports

---

**Playground state after Phase E**: The playground should use the auto-imported composables (`useSmileStore()`, `useAPI()`, etc.) without any explicit imports. The page should display some store state and demonstrate that the composable API shape is correct. This proves auto-imports work.

---

### Phase F: Routing (The Architecture Gate)

This is the highest-risk phase. Each sub-step introduces one routing concept, verified independently.

#### Step 16: Create Timeline plugin (provide timeline to app)

**Goal**: Timeline is initialized from a design file and provided to the app via `useNuxtApp().$timeline`.

1. Create `playground/design.js` with a **trivial 2-page timeline** (not 3 yet — start minimal):

   ```javascript
   import { defineComponent, h } from 'vue'
   import Timeline from '../src/runtime/core/timeline/Timeline.js'

   const Page1 = defineComponent({
     setup() { return () => h('div', 'Page 1 - Welcome') }
   })
   const Page2 = defineComponent({
     setup() { return () => h('div', 'Page 2 - Done') }
   })

   export default function createTimeline() {
     const timeline = new Timeline()

     timeline.pushSeqView({
       path: '/',
       name: 'welcome_anonymous',
       component: Page1,
       meta: { allowAlways: true, requiresConsent: false },
     })

     timeline.pushSeqView({
       path: '/done',
       name: 'done',
       component: Page2,
       meta: { requiresConsent: false },
     })

     timeline.build()
     return timeline
   }
   ```

2. Create `runtime/plugins/timeline.client.js`:

   ```javascript
   export default defineNuxtPlugin((nuxtApp) => {
     // Import design from the user's project
     // The actual import path will be configured via module options
     const createTimeline = require('~/design.js').default
     const timeline = createTimeline()
     return {
       provide: { timeline }
     }
   })
   ```

3. Register plugin in `src/module.ts`:

   ```typescript
   addPlugin({
     src: resolver.resolve('./runtime/plugins/timeline.client'),
     mode: 'client'
   })
   ```

4. Test in playground — access the provided timeline:

   ```vue
   <script setup>
   const { $timeline } = useNuxtApp()
   console.log('Timeline provided:', $timeline)
   console.log('Routes:', $timeline.routes)
   console.log('View for /:', $timeline.getViewForPath('/'))
   </script>
   <template><h1>Hello World</h1></template>
   ```

**What was done**: Created the Timeline plugin (`timeline.client.js`) which reads the researcher's `design.js`, builds the timeline, and provides it to the app as `$timeline`. Created a trivial 2-page `playground/design.js` for testing.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000`
2. Open browser DevTools → Console
   - Look for `Timeline provided:` — should show the Timeline instance
   - Look for `Routes:` — should show an array with 2 entries
   - Look for `View for /:` — should show the Page1 component config object (not null)
3. In the Console, manually test:
   - `useNuxtApp().$timeline.getViewForPath('/done')` — should return the Page2 config
   - `useNuxtApp().$timeline.seqtimeline[0].meta.next` — should be `'done'`
4. If any of these return `undefined` or `null`, the design file or plugin wiring is wrong

**VERIFY**:
- [ ] Plugin loads without errors
- [ ] `$timeline` is accessible via `useNuxtApp()`
- [ ] `$timeline.routes` has 2 entries
- [ ] `$timeline.getViewForPath('/')` returns the Page1 component config
- [ ] `$timeline.getViewForPath('/done')` returns the Page2 component config
- [ ] `$timeline.seqtimeline[0].meta.next` === `'done'` (buildGraph worked)

#### Step 17: Create catch-all page (render components from Timeline)

**Goal**: The catch-all page renders the correct component for the current URL path. **No middleware yet** — just component resolution.

1. Create `runtime/pages/[...slug].vue`:

   ```vue
   <script setup>
   const route = useRoute()
   const { $timeline } = useNuxtApp()

   const currentView = computed(() => {
     return $timeline.getViewForPath(route.path)
   })
   </script>

   <template>
     <div v-if="currentView">
       <component :is="currentView.component" v-bind="currentView.props" />
     </div>
     <div v-else>
       <p>No view found for: {{ route.path }}</p>
     </div>
   </template>
   ```

2. Register the page in `src/module.ts` via `extendPages` (or let Nuxt auto-discover from runtime/pages/).

**What was done**: Created the catch-all page `[...slug].vue` that resolves components from the Timeline at runtime using `$timeline.getViewForPath(path)`. No middleware yet — just dynamic component rendering.

**How to test**:

1. Run `pnpm run dev`
2. Open `http://localhost:3000/` — should show "Page 1 - Welcome"
3. Open `http://localhost:3000/done` — should show "Page 2 - Done"
4. Open `http://localhost:3000/nonexistent` — should show "No view found for: /nonexistent" (the fallback)
5. Right-click → Inspect on the page content to confirm the `<component :is>` rendered the correct inline component (not a wrapper or error boundary)
6. At this point, you CAN freely jump between `/` and `/done` by typing URLs — that's expected (guards come next)

**VERIFY**:
- [ ] Navigating to `http://localhost:3000/` shows "Page 1 - Welcome"
- [ ] Navigating to `http://localhost:3000/done` shows "Page 2 - Done"
- [ ] Navigating to `http://localhost:3000/nonexistent` shows "No view found for: /nonexistent"
- [ ] No crashes, no blank pages
- [ ] The dynamic `<component :is>` pattern resolves the correct component

> **Important**: At this point, there are NO navigation guards. Users can freely jump between `/` and `/done` by typing URLs. That's expected — we add guards in the next step.

#### Step 18: Create global middleware (navigation guards)

**Goal**: Port the `beforeEach` guard logic so sequential ordering is enforced. Start with a **minimal subset** of the guards, not the full 230-line file.

1. Create `runtime/middleware/timeline.global.js` with **only these guards** (the minimum needed to enforce ordering):

   ```javascript
   export default defineNuxtRouteMiddleware((to, from) => {
     const { $timeline } = useNuxtApp()

     // Guard 1: Allow-always routes bypass all checks
     if (to.meta.allowAlways) {
       return
     }

     // Guard 2: Sequential route validation
     // If the target is not the expected next route, block it
     if (from.meta.next && to.name !== from.meta.next) {
       // Redirect to the expected next route
       return navigateTo({ name: from.meta.next })
     }
   })
   ```

2. Register in `src/module.ts`:

   ```typescript
   addRouteMiddleware({
     name: 'smile-timeline',
     path: resolver.resolve('./runtime/middleware/timeline.global'),
     global: true,
   })
   ```

3. Add a "Next" button to the trivial Page1 component so you can test forward navigation:

   ```javascript
   const Page1 = defineComponent({
     setup() {
       return () => h('div', [
         h('p', 'Page 1 - Welcome'),
         h('button', { onClick: () => navigateTo('/done') }, 'Next'),
       ])
     }
   })
   ```

**What was done**: Created the global middleware (`timeline.global.js`) with a minimal subset of guards: allow-always bypass and sequential route validation. Added a "Next" button to Page1 for testing forward navigation.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000/`
2. **Test forward navigation**: Click the "Next" button on Page 1
   - Should navigate to `/done` and show "Page 2 - Done" — this is the expected next route, so it's allowed
3. **Test skip prevention**: Go back to `http://localhost:3000/`, then manually type `http://localhost:3000/done` in the address bar
   - Should be **blocked** — the page should redirect back to `/` (or stay on `/`)
4. **Test allow-always**: Page 1 has `allowAlways: true`, so navigating to `/` should always work regardless of state
5. Open browser DevTools → Console — look for middleware log messages on each navigation (confirm the guard runs)

**VERIFY**:
- [ ] Clicking "Next" on Page 1 navigates to `/done` (Page 2) — **allowed** (it's the expected next)
- [ ] Manually typing `http://localhost:3000/done` while on `/` — **blocked** (redirects back to `/`)
- [ ] Page 1 (allowAlways: true) is always accessible
- [ ] The middleware runs on every navigation (add a console.log to confirm)

#### Step 19: Expand middleware to full guard logic

**Goal**: Port the remaining guard logic from `src/core/router.js` into the middleware. Do this incrementally — add one guard at a time and test.

1. **COPY** `tests/vitest/core/router.test.js` → `test/core/router.test.js` (the existing router tests will need adaptation to test middleware instead, but copy first as reference)
2. **COPY** the full `beforeEach` logic from `src/core/router.js` (lines 26–255) into `runtime/middleware/timeline.global.js`
2. Mechanical translations:
   - `next(to)` → `return navigateTo(to)`
   - `next(false)` → `return abortNavigation()`
   - `next()` → `return` (allow navigation)
   - `api.store` → `useSmileStore()`
   - `api.isResetApp()` → `store.isResetApp` (or equivalent)
3. Add guards in this order, testing after each one:
   a. Reset app check
   b. Consent state management (`setConsented`, `setDone` on leaving)
   c. Force navigate flag
   d. Consent requirement (`requiresConsent`)
   e. Done requirement (`requiresDone`)
   f. Known user out-of-order block
   g. Withdraw state
   h. Development/presentation mode overrides

**What was done**: Ported the full `beforeEach` guard logic from `src/core/router.js` (lines 26-255) into the Nuxt middleware, one guard at a time. Mechanical translations: `next(to)` → `return navigateTo(to)`, `next(false)` → `return abortNavigation()`, `next()` → `return`.

**How to test** (repeat after adding each guard):

1. Run `pnpm run dev` and open `http://localhost:3000/`
2. After adding **reset check**: Clear localStorage, reload — should start fresh at `/`
3. After adding **consent gate**: Try navigating past consent without agreeing — should be blocked
4. After adding **force navigate**: In Console, set the force navigate flag and try jumping — should be allowed
5. After adding **done requirement**: Try accessing the final route before completing the flow — should be blocked
6. After adding **known user block**: Complete the flow, then try going back to an earlier page — should redirect to correct page
7. After adding **withdraw state**: Set withdraw state in Console, try navigating — should redirect to withdraw page
8. After adding **dev/presentation overrides**: Navigate to `/dev/...` — guards should be relaxed
9. After each guard, also re-test the basic 2-page forward flow to confirm no regressions

**VERIFY after each guard**:
- [ ] The newly added guard works correctly
- [ ] Previously working guards still work
- [ ] No regressions in the 2-page flow

#### Step 20: Expand test timeline to full prototype

**Goal**: Test the complete routing with a more realistic flow.

1. Update `playground/design.js` to a **5-page timeline** that exercises more guards:

   ```javascript
   // welcome (allowAlways) → consent (setConsented) → task → debrief → thanks (setDone)
   ```

2. Add trivial inline components for each (just text + Next button)

**What was done**: Expanded the playground timeline from 2 trivial pages to a realistic 5-page flow: welcome → consent → task → debrief → thanks. This exercises all the guards added in Steps 18-19.

**How to test** (this is the most thorough manual test in the entire migration):

1. Run `pnpm run dev` and open `http://localhost:3000/`
2. **Happy path**: Click through all 5 pages in order (welcome → consent → task → debrief → thanks) — each "Next" button should advance correctly
3. **Skip prevention**: From `/consent`, type `http://localhost:3000/thanks` in the address bar — should redirect back to `/consent` (or the current expected page)
4. **Back prevention**: After reaching `/task`, type `http://localhost:3000/` — should redirect forward to `/task` (can't go backwards)
5. **Consent gate**: Clear localStorage, reload, try navigating directly to `/task` — should be blocked (consent not given)
6. **Done gate**: Complete the full flow to `/thanks` — check that the "done" state is set (look in localStorage or Console)
7. **Force navigate**: In Console, set the force navigate flag, then try jumping to any page — should succeed
8. **Refresh resilience**: Navigate to `/task`, then refresh the browser — should resume at `/task` (not restart at `/`)
9. Open DevTools → Application → Local Storage — confirm the `lastRoute` or equivalent key is being updated on each navigation

**VERIFY**:
- [ ] Full 5-page sequential flow works (welcome → consent → task → debrief → thanks)
- [ ] Cannot skip ahead (typing `/thanks` from `/consent` is blocked)
- [ ] Cannot go backwards to already-completed pages (if applicable)
- [ ] Consent gate works: cannot reach `/task` without passing through `/consent`
- [ ] Done gate works: `/thanks` sets done state correctly
- [ ] `forceNavigate` flag allows jumping (test programmatically)
- [ ] Refresh mid-experiment resumes at correct page (if lastRoute persistence works)

> **This is the architecture validation gate.** If all checks pass, the catch-all route + middleware approach is confirmed working. Everything after this is just copying real components into this proven architecture.

**Playground state after Phase F**: A complete 5-page flow using trivial inline components: welcome → consent → task → debrief → thanks. Sequential ordering enforced by middleware, consent gating works, "Next" buttons navigate through the flow. This is the most important milestone — it proves the entire routing architecture works before any real SMILE components are involved.

---

### Phase G: Layouts & Mode Routes

#### Step 21: Create experiment layout

**Goal**: Production routes use a minimal layout wrapper.

1. Create `runtime/layouts/experiment.vue`:

   ```vue
   <template>
     <div class="experiment-container">
       <slot />
     </div>
   </template>
   ```

2. Update `runtime/pages/[...slug].vue` to use this layout:

   ```vue
   <template>
     <NuxtLayout name="experiment">
       <component v-if="currentView" :is="currentView.component" />
     </NuxtLayout>
   </template>
   ```

3. Register in `src/module.ts`:

   ```typescript
   addLayout({ name: 'experiment', src: resolver.resolve('./runtime/layouts/experiment.vue') })
   ```

**What was done**: Created the `experiment` layout wrapper and updated the catch-all page to use it. This wraps all experiment content in a styled container div.

**How to test**:

1. Run `pnpm run dev` and click through the 5-page flow — everything should work exactly as before
2. Right-click → Inspect on the page content — you should see a `<div class="experiment-container">` wrapping the view content (this is the layout)
3. Confirm no visual changes — the layout is a transparent wrapper at this point

**VERIFY**:
- [ ] Existing 5-page flow still works identically
- [ ] Layout wrapper div is visible in DOM inspector
- [ ] No visual regressions

#### Step 22: Add /dev/ mode route

**Goal**: `/dev/` prefix renders the same experiment content with a different layout.

1. Create `runtime/layouts/development.vue` (minimal for now — just a placeholder div with a "DEV MODE" header):

   ```vue
   <template>
     <div class="dev-mode">
       <div style="background: yellow; padding: 4px; text-align: center;">DEV MODE</div>
       <slot />
     </div>
   </template>
   ```

2. Create `runtime/pages/dev/[...slug].vue`:

   ```vue
   <script setup>
   const route = useRoute()
   const { $timeline } = useNuxtApp()
   const experimentPath = computed(() => route.path.replace(/^\/dev/, '') || '/')
   const currentView = computed(() => $timeline.getViewForPath(experimentPath.value))
   </script>

   <template>
     <NuxtLayout name="development">
       <component v-if="currentView" :is="currentView.component" />
       <div v-else>No view for: {{ experimentPath }}</div>
     </NuxtLayout>
   </template>
   ```

3. Register via `extendPages` in module

**What was done**: Created the `/dev/` mode route and layout. The dev layout adds a visible "DEV MODE" header. A new catch-all page at `dev/[...slug].vue` strips the `/dev` prefix and resolves from the same timeline.

**How to test**:

1. Run `pnpm run dev`
2. Open `http://localhost:3000/dev/` — should show Page 1 with a yellow "DEV MODE" header bar at the top
3. Open `http://localhost:3000/dev/consent` — should show the consent page with the dev header
4. Click "Next" from `/dev/` — the URL should stay in the `/dev/` prefix (e.g., `/dev/consent`, not `/consent`)
5. Open `http://localhost:3000/` (no `/dev/`) — should show the normal experiment without the yellow header
6. Confirm both modes are independent — navigating in one doesn't affect the other

**VERIFY**:
- [ ] `/dev/` shows Page 1 with yellow "DEV MODE" header
- [ ] `/dev/consent` shows consent page with dev layout
- [ ] Navigation within `/dev/` stays in dev prefix
- [ ] Production routes (`/`, `/consent`, etc.) still work normally without dev header

#### Step 23: Add /presentation/ mode route

**Goal**: Same as Step 22 but for presentation mode.

1. Create `runtime/layouts/presentation.vue` (placeholder with "PRESENTATION MODE" header)
2. Create `runtime/pages/presentation/[...slug].vue` (same pattern as dev, strip `/presentation` prefix)
3. Register via `extendPages`

**What was done**: Added `/presentation/` mode, following the same pattern as `/dev/`. A "PRESENTATION MODE" header is shown, and the route strips the prefix before resolving from the timeline.

**How to test**:

1. Run `pnpm run dev`
2. Open `http://localhost:3000/presentation/` — should show Page 1 with a "PRESENTATION MODE" header
3. Click through the flow under `/presentation/` — navigation should stay in the prefix
4. Open `http://localhost:3000/` — normal mode, no header
5. Open `http://localhost:3000/dev/` — dev mode with yellow header
6. All three modes should work independently — test the full 5-page flow in each one

**VERIFY**:
- [ ] `/presentation/` shows experiment with presentation header
- [ ] All three modes (`/`, `/dev/`, `/presentation/`) work independently
- [ ] The 5-page flow works in all three modes

---

### Phase H: Copy Real Components (One at a Time)

Routing is proven. Now replace trivial inline components with real SMILE components. Copy **one component at a time**, verify it renders, then move to the next. The order below starts with the simplest component and works up to the most complex.

#### Step 24: Set up Tailwind CSS

**Goal**: Styles will work when real components are copied.

1. Install and configure `@nuxtjs/tailwindcss` in the module
2. Copy any existing Tailwind config, CSS files, or theme configuration

**What was done**: Installed and configured `@nuxtjs/tailwindcss` in the module so that all subsequent component copies will have their styles work.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000/`
2. Add `class="text-red-500 text-2xl font-bold"` to a test element in the playground
3. The text should appear red, large, and bold — confirming Tailwind is processing classes
4. Open browser DevTools → Console — no style-related errors or warnings
5. Check that any existing Tailwind config or CSS variables from the original project are carried over

**VERIFY**:
- [ ] Tailwind classes work in playground (add `class="text-red-500"` to a test element)
- [ ] No style-related errors in console

#### Step 25: Copy UI kit components (foundation layer)

**Goal**: The UI primitives (Button, Card, Input, etc.) that built-in views depend on.

1. **COPY** all files from `src/uikit/` → `runtime/components/ui/`
2. Update internal import paths between UI components
3. Register with `Smile` prefix in module
4. Test one UI component in playground:

   ```vue
   <template>
     <SmileButton>Test Button</SmileButton>
   </template>
   ```

**What was done**: Copied all UI kit components (Button, Card, Input, etc.) from `src/uikit/` into the module and registered them with a `Smile` prefix for auto-import.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000/`
2. The playground should render a `<SmileButton>Test Button</SmileButton>` — confirm it appears with correct styling (not a plain unstyled button)
3. Try a few more UI components in the playground template (e.g., `<SmileCard>`, `<SmileInput>`) — they should render without errors
4. Open browser DevTools → Console — no missing dependency or unresolved component warnings

**VERIFY**:
- [ ] `SmileButton` renders with correct styling
- [ ] Other UI components render without errors
- [ ] No missing dependency errors

#### Step 26: Copy first built-in view — WelcomeView

**Goal**: One real SMILE component works in the catch-all route system.

1. **COPY** `src/builtins/advertisement/WelcomeView.vue` → `runtime/components/builtins/WelcomeView.vue`
2. **COPY** `tests/vitest/builtins/advertisement/AdvertisementView.test.js` → `test/builtins/advertisement/AdvertisementView.test.js`
3. Update import paths, replace explicit imports with auto-imports
4. Register in module with `priority: -1` (overridable)
5. Update `playground/design.js` to use `WelcomeView` for the welcome route (replace the trivial inline Page1)

**What was done**: Copied the real `WelcomeView.vue` component and its test file. Replaced the trivial inline Page1 in `design.js` with the real component. This is the first real SMILE component in the catch-all route system.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000/`
2. You should now see the real WelcomeView with proper styling (not the plain "Page 1 - Welcome" text)
3. Click the continue/Next button — should navigate to the next route (consent)
4. Confirm pages 2-5 still work (they'll still be trivial inline components — that's expected)
5. Compare the appearance to the current production WelcomeView to check for style differences

**VERIFY**:
- [ ] WelcomeView renders at `/` with correct styling
- [ ] The "Next" / continue button works and navigates to the next route
- [ ] Rest of the 5-page flow still works (pages 2-5 are still trivial inline components — that's fine)

#### Step 27: Copy ConsentView

1. **COPY** `src/builtins/informedConsent/ConsentView.vue` → `runtime/components/builtins/ConsentView.vue`
2. Update imports, register in module
3. Update `playground/design.js` to use ConsentView for consent route

**What was done**: Copied the real `ConsentView.vue`, registered it in the module, and wired it into the playground timeline. This is the first component that interacts with the consent guard.

**How to test**:

1. Run `pnpm run dev`, navigate through to `/consent`
2. The real ConsentView should render with a consent form, checkbox, and continue button
3. Try clicking "Continue" without checking the consent box — should be blocked or show a warning
4. Check the consent box and click "Continue" — should navigate to the next route
5. Try navigating directly to the post-consent route without consenting (clear localStorage, go to `/task`) — the consent guard should block it
6. After consenting, post-consent routes should be accessible

**VERIFY**:
- [ ] ConsentView renders with correct styling
- [ ] Consent checkbox and continue button work
- [ ] `setConsented` meta flag triggers correctly when leaving consent
- [ ] Post-consent routes are now accessible

#### Step 28–33: Copy remaining built-in views (one at a time)

Repeat the pattern for each remaining built-in view. Copy one, register it, update design.js, verify it works:

- **Step 28**: DemographicsView
- **Step 29**: InstructionsView / InstructionsQuizView
- **Step 30**: DebriefView
- **Step 31**: ThanksView
- **Step 32**: WithdrawView
- **Step 33**: WindowSizerView, TaskFeedbackView, and any remaining views

**What was done**: Copied each remaining built-in view one at a time, replacing the corresponding trivial inline component in the playground timeline.

**How to test** (repeat for each component):

1. Run `pnpm run dev` and navigate to the route that uses the newly copied component
2. Confirm the real component renders with proper styling (not the trivial placeholder text)
3. Test interactive elements: fill out forms, click buttons, check that navigation advances correctly
4. Run through the full flow end-to-end (welcome → ... → thanks) after each addition to catch any regressions
5. Compare the appearance to the current production version of each view

**VERIFY after each**:
- [ ] Component renders without errors
- [ ] Interactive elements work (forms, buttons, navigation)
- [ ] Routing flow still works end-to-end with the newly added real component

---

### Phase I: Dev Tools Components

#### Step 34: Copy DevToolbar

1. **COPY** `src/dev/developer_mode/DevToolbar.vue` → `runtime/components/dev/DevToolbar.vue`
2. Update imports, register in module
3. Add to `development.vue` layout (replace the yellow placeholder header)

**What was done**: Copied the real `DevToolbar.vue` component and added it to the development layout, replacing the yellow placeholder header.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000/dev/`
2. The yellow "DEV MODE" placeholder should be replaced by the real DevToolbar with actual controls
3. Check that toolbar buttons/controls render and are interactive
4. Navigate through the flow under `/dev/` — toolbar should persist across pages

**VERIFY**:
- [ ] `/dev/` shows the real DevToolbar
- [ ] Toolbar renders without errors

#### Step 35: Copy Sidebar

1. **COPY** `src/dev/developer_mode/Sidebar.vue` → `runtime/components/dev/Sidebar.vue`
2. Update imports, register, add to development layout

**What was done**: Copied `Sidebar.vue` and added it to the development layout. The sidebar shows a list of all timeline routes and allows jumping between them.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000/dev/`
2. The sidebar should appear (usually on the left or right side) showing all route names from the timeline
3. Click on a route name in the sidebar — it should navigate to that route (using `forceNavigate` to bypass guards)
4. Confirm the sidebar updates to highlight the current route

**VERIFY**:
- [ ] Sidebar renders in `/dev/` mode
- [ ] Route list appears in sidebar
- [ ] Clicking a route in sidebar navigates (using `forceNavigate`)

#### Step 36: Copy ConsoleBar

1. **COPY** `src/dev/developer_mode/ConsoleBar.vue` → `runtime/components/dev/ConsoleBar.vue`
2. Update imports, register, add to development layout

**What was done**: Copied `ConsoleBar.vue` and added it to the development layout. This shows log messages from the log store at the bottom of the page.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000/dev/`
2. The console bar should appear at the bottom of the page
3. Navigate through the flow — log messages should appear in the console bar as events fire (navigation, store changes, etc.)
4. Check that the console bar is scrollable if there are many messages

**VERIFY**:
- [ ] Console bar renders at bottom of `/dev/` mode
- [ ] Log messages appear

#### Step 37: Copy PresentationNavBar

1. **COPY** `src/dev/presentation_mode/PresentationNavBar.vue` → `runtime/components/dev/PresentationNavBar.vue`
2. Update imports, register, add to presentation layout

**What was done**: Copied `PresentationNavBar.vue` and added it to the presentation layout, replacing the placeholder header.

**How to test**:

1. Run `pnpm run dev` and open `http://localhost:3000/presentation/`
2. The real presentation nav bar should appear with QR code, reset button, and navigation controls
3. Click the navigation controls (next/prev) — should move through the experiment flow
4. Click the reset button — should reset the experiment state
5. QR code should render (it encodes the current URL for audience members)

**VERIFY**:
- [ ] `/presentation/` shows real presentation nav bar
- [ ] QR code, reset button, navigation controls work

---

### Phase J: Firebase Integration

#### Step 38: Create Firebase plugin

**Goal**: Firebase initializes and provides auth + Firestore.

1. Create `runtime/plugins/firebase.client.js`
2. Copy initialization logic from current setup
3. Use `useRuntimeConfig()` for Firebase config values

**What was done**: Created the Firebase client plugin that initializes Firebase, Firestore, and anonymous auth using `useRuntimeConfig()` for config values.

**How to test** (requires Firebase emulators):

1. Start Firebase emulators: `firebase emulators:start` (in a separate terminal)
2. Run `pnpm run dev` and open `http://localhost:3000/`
3. Open browser DevTools → Console
   - Look for a Firebase initialization message (no errors)
   - Check that anonymous auth completes (look for a user UID in the console)
4. In the Console, run `useNuxtApp().$firebase` — should return the Firebase app instance
5. Run `useNuxtApp().$firestore` — should return the Firestore instance
6. Run `useNuxtApp().$auth` — should return the Auth instance with a `currentUser`

**VERIFY** (with Firebase emulators):
- [ ] Plugin loads without errors
- [ ] `$firebase`, `$firestore`, `$auth` are accessible via `useNuxtApp()`
- [ ] Anonymous auth succeeds

#### Step 39: Test Firestore data persistence

**Goal**: Store data syncs to Firestore.

1. No new files — just configure the playground to use Firebase emulators
2. Run through the experiment flow and check that data saves

**What was done**: No new files — configured the playground to connect to Firebase emulators and verified that the store syncs data to Firestore.

**How to test** (requires Firebase emulators running):

1. Run `pnpm run dev` and open `http://localhost:3000/`
2. Navigate through the first few pages of the experiment (welcome → consent → task)
3. Open the Firebase Emulator UI (usually `http://localhost:4000`) → Firestore tab
   - You should see a document created for this participant with experiment data
4. Refresh the browser page — the app should resume where you left off (returning user flow), loading data from Firestore
5. Check that private data (if any) is saved to a separate Firestore collection (not the main participant document)

**VERIFY**:
- [ ] Data saves to Firestore on page transitions
- [ ] Data loads on refresh (returning user flow)
- [ ] Private data saves to separate collection

---

### Phase K: Full Integration Test

#### Step 40: Full playground experiment

**Goal**: Complete experiment flow works end-to-end with all real components.

1. Update `playground/design.js` to a full realistic timeline:
   - Welcome → Consent → Demographics → Instructions → Task → Debrief → Thanks
   - Include a custom task component in `playground/components/`
   - Include randomization if applicable (`pushRandomizedNode`)

**What was done**: Updated the playground timeline to a full realistic experiment flow with all real components and a custom task component. This is the comprehensive integration test.

**How to test** (dedicate 15-20 minutes to thorough manual testing):

1. **Fresh user flow**: Clear localStorage + cookies, run `pnpm run dev`, open `http://localhost:3000/`
   - Click through the full flow: Welcome → Consent → Demographics → Instructions → Task → Debrief → Thanks
   - Every page should render with real styling and real interactive elements
2. **Guard enforcement**: At each step, try typing a future URL (e.g., `/thanks` from `/consent`) — should redirect back
3. **Consent gate**: Clear state, try jumping to `/demographics` — should be blocked until consent is given
4. **Data persistence (localStorage)**: Navigate to `/task`, refresh the page — should resume at `/task`
5. **Data persistence (Firebase)**: If emulators are running, check the Emulator UI for saved data after each page transition
6. **Dev mode**: Open `http://localhost:3000/dev/` — toolbar, sidebar, and console bar should all work. Click routes in sidebar to jump around
7. **Presentation mode**: Open `http://localhost:3000/presentation/` — nav bar should work, QR code should render
8. **Browser back button**: Navigate forward a few pages, then press the browser back button — should be handled gracefully (either blocked or redirected to current position)
9. **Returning user**: Complete the flow to Thanks, close the tab, reopen `http://localhost:3000/` — should show the correct page (not restart)
10. **Force navigate**: In dev mode, use the sidebar to jump directly to any page — should bypass guards

**VERIFY**:
- [ ] Full flow works: Welcome → ... → Thanks
- [ ] Sequential ordering enforced (can't skip ahead)
- [ ] Consent gating works
- [ ] Data persists to localStorage
- [ ] Data syncs to Firebase (if configured)
- [ ] Dev mode works with all tools (sidebar, console, toolbar)
- [ ] Presentation mode works with nav bar
- [ ] Refresh mid-experiment resumes at correct page
- [ ] Browser back button handled correctly
- [ ] `forceNavigate` works for dev mode route jumping
- [ ] Returning user sees correct page (not restart)

---

### Phase L: Testing Infrastructure

> **Note**: By this point, all test files have already been **copied** to `test/` alongside their source files during Phases B–I. This phase sets up the test runner and makes the copied tests actually pass.

#### Step 41: Set up Vitest with Nuxt and copy test setup

1. Create `vitest.config.ts` with `@nuxt/test-utils`
2. **COPY** `tests/vitest/setup/mocks.js` → `test/setup/mocks.js`
3. Update mock import paths (`@/` → relative paths to new module locations)
4. Replace `import.meta.env` mocks with `mockNuxtImport('useRuntimeConfig')` in mocks file
5. Run one trivial test to confirm the test runner works

**What was done**: Set up Vitest with `@nuxt/test-utils`, copied the test setup/mocks file, and confirmed the test runner works with a trivial test.

**How to test**:

1. Run `pnpm test` from the module directory (or `pnpm --filter @gureckislab/smile test`)
2. You should see Vitest start, load the Nuxt test environment, and pass at least one trivial test
3. If the test runner fails to start, check that `vitest.config.ts` is correctly configured and `@nuxt/test-utils` is installed
4. Check the terminal output for any warnings about mock setup — the mocks file should load cleanly

**VERIFY**:
- [ ] `pnpm test` runs and passes a trivial test
- [ ] Nuxt test environment loads

#### Step 42: Fix up and run unit tests (incrementally)

All test files were already copied during earlier phases. Now update their import paths and mocks to work with the new module structure. Work through one directory at a time:

1. Fix up and run tests one directory at a time:
   - First: `test/core/timeline/` (Timeline tests — simplest, no Vue deps)
   - Then: `test/core/utils/` (utility tests — pure functions)
   - Then: `test/core/stepper/` (Stepper tests)
   - Then: `test/core/stores/` (Store tests — need Pinia mock setup)
   - Then: `test/core/composables/` (Composable tests — most complex, need Nuxt mocks)
   - Then: `test/builtins/` (Component tests — need `mountSuspended`)
   - Then: `test/core/router.test.js` (needs adaptation from router guards → middleware)
2. For each directory:
   - Verify import paths point to new locations
   - Update mocks as needed (`import.meta.env` → `useRuntimeConfig`, etc.)
   - Replace `mount()` with `mountSuspended()` for async components
   - Run tests and fix failures

**What was done**: Updated import paths and mocks in all copied test files to work with the new module structure, one directory at a time. Replaced `mount()` with `mountSuspended()` for async components, and `import.meta.env` with `useRuntimeConfig` mocks.

**How to test** (repeat for each test directory):

1. Run `pnpm test -- test/core/timeline/` (or whichever directory you just fixed)
   - All tests in that directory should pass (green)
2. Run `pnpm test` (full suite) to check for regressions in previously-passing tests
3. If tests fail, read the error messages carefully:
   - `Cannot find module` → import path needs updating
   - `useRuntimeConfig is not defined` → mock is missing
   - `mount is not a function` → need to use `mountSuspended` from `@nuxt/test-utils`
4. After fixing all directories, run the full `pnpm test` one final time — everything should be green

**VERIFY after each directory**:
- [ ] Tests in that directory pass
- [ ] No regressions in previously-passing tests

#### Step 43: Set up E2E tests

1. Install Playwright: `pnpm add -D @playwright/test`
2. Create `playwright.config.ts`
3. Convert Cypress tests to Playwright (one test file at a time)

**What was done**: Set up Playwright for E2E tests and converted existing Cypress tests one at a time to Playwright syntax.

**How to test**:

1. Run `pnpm test:e2e` from the module directory
2. Playwright should launch a browser, run through the test scenarios, and report results
3. Compare coverage to the original Cypress tests — the same user flows should be covered
4. If tests fail, check the Playwright HTML report (usually generated in `playwright-report/`) for screenshots and traces

**VERIFY**:
- [ ] E2E tests pass
- [ ] Coverage similar to original

---

### Phase M: Build & Publish

> **Important: Runtime import paths must be resolved before publishing.**
>
> During development, the playground imports runtime files using relative paths
> (e.g., `../src/runtime/core/stepper/StepState.js`). This works locally but
> will **not** work for external consumers who install the package from npm.
> Before publishing, runtime files must be accessible via one of:
>
> 1. **Auto-imports** — composables and components registered via `addImports()`
>    and `addComponent()` in `module.ts` are auto-imported (no explicit import needed)
> 2. **Package `exports` map** — for files that need explicit imports (e.g.,
>    `Timeline`, `StepState`), add entries to the `exports` field in `package.json`:
>    ```json
>    "exports": {
>      ".": { "types": "./dist/types.d.mts", "import": "./dist/module.mjs" },
>      "./runtime/*": "./dist/runtime/*"
>    }
>    ```
> 3. **Nuxt aliases** — register aliases in `module.ts` so consumers can use
>    `#smile/timeline` style imports
>
> This should be addressed in Step 44 (module build) by verifying that
> `pnpm run build` produces a `dist/` that includes runtime files, and in
> Step 45 (fresh project test) by confirming imports resolve correctly.

#### Step 44: Module build

1. Configure `@nuxt/module-builder`
2. Run `pnpm run build` and verify dist/ output
3. **Verify runtime files are included in `dist/`** and accessible to consumers (see note above)

**What was done**: Configured `@nuxt/module-builder` and ran a production build of the module.

**How to test**:

1. Run `pnpm run build` from the module directory
2. The build should complete without errors — look for a success message in the terminal
3. Check `dist/` directory: it should contain `module.mjs`, `module.cjs`, and `types.d.ts`
4. Inspect the file sizes — they should be reasonable (not suspiciously large or empty)

**VERIFY**:
- [ ] Build completes without errors
- [ ] `dist/` contains module files

#### Step 45: Test installation in fresh project

1. Create a fresh Nuxt project outside the monorepo
2. Install the module from local path: `pnpm add ../packages/nuxt`
3. Create a minimal design.js and run the experiment

**What was done**: Created a fresh Nuxt project outside the monorepo, installed `@gureckislab/smile` from the local path, created a minimal `design.js`, and ran the experiment.

**How to test**:

1. Create a new directory outside the monorepo: `mkdir ~/test-smile-project && cd ~/test-smile-project`
2. Initialize a Nuxt project: `pnpm dlx nuxi@latest init .`
3. Install the module: `pnpm add ../path-to/packages/nuxt`
4. Add `@gureckislab/smile` to `nuxt.config.ts` modules
5. Create a minimal `design.js` with a 2-3 page timeline
6. Run `pnpm run dev` — the experiment should work just like it does in the playground
7. Confirm auto-imports work (`useSmileStore()`, `useAPI()`, etc. — no explicit imports needed)
8. Confirm SMILE components are available (`<SmileButton>`, built-in views, etc.)
9. Delete the test project when done

**VERIFY**:
- [ ] Module installs without errors
- [ ] Fresh project can use SMILE components and composables
- [ ] Experiment flow works

---

### Phase N: TypeScript Conversion (Optional, Final)

#### Step 46+: Gradual TypeScript migration

**Goal**: Convert JavaScript to TypeScript **after everything works**. One file at a time.

1. Rename `.js` → `.ts` for one file
2. Add type annotations
3. Fix type errors
4. Verify no runtime regressions
5. Repeat for next file

**What was done**: Converted one JavaScript file to TypeScript — renamed, added type annotations, and fixed any type errors.

**How to test** (repeat for each file converted):

1. Run `pnpm run dev` — playground should still work identically (no runtime regressions)
2. Run `pnpm test` — all tests should still pass
3. Run `npx tsc --noEmit` (or `pnpm run typecheck` if configured) — no new type errors
4. Check that other files importing the converted file still work (import paths may change from `.js` to `.ts`)

**Note**: This phase is optional and can be done gradually over weeks/months. The module works fine with JavaScript.

---

## Risk Assessment

### High Risk Areas

1. **Catch-all Route + Timeline Resolution**: The catch-all `[...slug].vue` page resolving components from the Timeline is the single most critical piece. If `getViewForPath()` or the dynamic `<component :is>` pattern has issues, everything breaks. **Mitigated by Phase F (Steps 16–20)** — validated with trivial components before any real code is copied.
2. **Navigation Guard Migration**: The `beforeEach` guard has ~230 lines of complex conditional logic with many edge cases. The port to `defineNuxtRouteMiddleware()` is mostly mechanical (`next()` → `return`, etc.) but ordering and behavior must be identical. **Mitigated by Steps 18–19** — guards are added one at a time and tested individually.
3. **Circular Dependency (log ↔ smilestore)**: These two stores import each other. **Mitigated by Steps 7–9** — both are copied together and tested as a pair.
4. **State Persistence**: localStorage + Firestore sync must work identically. **Mitigated by Step 9** (localStorage) and **Steps 38–39** (Firestore), each tested in isolation.
5. **Development Tools**: Complex UI components with many features. **Mitigated by Steps 34–37** — each dev tool component is copied and integrated independently.

### Mitigation Strategies

1. **One-thing-at-a-time steps**: Each of the 46 steps does exactly one thing and has explicit verification checkboxes. Problems are caught immediately, not after multiple changes have been stacked.
2. **Early routing validation (Phase F, Steps 16–20)**: The two highest-risk areas (catch-all routing + middleware) are validated with trivial inline components before committing to the bulk component copy. If the architecture doesn't work, you find out with ~5 steps of work invested, not 30.
3. **Incremental guard porting (Step 19)**: The middleware guards are added one at a time (reset check, consent, ordering, etc.) and tested individually, rather than porting all 230 lines at once.
4. **Commit after every step**: Small commits mean easy rollback to the last known-good state.
5. **Rollback Plan**: Original code is untouched throughout the migration — it remains fully functional.

### Breaking Changes to Document

1. Import paths change (affects user components)
2. Environment variable names (VITE_* → NUXT_PUBLIC_*)
3. design.js may need minor syntax updates
4. Some Vite-specific features may not have direct equivalents
5. `src/core/router.js` is **not copied** — it is replaced by the catch-all route + middleware pattern. The `createRouter()` call and `beforeEach`/`beforeResolve`/`afterEach` guards are ported into Nuxt-native equivalents. The Timeline class no longer provides a `routes` array to a router instance; instead, the catch-all page calls `timeline.getViewForPath()`.
6. `router.push()` calls in composables become `navigateTo()` — this is a mechanical find-and-replace but affects `useTimeline`, `useAPI`, and any user code that calls `router.push()` directly

---

## Success Criteria

1. All existing experiments run without modification (or minimal changes)
2. Development mode works with all features
3. Presentation mode works
4. All tests pass
5. Firebase integration works (dev + production)
6. Recruitment service integration works
7. Build and deploy pipelines work
8. No performance regression
9. Documentation updated

---

## Future Enhancements (Post-Module Release)

### Near-term Improvements

1. **SSR Landing Pages**: Optimize recruitment landing pages for SEO
2. **Server-Side Data Validation**: Validate experiment data server-side
3. **API Routes for Integrations**: Direct integration with Prolific, MTurk APIs
4. **Edge Deployment**: Deploy to edge for global low-latency
5. **Incremental Static Generation**: Pre-render static content
6. **Real-time Features**: Server-sent events for live monitoring

### npm Publishing

Once the module is stable, publish to npm:

```bash
# From packages/nuxt
pnpm run build
npm publish --access public
```

Researchers will then be able to:

```bash
# Check for updates
pnpm outdated @gureckislab/smile

# Update to latest
pnpm update @gureckislab/smile

# Install specific version
pnpm add @gureckislab/smile@1.0.0
```

### Scaffolding CLI

Create `create-smile-experiment` for easy project setup:

```bash
pnpm create smile-experiment

# Prompts:
# ? Project name: my-cool-study
# ? Firebase project ID: my-cool-study-firebase
# ? Include example tasks? Yes
# ? Recruitment platforms: Prolific, MTurk

# Creates configured project ready to go
```

### Changelog-Driven Updates

Each SMILE release will include:

- New features
- Bug fixes
- Breaking changes (with migration guide)
- Deprecated features

This makes SMILE a proper framework (like Nuxt itself) rather than a template to fork.

---

## Summary: Migration Checklist

### Before Each Step

- [ ] Previous step is complete and all its VERIFY checkboxes pass
- [ ] No console errors, no blank pages, no regressions
- [ ] Changes from the previous step are committed

### During Each Step

- [ ] **Do exactly one thing** — don't combine multiple steps
- [ ] **COPY** files, don't rewrite them
- [ ] **COPY tests alongside source files** — if `src/core/foo.js` has `tests/vitest/core/foo.test.js`, copy both
- [ ] Keep `.js` extension (no TypeScript conversion)
- [ ] Only change what's strictly necessary:
  - Import paths (`@/` → relative paths)
  - Nuxt-specific wrappers (e.g., `defineNuxtPlugin`, `defineNuxtRouteMiddleware`)
  - Environment variable access (`useRuntimeConfig()`)
  - `router.push()` → `navigateTo()`
  - `next()`/`next(false)`/`next(to)` → `return`/`return abortNavigation()`/`return navigateTo(to)`
- [ ] Test immediately after copying each file
- [ ] Commit after each step passes verification

### After Each Step

- [ ] All VERIFY checkboxes for this step pass
- [ ] Previous steps' functionality still works (no regressions)
- [ ] Playground is in a working state

### Phase Overview (46 Steps)

| Phase | Steps | What it proves |
| --- | --- | --- |
| A: Bare Infrastructure | 1–2 | Nuxt module + playground work with zero SMILE code |
| B: Leaf Files | 3–6 | Config, Timeline, utils, stepper deps load in isolation |
| C: Stores | 7–9 | Pinia stores work, circular dep resolved, localStorage persists |
| D: Stepper | 10 | Full Stepper class works |
| E: Composables | 11–15 | Each composable works, auto-imports work |
| **F: Routing (Gate)** | **16–20** | **Catch-all route + middleware enforce sequential ordering with trivial pages** |
| G: Layouts & Modes | 21–23 | `/dev/` and `/presentation/` prefixes work |
| H: Real Components | 24–33 | Built-in views render one-at-a-time in proven routing |
| I: Dev Tools | 34–37 | Dev sidebar, console, presentation nav work |
| J: Firebase | 38–39 | Auth + Firestore sync work |
| K: Full Integration | 40 | Complete experiment flow end-to-end |
| L: Testing | 41–43 | Unit + E2E tests pass |
| M: Build & Publish | 44–45 | Module installs in fresh project |
| N: TypeScript | 46+ | Optional, gradual, after everything works |

### Agent Session Reference

See the **Agent Session Strategy** section at the top of the Implementation Order for the full table. Quick reference:

- **Start a fresh agent session for each phase** (not each step)
- **Phase F is split into two sessions** (Steps 16–17 and Steps 18–20) because guard porting needs focused context
- **Prompt each agent** with: "Execute Phase X (Steps N–M) of the migration plan at `plans/nuxt_migration_251.md`"
- **Handoff between sessions**: git commits are the state transfer mechanism; each session checks `git log` first

### Key Reminders

1. **ALWAYS copy existing files — NEVER reimplement** — Every step that moves code should start by copying the actual source file from `src/`. The code examples in this plan are for reference only; always use the real file as your starting point.
2. **One thing at a time** — Each step does exactly one thing and verifies it
3. **Fresh agent per phase** — Start a new Claude Code session at each phase boundary (see Agent Session Strategy)
4. **Resist the urge to improve** — Migration is not the time for refactoring
5. **When in doubt, copy verbatim** — Fix issues later if needed
6. **Never skip a VERIFY checkpoint** — If it fails, stop and debug
7. **TypeScript is optional and final** — The module works fine with JavaScript
8. **The playground is your test bed** — Every step should leave it in a working state
9. **Phase F is the go/no-go gate** — If routing doesn't work with trivial components, stop and debug before copying real code
10. **Commit after every passing step** — Small commits make rollback easy and serve as handoff points between agent sessions
11. **Build a working playground example at every phase** — After each phase, the playground should be a self-contained demo of what works so far. Don't just copy files silently; update the playground to exercise them.
12. **Tests travel with code** — When copying a source file, always copy its test file too. Tests are wired up and run in Phase L, but they should be present in the module from the moment the source arrives.
