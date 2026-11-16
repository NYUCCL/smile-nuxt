# Sync engine, schema and telemetry (#36, then #72, #39, #40, #45)

Status: step 1 done (2026-11-16); steps 2–7 to do. Branch `sync-engine`, off main at
7f977fc. Everything here happens on that branch, in small commits with the
tests passing at each, so any step can be reverted, or the branch dropped,
without touching main.

Replaces `plans/db_schema_review.md`; its findings are in "The tables" below.

## Why

Saving today was designed for Firebase, where writes cost money and had hard
limits: the experiment saves when asked (`saveData()`, plus an automatic save
when a View changes), at most every 2 s and at most 1000 times. Without those
limits that design causes the risks found in the review:

- A long task inside one View isn't saved until the participant leaves it; only
  the local backup has it.
- Resuming after a reload depends on three things written separately: the View
  (a cookie), the trial position (`viewSteppers` in localStorage) and the data
  (a localStorage backup and the database). They agree only because two
  watchers happen to run in the same update.
- One value in the record that can't be serialized (a BigInt, a circular
  reference) makes `JSON.stringify` throw, and then **nothing** saves again for
  that participant.
- The server stores whatever it's sent, a late save can overwrite a newer one,
  and two tabs of the same experiment overwrite each other.

## The rule everything here serves

**Nothing a participant does, and nothing an experiment records, can stop
saving.** Bad values are cleaned or replaced where they're recorded, the
record that's sent can always be serialized, the server never fails on content,
and a problem the engine can't fix (a record over the size limit) is reported,
kept locally, and doesn't stop anything else from saving.

## Design

### 1. One snapshot per participant

`{ rev, data, resume }`, kept together:
- `data`: the record, as today (analysis, export and `smiledata` unchanged).
- `resume`: what a reload needs to put the participant back: the current View,
  `viewSteppers` (each stepper's position and its `persist` values), and
  anything else in `localState` resume reads.
- `rev`: bumped on every change to either.

The snapshot is written to localStorage **synchronously, as one value**, on
every change. Data and position can't disagree, because they're never saved
separately.

The cookie keeps only what server-side rendering needs (participant id, gate
flags); the View in it stays as a hint and `resume` wins.

### 2. The sync loop

Runs by itself on the client:
- When `rev` is ahead of the server's last confirmed `rev`, send the snapshot.
  Debounced: ~1 s after the last change, at least every 5 s while changes keep
  coming.
- One request at a time. A newer snapshot replaces a queued one.
- Errors are sorted into **retry** (network failure, timeout, 5xx, 429: back
  off, 1 s doubling to 60 s, with jitter) and **stop** (400, 413: report, keep
  the snapshot locally, don't retry the same body). A 409 (the server has a
  newer `rev`) is handled as in "Two tabs" below.
- Pauses while offline (`navigator.onLine`, `online`/`offline` events), and
  sends at once when back.
- When the page is hidden or closing (`visibilitychange`, `pagehide`), sends
  at once with `keepalive` if the body fits (browsers cap keepalive bodies at
  64 KB); the local snapshot covers what doesn't.
- A guard against runaway code: no more than N sends a minute (default 30);
  above that it waits, warns in the dev tools, and keeps the newest snapshot.

### 3. Channels

The loop serves two kinds of channel, so retry, backoff, offline and close
handling are written once:

| | State channel | Append channels |
|---|---|---|
| Carries | the snapshot | console logs (#39), interaction chunks (#40) |
| Unit | the latest snapshot; newer `rev` replaces older | numbered chunks (`seq`) |
| Local | one snapshot | a queue of unsent chunks (localStorage, capped) |
| Server | keep it if `rev` is newer | insert; the unique key ignores a resent chunk |

A full queue drops the oldest telemetry chunk, never the snapshot.

### 4. Resume

On load, read both copies, local and server, and use **the one with the higher
`rev`**, data and position together. If a copy is missing or doesn't parse,
use the other. If neither can be used, start the participant's current View
again, keep whatever data could be read, and log why. A broken copy never stops
the page from loading.

A reload still starts a new `visit_N` (by design).

### 5. Two tabs

Two tabs of the same experiment share the cookie and localStorage. The server
answers a save whose `rev` isn't newer with 409 and its own `rev`. The tab that
gets it reloads from the newer copy and shows a "this experiment is open in
another tab" notice, rather than both tabs overwriting each other. A
`BroadcastChannel` lets the tabs notice each other before saving at all.

### 6. API

- `recordPageData`, `recordStep`, `recordProperty`, `persist`: unchanged for the
  experiment, but they clean values instead of throwing (below).
- `await api.sync()`: send now and wait for the server to confirm. For
  checkpoints, such as before redirecting to the recruitment site's completion
  page. Resolves `{ ok, rev, error }` and never throws.
- `saveData()` stays, as a name for `sync()`.
- `api.syncStatus`: `saved` / `saving` / `offline` / `error`, with the last
  error. Shown in the dev tools; the experiment can show it too (on the
  thanks page, for example).
- Deprecated, kept working with a warning: `autoSave`,
  `VITE_MIN_WRITE_INTERVAL`, `VITE_MAX_WRITES`.

## Bad data, layer by layer

Shared values to test against: one corpus file of bad values (below), used by
every layer's tests.

### Where values are recorded
`recordPageData`, `recordStep`, `recordProperty`, `recordWindowEvent`, stepper
data and `persist` all pass through one function, `toPlainJSON(value)`, which
never throws and returns plain JSON:

| Value | Becomes |
|---|---|
| `undefined`, functions, symbols | dropped (object keys) / `null` (array items) |
| `NaN`, `Infinity`, `-Infinity` | `null`, with a warning |
| `BigInt` | its decimal string |
| `Date` | ISO string (invalid date: `null`) |
| `Map`, `Set` | an object / an array |
| Typed arrays, `ArrayBuffer` | an array of numbers |
| Circular reference | `"[Circular]"` |
| Vue reactive proxies, refs | their plain value |
| DOM nodes, Vue components, class instances with no plain fields | `"[Unserializable: <type>]"` |
| Getters that throw | `"[Error: <message>]"` |
| Nesting deeper than 64 | `"[Too deep]"` |
| A string over 1 MB | cut, with `"…[truncated N chars]"` |
| Lone UTF-16 surrogates | replaced with U+FFFD |
| Keys with `.` `/` `[` `]` `*` | kept as given (the Firebase rule is dropped) |
| `__proto__`, `constructor` keys | stored as plain data, never touching the prototype |
| Nested arrays | kept as given (today they're rejected) |

Every change it makes is logged to the dev console and counted in
`data.smileWarnings` (`{ path, issue, count }`, capped), so a researcher can see
in the data that something was cleaned.

### The snapshot
Serializing the snapshot calls plain `JSON.stringify` first (fast) and, only if
that throws, runs `toPlainJSON` over the whole snapshot and tries again. If
that still fails, the engine keeps sending the last snapshot that worked and
reports the error. It never stops sending.

### Size
The client measures each snapshot. Over the limit (default 4 MB, under
Vercel's 4.5 MB; a project can lower it, never raise it past 4 MB): it keeps
the snapshot locally, sends a small status-only update (`oversize: true`, the size, the status columns) so the dashboard shows
the problem, and the dev tools say which part is large. Telemetry chunks are
small by design and aren't affected.

### The server
- Never answers 500 because of what was sent. It checks: the body parses, `data`
  and `resume` are objects, `rev` is a positive integer, the size is under the
  cap. Anything else is a 400 that says what was wrong, which the client
  doesn't retry.
- Writes are one transaction: the record, its `rev`, its status columns. A
  failed status column (an odd value in `data`) is stored as `null` and never
  fails the save.
- Status columns are read defensively from the record: wrong types are
  ignored.

### Loading
Reading localStorage, the server copy, a stepper's state and `persist` values
are all wrapped: a value that doesn't parse or has the wrong shape is skipped
and logged. The stepper's deserializer gets the corpus too, including faker
function markers with unknown names and missing children.

## The tables

Findings from the review, unchanged:
1. No indexes on the foreign keys (`participants.project_id`,
   `private_data.participant_id`).
2. `private_data.participant_id` isn't unique; a retried POST makes a second row.
3. The whole record is rewritten on every save (kept; the engine makes it
   regular and safe, and delta sync can come later).
4. Status isn't queryable without parsing every record's JSON.
5. The server doesn't check what it stores.
6. Migrations are applied by timestamp; one merged out of order is skipped.
7. `dev_sessions` never deletes expired rows.
8. No `ON DELETE CASCADE`.

One migration on the branch:
- `participants`: add `rev` (integer), `resume` (JSON, separate from `data` so
  exports are unchanged), and status columns kept by the server on each save:
  `consented`, `done`, `withdrawn`, `recruitment_service`, `started_at`,
  `ended_at`, `data_bytes`, `save_count`, `oversize`, `last_error`. Indexes
  `(project_id, updated_at)` and `(project_id, done)`.
- `private_data`: unique `participant_id`; the POST becomes an upsert.
- New tables (below) cascade on participant delete; a server helper deletes a
  participant and everything under them.
- Migrations tracked by tag; expired `dev_sessions` deleted at login.
- A backfill: existing rows get `rev = 0`, status columns read from their
  `data`, and an empty `resume` (old clients keep working: see Steps).

### `console_logs` (#39)
`id`, `project_id`, `session_id`, `participant_id` (nullable, backfilled),
`seq`, `entries` (JSON, messages truncated), `created_at`. Unique
`(session_id, seq)`. The endpoint before consent has no participant to
authenticate, so: body cap, rows-per-session cap, the project must exist, and
a token issued with the page.

### `interaction_chunks` (#40)
`participant_id`, `route`, `visit`, `seq`, `stream` (gzipped binary, #40's
format), `event_count`, `t_start`, `t_end`. Unique
`(participant_id, route, visit, seq)`. One row per flush rather than #40's one
row per visit, which would rewrite a growing blob every 5 s. `browserData`
moves here once #40 lands.

Both streams are opt-in in the config: console logs on by default, interaction
tracking off.

## Dashboard (#45)
Lists and counts from the status columns; one record on demand; logs and
chunks by participant through their indexes; exports stream rows. Dev server
only for 1.0, reading the deployed database with the project's credentials;
on the deployed site it waits for #52's read permissions.

## Testing

Tests come first: each step below starts by writing the tests that describe it,
and the characterization tests in step 0 run against today's code before
anything changes.

### Shared fixtures
- `test/fixtures/bad-values.js`: the corpus. Every row in the `toPlainJSON`
  table, plus: huge arrays, huge objects, sparse arrays, `-0`, strings of
  emoji and combining marks, objects with 10 000 keys, `Object.create(null)`,
  frozen objects, a Proxy that throws on every trap, a stepper's data holding a
  Vue component and a faker function.
- `fast-check` (new dev dependency) for property tests over arbitrary values.

### Unit (vitest)
- **`toPlainJSON`:** every corpus value; properties: never throws, the result
  always survives `JSON.parse(JSON.stringify(x))` unchanged, plain JSON input
  comes back equal, warnings name the right path.
- **Record functions:** each with the corpus: never throws into experiment
  code, records the cleaned value, writes a warning.
- **Stepper serialization:** round trips (serialize, deserialize, serialize
  again gives the same thing) for nested, shuffled, zipped and `outer` steppers,
  `persist` values, faker functions; and deserializing damaged state (missing
  fields, wrong types, unknown faker names, truncated JSON) doesn't crash and
  says what it skipped.
- **Snapshot:** written in one `setItem`; a corpus value anywhere in `data`
  still produces a sendable body; the fallback path is taken only when needed.
- **Sync loop** (fake timers, fake fetch): debounce timing; one request in
  flight; newer snapshot replaces queued; every error class (network, timeout,
  500, 502, 429, 400, 409, 413) leads to the right behavior; backoff caps;
  offline then online; hidden and closing; keepalive only under 64 KB; the
  runaway guard; acks arriving late, out of order, or twice.
- **Append channels:** `seq` increases and survives a reload; a resent chunk
  is accepted once; a full queue drops the oldest telemetry, never the snapshot.
- **Resume choice:** every combination of local/server copy being newer, older,
  equal, missing, unparseable, from another participant, or from the old
  format (no `rev`, no `resume`).

### Server (vitest, against a real local SQLite)
- The save endpoint with: every corpus body, invalid JSON, a missing or
  non-integer `rev`, an older `rev`, an equal `rev`, a body over the cap, `data`
  as an array/string/null, odd status values. Never a 500; the right 4xx; the
  stored row unchanged by a refused save.
- Status columns computed correctly, and `null` for bad values.
- Telemetry endpoints: duplicates, out-of-order `seq`, oversize, an unknown
  project, the pre-consent token, the row caps.
- Migration: on a fresh database, on a copy of the current schema with data,
  and run twice. Cascade delete removes every row.

### End to end (Playwright, #72)
- **Reload stress:** a stepper task with recorded trials; reload at random
  points, many times: mid-trial, right after `recordStep`, during a save,
  offline, with the closing save blocked. After each: the right View and trial;
  at the end, every trial recorded exactly once in the database.
- **Network trouble** (Playwright's `route`): every save fails for 30 s, then
  works; responses delayed 10 s; responses lost after the server stored them;
  the browser offline mid-task.
- **Bad data from the page:** an experiment that records each corpus value;
  saving keeps working and the warnings are in the data.
- **Two tabs:** the second tab gets the notice; nothing is overwritten.
- **Old records:** a participant saved by today's code resumes under the new
  code.
- The same suite against Turso (a test database) before merging.

## Steps

Each step is one or more commits on `sync-engine`, with all tests passing.

0. **Characterization tests against today's code**: the reload stress test,
   network trouble, bad data. They record what's broken today (marked as known
   failures where they fail), so each later step can show what it fixed.
1. **`toPlainJSON` and the corpus**, and every record function routed
   through it.
2. **The migration** (tables, status columns, `rev`, `resume`, tag tracking)
   and the server checks.
3. **The snapshot and resume**: one local value, the choice between copies,
   reading old-format records.
4. **The sync loop** and the state channel, replacing `saveData`'s throttle;
   `api.sync()`, `syncStatus`, deprecations; dev tools status.
5. **Two-tab handling.**
6. **Docs**: data storage, the new API, the deprecations, what researchers see
   in `smileWarnings`.
7. **#72's full suite** green on local SQLite and Turso. Then decide whether to
   merge the branch.
8. After merging: append channels, #39, #40, then #45, each on its own branch.

### What step 0 found (2026-11-15)
Tests: `test/core/sync/characterization.test.js` (unit, 65 known failures) and
`test/e2e/sync-characterization.spec.ts` (browser, 13 known failures). Known
failures run as `it.fails` / `test.fail()`; `SHOW_KNOWN_FAILURES=1` runs the
browser ones as plain tests.

- **Saving stops for good** after a BigInt, a circular reference, or a getter
  or `toJSON` that throws reaches `store.data` (directly, or through
  `recordWindowEvent`, which stores its argument as given). Every later save
  throws while serializing, and the local backup stops being written too.
- **The participant gets stuck**: a circular value in `persist` makes
  `Stepper.save()` throw inside `goNextStep()`, so the trial never advances.
- **Errors thrown into experiment code**: `recordProperty` and `Stepper.save()`
  throw on these values; `recordPageData` overflows the stack on a cycle.
- **Data refused and lost**: `recordPageData` refuses functions, symbols,
  BigInt, dotted keys, nested arrays, and a whole-argument array.
- **Damaged stepper state** starts the view over (useStepper catches the
  error), even when only one child or the index is bad.
- **No retry**: trials reach the database only on a view change; a failed save
  waits for the next one, and coming back online sends nothing.
- **The save endpoint checks nothing**: a string, number or array as `data`
  replaces the participant's record; `null` gives a 500; invalid JSON gets 200.
- Holding up: reloads at any point (all trials once), a lost response, and
  reloading while saves fail.

### What step 1 did (2026-11-16)
- `toPlainJSON` (`src/runtime/utils/plainJSON.js`), with `safeStringify`,
  `sendable` and `addWarnings`. `recordPageData`, `recordProperty`,
  `recordData`, `recordWindowEvent` and `Stepper.save()` go through it;
  `validateData` and the Firebase rules are gone. Warnings go to the console and
  `data.smileWarnings` (`{ path, issue, count, first }`, at most 100 entries).
- `saveData`, the local backup and the closing save serialize with the
  fallback, so a bad value written straight to `api.data` no longer stops
  saving. (The snapshot in step 3 replaces these.)
- Stepper state: `save()` never throws (damaged localStorage, a full quota);
  duplicate checks don't throw on bad step data; loading repairs damaged
  state (bad index, missing id, a child that isn't an object becomes an empty
  step at its index) and refuses only a root with no `states` list.
- Found on the way: a faker function lost its marker on the second save after
  a reload (fixed: the rebuilt function carries it). `shuffle()` set each
  child's `currentIndex` to its new position, which had no effect (leaves
  don't use it, and `next()` resets a block's index when it enters the
  block) but was wrong. Fixed: shuffle leaves the indices alone, and loading
  sets a leaf's index to 0, which also cleans state saved before the fix.
- Tests: `test/core/sync/plainJSON.test.js` (the table, warnings, fast-check
  properties), `test/core/sync/stepperState.test.js` (round trips, corpus in
  persist, fast-check damage). All 65 unit and 2 browser known failures from
  step 0 that were about bad data now pass; the 11 browser ones left are for
  steps 2 and 4 (retry, offline, server checks).

Old clients: a project upgraded mid-collection has participants whose page
still runs the old code until they reload. The server accepts the old body (no
`rev`) as `rev = previous + 1` for a transition period, so they keep saving.

## Decisions (Todd, 2026-11-15)
1. **Keys with `.` `/` `[` `]` `*` and nested arrays** are allowed. The Firebase
   rule in `validateData` is removed; `toPlainJSON` replaces it.
2. **Bad values in production**: the cleaned value is recorded, with a warning
   in `data.smileWarnings`. Nothing is refused.
3. **Size cap**: 4 MB default; a project can set a lower cap.
4. **Send timing**: 1 s after the last change, at least every 5 s while there
   are changes, at most 30 sends a minute.
5. **`fast-check`** is added as a dev dependency.
