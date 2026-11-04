---
description: "How to update @nyuccl/smile-nuxt to a newer version, check which version you have, and pin a version for replicability."
---

# Updating Smile

Smile ships as the `@nyuccl/smile-nuxt` npm package, so updating to a
newer version is a standard package manager operation. This page walks
through the mechanics, what the version numbers mean, and when you
might **not** want to update.

## How to update

From your experiment project's root directory:

::: code-group

```sh [pnpm]
pnpm up @nyuccl/smile-nuxt --latest
```

```sh [npm]
npm install @nyuccl/smile-nuxt@latest
```

```sh [yarn]
yarn upgrade @nyuccl/smile-nuxt --latest
```

```sh [bun]
bun add @nyuccl/smile-nuxt@latest
```

:::

This bumps the pin in your `package.json`, updates the lockfile, and
downloads the new version into `node_modules/`. Restart your dev server
afterwards.

## Docs for coding agents

These docs come with the package, as markdown, in
`node_modules/@nyuccl/smile-nuxt/dist/docs/`. Updating SMILE updates them
too, so they always match the version you run. A new project has the files
that point coding agents (Claude Code, Cursor, Codex and others) there:

- `AGENTS.md`: the project layout, the API and the conventions, and where
  the docs are
- `CLAUDE.md`: points Claude Code at `AGENTS.md`
- `.claude/skills/smile-docs/`: a skill that answers SMILE questions from
  the installed docs
- `.cursor/rules/smile.mdc`: the same pointer for Cursor

These files don't change when you update, since they only point at the
docs. A project created before they existed can copy them from the
template for the version you updated to (replace `<version>`, for example
`0.2.0`):

```sh
pnpm dlx giget gh:nyuccl/smile-nuxt/start#v<version> /tmp/smile-template
cp /tmp/smile-template/AGENTS.md /tmp/smile-template/CLAUDE.md .
cp -R /tmp/smile-template/.claude /tmp/smile-template/.cursor .
```

If you already have a `CLAUDE.md` or `.cursor/rules/` of your own, merge
rather than overwrite.

## Check what version you have

The version of <SmileText/> your project depends on lives in your
`package.json`:

```json
{
  "dependencies": {
    "@nyuccl/smile-nuxt": "^0.2.0-beta.2"
  }
}
```

or you can ask your package manager:

```sh
pnpm list @nyuccl/smile-nuxt
```

## Locking version for replicability

If you have an experiment that's **collecting data from real participants**,
or one that's tied to a paper/preprint where reproducibility matters, you
should **lock the SMILE version**. By pinning the version, you guarantee that
anyone who clones your repo and runs `pnpm install` gets exactly the same SMILE
code you used.

The default starter pins with a caret (`^`), which is permissive:

```json
{
  "dependencies": {
    "@nyuccl/smile-nuxt": "^0.2.0-beta.2"
  }
}
```

`^0.2.0-beta.2` means "any 0.2.x version ≥ 0.2.0-beta.2". For a published
experiment, **remove the caret** to pin the exact version:

```json
{
  "dependencies": {
    "@nyuccl/smile-nuxt": "0.2.0-beta.2"
  }
}
```

Then commit the change. Now `pnpm install` will always install exactly
`0.2.0-beta.2`, even years from now.

**During development** it is recommended to keep the caret (`^`). Run
`pnpm up @nyuccl/smile-nuxt` periodically to pick up patches.
**Before recruiting participants** pin the exact version (drop the
caret and set the version you want to lock to).

Smile follows [Semantic Versioning](https://semver.org) (SemVer). Version numbers look like `MAJOR.MINOR.PATCH`. The [changelog](https://github.com/nyuccl/smile-nuxt/releases) documents what changed in each release — read it before bumping past a
MINOR or MAJOR version.
