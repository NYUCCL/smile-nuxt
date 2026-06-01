# Getting started contributing

The <SmileText/> repo
([https://github.com/NYUCCL/smile](https://github.com/NYUCCL/smile)) includes
both the code and documentation for the code.

If you haven't already, make sure you have Node.js (≥ 22) and pnpm installed — see the [Quick Start](/quickstart) for setup.

The next step is to fork the project from
[github repo](https://github.com/NYUCCL/smile), clone it on your machine, and
set your current terminal to the working copy. Then, install the required
javascript dependencies using `npm`, the node package manager (similar to `pip`
in python). This can be accomplished with three simple commands in your terminal
program (you can also clone the repo using GUI tools if you prefer):

```
git clone https://github.com/nyuccl/smile.git
cd smile
npm install
```

Once you have the packages installed you can use different commands to start the
local development server for either the documentation website or the experiment
project.

To start the experiment development server:

```
npm run dev
```

To start the documentation development server:

```
npm run docs:dev
```

Either of these commands will print out a URL that looks roughly like
`http://localhost:3000/`. If you open this link in your favorite browser (or
command-click the link on MacOS), it will load the respective website.

Next steps:

- Learn how to [contribute to the documentation](/contributing)
- Understand the [design principles](/philosophy)
