# Plan: smile-lib — Reusable Trial Component Libraries

## Overview

Create an ecosystem of add-on packages (`smile-lib-*`) providing ready-made Vue
components for common experiment paradigms. The first package,
`smile-lib-jspsych`, would cover the same *behavioral territory* as popular
jsPsych plugins — keyboard/button response collection, categorization with
feedback, surveys, media playback — but implemented in SMILE's own idioms, not
as a port of jsPsych's API.

This plan covers the philosophical approach, architecture decisions, distribution
strategy, concrete component designs, and scaling to a general `smile-lib-*`
ecosystem.

---

## 1. Design Philosophy: SMILE's Way vs jsPsych's Way

### The fundamental difference

In jsPsych, the *timeline* is a flat list of individual trials. Each trial is a
plugin instance with parameters. The framework iterates through them.

In SMILE, the *timeline* sequences **phases of an experiment** — consent,
instructions, task block, debrief. Each phase is a **view component** that owns
its own internal structure. Within a view, the **stepper** handles trial-level
iteration. The component defines what a trial looks like, how input is collected,
and how data is recorded.

```
jsPsych:   timeline = [trial, trial, trial, trial, ...]
SMILE:     timeline = [consent, instructions, TASK_VIEW, debrief, ...]
                                                  └── stepper = [trial, trial, trial, ...]
```

### What this means for smile-lib

Library components should NOT be individual trial nodes pushed onto the timeline.
They should be **view-level components** (or sub-components used within views)
that:

1. Accept trial definitions as **data** (props or stepper node data)
2. Use the **stepper** internally to iterate through trials
3. Own their own **UI, input handling, timing, and data recording**
4. Call `api.goNextView()` when the entire block is done

The researcher's `design.js` stays clean — one `pushSeqView` per task block,
not one per trial:

```js
// SMILE way — one view for a whole categorization block
timeline.pushSeqView({
  name: 'categorization',
  component: markRaw(CategorizationTask),
})
```

The trial structure lives in the *component*, not in `design.js`. This is
exactly how StroopExpView works in the playground — it defines its own trials
via `api.steps.append()`, handles keyboard input, records per-step data, and
advances to the next view when done.

---

## 2. Two Layers of Abstraction

The library should provide components at two levels:

### Layer 1: Trial Display Components (sub-components)

Small, focused components that render a single trial's display and collect a
single response. These do NOT call `goNextView()` or manage the stepper. They
emit events when a response is collected.

Think of these as the "atoms" — stimulus + response collection:

```
KeyboardStimulus     — show content, wait for keypress, emit response + RT
ButtonStimulus       — show content + buttons, emit which button was clicked
ImageStimulus        — display an image with optional sizing
AudioStimulus        — play audio, optionally wait for completion
VideoStimulus        — play video with controls
FeedbackDisplay      — show correct/incorrect feedback for a duration
FixationCross        — show a fixation cross for a duration
BlankScreen          — blank ISI for a duration
```

These are used *inside* view components:

```vue
<!-- Inside a custom view -->
<KeyboardStimulus
  v-if="api.path[0] === 'trial'"
  :choices="['f', 'j']"
  :timeout="3000"
  @response="handleResponse"
>
  {{ api.stepData.word }}
</KeyboardStimulus>
```

### Layer 2: Task View Components (full views)

Complete, self-contained view components that wire together Layer 1 atoms with
the stepper to run an entire task block. These are what researchers drop into
`design.js`.

```
KeyboardResponseTask   — block of keyboard-response trials with stepper
ButtonResponseTask     — block of button-response trials with stepper
CategorizationTask     — categorize stimuli with feedback
LikertSurveyTask       — multi-item Likert scale
FreeResponseTask       — multi-item free text
MultiChoiceTask        — multi-item multiple choice survey
```

The researcher can use Layer 2 directly for standard paradigms, or compose
Layer 1 atoms into custom views for anything non-standard.

---

## 3. How Trial Data Gets Into Components

### The SMILE way: stepper node data

In the Stroop example, trial parameters are defined as stepper node data:

```js
api.steps.append([{ id: 'stroop' }])
  .children[0].append([
    { id: 'a', word: 'SHIP', color: 'red', condition: 'unrelated' },
    { id: 'b', word: 'RED', color: 'red', condition: 'congruent' },
  ]).shuffle()
```

The component reads `api.stepData.word`, `api.stepData.color` on each step.
Response data is written back: `api.stepData.rt = reactionTime`.

Library components should follow this pattern. Trial definitions flow through
the stepper, not through props. This keeps `design.js` minimal and lets the
component own its structure.

### Props for configuration, stepper for trial data

**Props** configure the *task* (how many practice trials? show feedback?
what keys are valid?). **Stepper data** defines the *trials* (what stimulus
on each trial, what's the correct answer).

**Critical rule: trial data is plain data, not markup.** Stepper nodes contain
strings, numbers, URLs, and condition labels — never HTML fragments. The
component's `<template>` decides how to render that data. This keeps syntax
highlighting, linting, and Vue tooling working.

```vue
<!-- KeyboardResponseTask.vue -->
<script setup>
const props = defineProps({
  trials: { type: Array, required: true },
  choices: { type: Array, default: () => ['f', 'j'] },
  showFeedback: { type: Boolean, default: false },
  feedbackDuration: { type: Number, default: 1000 },
  trialDuration: { type: Number, default: null },
  fixationDuration: { type: Number, default: 500 },
  isi: { type: Number, default: 200 },
})

const api = useViewAPI()

// Build stepper from trial definitions
api.steps.append([{ id: 'block' }])
api.steps.children[0]
  .append(props.trials.map((t, i) => ({ id: `trial_${i}`, ...t })))
  .shuffle()
api.steps.append([{ id: 'done' }])
</script>
```

Usage in `design.js` — note that trials are plain data objects:

```js
timeline.pushSeqView({
  name: 'categorization',
  component: markRaw(KeyboardResponseTask),
  props: {
    choices: ['f', 'j'],
    showFeedback: true,
    feedbackDuration: 1500,
    fixationDuration: 500,
    trials: [
      { text: 'SHIP', correctResponse: 'f', condition: 'control' },
      { text: 'BOAT', correctResponse: 'j', condition: 'control' },
      { image: '/images/cat.png', correctResponse: 'f', condition: 'animal' },
      // ...
    ],
  },
})
```

The component template handles rendering — the researcher never writes HTML
in a data structure:

```vue
<!-- Inside KeyboardResponseTask.vue template -->
<div v-if="api.stepData.text" class="text-6xl font-bold text-center">
  {{ api.stepData.text }}
</div>
<img v-else-if="api.stepData.image" :src="api.stepData.image" class="max-w-md mx-auto" />
```

For anything more complex (custom styling per trial, composite stimuli), the
researcher uses a **scoped slot** — real Vue template code with full tooling:

```vue
<!-- In the researcher's custom view or design -->
<KeyboardResponseTask :trials="trials" :choices="['f','j']">
  <template #trial="{ data }">
    <p class="text-6xl font-bold" :class="{ 'text-red-500': data.color === 'red' }">
      {{ data.word }}
    </p>
    <p class="mt-4 text-muted-foreground">{{ data.prompt }}</p>
  </template>
</KeyboardResponseTask>
```

### Alternative: define trials inside the component

For researchers who want full control, they can use the Layer 1 atoms directly
in a custom view and define the stepper themselves — exactly like the Stroop
example does today. The library doesn't force a particular trial definition
format.

---

## 4. Concrete Component Designs

### 4.1 KeyboardResponseTask (Layer 2 view)

A block of trials where participants respond by pressing a key. Covers the same
ground as jsPsych's keyboard response plugins but as a single view component
managing the whole block.

Trial data is **plain data** — text strings, image URLs, condition labels. The
component decides how to render it. For custom rendering, researchers provide
a `#trial` scoped slot with real Vue template code.

```vue
<script setup>
const props = defineProps({
  trials: { type: Array, required: true },
  // Each trial: { text?, image?, correctResponse?, condition?, ...anyData }
  choices: { type: Array, default: () => [] },         // empty = all keys
  trialDuration: { type: Number, default: null },      // ms, null = infinite
  fixationDuration: { type: Number, default: 500 },    // ms before stimulus
  isi: { type: Number, default: 200 },                 // inter-stimulus interval
  showFeedback: { type: Boolean, default: false },
  feedbackDuration: { type: Number, default: 1000 },
  randomize: { type: Boolean, default: true },
})

const api = useViewAPI()

// Phase enum for trial state machine
const phase = ref('fixation') // fixation → stimulus → feedback → isi

// Build stepper from plain data
const block = api.steps.append([{ id: 'trials' }])
const trialNodes = block[0]
  .append(props.trials.map((t, i) => ({
    id: `t${i}`,
    ...t,
    rt: () => api.faker.rnorm(500, 100),
    response: () => api.faker.rchoice(props.choices),
  })))
if (props.randomize) trialNodes.shuffle()
api.steps.append([{ id: 'done' }])

// Timer-driven trial phases
function startTrial() {
  phase.value = 'fixation'
  setTimeout(() => {
    phase.value = 'stimulus'
    api.startTimer('trial')
    if (props.trialDuration) {
      setTimeout(() => {
        if (phase.value === 'stimulus') recordResponse(null)
      }, props.trialDuration)
    }
  }, props.fixationDuration)
}

function recordResponse(key) {
  if (phase.value !== 'stimulus') return
  const rt = api.elapsedTime('trial')
  api.stepData.response = key
  api.stepData.rt = rt
  if (api.stepData.correctResponse) {
    api.stepData.correct = key === api.stepData.correctResponse
  }
  api.recordStep()

  if (props.showFeedback && api.stepData.correctResponse) {
    phase.value = 'feedback'
    setTimeout(advanceTrial, props.feedbackDuration)
  } else {
    advanceTrial()
  }
}

function advanceTrial() {
  phase.value = 'isi'
  setTimeout(() => {
    api.goNextStep()
    if (api.path[0] === 'done') {
      phase.value = 'done'
    } else {
      startTrial()
    }
  }, props.isi)
}

// Keyboard handler
api.onKeyDown((e) => {
  if (props.choices.length === 0 || props.choices.includes(e.key)) {
    recordResponse(e.key)
  }
})

onMounted(() => startTrial())

// Dev autofill
api.setAutofill(() => {
  while (api.path[0] !== 'done') {
    api.faker.render(api.stepData)
    api.recordStep()
    api.goNextStep()
  }
  phase.value = 'done'
})
</script>

<template>
  <ConstrainedTaskWindow>
    <!-- Fixation -->
    <div v-if="phase === 'fixation'" class="flex items-center justify-center h-full">
      <span class="text-4xl">+</span>
    </div>

    <!-- Stimulus: scoped slot for custom rendering, defaults for text/image -->
    <div v-else-if="phase === 'stimulus'" class="flex items-center justify-center h-full">
      <slot name="trial" :data="api.stepData">
        <!-- Default rendering: text or image based on what's in the data -->
        <p v-if="api.stepData.text" class="text-4xl font-bold">
          {{ api.stepData.text }}
        </p>
        <img v-else-if="api.stepData.image" :src="api.stepData.image" class="max-w-md" />
      </slot>
    </div>

    <!-- Feedback -->
    <div v-else-if="phase === 'feedback'" class="flex items-center justify-center h-full">
      <slot name="feedback" :data="api.stepData" :correct="api.stepData.correct">
        <p :class="api.stepData.correct ? 'text-green-500' : 'text-red-500'" class="text-2xl font-bold">
          {{ api.stepData.correct ? 'Correct!' : 'Incorrect' }}
        </p>
      </slot>
    </div>

    <!-- ISI (blank) -->
    <div v-else-if="phase === 'isi'" />

    <!-- Done -->
    <div v-else-if="phase === 'done'" class="text-center">
      <slot name="done">
        <p class="text-lg mb-4">Block complete!</p>
        <Button @click="api.goNextView()">Continue</Button>
      </slot>
    </div>
  </ConstrainedTaskWindow>
</template>
```

This is one view on the timeline but runs N trials internally. The researcher
never touches the stepper — it's an implementation detail of the component.

**Key design choices:**
- Default rendering handles the common cases (plain text, image URL) with no
  configuration needed
- The `#trial` scoped slot gives full control when researchers need custom
  rendering — real Vue template code with syntax highlighting, linting, and
  component composition
- The `#feedback` and `#done` slots allow customization of those phases too
- No HTML strings anywhere — trial data is always plain data

### 4.2 ButtonResponseTask (Layer 2 view)

Same structure as KeyboardResponseTask but responses come from clicking buttons
instead of pressing keys. The `trials` array includes a `choices` field per
trial (button labels), or a global `choices` prop applies to all.

```js
// design.js
timeline.pushSeqView({
  name: 'similarity',
  component: markRaw(ButtonResponseTask),
  props: {
    trials: [
      { stimulus: '/images/face1.png', choices: ['Same', 'Different'] },
      { stimulus: '/images/face2.png', choices: ['Same', 'Different'] },
    ],
    randomize: true,
  },
})
```

### 4.3 CategorizationTask (Layer 2 view)

Extends the keyboard/button response pattern with:
- Required `correctResponse` on each trial
- Feedback after each response (configurable)
- Accuracy tracking via `api.persist`
- Optional "force correct" mode (must press correct key to advance)

This covers what jsPsych's `categorize-html` and `categorize-image` do.

### 4.4 Layer 1 Atoms (sub-components)

These are simpler and more composable. They don't touch the stepper or timeline.

**KeyboardStimulus:**
```vue
<script setup>
const props = defineProps({
  choices: { type: Array, default: () => [] },   // empty = all keys
  timeout: { type: Number, default: null },       // ms, null = infinite
})
const emit = defineEmits(['response', 'timeout'])
// Handles key listening, emits { key, rt } on response
// Stimulus content comes via the default slot — real Vue template code
</script>

<template>
  <div class="flex items-center justify-center h-full">
    <slot />  <!-- researcher provides stimulus as slot content -->
  </div>
</template>
```

**ButtonStimulus:**
```vue
<script setup>
const props = defineProps({
  choices: { type: Array, required: true },  // button labels
  layout: { type: String, default: 'row' },  // row | grid
  enableAfter: { type: Number, default: 0 }, // delay before clickable
})
const emit = defineEmits(['response'])
// Renders buttons below the slot content, emits { index, label, rt } on click
</script>

<template>
  <div>
    <slot />  <!-- stimulus content from researcher's template -->
    <div class="flex gap-4 mt-6 justify-center">
      <Button v-for="(choice, i) in choices" :key="i" @click="respond(i, choice)">
        {{ choice }}
      </Button>
    </div>
  </div>
</template>
```

**FixationCross:**
```vue
<script setup>
const props = defineProps({
  duration: { type: Number, default: 500 },
  symbol: { type: String, default: '+' },
})
const emit = defineEmits(['done'])
// Shows fixation for duration, emits 'done'
</script>
```

**FeedbackDisplay:**
```vue
<script setup>
const props = defineProps({
  correct: Boolean,
  duration: { type: Number, default: 1000 },
  correctText: { type: String, default: 'Correct!' },
  incorrectText: { type: String, default: 'Incorrect' },
})
const emit = defineEmits(['done'])
</script>
```

A researcher building a custom task can compose these:

```vue
<!-- MyCustomTask.vue — researcher composes atoms into a custom task -->
<template>
  <ConstrainedTaskWindow>
    <FixationCross v-if="phase === 'fix'" :duration="500" @done="phase = 'stim'" />

    <KeyboardStimulus
      v-else-if="phase === 'stim'"
      :choices="['f', 'j']"
      :timeout="3000"
      @response="onResponse"
      @timeout="onTimeout"
    >
      <!-- Stimulus is real Vue template code — not a string -->
      <p class="text-6xl font-bold" :style="{ color: api.stepData.color }">
        {{ api.stepData.word }}
      </p>
      <p class="mt-4 text-muted-foreground">Press F for red, J for blue</p>
    </KeyboardStimulus>

    <FeedbackDisplay
      v-else-if="phase === 'feedback'"
      :correct="api.stepData.correct"
      :duration="1000"
      @done="nextTrial"
    />
  </ConstrainedTaskWindow>
</template>
```

This is the Vue-native way — composition via template, not configuration
objects. The researcher sees exactly what happens, gets full syntax highlighting
and autocomplete, and can rearrange, add conditional logic, or swap components.

---

## 5. Data is Data, Templates are Templates

A core principle: **never pass markup as data.** Trial definitions are plain
objects with strings, numbers, and URLs. Rendering is always done in Vue
templates where you get syntax highlighting, linting, and component composition.

### How the layers handle this

**Layer 1 atoms** accept data via props and render it with sensible defaults.
Researchers customize via the default slot:

```vue
<!-- Simple: atom renders the text prop -->
<KeyboardStimulus :choices="['f', 'j']" :timeout="3000" @response="onResponse">
  {{ api.stepData.word }}
</KeyboardStimulus>

<!-- Rich: researcher composes their own stimulus display -->
<KeyboardStimulus :choices="['f', 'j']" :timeout="3000" @response="onResponse">
  <p class="text-6xl font-bold" :style="{ color: api.stepData.color }">
    {{ api.stepData.word }}
  </p>
  <p class="mt-4 text-muted-foreground">Press F for red, J for blue</p>
</KeyboardStimulus>
```

**Layer 2 task views** render trial data from the stepper with built-in
defaults (text → `<p>`, image URL → `<img>`). For anything custom, a `#trial`
scoped slot gives full template control:

```vue
<!-- Default: task view auto-renders stepData.text or stepData.image -->
<KeyboardResponseTask :trials="trials" :choices="['f','j']" />

<!-- Custom rendering via scoped slot — real Vue code, full tooling -->
<KeyboardResponseTask :trials="trials" :choices="['f','j']">
  <template #trial="{ data }">
    <img :src="data.imageUrl" class="w-64 h-64 object-contain" />
    <p class="mt-4 text-lg">{{ data.caption }}</p>
  </template>
</KeyboardResponseTask>
```

No `v-html`, no HTML-in-strings, no loss of tooling.

---

## 6. Distribution Model

### Each library is its own independent package

Every `smile-lib-*` is a standalone Nuxt module in its own repository, published
to npm independently. It declares `@nyuccl/smile` as a **peer dependency** so
it always works with the installed version of SMILE. Anyone — NYUCCL, other
labs, individual researchers — can create and publish a `smile-lib-*` package.

```bash
# Install a library
pnpm add @nyuccl/smile-lib-jspsych

# Someone else's library works the same way
pnpm add @somelab/smile-lib-physics
```

```ts
// nuxt.config.ts — just add to modules
export default defineNuxtConfig({
  modules: [
    '@nyuccl/smile',
    '@nyuccl/smile-lib-jspsych',
    '@somelab/smile-lib-physics',
  ],
})
```

No monorepo, no central registry. npm *is* the registry. The convention is
the package name and the Nuxt module structure.

### Eject for customization

Integrate with the `smile eject` command (issue #9) so researchers can copy any
library component locally when they need to modify it:

```bash
npx smile eject KeyboardResponseTask    # copies from whichever lib provides it
```

### Package structure convention

Every `smile-lib-*` follows this structure so the ecosystem is predictable:

```
smile-lib-example/
├── src/
│   ├── module.ts                        # Nuxt module — registers components
│   ├── runtime/
│   │   ├── components/
│   │   │   ├── atoms/                   # Layer 1: sub-components
│   │   │   │   ├── SomeAtom.vue
│   │   │   │   └── AnotherAtom.vue
│   │   │   └── tasks/                   # Layer 2: full view components
│   │   │       ├── SomeTask.vue
│   │   │       └── AnotherTask.vue
│   │   └── composables/                 # shared logic for this library
│   │       └── useSomething.js
│   └── index.ts
├── package.json                         # peerDependencies: { "@nyuccl/smile": ">=0.2.0" }
├── playground/                          # working example experiment
│   ├── design.js
│   └── nuxt.config.ts
└── README.md
```

### What makes a good smile-lib

A library should:
- Focus on a **coherent domain** (response collection, psychophysics, social
  games, etc.) — not try to be everything
- Declare `@nyuccl/smile` as a peer dependency, not a regular dependency
- Follow the two-layer pattern (atoms + tasks) where it makes sense
- Include a `playground/` with a working example experiment
- Use SMILE's conventions: `useViewAPI()`, stepper for trials, `api.recordPageData()`
  for data, Tailwind for styling, slots for stimulus content

---

## 7. The `useTrialRunner` Composable

Many task views follow the same state machine:
fixation → stimulus → (response) → feedback → ISI → next trial → ... → done.

Extract this into a composable that Layer 2 components use internally:

```js
export function useTrialRunner(api, options) {
  const {
    fixationDuration = 500,
    trialDuration = null,
    feedbackDuration = 1000,
    isi = 200,
    showFeedback = false,
    doneStepId = 'done',
  } = options

  const phase = ref('idle')  // idle | fixation | stimulus | feedback | isi | done
  const trialStartTime = ref(0)

  function startTrial() {
    phase.value = 'fixation'
    setTimeout(() => {
      phase.value = 'stimulus'
      api.startTimer('trial')

      if (trialDuration) {
        setTimeout(() => {
          if (phase.value === 'stimulus') endResponse(null)
        }, trialDuration)
      }
    }, fixationDuration)
  }

  function endResponse(responseData) {
    if (phase.value !== 'stimulus') return
    const rt = api.elapsedTime('trial')

    // Write response data to current step
    Object.assign(api.stepData, responseData, { rt })
    api.recordStep()

    if (showFeedback && api.stepData.correct !== undefined) {
      phase.value = 'feedback'
      setTimeout(advanceTrial, feedbackDuration)
    } else {
      advanceTrial()
    }
  }

  function advanceTrial() {
    phase.value = 'isi'
    setTimeout(() => {
      api.goNextStep()
      if (api.path[0] === doneStepId) {
        phase.value = 'done'
      } else {
        startTrial()
      }
    }, isi)
  }

  return { phase, startTrial, endResponse, advanceTrial }
}
```

Layer 2 components use this and just define the template:

```vue
<script setup>
const { phase, startTrial, endResponse } = useTrialRunner(api, {
  fixationDuration: props.fixationDuration,
  showFeedback: props.showFeedback,
})

api.onKeyDown((e) => {
  if (validKey(e.key)) endResponse({ response: e.key, correct: e.key === api.stepData.correctResponse })
})

onMounted(startTrial)
</script>
```

---

## 8. Component Coverage

### What to provide (mapped from jsPsych territory)

| SMILE Component | Covers jsPsych equivalent | Level |
|---|---|---|
| **KeyboardStimulus** | html/image-keyboard-response (display+input) | Atom |
| **ButtonStimulus** | html/image-button-response (display+input) | Atom |
| **ImageStimulus** | image display portion | Atom |
| **AudioStimulus** | audio-keyboard-response (playback) | Atom |
| **VideoStimulus** | video-keyboard-response (playback) | Atom |
| **FixationCross** | (universal need) | Atom |
| **BlankScreen** | (ISI) | Atom |
| **FeedbackDisplay** | categorize feedback portion | Atom |
| **KeyboardResponseTask** | html/image-keyboard-response (full block) | Task |
| **ButtonResponseTask** | html/image-button-response (full block) | Task |
| **CategorizationTask** | categorize-html/image (full block) | Task |
| **LikertSurveyTask** | survey-likert | Task |
| **FreeResponseTask** | survey-text | Task |
| **MultiChoiceTask** | survey-multi-choice | Task |

### Not provided (SMILE already has these)

- Instructions → `InstructionsView`
- Fullscreen → not needed (browser handles it; could add as atom if requested)
- Preload → Nuxt handles asset optimization; could add `MediaPreloader` atom
- Demographics → `DemographicSurveyView`

### Naming convention

No prefix. Names describe what the component does, not where it comes from.
Matches SMILE's existing pattern (`AdvertisementView`, `WindowSizerView`).

- Atoms: `KeyboardStimulus`, `FixationCross` (noun — what it renders)
- Tasks: `KeyboardResponseTask`, `CategorizationTask` (noun — what it runs)

---

## 9. The `smile-lib-*` Ecosystem

### Independent packages, shared conventions

There is no monorepo. Each library is its own repo and npm package. The
ecosystem grows organically — NYUCCL publishes a few foundational libraries,
other labs publish domain-specific ones, and they all interoperate because
they follow the same conventions and depend on `@nyuccl/smile`.

```
NYUCCL-maintained:
  @nyuccl/smile-lib-jspsych       # basic response collection, categorization, surveys
  @nyuccl/smile-lib-core          # (optional) shared atoms like FixationCross, BlankScreen

Community examples:
  @somelab/smile-lib-psychophysics  # Gabor patches, RDK, contrast detection
  @somelab/smile-lib-social         # trust game, dictator game, public goods
  @somelab/smile-lib-memory         # n-back, serial recall, change detection
  @somelab/smile-lib-rl             # multi-armed bandit, reversal learning
  @somelab/smile-lib-survey         # conjoint, MaxDiff, adaptive questionnaires
  @somelab/smile-lib-physics        # physics simulations, collision tasks
```

### How interoperability works

All libraries depend on `@nyuccl/smile` as a peer dependency. SMILE provides:

- **`useViewAPI()`** — auto-imported, the universal API for navigation, data
  recording, timing, stepper, keyboard/mouse input
- **Stepper** — the trial iteration system
- **Layout components** — `ConstrainedTaskWindow`, `ConstrainedPage`, etc.
- **UI components** — `Button`, `Select`, `Input`, etc. (shadcn/Vue)
- **Tailwind** — the styling system

A library component from *any* publisher can use all of these because SMILE
registers them globally via Nuxt auto-import. The library doesn't bundle or
re-export SMILE — it just uses it.

```json
// package.json of any smile-lib-* package
{
  "peerDependencies": {
    "@nyuccl/smile": ">=0.2.0"
  }
}
```

### Composing multiple libraries

Researchers can install multiple libraries and use them together in one
experiment. Components from different libraries are all auto-imported and
can be mixed freely in `design.js`:

```js
import { markRaw } from 'vue'
import KeyboardResponseTask from '@nyuccl/smile-lib-jspsych/tasks/KeyboardResponseTask.vue'
import TrustGame from '@somelab/smile-lib-social/tasks/TrustGame.vue'
import NBackTask from '@somelab/smile-lib-memory/tasks/NBackTask.vue'

export default function createTimeline(api) {
  const timeline = new Timeline(api)
  // ... consent, demographics ...
  timeline.pushSeqView({ name: 'categorize', component: markRaw(KeyboardResponseTask), props: { ... } })
  timeline.pushSeqView({ name: 'trust', component: markRaw(TrustGame), props: { ... } })
  timeline.pushSeqView({ name: 'nback', component: markRaw(NBackTask), props: { ... } })
  // ... debrief, thanks ...
  timeline.build()
  return timeline
}
```

### Shared atoms: `@nyuccl/smile-lib-core` (optional)

Some atoms are universally useful across domains: `FixationCross`, `BlankScreen`,
`FeedbackDisplay`, `useTrialRunner`. These could live in a small
`@nyuccl/smile-lib-core` package that other libraries depend on, or they could
be duplicated in each library (they're small enough). The core package is
optional — a library can be completely standalone.

If `smile-lib-core` exists, other libraries declare it as a regular dependency:

```json
{
  "dependencies": {
    "@nyuccl/smile-lib-core": "^0.1.0"
  },
  "peerDependencies": {
    "@nyuccl/smile": ">=0.2.0"
  }
}
```

### Creating a new library: the template

To make it easy for anyone to create a `smile-lib-*`, provide a GitHub template
repo (`nyuccl/smile-lib-template`) with:

- Pre-configured `module.ts` with `addComponentsDir`
- Example atom and task view
- `playground/` with a working SMILE experiment
- `package.json` with correct peer dependencies
- README template explaining the conventions
- CI setup for building and publishing

```bash
# Create a new library from the template
gh repo create my-lab/smile-lib-physics --template nyuccl/smile-lib-template
```

---

## 10. Example: Complete Experiment Using Library Components

```js
// design.js — a categorization experiment
import { markRaw } from 'vue'
import CategorizationTask from '@nyuccl/smile-lib-jspsych/tasks/CategorizationTask.vue'
import KeyboardResponseTask from '@nyuccl/smile-lib-jspsych/tasks/KeyboardResponseTask.vue'

export default function createTimeline(api) {
  const timeline = new Timeline(api)

  // ... consent, demographics, window sizer (builtins) ...

  // Practice block with feedback — trials are plain data
  timeline.pushSeqView({
    name: 'practice',
    component: markRaw(CategorizationTask),
    props: {
      choices: ['f', 'j'],
      showFeedback: true,
      feedbackDuration: 1500,
      fixationDuration: 500,
      randomize: true,
      trials: [
        { text: 'CAT', correctResponse: 'f', category: 'animal' },
        { text: 'TABLE', correctResponse: 'j', category: 'object' },
        { text: 'DOG', correctResponse: 'f', category: 'animal' },
        { text: 'CHAIR', correctResponse: 'j', category: 'object' },
      ],
    },
  })

  // Test block with images, no feedback
  timeline.pushSeqView({
    name: 'test',
    component: markRaw(KeyboardResponseTask),
    props: {
      choices: ['f', 'j'],
      showFeedback: false,
      trialDuration: 2000,
      fixationDuration: 300,
      randomize: true,
      trials: [
        { image: '/stimuli/cat.png', correctResponse: 'f' },
        { image: '/stimuli/table.png', correctResponse: 'j' },
        // ...or load from JSON: loadTrials('/stimuli/test-trials.json')
      ],
    },
  })

  // ... debrief, thanks (builtins) ...

  timeline.build()
  return timeline
}
```

Notice: each `pushSeqView` is a *block* of the experiment, not an individual
trial. The component handles the trial loop internally. `design.js` reads
like an experiment protocol, not a trial list. Trial data is plain objects —
no markup, no HTML strings.

---

## 11. Open Questions

1. **Should trial definitions always go through props, or should some components
   read from an external file (JSON/CSV)?** Many researchers define stimuli in
   spreadsheets. A `trials` prop that accepts a URL to a JSON file could be
   convenient. But this adds async loading complexity. Probably better as a
   separate utility (`loadTrials('/stimuli.json')`) that researchers call in
   `design.js` and pass the result as a prop.

2. **How much layout should task views impose?** The Stroop example uses
   `ConstrainedTaskWindow`. Should library task views always wrap in a layout
   component, or let the researcher choose? Recommendation: use
   `ConstrainedTaskWindow` by default with a `layout` prop to override.

3. **Should atoms emit events or call callbacks?** Vue convention is events
   (`@response="handleResponse"`). But some researchers might prefer a callback
   prop pattern. Stick with events — it's idiomatic Vue and works with `v-on`.

4. **Image vs text stimulus — one component or two?** jsPsych splits these
   (`html-keyboard-response` vs `image-keyboard-response`). In Vue, a single
   component handles both naturally: if `stepData.text` exists, render it as
   text; if `stepData.image` exists, render as `<img>`. And for anything more
   complex, the `#trial` scoped slot gives the researcher full template control.
   No need for separate components.

5. **How to handle practice vs test blocks?** Common pattern: practice with
   feedback, then test without. This could be two instances of the same
   component with different props (as shown in the example above), or a single
   component with a `phases` prop that defines practice→test transitions. The
   two-instance approach is simpler and more explicit.

---

## 12. Implementation Roadmap

### Phase 1: Library template and first library
- [ ] Create `nyuccl/smile-lib-template` — GitHub template repo with
      pre-configured `module.ts`, example components, playground, CI
- [ ] Create `nyuccl/smile-lib-jspsych` from the template
- [ ] Implement atoms: `KeyboardStimulus`, `ButtonStimulus`, `FixationCross`,
      `BlankScreen`, `FeedbackDisplay`
- [ ] Implement `useTrialRunner` composable
- [ ] Implement `KeyboardResponseTask` (first full task view)
- [ ] Playground experiment demonstrating the pattern
- [ ] Publish to npm as `@nyuccl/smile-lib-jspsych`

### Phase 2: Core task views in smile-lib-jspsych
- [ ] `ButtonResponseTask`, `CategorizationTask`
- [ ] `ImageStimulus` atom (with canvas rendering option)
- [ ] Scoped slot support for custom trial rendering in task views
- [ ] Dev autofill support (`api.setAutofill`) in all task views

### Phase 3: Surveys, media, and shared core
- [ ] `LikertSurveyTask`, `FreeResponseTask`, `MultiChoiceTask`
- [ ] `AudioStimulus`, `VideoStimulus` atoms
- [ ] Decide whether `@nyuccl/smile-lib-core` is needed or if atoms are
      small enough to duplicate across libraries

### Phase 4: Ecosystem enablement
- [ ] Integrate with `smile eject` (issue #9) — eject components from any
      installed `smile-lib-*`
- [ ] Documentation: how to create a `smile-lib-*` package
- [ ] Publish the template repo and announce to the community
- [ ] Encourage other labs to publish domain-specific libraries
