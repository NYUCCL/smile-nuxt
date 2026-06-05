# Getting started contributing

The <SmileText/> repo
([https://github.com/NYUCCL/smile-nuxt](https://github.com/NYUCCL/smile-nuxt))
includes both the code and documentation for the code.

If you haven't already, make sure you have Node.js (≥ 22) and pnpm installed — see the [Quick Start](/quickstart) for setup.

The next step is to fork the project from
[github repo](https://github.com/NYUCCL/smile-nuxt), clone it on your machine,
and set your current terminal to the working copy. Then, install the required
javascript dependencies using `pnpm`, the node package manager (similar to `pip`
in python). This can be accomplished with three simple commands in your terminal
program (you can also clone the repo using GUI tools if you prefer):

```
git clone https://github.com/nyuccl/smile-nuxt.git
cd smile-nuxt
pnpm install
```

Once you have the packages installed you can use different commands to start the
local development server for either the documentation website or the playground
experiment.

To start the playground development server:

```
pnpm dev
```

To start the documentation development server:

```
pnpm docs:dev
```

Either of these commands will print out a URL that looks roughly like
`http://localhost:3000/`. If you open this link in your favorite browser (or
command-click the link on MacOS), it will load the respective website.

Next steps:

- Learn how to [contribute to the documentation](/contributing)
- Understand the [design principles](/philosophy)
