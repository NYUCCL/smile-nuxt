# Plan: docs in the dev tools, and docs for coding agents

Issue: #34 ("Agent skill for the docs (and maybe serve docs in dev mode)").
Status: Phases 0 and 1 merged (#67, #68). Phase 2 built on `dev-docs-mode`.

## The short version

1. **Do agents first.** Ship the docs markdown inside the npm package, add a
   generated page index, and put a small `smile-docs` skill plus an `AGENTS.md`
   in the `start/` template that point at it. About 140 KB added to the package.
   The docs always match the installed module version, with no syncing step.
2. **Then a Docs mode in the dev tools.** Use the same shipped markdown. A
   dev-only server route renders it to HTML, and a new Docs view in the
   dev layout shows it, styled with the `--sd-*` tokens. Text, search, and
   links between pages work offline. Images and live demos fall back to the
   website.
3. **Later, maybe.** `llms.txt` on the website. An MCP server only if agents
   turn out to struggle with plain files, which seems unlikely.

Todd's second comment on #34 already drops the in-app AI chat. This plan
assumes it stays dropped.

## How docs reach a user's project

The docs ride with the module, not with the template:

```
docs/*.md  --(pnpm release, copied as-is)-->  npm package  --(pnpm install)-->  node_modules/@nyuccl/smile-nuxt/docs/
start/     --(create-smile-nuxt)-->  AGENTS.md, CLAUDE.md, .claude/skills/smile-docs  (pointers only, no docs text)
```

- Editing a page in `docs/` needs no template change. The next module release
  carries the markdown unchanged. Users get it with `pnpm update`, and the
  version always matches the module they run.
- The template files contain only the path and how to search it. They never
  need updating when the docs change.
- Docs are not copied into the project itself. A copy would stay at the
  version the project was created with and drift after every upgrade.
- The one generated file, `INDEX.md`, is built from the pages and the sidebar
  at release time. It adds to the pages and never edits them.

---

## Current state

**Docs site**
- VitePress site in `docs/`, config in `docs/.vitepress/config.mjs`, published
  at https://smile.gureckislab.org. The sidebar is defined inline in that config.
- 46 markdown pages, about 400 KB of text and 55k words (roughly 75k tokens).
  Compressed with tar+gzip it is about 140 KB.
- Media is large: `docs/images` 23 MB, `docs/public/images` 5.8 MB,
  `docs/videos` + `docs/public/videos` about 32 MB. The built site
  (`docs/.vitepress/dist`) is 35 MB, of which 9.8 MB is JS/CSS in `assets/`.
- The pages use VitePress features: containers (`::: tip/warning/info/danger/
  details/raw/code-group`), about 188 internal links, 23 markdown images plus
  18 `<img>` tags, 4 `<video>` tags.
- They also use live Vue components, registered in `docs/.vitepress/theme/index.js`,
  which imports the module's own components through `@/runtime/...`:
  `SmileText` (89 uses), `ComponentViewer` (18 live demos), `Motion`, `Button`,
  layout components, and several `*Example` components.
- **The content is still partly SPA-era.** `plans/docs_rewrite.md` says so, and
  5 pages still show `@/core/...` imports. Any plan that hands the docs to
  agents has to deal with that (see Risks).

**Dev tools**
- `src/runtime/layouts/development.vue` (lines ~74–85): when
  `store.dev.mainView === 'docs'`, it shows an `<iframe src="https://smile.gureckislab.org">`.
  It needs a network connection, always shows the latest docs (not the
  installed version), and doesn't use the dev tools theme.
- `src/runtime/components/dev/menu/SmileDevAppMenu.vue`: the `modes` array has
  only `devmode` and `presentation`. A comment says docs (`BookMarked` icon)
  come back "when they're ready".
- The dev tools theme lives in `src/runtime/css/dev-theme.css` (`--sd-*`
  tokens), with palettes in progress on branch `dev-tools-theme`
  (`dev-palettes.css`, `useDevPalette.js`).
- Production gating: `src/module.ts` `resolveDevToolsBuild()` sets
  `includeDevTools`. Dev tools are always on under `nuxt dev`, and are left out
  of production builds unless `SMILE_DEV_TOOLS=include` is set. There is also a
  separate `if (_nuxt.options.dev)` block (around line 350) for things that
  should only ever run under `nuxt dev`.

**Package and template**
- `package.json` `files: ["dist"]`. Docs are not in the package. The published
  beta.8 is 3.9 MB unpacked, 837 files. `dist/runtime/` contains the module's
  runtime source (`.vue`/`.js`), so agents can already read the real code at
  `node_modules/@nyuccl/smile-nuxt/dist/runtime/`.
- `start/CLAUDE.md` is a hand-written summary of the API (accurate, Nuxt-era,
  but it says "Nuxt 3"). `start/.cursor/rules/smile.mdc` (90 lines) repeats
  much of it, and also says Nuxt 3. There is no `start/AGENTS.md` and no
  `start/.claude/`.
- `create-smile-nuxt/src/index.mjs` downloads `start/` with giget from the git
  tag matching npm `latest`. Dotfiles come along (`.cursor/` already does), so
  a `start/.claude/skills/` folder would too. Template changes reach users only
  with the next module release.

**A finding that shapes the agent plan.** I tested ripgrep, which Claude
Code's Grep tool uses, on a pnpm-style `node_modules` that is gitignored and
symlinked. Searching from the project root finds **nothing** in
`node_modules`. Passing the path explicitly (`rg foo node_modules/@x/pkg/docs`)
works, symlink included. So an agent will not find the docs on its own. It has
to be told the exact path. That is what the skill and `AGENTS.md` are for.

---

## Part 1: Docs inside the dev tools

Goals: a Docs mode in the app menu that works offline, matches the installed
version, looks like the dev tools, and never ships to participants.

### Options

**A. Keep the iframe to the live site (today).**
- Costs nothing and looks exactly like the site.
- Needs a connection, shows the wrong version for anyone not on latest, and
  ignores the dev tools theme. A good fallback, not a solution.

**B. Bundle the prebuilt VitePress site and serve it from a dev-only route.**
- Build the site a second time with `base: '/__smile/docs/'`, leave out the
  videos, copy it into `dist/docs-site/`, serve it with a dev-only handler, and
  iframe it.
- Full fidelity: live `ComponentViewer` demos, VitePress search, sidebar,
  links all work.
- Size: at least 10 MB of JS/CSS and the search index, plus images (up to
  29 MB) unless they're trimmed. That is 3–10× the current package. Every
  release pays a second VitePress build.
- The theme is VitePress's. The VitePress CSS variables (`--vp-c-*`) could be
  mapped to `--sd-*`, since the iframe is same-origin and can read the parent's
  tokens. But it stays a different-looking app inside the dev tools.

**C. Ship the markdown and render it at runtime in the browser.**
- Small (about 140 KB compressed) and fully styled with `--sd-*`.
- It means shipping a markdown parser, plus plugins for VitePress containers
  and the sub/mark/footnote plugins, into the client. It also means handling or
  stubbing the Vue components in the pages. Search would be built in the
  browser.

**D. Ship the markdown and render it on a dev-only server route** (a variant
of C, recommended).
- `addDevServerHandler` (Nuxt kit) registers `/__smile/docs/*` only under
  `nuxt dev`. The handler reads `node_modules/@nyuccl/smile-nuxt/docs/*.md`,
  renders it with markdown-it and the same plugins the site uses, and returns
  `{ html, title, headings }`. A `/__smile/docs/search?q=` endpoint runs a small
  in-memory index (minisearch, or a plain substring scan over 46 pages).
- The client is one Vue view, `SmileDevDocsView`. It has a page list built
  from the generated index, the rendered HTML in a `.sd-prose` container styled
  with `--sd-*`, a search box, and an "Open on smile.gureckislab.org" link for
  the current page.
- Nothing reaches production. The route doesn't exist outside `nuxt dev`, and
  the view can be left out when `!nuxt.options.dev` (so even
  `SMILE_DEV_TOOLS=include` deploys don't carry it). Deployed dev tools can
  keep option A's iframe.
- The parser stays on the server, so the client bundle grows only by the view.
  markdown-it and its plugins become runtime `dependencies` of the module
  (small, already in the lockfile through VitePress).

### Details for option D

- **Version:** the markdown comes from the installed package, so it matches by
  construction. The view header shows `v<module version>`.
- **Links between pages:** rewrite `/coding/steps` and `../coding/steps.md`
  links on the server to in-app navigation, using
  `store.dev.docsPage = 'coding/steps'` and a `#hash` for anchors. External
  links open in a new tab.
- **Images:** don't ship 29 MB. Rewrite image `src` to
  `https://smile.gureckislab.org/images/...`. They work online and show alt
  text offline. Later, if offline images matter, ship only the referenced
  images (41 references) converted to webp, probably 2–4 MB. Measure before
  deciding. Videos always link out.
- **Vue components in markdown:** replace `<SmileText/>` and
  `<GureckisLabText/>` with plain text. Replace `ComponentViewer` and the
  `*Example` demos with a small card: "Live example — open on the website".
  Strip `<script setup>` blocks that are page code (not inside code fences).
  Unknown tags get the same card. A test lists any new component names, so they
  get a deliberate mapping.
- **Containers:** `markdown-it-container` for tip/warning/info/danger/details,
  rendered as dev-tools callouts. `code-group` renders as stacked code blocks
  with labels. `raw` passes through.
- **Code highlighting:** optional. Shiki on the server is heavy. Start with
  plain `<pre>` styled by the theme, and add highlighting later if wanted.
- **Sidebar and order:** move the sidebar array out of `config.mjs` into
  `docs/.vitepress/sidebar.mjs`, which the site config and the index generator
  both import. This is a config refactor, not a content change.

### Trade-off summary (Part 1)

| | Offline | Matches version | Dev tools theme | Package size | Live demos | Effort |
|---|---|---|---|---|---|---|
| A iframe site | no | no | no | 0 | yes | none |
| B bundled VitePress | yes | yes | partial | +10–40 MB | yes | medium |
| C client render | yes (text) | yes | yes | +~0.2 MB + parser in client | link out | medium |
| **D server render** | yes (text) | yes | yes | +~0.2 MB | link out | medium |

---

## Part 2: Docs for coding agents

Goal: an agent (Claude Code, Codex, Cursor…) working in a user's project can
answer questions from the docs for the version they have installed.

### Options

**a. Ship the markdown in the npm package.**
`files: ["dist", "docs/**/*.md", "!docs/.vitepress/**", "!docs/node_modules/**"]`
(or copy into `dist/docs/` at prepack). That adds about 140 KB to the tarball
and 400 KB unpacked (about 10%). The installed version is always the right
version, with no network and nothing to sync. This is the base the other
options build on. It costs almost nothing.

**b. A generated index: `docs/INDEX.md` (built at prepack, shipped, not in git).**
One line per page: path, title, and a one-sentence description (from
frontmatter `description:`, falling back to the first paragraph), grouped by
the sidebar sections. This is the "which page answers what" map from #34. It is
generated so it can't drift from the pages.

**c. `AGENTS.md` in `start/` (plus `CLAUDE.md` importing it).**
Codex, Cursor and others read `AGENTS.md`. Claude Code reads `CLAUDE.md`, which
can contain just `@AGENTS.md` plus anything specific to Claude. Move the
current `start/CLAUDE.md` content into `AGENTS.md` and add a "Docs" section:
the exact path, "search it with an explicit path, since node_modules is
ignored", and "when docs and code disagree, the code in `dist/runtime/` wins."
Fix "Nuxt 3" to "Nuxt 4". Shrink `.cursor/rules/smile.mdc` to a pointer to
`AGENTS.md`, or drop it. Cheap, works with every agent, but only for new
projects.

**d. A skill: `start/.claude/skills/smile-docs/SKILL.md`.**
Loads when the user asks about SMILE. Keep it thin and version-free: where the
docs are, how to search them (`rg -n <term> node_modules/@nyuccl/smile-nuxt/docs`,
read `INDEX.md` first), where the real source is, and the website URL for
images and demos. The page map lives in the package's `INDEX.md`, not in the
skill, so an old skill in an old project still points at current docs after an
upgrade. Claude Code only (other agents get the same text from `AGENTS.md`).

**e. Installing into existing projects.** Options: a CLI subcommand
(`pnpm create @nyuccl/smile-nuxt --agent-files`, or a small
`smile-nuxt agents` bin that copies `AGENTS.md`, `CLAUDE.md` and the skill
without overwriting). Or have the module write the skill at `nuxt prepare`.
Writing into a user's repo from a module is surprising, so if done at all it
should be opt-in. Or a section in `docs/updating.md` explaining what to copy.
Start with the docs section, and add a CLI command if people ask.

**f. `llms.txt` / `llms-full.txt`.**
Generate at docs build (`vitepress-plugin-llms`, or a 30-line script) and
publish on the site. It helps agents that work from the web with no local
install (ChatGPT, claude.ai, someone evaluating SMILE). `llms-full.txt`
(about 75k tokens) is too big to load whole, but it can be fetched and
searched. It always shows latest, not the installed version. Cheap, and
separate from the in-project story.

**g. MCP server** (a dev-server route or `smile-nuxt mcp` over stdio) with
`search_docs` and `read_doc` tools.
Agents already read and grep local files well, so this adds little beyond a
and b. Costs: a protocol dependency, users have to configure `.mcp.json`, the
route variant only works while `pnpm dev` runs, and it's one more thing to
keep working. It could become worthwhile if it offered things files can't, such
as "what is the current timeline", "list registered views", or "show recorded
data", which are live app state. That is a different feature from docs. Defer.

### Trade-off summary (Part 2)

| | Benefit | Cost | Version-correct |
|---|---|---|---|
| **a ship markdown** | the base for everything | +140 KB tarball | yes |
| **b INDEX.md** | fast "which page" lookups | small prepack script | yes |
| **c AGENTS.md** | every agent, every session | template edit | points to installed docs |
| **d skill** | Claude Code knows how to search | template edit | yes (thin skill) |
| e install CLI | existing projects | CLI code + release | yes |
| f llms.txt | web agents, no install | docs build step | latest only |
| g MCP | small for docs | real maintenance | yes |

---

## Recommendation

**Before anything:** Phase 0, fix the stale pages and add page descriptions.

**First step (one small PR, ships with the next module release):** a + b + c + d.
The agent gets the right docs for the installed version, knows where they are,
and knows the code is the final authority. No dev-tools code, no new runtime
dependencies, and it doesn't touch `src/runtime/`.

**Second:** Part 1 option D (server-rendered Docs mode), built on the same
shipped markdown and index. Wait until the `dev-tools-theme` branch lands, so
the view can use the final tokens.

**Later, if wanted:** f (`llms.txt` on the site), e (a CLI to add the agent
files to existing projects), shipping trimmed images. g (MCP) only if it's
about live app state, not docs.

---

## Phased plan

### Phase 0: fix and improve the docs first

Agents will repeat whatever the docs say, so the docs get fixed before they
ship to agents (Todd, 2026-11-03). Pages with old-version content, from a scan
checked against `src/` (the `VITE_*` variables are fine, since the module still
reads them):

| Page | What's stale |
|---|---|
| `coding/datastorage.md` | Firebase console walkthrough and screenshots, `docRef` / `firebaseDocID` fields, `@/core/...` imports |
| `recruit/bonuses.md` | Whole page is Firebase Cloud Functions |
| `analysis.md` | Downloading data "from Firebase", Firebase document IDs |
| `api.md` | `@/core/...` imports, `src/user/assets/` |
| `coding/steps.md` | `@/core/composables/useViewAPI` imports (3) |
| `coding/randomization.md` | `@/core/composables/useAPI` imports (4) |
| `styling/imagesvideo.md` | `src/user/assets/` folder, `@/core/...` import |
| `presentation.md` | `src/userPresentationModeView.vue` path |

**Status (2026-11-03):** the 8 pages are fixed on branch `docs-refresh`
(worktree `~/projects/smile-nuxt-docs`), uncommitted, along with small fixes on
`styling/uikit.md` and `contributing.md`. `recruit/bonuses.md` and
`recruit/dashboard.md` are deleted, `test/docs/stale-content.test.js` is
added, and 8 pages have `description:`. Data export waits for the dashboard
(#45); until then the docs show the `sqlite3` method.

Second pass (same day): every page in the sidebar has a `description:`;
`api.getRuntimeConfig` (doesn't exist) is now `api.getConfig`; user-facing
`@/runtime/...` imports are gone from `uikit.md` and `layouts.md` (the example
viewer strips them from displayed source; the test now bans `@/runtime/` in
markdown); the lucide-vue-next icon example uses `<i-lucide-…>`; links to the
old `NYUCCL/smile` repo (edit link, releases, GitHub icon, issues, Actions, a
source link) point to `smile-nuxt`. The open docs issues (#13, #14, #35, #46)
are already closed. The orphan stub pages (`problems`, `qualitycontrol`,
`reactive`, `recruit/ethics`, `advanced/notes`) are deleted. The Discussions
link stays on `NYUCCL/smile`, since `smile-nuxt` will eventually move onto
that repo; the `smile-nuxt` links will need repointing then. The state
diagram is redrawn as `docs/images/storage-statediagram.svg` (CCM book-figure
style) and the Firebase-era PNG is deleted. Phase 0 is done apart from
committing.

Work:
- Fix each page against the current code in `src/runtime/`. Imports go away,
  since composables are auto-imported in `.vue` files. Paths become the
  `start/` layout (`assets/`, `public/`, `components/`). Firebase becomes the
  Drizzle/libsql database and the dev tools' database browser.
- Add a `description:` to each page's frontmatter: one sentence saying what
  questions the page answers. This feeds `INDEX.md` and the VitePress page
  meta.
- A read-through of the rest for agent-friendliness: code examples that run
  as written in a `start/` project, one topic per page, and cross-links to the
  page that owns each topic.
- A docs lint test (`test/docs/`) that fails on `@/core/`, `src/user`,
  `firebase` and pages missing `description:`, so stale content doesn't come
  back.
- Fold in the open docs issues from `plans/docs_rewrite.md` where they touch
  these pages (#13, #14, #35, #46).

### Phase 1: docs for agents

**Status (2026-11-03):** built on branch `agent-docs` (worktree
`~/projects/smile-nuxt-agents`, on top of `docs-refresh`), committed, not
pushed. Differences from the list below: the docs go to `dist/docs/` (so
`files` stays `["dist"]`), only the sidebar's pages ship (`index.md` and the
unlisted `styling/animations.md` don't), and the examples ship with their
`@/runtime/` imports removed (shared `forReaders.js`). +75 KB to the tarball.
`pnpm test:starter` passes with the new checks, and the by-hand check
worked: in a scaffold, Claude Code answered "random task order" and "how do
I deploy" from the shipped pages and cited them. `docs/updating.md` tells
older projects how to copy the agent files.

Files:
- `package.json`: add the docs markdown to `files` (or copy to `dist/docs/` in
  prepack; copying keeps `files` simple and the layout stable). Add a
  `docs:index` script and run it from `prepack`.
- `scripts/build-docs-index.mjs` (new): walks `docs/**/*.md` (skipping
  `.vitepress`, `node_modules`) and writes `INDEX.md` with title, path and
  description, grouped by sidebar section. It also writes `index.json` (the
  same data, for Phase 2).
- `docs/.vitepress/sidebar.mjs` (new) + `docs/.vitepress/config.mjs`: move the
  sidebar array out so the script can import it without loading Vite plugins.
- `start/AGENTS.md` (new): the current `start/CLAUDE.md` content, fixed to
  Nuxt 4, plus a "Docs" section (path, explicit-path search, code wins when
  they disagree, website for images and demos).
- `start/CLAUDE.md`: becomes `@AGENTS.md` plus a line about the skill.
- `start/.claude/skills/smile-docs/SKILL.md` (new): a thin skill as described
  in d.
- `start/.cursor/rules/smile.mdc`: shrink to a pointer to `AGENTS.md`.
- `scripts/test-starter.mjs`: assert that
  `node_modules/@nyuccl/smile-nuxt/docs/INDEX.md` exists in the scaffolded
  project, and that every path in it exists. Run it with `--published` after
  the release, as usual.
- `test/`: a unit test that the index generator covers every page in the
  sidebar.

Check by hand: scaffold in `/tmp` with `SMILE_TEMPLATE_DIR`, run Claude Code
there, and ask "how do I shuffle trials?" and "how do I deploy?". Confirm it
finds and cites the right pages.

### Phase 2: Docs mode in the dev tools

**Status (2026-11-03):** built on branch `dev-docs-mode` (worktree
`~/projects/smile-nuxt-devdocs`, on top of `nuxt` after #69). Differences
from the list below: `addServerHandler` inside `if (dev)` (the folder passed in
through `nitro.replace`), so nothing reaches a build; the renderer is
`renderDocs.js` (markdown-it + container/footnote/mark, VitePress slugs and
`{#id}`, examples shown as source), and search is a small scorer over sections,
not minisearch. Laid out like the website (VitePress): sidebar sections,
"On this page", previous/next, callouts as tinted boxes, Shiki code blocks
(github-light/dark) with a copy button; `shiki` became a dependency (loaded
only by the dev route). The top bar is developer/presentation mode's
(`DevModeLabel`, with the LOCAL tag). Diagrams ship in `dist/docs/images/` and are served by the
route; screenshots link to the website. A built app with the dev tools included
has no route, so the view falls back to the website iframe. Fixed five broken
anchors in the docs, found by the renderer test. The consumer check also found
that the dev layout relied on the `useAPI` auto-import, which Nuxt doesn't
apply to a module's files in `node_modules` (it broke `/dev` in real projects;
the starter's e2e never opens `/dev`): fixed, with a test that runtime files
import what they use.

Files:
- `src/module.ts`: inside `if (_nuxt.options.dev)`, call
  `addDevServerHandler` for `/__smile/docs/**`. Register `SmileDevDocsView`
  only in dev. In builds with `SMILE_DEV_TOOLS=include`, keep the iframe to the
  website.
- `src/runtime/server/dev/docs.ts` (new): resolves the docs directory, renders
  with markdown-it (sub, footnote, mark, container), rewrites links and images,
  stubs components, caches by mtime, and serves search.
- `src/runtime/components/dev/docs/SmileDevDocsView.vue` (new): page list from
  `index.json`, search, rendered page, "open on website" link, version label.
- `src/runtime/css/dev-theme.css`: an `.sd-prose` block (headings, code,
  tables, callouts) using `--sd-*` tokens only.
- `src/runtime/layouts/development.vue`: replace the iframe branch with
  `<SmileDevDocsView>` (iframe as the fallback).
- `src/runtime/components/dev/menu/SmileDevAppMenu.vue`: add
  `{ view: 'docs', icon: BookMarked, label: 'Docs' }` to `modes`.
- `src/runtime/stores/smilestore.js`: `dev.docsPage` (persisted, so the docs
  reopen where you left them).
- `package.json`: markdown-it, its plugins, and minisearch become
  `dependencies`.
- Tests: the renderer (containers, link rewriting, stubbed components, no
  unknown tags), and an e2e test that opens Docs mode, searches, follows a
  link, and goes offline (route to `/__smile/docs` still works). A production
  build test that greps `.output/` for the docs view and route and expects
  none.

### Phase 3: optional

- `llms.txt` / `llms-full.txt` generated in `docs:build` and published on the site.
- A CLI command to add the agent files to an existing project.
- Ship referenced images as webp if offline images turn out to matter.
- An MCP server for live app state (timeline, views, data), if wanted. That is
  its own plan.

---

## Risks and open questions

- **Stale docs will mislead agents.** About 5 pages still show SPA-era imports,
  and `plans/docs_rewrite.md` lists more. Shipping them puts wrong answers in
  front of agents with the authority of "the docs". Mitigations: the "code in
  `dist/runtime/` wins" rule in `AGENTS.md` and the skill, a `stale: true`
  frontmatter flag that `INDEX.md` shows as "(being rewritten)", and doing the
  docs rewrite's top pages first. Decided: fix them first (Phase 0), with a
  lint test so they stay fixed.
- **Template changes reach only new projects.** Existing projects need the
  `docs/updating.md` note (or Phase 3's CLI command).
- **Package size.** Markdown only is about +140 KB, which is fine. Watch that
  `files` globs never pull in `docs/.vitepress/dist` or the cache (14 MB).
  Add a `pnpm pack --dry-run` size check to the release script.
- **Should Docs mode ship with deployed dev tools** (`SMILE_DEV_TOOLS=include`,
  for example on a lab demo server)? Decided (2026-11-03): no. Docs mode exists
  only under `nuxt dev`; a build has none of it (no button, view, styles,
  route or Shiki), and `test:starter` checks an include build for it.
