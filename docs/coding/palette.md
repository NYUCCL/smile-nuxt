---
description: 'The command palette on the local dev server: type : to switch modes, jump to a view, zap the local state, autofill, open panels and search the docs from the keyboard.'
---

# Command palette

On the local dev server (`pnpm dev`), type `:` anywhere on the page to open the
command palette: a small box near the top where you type a command and press
`Enter`. It works in the participant view and in the developer tools, and you
can also open it with the `>_` button at the bottom of the dev tools' menu on
the left.

Commands are short words, like `dev` to open developer mode, `go consent` to
jump to the consent view, or `zap` to start over. You don't have to type all of
a command: `:d` is enough for `dev`, and letters in order with gaps also match
(`:cnsl` finds `console`). The best match is chosen as you type, so most
commands are `:`, a letter or two, and `Enter`.

![The command palette with nothing typed: a : prompt, the recent commands, then the commands by group, each with an icon, a short description and its keyboard shortcut.](/images/command-palette.webp)

::: tip Only on your computer
The command palette is part of the local dev server only. It isn't in a build,
so participants never see it, even with the dev tools included in a deployment.
:::

## Running a command

Type `:`, then the start of a command. The list under the box shows up to eight
matches, with the matched letters in bold, a short description and, where there
is one, the keyboard shortcut that does the same thing.

![The palette with co typed: config and console first, with the matched letters in bold, then db, vars and docs, which match through their other names.](/images/command-palette-matching.webp)

| Key                          | What it does                                      |
| ---------------------------- | ------------------------------------------------- |
| `↑` / `↓`                    | Choose a command in the list                      |
| `Tab`                        | Complete the chosen command                       |
| `Enter`                      | Run it                                            |
| `Esc`, or a click outside    | Close (with text typed: Vim's normal mode, below) |
| `Backspace` on an empty line | Close                                             |

With nothing typed, the list shows every command by group, with your most
recent commands at the top. `:` then `Enter` runs the last command again.

When a command works, the palette closes and you see the result: the mode
changes, the sidebar opens, the form fills in. When it can't (`:fill` on a view
with no autofill, `:go` to a view that doesn't exist), it says why under the
box and stays open so you can fix what you typed.

A `:` typed into a text box, a text area or a menu is just a colon: the palette
only opens when you aren't typing text. While it's open, the keys you type go
to the palette and nowhere else, so an experiment that records key presses
won't see them.

## Commands

Type `:help` to see every command with its other names.

### Modes

| Command  | Also     | What it does                                |
| -------- | -------- | ------------------------------------------- |
| `dev`    | devmode  | Developer mode                              |
| `pres`   |          | [Presentation mode](/presentation)          |
| `docs`   |          | Docs mode: these docs, inside the dev tools |
| `config` | settings | Build & deploy settings                     |
| `part`   |          | The participant view (from the dev tools)   |

From the participant view, the mode commands open the dev tools in that mode.

### Navigate

| Command     | Also | What it does                            |
| ----------- | ---- | --------------------------------------- |
| `go <view>` | goto | Go to a view                            |
| `next`      | n    | The next view in the timeline (`↓`)     |
| `prev`      | back | The previous view in the timeline (`↑`) |

`:go ` (with the space) lists the views in your [timeline](/coding/timeline),
with the one you're on marked. Keep typing to narrow the list, then press
`Enter`.

### Actions

| Command         | Also     | Shortcut | What it does                                                                    |
| --------------- | -------- | -------- | ------------------------------------------------------------------------------- |
| `zap`           | reset    | `Ctrl R` | Zap the local state and reload: start over ([Persistence](/coding/persistence)) |
| `fill`          | autofill | `Ctrl A` | [Autofill](/coding/autofill) the current view                                   |
| `pin`           | unpin    | `Ctrl P` | Pin or unpin the current view                                                   |
| `db`            | connect  | `Ctrl D` | Connect to the database                                                         |
| `dark`, `light` |          |          | The dev tools' theme                                                            |
| `reload`        | refresh  | `⌘ R`    | Reload the page                                                                 |
| `full`          |          |          | Full screen, or back to the responsive device preview                           |

### Panels

| Command          | Shortcut     | What it does                          |
| ---------------- | ------------ | ------------------------------------- |
| `side`           | `Ctrl 1`     | Show or hide the sidebar              |
| `side steps`     |              | The sidebar, on its Steps tab         |
| `side random`    |              | The sidebar, on its Random tab        |
| `side info`      |              | The sidebar, on its Info tab          |
| `console`        | `` Ctrl ` `` | Show or hide the console              |
| `console data`   |              | The console, on its Data Explorer tab |
| `console log`    |              | The console, on its Narrative Log tab |
| `console vars`   |              | The console, on its Configuration tab |

Typing a panel's command lists its tabs under it (`:side` shows `side`,
`side steps`, `side random` and `side info`), and more letters pick one
(`:side st`). A tab's own name works too: `:steps` is `side steps`, and
`:log` is `console log`.

### Search the docs

Type `:/` and some words to search these docs. The results show as you type;
press `Enter` to open the one you've chosen in Docs mode, at that section.
`:s`, `:search` and `:find` do the same.

## In the participant view

The participant view (your experiment as participants see it, at `/`) has the
palette too, with the commands that make sense there: the modes, `go`, `next`,
`prev`, `zap`, `fill`, `reload`, the docs search and `help`. The panel
commands, `pin`, `db` and the theme commands are only in the dev tools.

## Vim keys

If you use Vim, the palette has a few of its keys. While typing, `Ctrl` + `J` /
`Ctrl` + `K` (or `Ctrl` + `N` / `Ctrl` + `P`) move through the list,
`Ctrl` + `W` deletes a word and `Ctrl` + `U` clears the line.

Press `Esc` with something typed to go to normal mode (the box says NORMAL):

| Key            | What it does             |
| -------------- | ------------------------ |
| `j` / `k`      | Move down / up the list  |
| `gg` / `G`     | The first / last command |
| `Enter` or `l` | Run it                   |
| `i` or `a`     | Back to typing           |
| `dd` or `cc`   | Clear the line and type  |
| `Esc` or `q`   | Close                    |
