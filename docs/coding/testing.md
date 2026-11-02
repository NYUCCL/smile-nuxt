# :lady_beetle: Testing your experiment

Automated tests click through your experiment the way a participant would and
check that each page works and that the data you expect ends up in the
database. They catch the bugs that cost you money and participants' patience:
a page that can be skipped, a task that stops recording after a reload, a
response saved under the wrong name.

Every project made with `create-smile-nuxt` comes with a working test suite.
It uses [Playwright](https://playwright.dev), which drives a real browser
against your dev server.

## What ships with your project

| File                          | What it is                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `playwright.config.ts`        | Starts `pnpm dev` on a dedicated port, runs the tests in Chromium, one at a time.           |
| `test/e2e/experiment.spec.ts` | Tests for the built-in flow (welcome → consent → demographics → your task) and for your task. |
| `test/e2e/helpers.ts`         | `clearState()` and helpers that fill in the demographics form.                               |

The suite starts with these tests:

- the welcome page shows, and welcome → consent → demographics works
- a participant can't skip ahead without consenting
- consenting creates a participant record in the database
- the route history is saved
- a refresh resumes on the same page
- **your task** records its response (an example for `components/MyTaskView.vue`)

## Running the tests

```sh
pnpm test:e2e        # run the suite in the terminal
pnpm test:e2e:ui     # Playwright's UI: pick tests, watch them run, step through
```

The first run downloads a browser (`pnpm exec playwright install chromium` if
it asks). Playwright starts the dev server itself on port **3100** and stops it
afterward. If you already have `pnpm dev` running on 3100, it reuses it. Use
another port with `SMILE_E2E_PORT`:

```sh
SMILE_E2E_PORT=3200 pnpm test:e2e
```

To run one file or one test:

```sh
pnpm test:e2e test/e2e/experiment.spec.ts
pnpm test:e2e -g "records the response"
```

A failed test leaves a screenshot and an `error-context.md` (what the page
looked like when it failed) in `test-results/`. To watch a failing test step by
step, open it in `pnpm test:e2e:ui`.

## Writing tests for your task

When you build your own task in place of `MyTaskView`, update the
`Your task` test at the bottom of `experiment.spec.ts` to match. A task test
does three things:

1. **Get to the task** the way a participant does: consent, demographics, the
   window sizer.
2. **Do the task**: click buttons, press keys, wait for the next trial.
3. **Check the data** in the local database.

```ts
test('records the response on the task page', async ({ page }) => {
  // 1. Get to the task (see the full flow in experiment.spec.ts)
  await expect(page).toHaveURL(/\/task/)
  const participant = await getLatestParticipant(db)

  // 2. Do the task
  await page.getByRole('button', { name: 'Left' }).click()

  // 3. Check what was recorded
  await expect.poll(async () => {
    const row = await db.execute({
      sql: 'SELECT data FROM participants WHERE id = ?',
      args: [participant!.id],
    })
    const data = JSON.parse(row.rows[0]!.data as string)
    return data.pageData_task?.visit_0?.data?.[0]?.response
  }).toBe('left')
})
```

### Where the data is

In development, data is saved to a SQLite file, `.data/experiment.db`, in your
project. The tests read it directly with `@libsql/client`. Each participant is
a row in the `participants` table, and its `data` column holds the same object
you see in the dev tools. Data from `api.recordPageData()` is stored under
`pageData_<route name>`, with one entry per visit to the page:

```js
pageData_task: {
  visit_0: { timestamps: [...], data: [{ response: 'left', rt: 812, ... }] },
}
```

A reload starts a new visit (`visit_1`, and so on); see
[Understanding the visit structure](/analysis#understanding-the-visit-structure).

### Tips

- **Poll, don't read once.** Saves are throttled by `VITE_MIN_WRITE_INTERVAL`
  (2 seconds by default), so data reaches the database a moment after the click.
  `expect.poll()` retries until the value appears.
- **Multi-trial tasks:** press keys with `page.keyboard.press('f')` and wait for
  each trial to change (for example `await expect(page.locator('#prompt')).toHaveText(...)`)
  before the next press, so every keypress lands on its own trial.
- **Reloads:** call `page.reload()` partway through and check that the task
  resumes where it was and that the trials before the reload are still saved.
- **Clean up:** delete the participant rows your test created (`cleanupParticipant()`
  in the spec) so your local database doesn't fill up with test data.
- **Start fresh:** call `clearState(page)` before each test so cookies and local
  storage from the last test don't make the browser look like a returning
  participant.

## Before you deploy

Run through this list before you recruit real participants:

- [ ] `pnpm test:e2e` passes, including a test for your own task.
- [ ] You've completed the whole experiment yourself in a normal browser window
      (not just in `/dev/`), start to finish.
- [ ] You reloaded partway through your task and it resumed correctly.
- [ ] The data in `.data/experiment.db` (or the dev tools' data view) has every
      field you plan to analyze, under the names you expect.
- [ ] The consent form, debrief text and study details are yours, not the
      template's placeholders.
- [ ] `VITE_WINDOWSIZER_REQUEST` and the other settings in `.env` are set for
      your study; see [Configuration](/coding/configuration).
- [ ] Your deploy has `SMILE_AUTH_SECRET` and its database variables set; see
      [Cloud Hosting](/recruit/deploying).

## Testing the database layer

Local development uses the same libSQL dialect as Turso in production, so tests
don't need a separate database emulator. See [Data Storage](/coding/datastorage)
for how data is stored, and [Configuration](/coding/configuration) for pointing
at a remote Turso database instead.

---

Working on <SmileText/> itself rather than an experiment? The module's own
tests are described in [Contributing](/contributing#testing-the-module).
