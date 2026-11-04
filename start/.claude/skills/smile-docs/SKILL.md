---
name: smile-docs
description: Answer questions about SMILE (@nyuccl/smile-nuxt) from the docs installed with the module, for the exact version in this project. Use for anything about SMILE's API (useViewAPI, useAPI, api.steps, recordPageData, the faker and randomization helpers), the timeline and design.js, built-in Views and overriding them, data storage and downloading data, styling, deploying, recruiting on Prolific or CloudResearch, and the dev tools.
---

# SMILE docs

The docs for the installed version are in
`node_modules/@nyuccl/smile-nuxt/dist/docs/`.

1. Read `INDEX.md` there. It lists every page with a one-line summary;
   pick the page (or two) that covers the question.
2. Read those pages. To find a function or setting across all pages, search
   with the path given explicitly, since `node_modules` is gitignored:

   ```bash
   rg -n "pushConditionalNode" node_modules/@nyuccl/smile-nuxt/dist/docs/
   ```

3. Links inside the pages, like `/coding/steps#navigating-through-steps`,
   are files here: `coding/steps.md`, at the heading after `#`.
4. Example components the pages show are in `examples/`.
5. If a page and the code disagree, the code wins. Check
   `node_modules/@nyuccl/smile-nuxt/dist/runtime/` (composables in
   `composables/`, components in `components/`) and say that the docs
   differ.
6. Images aren't included. If a figure matters, the same page is on
   https://smile.gureckislab.org.

Answer with the page you used (for example "see `coding/timeline.md`,
Branching and randomized flows"), and with code that works in this project:
composables and components are auto-imported, so don't add imports for them.
