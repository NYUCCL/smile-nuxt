---
description: "Dark mode in SMILE experiments: setting it with VITE_COLOR_MODE or at runtime, things to consider for experiments, and the dev tools' theme controls."
---

# Dark Mode

Smile supports dark mode in a highly configurable way. Sometimes dark mode is
helpful for people to increase visibility for reading text. Other times though
dark mode might be undesirable because it alters the colors of an experiment in
a perceptually important way.

Smile allows customization of the dark mode settings for your experiment. You
can set it to always prefer light mode, always prefer dark mode, or to fall back
to the user's "system" setting, which is usually passed through by the browser.

## Configuration

The setting has three values:

| Value    | What participants see                                                         |
| -------- | ----------------------------------------------------------------------------- |
| `light`  | Always light, whatever their system prefers. **The default.**                 |
| `dark`   | Always dark.                                                                  |
| `system` | Their operating system / browser setting (`prefers-color-scheme`), live: if it changes mid-session, the page follows. `auto` means the same. |

Anything else (or leaving it unset) is `light`, since dark mode changes how
stimuli look and should be a deliberate choice.

### Environment Variable

Set `VITE_COLOR_MODE` in your project's `.env`:

```
VITE_COLOR_MODE = light    # Always use light mode
VITE_COLOR_MODE = dark     # Always use dark mode
VITE_COLOR_MODE = system   # Use system preference
```

### Runtime Configuration

Or set it in `design.js`, which overrides the environment variable:

```js
api.setRuntimeConfig('colorMode', 'light') // Always use light mode
api.setRuntimeConfig('colorMode', 'dark') // Always use dark mode
api.setRuntimeConfig('colorMode', 'system') // Use system preference
```

The mode is applied to the page's `<html>` element (the `dark` or `light`
class), so dialogs, menus and tooltips match the rest of the page. Style your
own components with Tailwind's `dark:` variant or the theme tokens
(`bg-background`, `text-foreground`, …) and they follow along.

## Experimental Considerations

When designing your experiment, consider whether dark mode is appropriate for
your specific use case:

- **Perceptual Studies**: Dark mode changes the contrast and color properties of
  the entire interface, which could interfere with visual perception
  experiments, color discrimination tasks, or studies involving visual stimuli
  where contrast is important.

- **Reading Studies**: Dark mode can improve readability and reduce eye strain
  for text-heavy experiments or long reading tasks.

- **General Use**: For most standard experiments, either mode works well, but
  consider your specific experimental requirements when making this choice.

## Developer Tools

The developer mode tools have a separate dark mode configuration. The
experiment preview starts in your experiment's own setting; picking a mode in
the dev tools changes only the preview (and is remembered in your browser), not
what participants get. You can toggle
dark mode for the developer tools irrespective of what you choose for the
experiment itself. This allows you to use dark mode for development while
keeping your experiment in light mode, or vice versa.

The dark mode button on the sidebar (lower left corner) sets the theme of the
developer tools themselves. It starts on your system setting and cycles
system → light → dark. The sidebar on the right has a dropdown for
configuring the dark mode for the experiment. In addition, the developer tools
have a dark mode button in the top toolbar (upper right corner).

In presentation mode, the dark mode button in the top toolbar (upper right
corner) will toggle the dark mode for the presentation mode. Like the sidebar
button, these cycle system → light → dark.
