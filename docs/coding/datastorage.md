---
description: "Where participant data is saved (SQLite locally, Turso when deployed), how to record data with recordPageData, how saving works (by itself, about a second after each change), how to look at and download the data, and what's in the SMILE store."
---

# Data Storage

Data recording and storage are critical functions of an experiment that enable
[analysis](/analysis). When a person takes part in your experiment, you want
their data saved in one place, securely and without losing anything if their
browser crashes or they reload the page.

Some designs need custom storage code (for example, real-time multiplayer
games). But for most experiments on individuals, <SmileText/> handles storage
with little or no configuration. Dealing with data is so important,
[it isn't something you should even have to think about](/philosophy.html#no-code-is-the-best-code)!

This page covers where data is saved, how to record your own data, when saves
happen, how to look at and download the data, and how the store behind it is
organized.

## Where data is saved

There's nothing to set up. A new project already saves each participant's data
as they move through your experiment:

- **During development** (`pnpm dev`), data goes to a SQLite file in your
  project, `.data/experiment.db`. It's created, and kept up to date with the
  current tables, when the dev server starts.
- **When deployed**, data goes to a [Turso](https://turso.tech) database (a
  hosted version of SQLite), set by `TURSO_DATABASE_URL` and
  `TURSO_AUTH_TOKEN`. See [Cloud Hosting](/recruit/deploying) and
  [Configuration](/coding/configuration).

Both use the same tables, so code and queries that work locally work on the
deployed database too.

### The tables

| Table | One row per | What's in it |
|---|---|---|
| `projects` | version of your experiment | `id` is `owner:repo:branch:mode`. `mode` is `test` for data from `pnpm dev` and `live` for data from a deployed build. |
| `participants` | participant | `data`: the participant's whole `data` object as JSON (everything you record). `project_id` says which project it belongs to. Also a few columns about the row itself, for looking through a study without reading every `data` object: `consented`, `done`, `withdrawn`, `recruitment_service`, `started_at`, `ended_at`, `rev` and `save_count` (how many changes and saves), `data_bytes`, `oversize` and `last_error` (see [When a save fails](#when-a-save-fails)). |
| `private_data` | participant | `data`: the participant's `private` object (for example recruitment IDs), kept apart so it can be left out of shared datasets. |

The project id comes from your git repository and branch (see
[Branch = experiment](/recruit/deploying#branch-experiment)),
so each branch's data, and test data versus real data, stay separate
automatically.

## Recording data

A new project already records a lot without any code from you: whether the
participant consented, the order of pages they visited, their conditions, the
configuration and code version they ran, browser events, and start and end
times. You add your own task data with the [SMILE API](/api).

### Recording page data (recommended)

`api.recordPageData()` saves data under the name of the current page, so it's
easy to tell which part of the experiment it came from. `useViewAPI()` and
`useAPI()` are auto-imported in `.vue` files, so no import is needed:

```vue
<script setup>
const api = useViewAPI()

// Recorded to pageData_<current page name>
api.recordPageData({
  trialNum: 1,
  response: 'correct',
  rt: 543,
})

// Or name the page yourself
api.recordPageData({ data: 'value' }, 'custom_page')
</script>
```

The data is usually an object, but any value works. Values plain JSON can't
hold (a `BigInt`, a circular reference, a DOM element) are converted when
they're recorded and noted in the participant's `smileWarnings`; recording
never fails because of what's passed in. See
[Data Recording and Saving](/api#data-recording-and-saving) for the details.

Data is grouped by visit. If a participant comes back to the same page (or
reloads it), each visit is kept separately:

```javascript
// In the participant's data
{
  pageData_consent: {
    visit_0: {
      timestamps: [1701619200000, 1701619205000], // timestamps[i] goes with data[i]
      data: [{ agreed: true }, { additionalInfo: '...' }],
    },
  },
  pageData_experiment: {
    visit_0: {
      timestamps: [1701619210000, 1701619215000, 1701619220000],
      data: [{ trial: 1, rt: 500 }, { trial: 2, rt: 450 }, { trial: 3, rt: 480 }],
    },
  },
}
```

For tasks with many trials, `api.recordStep()` records the current trial's
`api.stepData`. See [Steps](/coding/steps).

### Deprecated methods

::: warning Deprecated
`api.recordData(data)` and `api.recordForm(name, data)` still work, but log a
warning and will be removed in a future version. They now also record to
`pageData_*`. Use `recordPageData()` instead.
:::

### Completion codes

`api.computeCompletionCode()` makes a code from a hash of all the `pageData_*`
fields, with a suffix for how the participant finished:

- `oo`: completed the study
- `xx`: withdrew

The built-in `ThanksView` already computes and shows it. To use it somewhere
else:

```vue
<script setup>
const api = useAPI()

const completionCode = api.computeCompletionCode()
api.setCompletionCode(completionCode)
</script>
```

### Automatically recorded browser data

<SmileText/> records window resizes and focus changes (blur when the
participant switches to another window, focus when they come back) in
`data.browserData`. These can help spot odd behavior, such as searching for
answers in another window or doing two things at once.

## When data is saved

You don't save data yourself. <SmileText/> sends the participant's data to the
database about **one second after each change** to it: a call to
`recordPageData()` or `recordStep()`, a change of page, a browser event. While
changes keep coming (a task that records constantly), a save goes out at least
every 5 seconds. Each save sends the participant's whole `data` object.

Three more things keep data from being lost:

- **A copy in the browser.** Every change is also written, a few milliseconds
  later, to the browser's local storage, together with the participant's
  position in the experiment. If the page reloads or the browser crashes
  before a save arrives, the copy is read back and sent.
- **Retries.** A save that fails because of the network or the server (no
  answer, a timeout, a 5xx error) is tried again after 1 second, then 2, 4 and
  so on up to once a minute, until it arrives. When the browser reports it is
  back online, a save is tried at once.
- **Leaving the page.** When the participant switches tabs, closes the tab or
  navigates away, whatever hasn't been sent is sent at once.

### Checking that the data has arrived

`await api.sync()` sends everything recorded so far and waits for the server's
answer. Use it where your experiment needs to know the data is in the database
before going on, for example before sending the participant back to the
recruitment site:

```js
const result = await api.sync()
if (!result.ok) {
  // not saved yet; result.error says why. It is still in the browser and
  // will be tried again.
}
```

It resolves to `{ ok, rev, error }` and never throws. Page changes made with
the API (`api.goNextView()` and friends) call it for you.

`api.syncStatus` is a reactive object you can show to the participant or
watch: `{ status, error, retryAt }`, where `status` is one of

| `status`  | Meaning                                                                    |
| --------- | -------------------------------------------------------------------------- |
| `saved`   | The database has everything recorded so far.                               |
| `pending` | A change is waiting to be sent (within the next second or so).             |
| `saving`  | A save is on its way.                                                      |
| `offline` | The browser is offline; the save will be tried when it is back.            |
| `error`   | The last save failed. `error.kind` says how (below); `retryAt` is the time of the next try, when there is one. |

The dev tools' Database panel shows the same status.

::: info `api.saveData()`
`api.saveData()` still works: it is another name for `api.sync()`. Older
experiments called it to save in the middle of a long task. That is no longer
needed, and its `force` argument is ignored.
:::

### When a save fails

Recording never fails, and a failed save never stops the experiment: the
participant goes on, and the data stays in the browser's copy.

| `error.kind` | What happened | What <SmileText/> does |
| --- | --- | --- |
| `retrying` | No answer, a timeout, or a server error. | Tries again (1 second, doubling to 60). |
| `refused`  | The server rejected that save (a 4xx answer). | Doesn't send the same content again. The next change is sent as a new save. |
| `oversize` | The data is over 4 MB (see [How much data a participant can have](#how-much-data-a-participant-can-have)). | Doesn't send it; keeps it in the browser; marks the participant's row (`oversize`, `last_error`). |
| `limit`    | The browser reached `VITE_MAX_WRITES` saves (below). | Stops saving by itself; marks the row's `last_error`. |
| `conflict` | Another tab of the same browser saved something newer. | Stops saving from this tab and shows a notice (see [Two tabs](#two-tabs)). |

### The limit on saves

`VITE_MAX_WRITES` (in `.env`, default `10000`) is the most saves one
participant's browser will send. It exists so a bug in an experiment, or a tab
left open for days, can't send requests forever.

A page that changes constantly sends one save every 5 seconds, so 10000 is
about 14 hours of constant change; ordinary experiments use a few hundred at
most. At the limit, nothing more is sent by itself. The data stays in the
browser's copy, and `api.sync()` (so also page changes made with the API)
still sends, up to twice the limit, so the end of a long study is still saved.

The config check and the dev console warn about a value under 2000. Projects
made from older templates have `VITE_MAX_WRITES = 1000` in `.env`; with
automatic saving that is 83 minutes of constant change. Raise it or remove the
line.

Separately, a page can send at most 30 saves a minute, whatever its code does.

::: warning Settings that no longer do anything
`VITE_AUTO_SAVE_DATA` and `VITE_MIN_WRITE_INTERVAL` are accepted and ignored
(with a warning in the dev console and the config check). Saving can't be
turned off, and its timing isn't configurable. Remove them from `.env`.
:::

### Two tabs

If a participant opens the experiment in a second tab of the same browser, the
tab opened last is theirs. The other tab stops saving and shows a notice
("this study is open in another tab") with a **Continue here** button, which
reloads that tab from the newest data and makes it the participant's tab
again. This keeps two tabs from overwriting each other's data.

### How much data a participant can have

The database itself has no practical size limit for one participant. The limit
that matters is your host's maximum request size, because every save sends the
whole `data` object. On Vercel, the default deploy target, a request body can be
at most 4.5 MB, so <SmileText/> doesn't send a save over **4 MB**. The data
stays in the browser, the participant's row is marked `oversize`, and
`api.syncStatus` reports it; nothing recorded after that point reaches the
database unless the data gets smaller.

The dev tools show the participant's current data size against this 4.5 MB
reference: in the database button's tooltip and progress ring, and in the
sidebar's Database panel. The number is the length of the data as JSON, which
is close to its size in bytes. It's there so you notice a task that records far
more than you expected (for example, every mouse movement) before you run it.

## Looking at your data

While you develop, the [dev tools](/coding/developing) show the current
participant's data as it's recorded: open the console (`Ctrl` + `` ` ``) and
choose the **Data Explorer** tab. The sidebar's Database panel shows whether the
participant is connected to the database, how many saves they've made, and how
big their data is.

## Downloading your data

::: info Coming with the data dashboard
A built-in way to browse and download data is planned as part of the dev tools'
data dashboard ([#45](https://github.com/NYUCCL/smile-nuxt/issues/45)). Until
then, read the database directly as shown below.
:::

The [analysis library](/analysis) reads a JSON file holding a list of
participants' `data` objects, each with its `id`. The `sqlite3` command (built
into macOS, and available for Windows and Linux) can write that file straight
from the database.

First save this query as `analysis/export.sql`:

```sql
-- One JSON list of participants' data, each with its id.
-- branch: the git branch; mode: 'test' (pnpm dev) or 'live' (deployed).
SELECT json_group_array(json_set(p.data, '$.id', p.id))
FROM participants p JOIN projects pr ON pr.id = p.project_id
WHERE pr.branch = 'main' AND pr.mode = 'test';
```

Change `pr.branch` to the branch you want, and `pr.mode` to `'live'` for data
from a deployed build. To keep only participants who finished, add
`AND json_extract(p.data, '$.done') = 1` to the last line, before the `;`.

**From your local database** (data from `pnpm dev`):

```sh
sqlite3 -readonly .data/experiment.db ".read analysis/export.sql" > analysis/data/my-experiment-test.json
```

To see which projects are in the database, run
`sqlite3 -readonly .data/experiment.db "SELECT id FROM projects;"`.

**From your deployed Turso database:** download a copy with the
[Turso CLI](https://docs.turso.tech/cli/introduction), load it into a local
file, and run the same query on it (with `pr.mode = 'live'`):

```sh
turso db shell <your-database-name> .dump > backup.sql
sqlite3 backup.db ".read backup.sql"
sqlite3 -readonly backup.db ".read analysis/export.sql" > analysis/data/my-experiment-live.json
```

The copy includes `private_data` (for example recruitment IDs). Treat
`backup.sql` and `backup.db` as private: keep them out of git, and delete them
when you're done.

## How state works in SMILE

A <SmileText/> experiment is made of [components](/coding/components). Each one
can have **local state**: values only it needs, such as which page of the
instructions is showing, what's typed in a form, or where the mouse is. Local
state lives in memory and is gone when the page reloads, which is fine for
values like these.

Data from the participant usually comes from many components over the whole
experiment, so it goes in **global state** that every component can read and
write. In <SmileText/> that's a [Pinia](https://pinia.vuejs.org) **store**, the
SMILE store.

Parts of the store are **persisted**, so they survive a reload or a browser
crash:

- The participant's `data` and `private` objects are saved to the database (see
  [When data is saved](#when-data-is-saved)).
- A copy of both, together with the participant's position (the current View,
  each stepper's place and its `persist` values, conditions, the timeline), is
  kept as one value in the browser's
  [local storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).
  The database also gets the position with each save. On a reload,
  <SmileText/> reads both copies and uses the newer one, so a participant
  whose local storage was cleared still comes back to the same trial.
- A few small values the server needs before the page loads, such as the
  participant id and whether they consented, are kept in cookies.

::: warning The browser's copy includes private data
The copy in local storage holds the participant's `private` object too
(recruitment IDs, the browser fingerprint, the withdraw form), so it survives
a reload. It is on the participant's own computer only, and it stays there
after they finish, until the state is reset or the browser's site data is
cleared.
:::

![Components keep local state and read and write the SMILE store. The store's data and private parts are saved to the database; cookieState and localState are kept in the browser; browserEphemeral is in memory only.](/images/storage-statediagram.svg)

## The SMILE store

Most code should use the [API](/api) rather than the store. The API is the
stable interface; the store's layout can change between versions. For
debugging, or for something the API doesn't cover, the store is available as
`api.store`, or directly with the auto-imported `useSmileStore()`:

```vue
<script setup>
const smilestore = useSmileStore()

// Sets 'something' in the participant's data (saved to the database)
smilestore.data.something = true
</script>
```

The store's source is in your project at
`node_modules/@nyuccl/smile-nuxt/dist/runtime/stores/smilestore.js`. It can't be
edited from your project; to change behavior, use the API or
[override a component](/coding/overrides).

### What's in it

| Part | Kept in | What it holds |
|---|---|---|
| `data` | database (`participants`) | The participant's data: everything you record, plus `consented`, `done`, `withdrawn`, `starttime`/`endtime` (and local-time versions and time zone), `recruitmentService`, `routeOrder`, `conditions`, `randomizedRoutes`, `browserData`, `smileConfig`, `seedID`. |
| `private` | database (`private_data`) | `recruitmentInfo` (for example Prolific IDs), `withdrawData`, `browserFingerprint`. |
| `cookieState` | cookies | What's needed to recognize a returning participant: `participantId`, `knownUser`, `consented`, `withdrawn`, `done`, `lastRoute`, `completionCode`, `seedID`, `seedSet`. |
| `localState` | local storage (in the one saved copy, with `data` and `private`) | `conditions`, `randomizedRoutes`, `seqtimeline`, `viewSteppers`, `totalWrites`, `totalSends`, `lastWrite`, `approxDataSize`, and similar bookkeeping. |
| `browserEphemeral` | memory only | Resets on reload: whether data has loaded, the save status (`sync`), whether another tab has taken over (`otherTab`), window-too-small, steppers. |
| `dev` | cookie, dev tools only | The dev tools' own settings (open panels, sizes, filters, device preview). |
| `config` | none | The app's configuration, from the `VITE_*` settings in `.env` (see [Configuration](/coding/configuration)). |

`browserPersisted` is a read-only view that merges `cookieState` and
`localState`, kept for older code.

### Getters and actions

Commonly used getters: `isKnownUser`, `isConsented`, `isWithdrawn`, `isDone`,
`isDataLoaded`, `lastRoute`, `recruitmentService`, `getConditions`,
`getRandomizedRoutes`, `getShortId`.

Commonly used actions (most have an API equivalent you should prefer):

- Saving and loading: `sync()`, `loadData()`, `setKnown()`
- Participant status: `setConsented()`, `setWithdrawn(formInfo)`, `setDone()`,
  `setCompletionCode(code)`, `verifyVisibility(value)`, `resetApp()`
- Conditions and routes: `setCondition(name, cond)`,
  `getConditionByName(name)`, `setRandomizedRoute(name, route)`,
  `getRandomizedRouteByName(name)`
- Recording: `recordWindowEvent(type, data)`, `recordProperty(name, data)`,
  `recordRoute(route)`
- Steppers: `registerStepper(view, stepper)`, `getStepper(view)`,
  `resetStepper(view)`

### Good to know

1. **Size:** each save sends the whole `data` object, so keep it under your
   host's request size limit (4.5 MB on Vercel). See
   [How much data a participant can have](#how-much-data-a-participant-can-have).
2. **Saving is automatic:** about a second after each change, with retries.
   `await api.sync()` waits for the server's answer when you need to be sure.
   `VITE_MAX_WRITES` caps the saves one browser sends.
3. **Private data:** `private` is saved to the separate `private_data` table,
   not with the participant's `data`, so it can be kept out of shared datasets.
4. **Reactivity:** the store is reactive, so changes to it update every
   component that uses it.
