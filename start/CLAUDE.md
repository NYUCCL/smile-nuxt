# SMILE Experiment Project

This is a behavioral experiment built with the [SMILE framework](https://smile.gureckislab.org) (`@nyuccl/smile-nuxt`), a Nuxt 3 module for online cognitive science experiments.

## Project Structure

```
app.vue              # Root component (just renders <NuxtPage />)
design.js            # Experiment timeline — sequence of pages participants see
nuxt.config.ts       # Nuxt config — loads @nyuccl/smile-nuxt module, icons, CSS
components/          # Your custom Vue components (auto-imported in .vue files)
assets/css/app.css   # Global styles and Tailwind CSS customizations
public/              # Static assets (images, logos)
analysis/            # Python data analysis scripts (uv-managed)
test/e2e/            # Playwright end-to-end tests
.env                 # Environment variables (database, deployment, etc.)
```

## Nuxt Auto-Imports

The `@nyuccl/smile-nuxt` module auto-imports everything you need in `.vue` files — no import statements required:

**Composables:** `useAPI()`, `useViewAPI()`, `useTimeline()`, `useStepper()`, `useSmileStore()`, `useLog()`, `useSmileColorMode()`, `Timeline`

**UI components (shadcn-vue):** `Button`, `Card`, `Input`, `Select`, `Switch`, `Tooltip`, `Badge`, `Dialog`, etc.

**Built-in experiment components:** `ConstrainedTaskWindow`, `InformedConsentView`, `AdvertisementView`, `DemographicSurveyView`, `WindowSizerView`, `InstructionsView`, `InstructionsQuiz`, `DebriefView`, `DeviceSurveyView`, `TaskFeedbackSurveyView`, `ThanksView`, `WithdrawView`

**Icon components:** `<i-mdi-icon-name />` syntax via `unplugin-icons` (icons from `@iconify/json`)

**Important:** Auto-import only works in `.vue` files. In plain `.js` files like `design.js`, you must use explicit imports:
```js
import MyComponent from './components/MyComponent.vue'
```

## Overriding Built-In Components

Any built-in component can be overridden by placing a component with the same name in your `components/` directory. Your local version takes priority (`priority: -1` on module components). For example, to customize the informed consent view, create `components/InformedConsentView.vue` — it will replace the module's version everywhere.

The consent text specifically uses the `setAppComponent` pattern in `design.js`:
```js
api.setAppComponent('informed_consent_text', InformedConsentText)
```

## Adding New Components

1. Create a `.vue` file in `components/` (PascalCase name, e.g., `MyNewTask.vue`)
2. It's auto-imported — use it directly in templates or other components
3. To add it to the experiment timeline, import it in `design.js` and register it:
```js
import MyNewTask from './components/MyNewTask.vue'
// ...
timeline.pushSeqView({
  name: 'mytask',
  component: markRaw(MyNewTask),
})
```

## Timeline (`design.js`)

The experiment flow is defined via `createTimeline(api)`. Pages are added sequentially with `timeline.pushSeqView()`. Each view has:
- `name` — unique route name (becomes the URL path, e.g., `/mytask`)
- `component` — Vue component (string for built-ins, `markRaw(Component)` for custom)
- `props` — optional props passed to the component
- `meta` — navigation guard config: `requiresConsent`, `setConsented`, `setDone`, `requiresDone`, `resetApp`, `requiresWithdraw`, `allowAlways`
- `path` — optional custom URL path (e.g., `/welcome/:service?` for dynamic segments)

Use `timeline.registerView()` instead of `pushSeqView()` for views not in the main sequence (e.g., the withdraw page).

## API

**View components** (pages with stepper/trials): `const api = useViewAPI()`
**Non-view components** (shared UI): `const api = useAPI()`

### Navigation
- `api.goNextView()` / `api.goPrevView()` — move between timeline views
- `api.goNextStep()` / `api.goPrevStep()` — move between trials within a view (ViewAPI only)
- `api.goToView('name')` — jump to a named view

### Data Recording
- `api.recordPageData({ key: value })` — record data for the current page (must be an object, not an array)
- `api.recordStep()` — record `api.stepData` for the current trial step
- `api.stepData.myField = value` — set data on the current step (reactive proxy)
- `api.persist.myVar = value` — persistent variables that survive page reloads

### Stepper (Multi-Trial Tasks)
```js
const trials = api.steps.append([
  { id: 'trial', rt: null, response: null }
])
trials[0].append([
  { id: 'a', stimulus: 'cat.png', condition: 'animal' },
  { id: 'b', stimulus: 'car.png', condition: 'vehicle' },
]).shuffle()
trials.append([{ id: 'summary' }])
```

Access: `api.stepData.stimulus`, `api.stepIndex`, `api.nSteps`, `api.path`, `api.isLastStep()`.

### Timing
- `api.startTimer()` / `api.elapsedTime()` — persistent timer (survives reloads)

### Keyboard Events
```js
const stop = api.onKeyDown(['a', 'b'], (e) => {
  e.preventDefault()
  // handle keypress
}, { dedupe: true })
// call stop() to remove listener
```

### Randomization
- `api.shuffle(array)`, `api.randomInt(min, max)`
- `api.faker.rnorm(mean, sd)`, `api.faker.rchoice(array)`, `api.faker.rbinom(n, p)`
- `api.randomAssignCondition(conditionObject)` — random condition assignment

### Autofill (Dev Mode)
Register an autofill function so the dev toolbar can auto-complete your task:
```js
api.setAutofill(() => {
  while (api.stepIndex < api.nSteps) {
    api.faker.render(api.stepData)
    api.recordStep()
    api.goNextStep()
  }
})
```

## Data Constraints

- Recorded data must be plain objects (not arrays at top level)
- Keys cannot contain `.`, `/`, `[`, `]`, or `*`
- No functions or symbols in recorded data

## E2E Tests

Tests are in `test/e2e/` using Playwright. They walk through the experiment as a real participant.

### Structure
- `experiment.spec.ts` — main test file with experiment flow tests
- `helpers.ts` — reusable helpers (`clearState`, `fillDemographicsPage1/2/3`, `selectOption`)

### Key Patterns
```ts
// Clear state before each test for a fresh participant
await clearState(page)

// Navigate through the flow
await page.goto('/welcome')
await page.getByRole('button', { name: /I'm ready/i }).click()

// Use role-based selectors for shadcn-vue components
await page.getByRole('switch').click()           // Toggle/Switch
await page.getByRole('button', { name: /Continue/i }).click()
await page.getByRole('combobox')                 // Select dropdowns
await page.getByRole('option', { name: 'Male' }) // Select options

// Verify database records directly
const db = createClient({ url: 'file:.data/experiment.db' })
const result = await db.execute('SELECT * FROM participants ORDER BY created_at DESC LIMIT 1')
```

### Adding Tests for Your Task
When you add or modify a task component, add corresponding e2e tests:
1. Navigate to your task page (walk through preceding pages or use dev mode)
2. Interact with your task UI using Playwright locators
3. Verify navigation proceeds correctly after task completion
4. Optionally verify recorded data in the SQLite database

### Running
```bash
pnpm test:e2e           # Run all e2e tests (headless)
pnpm test:e2e:ui        # Run with Playwright UI for debugging
```

The dev server must be running (`pnpm dev`) or Playwright must be configured to start it (see `playwright.config.ts`).

## Conventions

- Use `<script setup>` with Composition API (never Options API)
- Use Tailwind CSS for styling
- Component names use PascalCase (e.g., `MyTaskView.vue`)
- Use `ConstrainedTaskWindow` to wrap task content that should respect window size constraints
- Order SFC sections: `<script setup>`, `<template>`, `<style>`

## Commands

```bash
pnpm dev          # Start dev server
pnpm lint         # Run ESLint
pnpm test         # Run unit tests (vitest)
pnpm test:e2e     # Run end-to-end tests (playwright)
```

## Dev Mode

Navigate to `/dev/` to access developer tools: recruitment testing, data inspection, route jumping, randomization controls, and the dev console.
