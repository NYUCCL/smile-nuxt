# Updating Smile

Smile ships as the `@nyuccl/smile-nuxt` npm package, so updating to a
newer version is a standard package manager operation. This page walks
through the mechanics, what the version numbers mean, and when you should
deliberately **not** update.

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

### How to lock

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

## Workflow recommendations

A workflow that balances staying current with experiment stability:

1. **During development** — keep the caret (`^`). Run
   `pnpm up @nyuccl/smile-nuxt` periodically to pick up patches.
2. **Before recruiting participants** — pin the exact version (drop the
   caret). Commit. This is the version your study runs on.
3. **For follow-up studies based on the same protocol** — start from your
   pinned version. Decide whether to update before launch based on what
   changed in newer releases.
4. **When archiving an experiment** — leave the pin and lockfile in place
   in the repo. Future you can always reproduce the exact build.

## How to read version numbers

<SmileText/> follows [Semantic Versioning](https://semver.org) (SemVer). Version numbers look like `MAJOR.MINOR.PATCH`:

| Bump  | Example           | What it means                                                                      |
| ----- | ----------------- | ---------------------------------------------------------------------------------- |
| PATCH | `0.2.0` → `0.2.1` | Bug fixes only. Safe to update — your code should keep working.                    |
| MINOR | `0.2.0` → `0.3.0` | New features. Old code keeps working **(usually — see beta caveat below)**.        |
| MAJOR | `0.2.0` → `1.0.0` | Breaking changes. Your code may need updates. Read the changelog before upgrading. |

Pre-release versions append a tag and a number — `0.2.0-beta.2` is the second beta of the 0.2.0 release. Higher beta number = later release.

The changelog at
[github.com/nyuccl/smile-nuxt/releases](https://github.com/nyuccl/smile-nuxt/releases)
documents what changed in each release — read it before bumping past a
MINOR or MAJOR version.
