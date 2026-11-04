---
description: "How your project's files take priority over SMILE's built-ins: overriding Vue components, public assets, CSS theme tokens and composables, and a cheat sheet of what wins when names collide."
---

# Overriding Builtins

Your code and the `@nyuccl/smile-nuxt` module both contribute components,
assets, and styles to the same Nuxt application. This page explains the
precedence rules — who wins when names collide — and one important footgun
(accidentally shadowing a built-in UI primitive).

The short version:

| Layer                                 | Project wins?             | Mechanism                                                                 |
| ------------------------------------- | ------------------------- | ------------------------------------------------------------------------- |
| Built-in views (string-referenced)    | ✅ Yes                    | Local `components/` has higher priority than module dirs (`priority: -1`) |
| UI primitives & layouts (`Button`, …) | ⚠️ Yes, everywhere — discouraged | Module ships source, so a local `Button.vue` also replaces `<Button>` *inside* built-in views and can break them; SMILE prints a build warning |
| Public assets                         | N/A                       | No collision — different URL namespaces (`/` vs `/_smile/`)               |
| CSS rules                             | ✅ Yes                    | Module's `main.css` loads first; your `app.css` wins at equal specificity. Put global rules in a cascade layer so they don't override SMILE's components ([below](#adding-your-own-css)) |
| CSS variables (theme tokens)          | ✅ Yes                    | Same as above — redefine `--primary` etc. in your `app.css`               |
| Composables / API                     | N/A                       | Module exposes `useAPI()` etc.; project doesn't redefine these            |

## Vue components

Any time the module registers a component (via `addComponentsDir`), it does
so with `priority: -1`. Nuxt's component resolver uses priority to break
name collisions: higher priority wins. Your local `components/` is
registered by Nuxt itself with the default priority, so a same-named file
there outranks the module's version.

But there's an important wrinkle: **where the lookup happens matters**.

- **Runtime lookups (string-named built-ins)** — fully overridable. The
  timeline references built-in views by string (`component:
'InformedConsentView'`), and Vue resolves that name at render time
  against the global component registry. The module's `components:extend`
  hook promotes your local override to `global: true`, so Vue finds your
  version. Dropping `components/AdvertisementView.vue` into your project
  replaces the built-in everywhere — including in the string-reference in
  `design.js`.

- **UI primitives & layouts (e.g. `<Button>`, `<CenteredContent>`)** —
  overridable, but **everywhere at once**, which is usually not what you
  want. The module ships its runtime `.vue` files as _source_, compiled
  inside your app — so a local `components/Button.vue` becomes _the_
  `Button` in the shared registry and replaces `<Button>` **inside SMILE's
  own built-in views too** (e.g. `InformedConsentView`). Because your
  version rarely matches the props those views pass (`variant`, `size`, …),
  this typically **breaks them**. SMILE prints a build warning when it
  detects a local file shadowing a built-in primitive.

::: warning Don't accidentally shadow a built-in primitive
There are ~150 built-in UI/form/layout components (`Button`, `Checkbox`,
`Input`, `Card`, `Select`, …). Naming one of your own components the same
silently replaces it everywhere, including inside SMILE's built-in views.
Prefer a unique name (`MyButton`, `MyCheckbox`) for your own components.
:::

If you genuinely want to change a UI primitive's look:

- **inside a built-in view** — override the **entire** view (using the
  timeline's [two-approach override pattern](/coding/timeline#overriding-a-built-in-view))
  and use your custom component inside that override; or
- **globally** — restyle via CSS theme tokens in `assets/css/app.css`
  (see [CSS](#css) below) rather than replacing the component.

The module registers four directories at `priority: -1`:

- `components/ui/` — shadcn-vue primitives (`Button`, `Card`, `Input`, …)
  — a same-named local file overrides these **everywhere** (built-in views
  included); discouraged, and SMILE warns you
- `components/forms/` — form pieces — same caveat as `ui/`
- `components/layouts/` — `ConstrainedTaskWindow`, `TwoCol`, etc. —
  same caveat as `ui/`
- `components/builtins/` — full views (`InformedConsentView`,
  `DemographicSurveyView`, `WindowSizerView`, `DebriefView`, …) —
  **fully overrideable** everywhere, because the timeline references them
  by string at runtime (this is the intended override path)

::: info Why string references still work after an override
When Nuxt detects that your local component shadows a global module
component, the module's `components:extend` hook promotes your local
component to `global: true` automatically. This means
`<component :is="'AdvertisementView'">` and string references in
`design.js` resolve to your override, not the module's original.
:::

### Customizing without overriding the whole view

For the most common customizations — consent body text, debrief body text,
welcome ad text — you don't need to override the full view. The built-in
views accept "text" components as registered app components:

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

| What                  | URL prefix          | How to reference                    |
| --------------------- | ------------------- | ----------------------------------- |
| Your `public/cat.png` | `/cat.png`                 | `api.getPublicUrl('cat.png')`              |
| Module's `smile.svg`  | `/_smile/images/smile.svg` | `api.getCoreStaticUrl('images/smile.svg')` |

If you put `public/smile.svg` in your project, it does **not** replace the
module's `/_smile/images/smile.svg`. It just becomes a separate file available
at `/smile.svg`.

To swap the university logo shown by the welcome page, set
`VITE_BRAND_LOGO_FN` in `.env` and put your image in `public/`:

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
expectation for module-vs-project styling. Load order isn't the whole story,
though: Tailwind keeps its styles in cascade layers, and that changes what a
rule in `app.css` can override (see
[Adding your own CSS](#adding-your-own-css) below).

To rebrand the experiment, redefine the theme tokens you care about in
your `app.css`:

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

Theme tokens are defined twice in the module's `main.css` — once in
`:root, .light` and once in `.dark`. Override the relevant block(s) in
your `app.css` using the matching selector.

### Adding your own CSS

`app.css` is global: its rules apply to every page, including SMILE's
built-in components (the buttons, the consent and demographic forms, the
withdraw dialog) and, while you develop, the dev tools around your
experiment. A rule like `button { padding: 0 }` reaches all of those, not
just your own buttons.

It can also win more often than you'd expect. Tailwind puts its styles in
[cascade layers](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Cascade_layers)
(`theme`, `base`, `components`, `utilities`), and the browser lets a rule
that isn't in any layer beat every layered rule, whatever their
specificity. So a plain `button { padding: 0 }` in `app.css` overrides the
`px-4` on SMILE's own Button, even though a class normally beats an
element selector.

To add styles without changing SMILE's components:

1. **Change a color, radius or font:** redefine the theme tokens (above).
   SMILE's components read them too, so everything changes together.
2. **Style one of your own components:** use a `<style scoped>` block in
   its `.vue` file, or Tailwind classes in its template. Scoped styles apply
   only to that component's elements
   (see [Components](/coding/components)).
3. **Set defaults for plain elements** (headings, links, paragraphs), or
   share a class across your Views: put the rules in a layer in `app.css`.
   Layered rules lose to Tailwind's utilities, so any class SMILE (or you)
   puts on an element still wins:

   ```css
   /* assets/css/app.css */
   @layer base {
     h1 {
       font-size: 2rem;
       font-weight: 700;
     }
   }

   @layer components {
     .stimulus-card {
       border: 1px solid var(--border);
       border-radius: var(--radius);
       padding: 1.5rem;
     }
   }
   ```

   These join the layers Tailwind already declared (the module's `main.css`
   loads first), so `base` rules sit under everything else and `components`
   rules sit under the utilities.
4. **Keep element selectors to your own pages:** put a class on the outer
   element of your Views and start your selectors with it
   (`.my-task button { … }`), rather than styling every `button`.

Avoid unlayered rules on bare elements (`button`, `input`, `*`) and
`!important` in `app.css`: those are what reach into SMILE's components and
the dev tools. To change how one of SMILE's built-in Views looks, override
that View ([how](/coding/timeline#overriding-a-built-in-view)) rather than
restyling it from outside.

## Composables and API

The module exposes a handful of auto-imported composables (`useAPI`,
`useViewAPI`, `useTimeline`, `useStepper`, `useSmileStore`, `useLog`,
`useSmileColorMode`, plus the `Timeline` class). These don't have an
override system — you use them as-is in your `.vue` files.

You **can** create your own composables in a project-level `composables/`
directory and Nuxt will auto-import them alongside the module's. They
live in a separate namespace; nothing collides.

## Building a library of SMILE-based components

Two patterns work here.

**A reusable component library as a separate Nuxt module.** If you want
to publish a set of SMILE-based components for other labs to install
(e.g., `@yourlab/smile-stroop` with a polished Stroop task), publish it
as a Nuxt module that calls `addComponentsDir` for its components.
Register at `priority: -1` (matching `@nyuccl/smile-nuxt`) so the
consumer's local `components/` still wins. The resolution chain becomes:

```
user components/  >  @yourlab/smile-stroop  >  @nyuccl/smile-nuxt
(default priority)   (priority: -1)              (priority: -1)
```

If two libraries register components at equal priority with the same
name, the last one to register wins — order modules in `nuxt.config.ts`
deliberately.

**A simple npm package of `.vue` files.** For something lighter, publish
plain Vue SFCs in an npm package and have consumers import them
explicitly in `design.js`:

```js
import { TrustGameView } from '@yourlab/smile-economic-tasks'

timeline.pushSeqView({
  name: 'trust-game',
  component: markRaw(TrustGameView),
})
```

No module needed; no auto-import; no precedence questions. The trade-off
is that consumers can't override your components by dropping a same-named
file in their `components/`.

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
                (views: intended;
                 primitives: warns,
                 affects built-ins)
```

## Next steps

- [Project Organization](/coding/organization) — the file-and-folder tour.
- [Components](/coding/components) — building custom views.
- [Timeline and Design File](/coding/timeline) — `design.js` in depth.
