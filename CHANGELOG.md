# Changelog


## v0.2.0-beta.8

[compare changes](https://github.com/nyuccl/smile/compare/v0.2.0-beta.7...v0.2.0-beta.8)

### 🩹 Fixes

- **test:** Run e2e suites on a dedicated port instead of 3000 ([641c8a3](https://github.com/nyuccl/smile/commit/641c8a3))
- **guards:** Stop redirect loop, allowAlways lockout and duplicate route records ([d9acbbb](https://github.com/nyuccl/smile/commit/d9acbbb))
- **store:** Keep data recorded before a reload ([#42](https://github.com/nyuccl/smile/pull/42))
- **test:** Run test:overrides on a dedicated, checked port ([8967f68](https://github.com/nyuccl/smile/commit/8967f68))
- **build:** Annotate plugin/middleware exports so .d.ts builds on nuxt 4.6 ([#62](https://github.com/nyuccl/smile/pull/62))

### 📖 Documentation

- Explain that a page reload starts a new visit ([53ee9d4](https://github.com/nyuccl/smile/commit/53ee9d4))

### 🏡 Chore

- **test:** Add coverage reporting and Vue SFC support to Vitest ([562dd33](https://github.com/nyuccl/smile/commit/562dd33))

### ✅ Tests

- **e2e:** Reproduce #42 stepper data loss at the database level ([#42](https://github.com/nyuccl/smile/issues/42))
- **e2e:** Route guard tests for a consented participant mid-study ([8152bb8](https://github.com/nyuccl/smile/commit/8152bb8))
- **e2e:** Wait on the SQLite lock in specs that read the dev DB ([f58c6a3](https://github.com/nyuccl/smile/commit/f58c6a3))

### ❤️ Contributors

- Todd Gureckis <gureckis@mac.com>

## v0.2.0-beta.7

[compare changes](https://github.com/nyuccl/smile/compare/v0.2.0-beta.6...v0.2.0-beta.7)

### 🚀 Enhancements

- **dev:** Add WIP data dashboard, hidden until feature complete ([06a5ac8](https://github.com/nyuccl/smile/commit/06a5ac8))

### 🩹 Fixes

- **playground:** Forward access-mode env vars to the dev server ([26729f9](https://github.com/nyuccl/smile/commit/26729f9))

### ❤️ Contributors

- Todd Gureckis <gureckis@mac.com>

## v0.2.0-beta.6

[compare changes](https://github.com/nyuccl/smile/compare/v0.2.0-beta.5...v0.2.0-beta.6)

### 🩹 Fixes

- **components:** Warn when a local component shadows a built-in UI primitive ([b6b59ae](https://github.com/nyuccl/smile/commit/b6b59ae))
- **test:** Give override spec assertions time for first cold dev-server compile ([7e15cae](https://github.com/nyuccl/smile/commit/7e15cae))

### 📖 Documentation

- **overrides:** Split Overrides & Resolution into its own page ([a8056af](https://github.com/nyuccl/smile/commit/a8056af))
- Split built-in views and overrides into their own pages ([8a069aa](https://github.com/nyuccl/smile/commit/8a069aa))

### 🏡 Chore

- **release:** Re-point tag onto amended commit to fix orphaned release tag ([e735709](https://github.com/nyuccl/smile/commit/e735709))
- **release:** Generate changelog + GitHub release, fix double-bump & orphan tag ([8b12ce5](https://github.com/nyuccl/smile/commit/8b12ce5))

### ❤️ Contributors

- Todd Gureckis <gureckis@mac.com>

