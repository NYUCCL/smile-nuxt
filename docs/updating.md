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
