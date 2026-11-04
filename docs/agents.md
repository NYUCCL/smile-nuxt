---
description: "Using coding agents (Claude Code, Codex, Cursor) with a Smile project: they read the docs installed with the module and follow the project's guide to Smile's API and conventions."
---

# Leveraging agents

A coding agent such as [Claude Code](https://claude.com/claude-code) or
[Codex](https://openai.com/codex/) can work on your experiment with you: answer
questions about <SmileText/>, write a new task component, add steps to the
timeline, or write a test. Every new project comes set up for this. The agent
finds these docs on its own, for the exact version of <SmileText/> you have
installed, and a guide in the project tells it how <SmileText/> projects are
built.

## Start an agent in your project folder

Open a terminal in your project folder (the one with `design.js` and
`package.json`) and start the agent there:

```sh
cd my-experiment
claude   # Claude Code
codex    # Codex
```

Then ask in plain language, for example:

- "How do I show the trials in a random order?"
- "Make a task where people press F or J to say whether a word is a noun,
  with 20 trials, and record the response and reaction time."
- "Add a test that goes through my new task."

Run `pnpm dev` in another terminal so you can try what the agent makes at
`http://localhost:3000`, with the dev tools at `/dev/`.

Cursor and other editors with an agent work the same way: open the project
folder in the editor.

## What the agent knows

### The docs, for your version

These docs are installed with the module, as markdown, in
`node_modules/@nyuccl/smile-nuxt/dist/docs/`. `INDEX.md` there lists every
page with a one-line summary, so the agent can find the right page for a
question and read it. Updating <SmileText/> updates the docs too, so the agent
never reads about an API your version doesn't have. When the docs and the
code disagree, the agent is told to trust the code, which is in
`node_modules/@nyuccl/smile-nuxt/dist/runtime/`.

The same pages are in the dev tools: open `/dev/` and pick Docs in the rail.

### The project guide

The template includes files that agents read when they start in the folder:

| File | Read by | What it says |
|---|---|---|
| `AGENTS.md` | Codex, Cursor and most other agents | The project layout, auto-imports, the timeline in `design.js`, the API, recording data, overriding built-ins, styling, tests and conventions, and where the docs are |
| `CLAUDE.md` | Claude Code | Loads `AGENTS.md`, and points to the `smile-docs` skill |
| `.claude/skills/smile-docs/` | Claude Code | A skill that answers questions about <SmileText/> from the installed docs and cites the page it used |
| `.cursor/rules/smile.mdc` | Cursor | Points to `AGENTS.md` and the docs |

The guide in `AGENTS.md` steers the agent toward the way <SmileText/> is
meant to be used, so new components fit in with the built-in ones:

- Use `useViewAPI()` in a View and `useAPI()` elsewhere, without importing
  them (they're auto-imported).
- Add Views to the timeline with `timeline.pushSeqView()`, and use
  `api.steps` for multi-trial tasks.
- Record data with `api.recordPageData()` or `api.recordStep()`, in the
  shapes the database accepts.
- Wrap task content in `ConstrainedTaskWindow`, and use Tailwind and the
  built-in UI components (`Button`, `Card`, ...) rather than new ones with
  the same names.
- Keep global CSS in `@layer base` or `@layer components`, so it doesn't
  override <SmileText/>'s built-in components.
- Add a Playwright test when adding or changing a task.

You can add your own notes to `AGENTS.md`, such as your design, your
conditions or your lab's conventions, and the agent will follow them too.

## Check the agent's work

An agent can be wrong, and it's your experiment. Before you collect data:

- Read the code it wrote, and go through the experiment yourself in the dev
  tools.
- Check what is recorded: the dev tools show the data as you go, and
  [Data storage](/coding/datastorage) explains the format.
- Run the tests (`pnpm test:e2e`).
- Make sure the consent form, debrief and recruitment settings are the
  ones your IRB approved.

## A project from before these files

Projects created before the agent files were added can copy them from the
template. See [Docs for coding agents](/updating#docs-for-coding-agents).
