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
| CSS rules            | ✅ Yes         | Module's `main.css` loads first; your `app.css` loads after, so your rules win at equal specificity |
| CSS variables (theme tokens) | ✅ Yes | Same as above — redefine `--primary` etc. in your `app.css` |
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

The module loads its global stylesheet (`runtime/css/main.css`) at the
front of Nuxt's CSS array. Your project's `assets/css/app.css` is then
registered after, so the final load order is:

1. Module's `runtime/css/main.css`
2. Your `assets/css/app.css`

This means **your `app.css` wins at equal specificity** — the natural
expectation for module-vs-project styling. Three practical cases:

### Tailwind utility classes

Unaffected by load order. Tailwind processes utilities at compile time,
so `bg-primary` and `text-lg` behave the same regardless of which CSS
file is loaded first.

### Custom CSS rules

Your `app.css` wins. Both of these work as you'd expect:

```css
/* assets/css/app.css */

/* Override a built-in rule */
body {
  font-family: 'Comic Sans MS', cursive;
}

/* Your own rules */
.my-task-container {
  background: oklch(0.95 0.1 280);
  border-radius: 12px;
}
```

### CSS variables / theme tokens

The module defines theme tokens like `--primary`, `--background`, and a
long list of `--*-button` colors in `:root, .light` and `.dark` blocks.
To rebrand the experiment, just redefine the ones you care about in your
`app.css`:

```css
/* assets/css/app.css */

:root,
.light {
  --primary: oklch(0.55 0.2 250);
  --primary-button: oklch(0.55 0.2 250);
  --primary-button-foreground: oklch(0.985 0 0);
}

.dark {
  --primary: oklch(0.7 0.18 250);
}
```

No higher-specificity gymnastics needed.

### Color mode (light/dark)

Theme tokens are defined twice in `main.css` — once in `:root, .light`
and once in `.dark`. Override the relevant block(s) in your `app.css`
using the matching selector.

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
user wins?      ✅ always            n/a (separate URLs) ✅ at equal
                (priority 1 > -1)                          specificity

module path     module dirs at       /_smile/*           main.css (loads first)
                priority: -1

user path       components/          public/             assets/css/app.css
                                                         (loads after main.css)

shadowing       drop same-named      no override —       redefine the
                file in              they coexist        rule / variable
                components/                              in app.css
```

## Next steps

- [Components](/coding/components) — how to build your own components
- [Project Organization](/coding/organization) — where files live
- [Configuring](/coding/configuration) — env vars and runtime config
