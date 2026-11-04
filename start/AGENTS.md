# SMILE Experiment Project

This is a behavioral experiment built with [SMILE](https://smile.gureckislab.org)
(`@nyuccl/smile-nuxt`), a Nuxt 4 module for online cognitive science
experiments.

## SMILE's docs are in node_modules

The full SMILE documentation, for the exact version installed here, is in
`node_modules/@nyuccl/smile-nuxt/dist/docs/` as markdown:

- `INDEX.md` lists every page with a one-line summary. Start there to find
  the page for a question.
- The pages: `coding/timeline.md`, `coding/steps.md`, `coding/datastorage.md`,
  `recruit/deploying.md`, `api.md` and the rest.
- `examples/` has the example components the pages show.

Search with the path given explicitly, because `node_modules` is gitignored
and tools that respect `.gitignore` skip it otherwise:

```bash
rg -n "pushRandomizedNode" node_modules/@nyuccl/smile-nuxt/dist/docs/
```

When a page and the code disagree, the code wins. SMILE's code is in
`node_modules/@nyuccl/smile-nuxt/dist/runtime/` (composables in
`composables/`, built-in components in `components/`). The website,
https://smile.gureckislab.org, has the same pages with images and live
examples.

Check the docs before guessing at SMILE's API, and cite the page you used.

## Project structure

```
app.vue              # Root component (just renders <NuxtPage />)
design.js            # Experiment timeline: the sequence of pages participants see
nuxt.config.ts       # Nuxt config: loads @nyuccl/smile-nuxt, icons, CSS
components/          # Your Vue components (auto-imported in .vue files)
assets/css/app.css   # Global styles (see "Styling" below)
public/              # Static files (images, logos), served at /
analysis/            # Python data analysis (uv-managed)
test/e2e/            # Playwright end-to-end tests
.env                 # Settings (database, deployment, etc.)
```

More: `coding/organization.md` in the docs.

## Auto-imports

SMILE's composables are auto-imported in `.vue` and `.js` files, so
`design.js` can use `Timeline` without importing it:

- Composables: `useAPI()`, `useViewAPI()`, `useTimeline()`, `useStepper()`,
  `useSmileStore()`, `useLog()`, `useSmileColorMode()`, `Timeline`

Components are global in templates, with no import needed:

- UI components (shadcn-vue): `Button`, `Card`, `Input`, `Select`, `Switch`,
  `Tooltip`, `Badge`, `Dialog`, ...
- Built-in Views: `InformedConsentView`, `AdvertisementView`,
  `DemographicSurveyView`, `WindowSizerView`, `InstructionsView`,
  `InstructionsQuiz`, `DebriefView`, `DeviceSurveyView`,
  `TaskFeedbackSurveyView`, `ThanksView`, `WithdrawView`
- Layouts: `ConstrainedTaskWindow`, `CenteredContent`, `TwoCol`, ...
- Icons: `<i-mdi-icon-name />` (any Iconify set, via `unplugin-icons`)

In a `.js` file such as `design.js`, import your own components explicitly:

```js
import MyTaskView from './components/MyTaskView.vue'
```

## Timeline (`design.js`)

`design.js` exports `createTimeline(api)`. Views are added in order with
`timeline.pushSeqView()`:

```js
timeline.pushSeqView({
  name: 'mytask',               // route name; the URL is /mytask
  component: markRaw(MyTaskView), // a string for built-ins: 'ThanksView'
  props: { ... },               // optional
  meta: { ... },                // optional: requiresConsent, setDone, ...
})
```

Use `timeline.registerView()` for Views outside the sequence (like the
withdraw page). Randomized and conditional orders: `pushRandomizedNode()` and
`pushConditionalNode()`. More: `coding/timeline.md`.

## The API

In a View (a page on the timeline): `const api = useViewAPI()`. Elsewhere:
`const api = useAPI()`.

- Navigation: `api.goNextView()`, `api.goPrevView()`, `api.goToView('name')`;
  within a View, `api.goNextStep()` and `api.goPrevStep()`
- Recording: `api.recordPageData({ ... })` for the page,
  `api.stepData.field = value` then `api.recordStep()` for a trial
- State that survives a reload: `api.persist.myVar = value`
- Timing: `api.startTimer()`, `api.elapsedTime()`, `api.isTimerStarted()`
- Keys: `const stop = api.onKeyDown(['a', 'b'], (e) => { ... })`
- Randomness (seeded): `api.shuffle(array)`, `api.randomInt(min, max)`,
  `api.randomAssignCondition({ ... })`
- Fake data for autofill: `api.faker.rnorm(mean, sd)`, `rbinom`, `rchoice`,
  `render`; register with `api.setAutofill(fn)`

Multi-trial tasks use `api.steps`:

```js
const trials = api.steps.append([{ id: 'trial', rt: null, response: null }])
trials[0].append([
  { id: 'a', stimulus: 'cat.png', condition: 'animal' },
  { id: 'b', stimulus: 'car.png', condition: 'vehicle' },
]).shuffle()
trials.append([{ id: 'summary' }])
```

Read with `api.stepData.stimulus`, `api.stepIndex`, `api.nSteps`,
`api.isLastStep()`.

Full reference: `api.md`, `coding/steps.md`, `coding/autofill.md`,
`coding/randomization.md`.

## Recorded data

Values are strings, numbers, booleans, `null`, dates, or arrays and objects
of these. No arrays directly inside arrays, no functions or symbols, and keys
can't contain `.`, `/`, `[`, `]` or `*`. Locally the data is in
`.data/experiment.db` (SQLite). More: `coding/datastorage.md`.

## Overriding built-ins

A file in `components/` with the same name as a built-in View (for example
`components/InformedConsentView.vue`) replaces it. Don't give your own
components the names of SMILE's UI components (`Button`, `Card`, `Input`,
...): that replaces them inside SMILE's built-in Views too and usually breaks
them. Use names like `MyButton`. More: `coding/overrides.md`.

The consent text is set in `design.js`:

```js
api.setAppComponent('informed_consent_text', InformedConsentText)
```

## Styling

Use Tailwind classes, and `<style scoped>` in a component for anything else.
`assets/css/app.css` is global: it also reaches SMILE's built-in components
and the dev tools. Change colors through the theme tokens (`--primary`,
...), and put other global rules in `@layer base` or `@layer components`. A
rule outside a layer overrides Tailwind's classes on SMILE's components.
More: `coding/overrides.md#adding-your-own-css`.

## Tests

The Playwright tests in `test/e2e/` walk through the experiment as a
participant. `helpers.ts` has `clearState`, `fillDemographicsPage1/2/3` and
`selectOption`. Use role-based selectors for the UI components
(`getByRole('button', { name: /Continue/i })`, `getByRole('switch')`,
`getByRole('combobox')`). When you add or change a task, add a test that
reaches it, uses it and checks the experiment moves on. More:
`coding/testing.md`.

## Conventions

- `<script setup>` with the Composition API (no Options API)
- Tailwind CSS for styling
- PascalCase component names (`MyTaskView.vue`)
- Wrap task content in `ConstrainedTaskWindow` so it respects the window size
- SFC order: `<script setup>`, `<template>`, `<style>`

## Commands

```bash
pnpm dev          # dev server: experiment at /, dev tools at /dev/
pnpm test:e2e     # end-to-end tests (Playwright)
pnpm build        # production build
pnpm preview      # run the production build locally
```

The dev tools (`/dev/`) are always there under `pnpm dev`. Production builds
leave them out unless `SMILE_DEV_TOOLS=include` is set at build time.
