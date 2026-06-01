# Overrides & Resolution

When you scaffold a SMILE project, both your code and the
`@nyuccl/smile-nuxt` module contribute components, assets, and styles to the
same Nuxt application. This page explains the precedence rules: who wins
when names collide.

The short version:

| Layer                | Project wins?  | Mechanism                                |
| -------------------- | -------------- | ---------------------------------------- |
| Vue components       | ✅ Yes         | Local `components/` has higher priority than module dirs (`priority: -1`) |
| Public assets        | N/A            | No collision — different URL namespaces (`/` vs `/_smile/`) |
| CSS rules            | ⚠️ No, by default | Module's `main.css` loads after your `app.css` — module wins for equal specificity |
| CSS variables (theme tokens) | ⚠️ Override with higher specificity | Same as above |
| Composables / API     | N/A            | Module exposes `useAPI()`, etc.; project doesn't redefine these |

## Vue components

This is the cleanest part of the system. Any time the module registers a
component (via `addComponentsDir`), it does so with `priority: -1`. Nuxt's
component resolver uses priority to break name collisions: higher priority
wins.

Your local `components/` directory is registered by Nuxt itself with the
default priority (effectively `1`), so **a file in your `components/`
with the same name as a module component replaces it everywhere**.

The module registers four directories at `priority: -1`:

- `components/ui/` — shadcn-vue primitives (`Button`, `Card`, `Input`, …)
- `components/forms/` — form pieces (survey scaffolding, demographic widgets)
- `components/layouts/` — `ConstrainedTaskWindow`, `TwoCol`, etc.
- `components/builtins/` — full views (`InformedConsentView`,
  `DemographicSurveyView`, `WindowSizerView`, `DebriefView`, …)

So if you want a custom welcome page, just drop
`components/AdvertisementView.vue` into your project. Your version
replaces the built-in everywhere — including inside `design.js` where the
timeline still references `'AdvertisementView'` as a string.

::: info Why string references still work after an override
When Nuxt detects that your local component shadows a global module
component, the module's `components:extend` hook promotes your local
component to `global: true` automatically. This means
`<component :is="'AdvertisementView'">` and string references in
`design.js` resolve to your override, not the module's original.
:::

### Customizing without overriding the whole view

For the most common customizations — consent body text, debrief body
text, welcome ad text — you don't need to override the full view.
The built-in views accept "text" components as registered app components:

```js
api.setAppComponent('informed_consent_text', InformedConsentText)
```

This is set in `design.js`, with `InformedConsentText` being a regular
component in your project's `components/` folder. The built-in
`InformedConsentView` consumes this and renders your text inside its own
layout. Less destructive than replacing the whole view.

## Public assets (images, videos, stimuli)

There's no override system here because **there's nothing to override**.
The module's static assets and your project's static assets live at
completely separate URLs.

| What                   | URL prefix      | How to reference                  |
| ---------------------- | --------------- | --------------------------------- |
| Your `public/cat.png`  | `/cat.png`      | `api.getPublicUrl('cat.png')`     |
| Module's `smile.svg`   | `/_smile/smile.svg` | `api.getCoreStaticUrl('smile.svg')` |

If you put `public/smile.svg` in your project, it does **not** replace
the module's `/_smile/smile.svg`. It just becomes a separate file
available at `/smile.svg`. Helper functions reflect this:

- Use `api.getPublicUrl(name)` for project assets in `public/`
- Use `api.getCoreStaticUrl(name)` for module assets (rarely needed
  outside built-in views)

### Assets used by built-in views

If you want to swap the university logo shown by the welcome page, the
built-in `AdvertisementView` reads its logo path from
`VITE_BRAND_LOGO_FN` in `.env`. Put your image at `public/mylogo.png`
and set:

```ini
VITE_BRAND_LOGO_FN = mylogo.png
```

This is a configuration override, not an asset override.

## CSS

The module loads its global stylesheet (`runtime/css/main.css`) via
`_nuxt.options.css.push()`. Your project's `assets/css/app.css` is
registered first (in your `nuxt.config.ts`), so the final load order is:

1. Your `assets/css/app.css`
2. Module's `runtime/css/main.css`

For equal-specificity selectors, **the module's styles win** because they
load second. This is the opposite of what you might expect — heads-up.

### What this means in practice

- **Tailwind utility classes** are unaffected — Tailwind processes
  utilities at compile time and the cascade order doesn't matter for
  classes like `bg-primary` or `text-lg`.
- **Custom CSS rules** you write in `app.css` (e.g.,
  `.my-task-container { ... }`) work fine as long as you're not naming
  the same class the module uses.
- **CSS variables / theme tokens** (the module defines a long list of
  `--primary`, `--background`, `--sidebar-bg`, etc.) require higher
  specificity to override:

  ```css
  /* assets/css/app.css */

  /* This may NOT work — module's :root loads after */
  :root {
    --primary: oklch(0.55 0.2 250);
  }

  /* This DOES work — higher specificity wins */
  html:root,
  html.light {
    --primary: oklch(0.55 0.2 250);
  }
  ```

  Or define them in a `@layer` that the module doesn't use, since later
  layers always beat earlier layers.

::: warning This is a current design quirk
A future module update may load `main.css` first (so your `app.css`
wins by default). Until then, plan for the override-with-higher-specificity
pattern when customizing theme tokens.
:::

### Color mode (light/dark)

Theme tokens are defined twice in `main.css` — once in `:root, .light`
and once in `.dark`. To override a dark-mode color specifically, target
`html.dark` (or higher specificity) in your `app.css`.

## Composables and API

The module exposes a handful of auto-imported composables (`useAPI`,
`useViewAPI`, `useTimeline`, `useStepper`, `useSmileStore`, `useLog`,
`useSmileColorMode`, plus the `Timeline` class). These don't have an
override system — you use them as-is in your `.vue` files.

You **can** create your own composables in a project-level
`composables/` directory and Nuxt will auto-import them alongside the
module's. They live in a separate namespace; nothing collides.

## Building a library of SMILE-based components

Two patterns work here:

### A reusable component library as a separate Nuxt module

If you want to publish a set of SMILE-based components for other labs to
install (e.g., `@yourlab/smile-stroop` with a polished Stroop task), the
standard pattern is to publish it as a Nuxt module that calls
`addComponentsDir` for its components.

A good convention is to also register at `priority: -1` (matching
`@nyuccl/smile-nuxt`) so that the **consumer's** local `components/`
still wins over your library. The resolution chain becomes:

```
user components/  >  @yourlab/smile-stroop  >  @nyuccl/smile-nuxt
(default priority)   (priority: -1)              (priority: -1)
```

If two libraries register components at equal priority with the same
name, the last one to register wins — order modules in `nuxt.config.ts`
deliberately.

### A simple npm package of `.vue` files

For something lighter — say, a few useful task components — you can
publish them as plain Vue SFCs in an npm package and have consumers
import them explicitly in `design.js`:

```js
import { TrustGameView } from '@yourlab/smile-economic-tasks'

timeline.pushSeqView({
  name: 'trust-game',
  component: markRaw(TrustGameView),
})
```

No module needed; no auto-import; no precedence questions. The trade-off
is that consumers can't override your components by dropping a
same-named file in their `components/` folder, because there's no
`addComponentsDir` registration. That's often fine.

## Cheat sheet

```
                Vue component        Public asset        CSS rule
                ─────────────        ────────────        ────────
user wins?      ✅ always            n/a (separate URLs) ⚠️ needs higher
                (priority 1 > -1)                          specificity

module path     module dirs at       /_smile/*           main.css
                priority: -1

user path       components/          public/             assets/css/app.css

shadowing       drop same-named      no override —       use html:root or
                file in              they coexist        higher-specificity
                components/                              selectors
```

## Next steps

- [Components](/coding/components) — how to build your own components
- [Project Organization](/coding/organization) — where files live
- [Configuring](/coding/configuration) — env vars and runtime config
