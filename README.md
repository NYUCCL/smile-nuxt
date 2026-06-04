<p align="center">
<a href="https://smile.gureckislab.org/" target="_blank">
<img src="https://smile.gureckislab.org/images/smile.svg" alt="smile" height="150" />
</a>

<p align="center">
<i>A happy approach to online behavioral research.</i>
</p>

<p align="center">
<a href="https://github.com/nyuccl/smile-nuxt/releases" alt="GitHub release"><img src="https://img.shields.io/github/v/release/nyuccl/smile-nuxt"></a>
<a href="https://github.com/nyuccl/smile-nuxt/actions" alt="Build Status"><img src="https://github.com/nyuccl/smile-nuxt/actions/workflows/deploy.yml/badge.svg"></a>
<a href="https://github.com/nyuccl/smile-nuxt/actions" alt="Doc Build Status"><img src="https://github.com/nyuccl/smile-nuxt/actions/workflows/docs-deploy.yml/badge.svg"></a>
</p>

<br />

The Smile project is a new way to develop rich and interactive online experiments. Smile prioritizes modularity and reusability. Unlike tools that cater to non-programmers, Smile is designed to help reasonably competent programmers (or AI-assisted programmers) accomplish more in less time.

`smile-nuxt` is distributed as a versioned [Nuxt](https://nuxt.com) module on top of [Nuxt 4](https://nuxt.com/), so every experiment is a real full-stack Nuxt app — Vue 3 + Vite on the front end, a Nitro server runtime for API routes and data persistence, and a libSQL/SQLite database built in.

Online docs: [https://smile.gureckislab.org](https://smile.gureckislab.org)

### Highlighted features:

- 🌈 Fast and fun front-end interface development with [Vue.js](https://vuejs.org),
  [Tailwind CSS](https://tailwindcss.com/), and
  [Shadcn/vue](https://www.shadcn-vue.com/). Create complex games, animations, and
  surveys with ease.
- 👩‍💻 Custom [developer mode tools](https://smile.gureckislab.org/coding/developing.html) provide a novel interface for specifying and debugging interactive
  experiments. Quickly jump between phases and trials in your experiments,
  [autofill forms and generate mock data for testing](https://smile.gureckislab.org/coding/autofill.html),
  [hot-reload](https://smile.gureckislab.org/coding/developing.html#hot-module-replacement) your code without restarting the entire experiment, and more!
- 🧩 Built-in support for
  [common experiment elements](https://smile.gureckislab.org/coding/views.html#built-in-views) like consent forms,
  instructions, and surveys. Just add your custom experiment logic and start
  collecting data.
- 🤖 Code writing is greatly accelerated using AI tools, as LLMs are
  trained on extensive codebases covering Vue, Tailwind, and other popular web
  standards used by the project.
- 👫 Supports multiple [recruitment services](https://smile.gureckislab.org/recruit/recruitment.html)
  including Prolific, MTurk, CloudResearch, and more.
- 📝 [Data provenance features](https://smile.gureckislab.org/analysis.html#data-provenance) include an audit trail
  of which version of the code was used to create each data file.
- 🐍 Easy-to-use [Python library](https://smile.gureckislab.org/analysis.html#python-analysis-library-smiledata) for data analysis with Polars DataFrames, built-in plotting, and support for Jupyter and Marimo notebooks.
- 🛠️ Built on [Nuxt](https://nuxt.com) as a versioned [Nuxt Module](https://nuxt.com/modules), so every experiment has a real server runtime available. Add custom [server API routes](https://smile.gureckislab.org/coding/serverside.html) for custom data logic, condition assignment, randomization seeds, authentication, or integrations with external services (e.g., LLMs).
- 💾 Zero-config local SQLite database for development. Swap in a hosted solution (e.g., [Turso](https://turso.tech)) for deployment.
- 😎 Great-looking and detailed docs, if we do say so ourselves!

## Quick start

Requires Node ≥ 22 and [pnpm](https://pnpm.io/installation). Scaffold a new
experiment with:

```sh
pnpm create @nyuccl/smile-nuxt my-experiment
cd my-experiment
pnpm dev
```

Then open `http://localhost:3000`. See the full
[Quick Start guide](https://smile.gureckislab.org/quickstart).

## License

MIT License © 2022 [Todd Gureckis](https://todd.gureckislab.org)

_Initial development was supported by National Science Foundation Grant [BCS-2121102](https://www.nsf.gov/awardsearch/showAward?AWD_ID=2121102&HistoricalAwards=false) to T. M. Gureckis._
