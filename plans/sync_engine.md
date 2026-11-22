# Sync engine, schema and telemetry (#36, then #72, #39, #40, #45)

Status: steps 1 to 6 done (2026-11-17); step 7 to do. Branch `sync-engine`, off main at
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

The snapshot is written to localStorage **as one value**, a few milliseconds
after a change (at once when the page is hidden or closing, and before every
save). Data and position can't disagree, because they're never saved
separately. (Not synchronously on every change, as first planned: see "What
step 3 did".)

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
- Offline is a failed send like any other (the wait grows to 60 s); the
  browser's `online` event sends at once. (First planned as a pause while
  `navigator.onLine` is false; that flag can be wrong, and a send that fails
  costs nothing.)
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
- Deprecated: `VITE_AUTO_SAVE_DATA`, `VITE_MIN_WRITE_INTERVAL`. They are
  accepted and have no effect, with a warning in the dev console and the
  config check. (`autoSave=false` would turn the engine off.)
- `VITE_MAX_WRITES` stays a real limit (Todd, 2026-11-17: "i do want a max
  though (can be high) because i don't want clients in the wild running crazy
  and saending data indefinitely"). Default 10000, was 1000. See "The send
  limit" under step 4.

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
7. **#72's full suite** green on local SQLite and Turso, and the **live
   tests** below. Then decide whether to merge the branch.
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

### What step 2 did (2026-11-16)
- **Migration `0001_sync_engine`** (`drizzle/`, bundled into
  `server/database/migrations.ts`): `participants` gets `rev`, `resume` and the
  status columns, with two indexes; `private_data.participant_id` becomes
  unique (duplicate rows from a retried POST are removed first, keeping the
  newest; every PATCH wrote to all of them, so they held the same data); the
  `console_logs` and `interaction_chunks` tables. Existing rows get `rev = 0`
  and status columns read from their record; a record that isn't a JSON
  object, or a value of the wrong type, leaves them null.
- **The migration runner** (`server/utils/migrate.ts`): a migration is applied
  when its tag isn't recorded (older rows are matched by hash or timestamp and
  given their tag), so one merged out of order still runs. Each runs in one
  transaction with the row that records it, so it applies whole or not at
  all. A second server starting at the same time waits and skips it. A
  database with hand-made tables has only the first migration recorded as
  applied (before, all of them were, which would have skipped this one).
- **API requests wait for the migrations** (`middleware/00.database-ready.ts`):
  Nitro doesn't wait for an async plugin, so a request during a cold start
  could run before the schema was ready. If setup fails the answer is 503,
  and setup is tried again on the next request.
- **The save endpoint** (`server/utils/participant-save.ts`): 400 for a body
  that isn't JSON or has the wrong shape (`data` must be an object), 413 over
  4.5 MB, 409 with the row's `rev` for a save that isn't newer, 404 for an
  unknown participant; the row is unchanged by a refused save. The same `rev`
  with the same content (a resend after a lost response) succeeds without
  writing. The rev check is in the UPDATE's WHERE, so two saves arriving
  together can't both win. A save with no `rev` (today's client) is stored as
  `rev + 1`. `GET` returns `{ data, rev, resume }`.
- **Private data**: POST and PATCH are both upserts on the participant (one
  row); a PATCH creates the row if the POST never arrived. Bad bodies get 400.
- `deleteParticipant()` removes a participant and every row under them in one
  transaction. Expired `dev_sessions` are deleted at login.
- The client is unchanged in this step: it still sends `{ data }` with no
  `rev`, which the server accepts.
- Tests: `test/server/participant-save.test.ts` and `test/server/migrate.test.ts`
  (a real SQLite file: 108 tests, with fast-check over bodies), and
  `test/e2e/save-endpoint.spec.ts` over HTTP. The 8 browser known failures
  about bad request bodies now pass; 3 are left for step 4 (saving during a
  view, retrying, coming back online).
- Not done here: the old tables' foreign keys still have no `ON DELETE
  CASCADE` (SQLite needs the table rebuilt for that; `deleteParticipant()`
  covers it). The migration has run on local SQLite only; Turso is step 7.
- Also: the unit tests' setup now works on Node 25 and later, which define
  their own `localStorage` (undefined by default) over happy-dom's.

### What step 3 did (2026-11-16)
- **One local value** (`core/sync/snapshot.js`, plain functions; the store's
  `captureSnapshot()`): `{ v, participantId, rev, savedRev, local, data,
  resume }` under the existing key `smilestore-<codeName>`. It replaces the two
  values kept before (`localState` under that key, written by a watcher and
  separately by the stepper, and the data backup under `-data`).
  - `resume`: the current View (`view`), `viewSteppers`, `conditions`,
    `randomizedRoutes`, `possibleConditions`, `verifiedVisibility`,
    `useSeed`.
  - `local`: values that stay on the device (`reset`, `totalWrites`,
    `lastWrite`, `approxDataSize`).
  - No longer stored: `routes` and `seqtimeline`, which the timeline rebuilds
    on every load.
- **`rev`** goes up by one when the record or the position differs from the
  last snapshot taken (the texts are compared), so it doesn't depend on when
  a watcher runs: a save sends exactly the text its `rev` names.
- **When it's written**: a change asks for a write, which happens 4 ms later,
  so everything one event does ends in one write. Measured before this: one
  Stroop keypress wrote the whole snapshot 10 times, because the stepper saves
  on each assignment to step data and the keypress is handled over several
  microtasks. The wait grows to ten times what the last write took (at most
  2 s), so writing a large record uses about a tenth of the main thread at
  most. The page being hidden or closing, and every save, write at once.
- **A full or blocked localStorage** doesn't throw; it's reported once
  (`browserEphemeral.localCopyError`) and saving to the server goes on.
- **Saves** send `{ rev, data, resume }`, the text of the snapshot. The
  `resume` sent has only the current View's stepper (stepper state holds
  every step's data; the steppers of finished Views would be uploaded again
  with each save). The local copy keeps all of them. Private data is sent with
  every save, whether or not its row was created (the server creates it).
  `saveData()`'s timing is unchanged (step 4 replaces it). A 409 is logged;
  handling it is step 5.
- **On load** (`chooseCopy`): the copy with the higher `rev`, record and
  position together; equal revs use the local one and send nothing.
  - Local copy missing, unparseable, with the wrong shape, or from another
    participant: the server's is used, with its position. A participant whose
    localStorage is gone comes back to the same trial from the server copy.
  - Server not reached: the local copy is used and a save is tried.
  - Server record unusable (not an object): the local copy is used, with a
    `rev` above the server's.
  - Neither usable: the record starts again, the position that could be read
    is kept, and the reason is logged.
  - Server not reached and no local copy: asked twice more (0.3 s, 0.9 s), then
    the page goes on without the record and the next navigation tries again.
    While in that state the record isn't written locally, so an empty one
    can't be taken for the participant's. When the record does arrive, the
    page reloads so the record and what's on screen agree.
  - The View in the snapshot wins over the cookie's.
  - A loaded record is repaired where the code appends to it (`studyData`,
    `routeOrder`, `pageData_*` and so on must be lists or objects).
- **Old-format copies** (a participant mid-study when the project upgrades):
  the position is read from the old `localState`; the old data backup wins
  over the server when it has unsaved changes (its counter can't be compared
  with the server's `rev`, so the old rule is kept), with a `rev` above the
  server's. After the first write there is one value in the new format.
- Found on the way:
  - The default `viewSteppers`, `conditions` and stepper registry objects were
    shared between a store and the one after a reset, so a participant reset
    as "not found on the server" kept the previous steppers and conditions.
    Each store now gets its own.
  - A failed private-data POST at consent left the participant unconnected
    until the next navigation. The record is now connected as soon as its row
    exists.
  - A reset removes the stored state and reloads; the write made as the page
    closes would have put it back. Writing stops when a reset begins.
- Tests: `test/core/sync/snapshot.test.js` (104: reading, choosing between
  every combination of copies, repair, the corpus in the snapshot, fast-check
  over arbitrary stored text and server answers), `snapshotStore.test.js`
  (106: the store's writes, saves, loads, old format; replaces the #42 backup
  tests, whose cases are all in it), `test/e2e/resume.spec.ts` (10, in the
  browser: resume from the server copy alone, damaged local copies, another
  participant's copy, an old-format participant, the server unreachable at
  load).
- Consumer install (`pnpm test:starter`: the packed module in a scaffolded
  project outside the workspace, built, its own browser tests run): passes,
  which covers steps 2 and 3. It needs pnpm 10; under pnpm 12 the scaffolded
  project's install fails on esbuild's unapproved build script (not caused by
  this branch).
- Left for later steps:
  - A participant whose creation request failed at consent has no record and
    nothing is saved for them; nothing retries it. (Done in step 4.)
  - A 404 on load still resets the participant and removes the local copy,
    as before.
  - Two tabs share the one local value and overwrite each other's (step 5).

### What step 4 did (2026-11-16)
- **Before it, a review of step 3** (Todd: "see if anything could be
  simpler"): `chooseCopy` rewritten around one result builder, a redundant
  field removed, and the stepper no longer asks for the snapshot itself (the
  watcher already does). 44 lines fewer, same behavior.
- **The loop** (`core/sync/loop.js`, plain functions and timers; the store
  supplies `take` and `send`): a change is sent 1 s after the last one and at
  most 5 s after the first unsent one; one request at a time, and what
  changed meanwhile goes after it; at most 30 sends a minute.
  - No answer, a timeout (30 s), 408, 429, 5xx: tried again after 1 s,
    doubling to 60 s, with jitter (half to all of the wait).
  - 400, 413 and other 4xx: that snapshot isn't sent again; the next change
    is a new one and is tried.
  - 409: nothing more is sent from this page (step 5 adds the reload and the
    notice). A 409 for a send older than one already made is ignored.
  - 403: the participant is reset, as before.
  - Over 4 MB: not sent, kept locally, and the server is told
    (`{ oversize: true, dataBytes }` sets the row's `oversize` and
    `last_error`; the next save that fits clears them).
  - Hidden or closing: what's unsent goes at once in a keepalive request when
    it's under 60 KB, otherwise as an ordinary one.
- **`saveData`'s throttle is gone** (the 2 s minimum, the 1000 write cap, the
  deferred save). `api.sync()` sends now and resolves `{ ok, rev, error }`
  with the server's answer, never rejecting; `saveData()` is the same
  function. A View change calls it. `api.syncStatus` is
  `{ status, error, retryAt }` with status `saved`, `pending`, `saving`,
  `offline` or `error`; the dev tools' database panel shows it.
- **Creating the participant**: if the request at consent fails, the
  participant goes on, the record is kept in the local snapshot (with no
  participant id), and the loop creates the row with its first save. A reload
  in that state continues from the local copy.
  The first save goes at consent, not a second later, so the private data
  (recruitment ids) reaches the server at once. Not handled: a create whose
  answer is lost after the server made the row leaves an empty row behind
  (`rev` 0, `save_count` 0) when the loop creates another.
- **Private data** (found while reading the save path; older than this
  branch): after a reload the page's private data was empty, and the next
  save replaced the server's copy with it, so recruitment ids, the
  fingerprint and the withdraw form were erased by any reload. Now:
  - the private data is in the local snapshot and is restored on reload (the
    Thanks page builds the return link from it);
  - the client sends only the parts that hold something, and the server
    merges them into the stored row instead of replacing it;
  - it is sent when it changes, not with every save (once per page load
    even when empty, so every participant has a row); a change to it bumps
    `rev` so the loop sends it.
- **A step 3 bug, in development only**: Pinia's dev tools call each action
  with a new wrapper object as `this`, and the store's snapshot bookkeeping
  was keyed on it, so it was made again on every call: every snapshot looked
  changed, `rev` rose with every write, and with the loop that became a save
  per write. Keyed on the store's state object now, with a test that calls
  actions the way Pinia does. Production builds were not affected. (Step 3's
  figure of 10 writes per keypress was measured with this bug present.)
- Removed: `privateDataId` (nothing read it; the server finds the row by
  participant).
- Tests: `test/core/sync/loop.test.js` (64, fake timers: timing, every status
  class, backoff, offline, closing, the send limit, size, late and repeated
  answers); the store's tests rewritten where they described the throttle
  (private data, creating the participant, `sync()`); server tests for the
  merge and the oversize report; `test/e2e/sync-loop.spec.ts` (8, in the
  browser). The last 3 known failures from step 0 pass (saving during a View,
  retrying, offline then online); none are left.
- **The send limit** (added 2026-11-17, after Todd asked for a max):
  `VITE_MAX_WRITES`, default 10000, is the most sends one participant's
  browser makes. Every send counts whatever its answer (failed ones and
  close-time ones too), in `localState.totalSends`, which is in the local
  snapshot, so a reload doesn't start the count again. At the limit nothing
  more is sent by itself: changes stay in the local snapshot, `syncStatus` is
  `error` with kind `limit`, and the browser tells the server once
  (`PATCH { limit: true, sends }` sets the row's `last_error`). `api.sync()`
  (which page navigation also calls) still sends, up to twice the limit, so
  the end of a long study is saved; past that nothing is sent at all. A busy
  page sends at most one save every 5 s, so 10000 is about 14 hours of
  constant change; runaway code at the 30 a minute cap reaches it in 5.5
  hours. A value under 2000 is a warning in the config check and the dev
  console (older templates set 1000, which is 83 minutes of constant
  change). The limit is the client's own; the server does not refuse a
  participant with a high `save_count`. Todd, 2026-11-17: client only is
  fine.
- **Two fixes found while testing the limit (2026-11-17)**, both in the case
  where the request at consent failed and the row doesn't exist yet. The
  browser test for that case had failed now and then; it was put down to the
  dev server reloading, which was wrong.
  - A page that closes or reloads no longer tries to create the row. The
    close-time save did, the page never read the answer, the server made a
    row, and the next page made a second one. The local copy has the record;
    the next page creates the row.
  - The server's render of a page never runs the sync loop, and doesn't take
    the "no row yet" path of `loadData()` (only the browser has the local
    copy). Before, the server marked the record loaded, and could start a
    loop with timers inside the server process.
- Left open:
  - A 404 or 403 on load, and a 403 on save, still reset the participant and
    remove the local copy (as before this branch). Creating a new row from
    the local copy would keep the data; that changes what a wiped dev
    database does, so it's Todd's call.
  - The built-in Thanks, Withdraw and feedback views still call `saveData()`
    and ignore the answer. The Thanks page could wait on `sync()` and show
    `syncStatus`.
  - The docs still describe `autoSave` and the write limits (step 6).

### What step 5 did (2026-11-17)
- **The rule:** of the tabs of one browser that hold the participant's
  record, the one opened last is the participant's. The others stop writing
  the local snapshot, stop saving, and show a notice with a "Continue here"
  button. The button reloads the tab, which makes it the newest: it starts
  from the newest copy and the other tab gets the notice.
- **How a tab finds out** (`core/sync/tabs.js`, plain functions; the channel
  is passed in): a tab says `hello` (its id and start time) on a
  `BroadcastChannel` once its record is loaded. An older tab that holds the
  record pauses. A newer tab that hears an older one (two tabs restored
  together, the older loading second) says `hello` back, so the older one
  stops. Equal start times are settled by the id. A tab with no participant
  (before consent) is left alone. Anything else on the channel is ignored.
- **Without the channel, or when a tab was not told:** the server's 409
  pauses the tab the same way (`pauseForOtherTab('conflict')`). That tab
  also removes the local copy if it is still the one it wrote, so a reload
  takes the server's copy and not its own older one.
- **Different from the first plan:** a 409 does not reload the tab by itself.
  The tab shows the notice and the participant chooses. One state and one
  notice for both ways of finding out, and no way for two tabs to reload
  each other in turn. The server already accepts a resent `rev` with the
  same content, so a 409 always means another copy saved something else.
  Todd, 2026-11-17: keep the button.
- **The notice** (`OtherTabNotice.vue`): over the whole page in the
  experiment layout; in place of the page in the dev tools.
- Tests: `test/core/sync/tabs.test.js` (10), four store tests, and
  `test/e2e/two-tabs.spec.ts` (with the channel, and with it removed).
- Left open:
  - The page under the notice keeps running (its timers, its key handlers);
    nothing it records is written or sent.
  - Two tabs that both consent make two participant rows; the second tab's
    is the one that continues.
  - The presentation layout has no notice.

### What step 6 did (2026-11-17)
- `docs/coding/datastorage.md`: "When data is saved" rewritten (saved by
  itself about a second after each change, the browser's copy, retries,
  leaving the page), with new sections for `api.sync()` and `api.syncStatus`,
  what happens when a save fails (by `error.kind`), the limit on saves
  (`VITE_MAX_WRITES`), the settings that no longer do anything, and two tabs.
  Also: the 4 MB size limit, the row's new columns, that the browser's copy
  includes the private data, the store table.
- `docs/api.md`: `sync()`, `syncStatus`, `saveData()` as the older name.
- `configuration.md`, `concepts.md`, `testing.md`, `views.md`, `timeline.md`,
  `steps.md`, `persistence.md`, `styling/forms.md`: the text about auto-save
  on View changes, the write interval and forced saves replaced.
- The template's test comment about throttled saves.
- The docs site builds; it describes the two-tab notice with the button.
- Not done: a page for people upgrading a project mid-collection; the dev
  tools page doesn't describe the save status in the Database panel.

### Step 7 so far (2026-11-21)
- The browser tests open the database the dev server uses
  (`test/e2e/db-client.ts`: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` when
  set, otherwise the local file), so the same suite runs against Turso.
- Full browser suite on local SQLite: 190 passed.
- Full browser suite on a new, empty Turso database (`smile-sync-test`, made
  with the turso CLI; the server applied every migration to it at start):
  190 passed in 8.5 minutes.
- `pnpm test:starter` (the packed module in a scaffolded project outside the
  workspace): passes, its 8 browser tests included.
- `smile-sync-test` is kept for the live tests (Todd).
- **Found while preparing the live test (not from this branch; the same code
  is on `nuxt`):** `useViewAPI` rebuilt a picture of the whole stepper tree
  (`_visualizeStateMachine`) on every step and every data change. Nothing
  read it (the dev tools' step panel uses `steps.visualize()`); an old commit
  added it for a state viewer that has since changed. With 300 steps it took
  about 0.6 s of main-thread time each time: a step took about 1150 ms, and
  about 70 ms without it. Removed. New browser test: the step panel follows
  the current step. Full browser suite with the change: 190 passed (before
  the new test). The step panel, when open, still rebuilds the tree on each
  change, so a long task is slow in dev with that panel open.
- One unit test failed once in six runs while other servers were running on
  the machine; which one wasn't caught.
- The live-test project is in `/tmp/smile-sync-live` (this branch's module
  packed into a scaffolded project, a 300-trial task with a mouse stream,
  `live-run.mjs` to run it in a scripted browser and check the database,
  `deploy.sh`). Local production build, one trial a second: every trial and
  all 14,889 mouse samples in the database, 136 sends, none failed, a 407 KB
  record, 36.7 MB uploaded in 6 minutes.
- **Live runs (2026-11-21)**: the project deployed to Vercel
  (`gureckislab/smile-sync-live`, https://smile-sync-live.vercel.app) with
  `smile-sync-test` as its database. Scripted browser, 300 trials at one a
  second, the mouse moving throughout (about 15,300 samples), about 6 minutes
  each. In all three every trial and every mouse sample was in the database
  at the end, with no `smileWarnings`, `oversize` or `last_error`.

  | Connection | Sends (failed) | Uploaded | Save time, median / 95% / longest | Record |
  |---|---|---|---|---|
  | normal | 133 (0) | 37.0 MB | 0.17 s / 0.28 s / 1.3 s | 420 KB |
  | slow 3G (400 ms latency, 400 kbit/s) | 59 (0) | 13.3 MB | 4.6 s / 10.2 s / 10.5 s | 417 KB |
  | slow 3G, offline 8 s of every 30 | 95 (43) | 24.7 MB | 4.0 s / 10.0 s / 10.5 s | 416 KB |

  ("Uploaded" is the size of the request bodies the page started, failed
  ones included.) The largest single send was about 505 KB for a 420 KB
  record: the position (the stepper's state for 300 steps) is the rest.
  On slow 3G one send of this record takes about 10 s, so the uplink is in
  use nearly all the time. Not tested: a record several times larger, where
  one send would take longer than the 30 s timeout on this connection and
  so might never complete; by hand; a phone.
- **Compression (2026-11-21; Todd: "the compression seems a good idea")**:
  the browser gzips a save of 1 KB or more (`core/sync/compress.js`,
  `CompressionStream`); the save made as the page closes, and every save in
  a browser that can't compress, stay text. The server recognises gzip by
  the body's first two bytes and unzips it with `DecompressionStream`
  (`server/utils/read-body.ts`): the web API, so it also runs on edge
  runtimes and doesn't hold the thread (Todd asked whether unzipping could
  be a problem on Vercel). The unzipped text keeps the 4.5 MB limit and
  reading stops when it is passed (413); gzip that can't be unzipped is a
  400. The client's 4 MB cap is still on the text, not the gzipped size.
  Tests: `test/core/sync/compress.test.js` (13), one store test with
  compression on (the other store tests run as a browser without
  `CompressionStream`, so they can read the bodies). Browser suite: 191
  passed. The same three live runs with it:

  | Connection | Sends (failed) | Uploaded, before → after | Largest send, before → after | Save time median / longest, after |
  |---|---|---|---|---|
  | normal | 137 (0) | 37.0 → 6.7 MB | 507 → 92 KB | 0.14 s / 0.36 s |
  | slow 3G | 105 (0) | 13.3 → 4.5 MB | 504 → 91 KB | 1.2 s / 2.3 s (was 4.6 s / 10.5 s) |
  | slow 3G, offline 8 s of every 30 | 121 (42) | 24.7 → 5.7 MB | 503 → 91 KB | 1.2 s / 3.1 s |

  Every trial and mouse sample was in the database in all three. The record
  shrinks about 5.5 times, so on slow 3G the 30 s timeout is now reached at
  a record of roughly 8 MB of text, above the 4 MB cap.
- **A mistake to avoid:** `pnpm pack` run while the repo's dev server was
  starting wrote the build into `src/` (the dev server makes `dist/runtime`
  a link to `src/runtime`). Restored from git; nothing was committed. Pack
  only with no dev server or browser suite running here.
- `StepperPerformance.test.js` ("1000 flat leaf nodes quickly") fails when
  the machine is busy and passes alone.
- **Reloads** (2026-11-21, deployed build with compression). The live task
  got Word / Not a word buttons and finger tracking so it can be done on a
  phone.
  - Scripted, four reloads straight after answering trials 40, 120, 121 and
    250, on a normal connection and on slow 3G: the page came back on the
    next trial each time; 300 of 300 trials and every mouse sample in the
    database in both.
  - Todd by hand on a desktop: one run without reloads and one with 8
    reloads (7 of them within 25 seconds): 300 of 300 trials, in order, in
    both; row marked done.
  - Found in these runs: data recorded with `recordPageData` under a custom
    name stayed under `visit_0` while the view's own data went to `visit_1`
    to `visit_8` (not looked into). A record too large for the closing-page
    send (over 60 KB) loses its last change when the browser closes within a
    few seconds of it, until the participant returns (seen as a stale saved
    position on slow 3G; the data was already saved). The test task's `NaN`
    chunk number was stored as `null` with a `smileWarnings` entry and the
    save went through.
- **Decided (Todd, 2026-11-22):** the private data stays in the browser copy
  as it is, unencrypted. Considered and not done: keeping only the
  recruitment ids there, clearing it when the study ends, encrypting it.
- The run on a real phone moved to #78 (the template's views aren't designed
  for phones; the size check blocked it). An emulated phone completed the
  task with every trial saved.
- **Save indicators** (2026-11-22). One mapping from the loop's state to what
  is shown (`core/sync/display.js`), used everywhere:
  - participants: a small muted cloud icon in the status bar
    (`SyncIndicator.vue`); nothing before there is a record;
  - dev tools: the nav bar's sync icon, the side bar's progress and its
    Database table, which also shows the seconds to the next try, sends
    against the limit, what the last send cost (bytes sent, before gzip, ms)
    and the record's size against the 4 MB that stops sending (it used to
    compare against 4.5 MB, which nothing enforces).
- **Code review** (2026-11-22): six independent reviews (three areas, two
  models each). Fixed from them, with Todd's go-ahead:
  1. **A 403 or 404 no longer wipes the browser's copy by itself.** The
     server marks its own two answers (`shared/save-answers.js`); an unmarked
     403/404 (a firewall, a proxy, a deploy being swapped) is tried again.
     A marked 404 (the row is gone) still resets to a new user. A marked 403
     (the token is refused) keeps the record and saves it as a new row, with
     the old id in `data.previousParticipantIds`; with no local copy it
     resets. The token now lasts 30 days (it was 7; the cookies last 30), is
     issued again when a day old, and allows 5 minutes between servers'
     clocks.
  2. A reset clears the record and private data in memory (the next consent
     used to create a row from the previous participant's).
  3. The Thanks page waits up to 15 s for the last save and then shows the
     code either way (Todd: participants are paid for their time even when
     saving fails), with a note while a failed save is still being retried.
     The built-in views call `api.sync()`.
  4. A closing page's save is gzipped when the text is over 60 KB (best
     effort: compressing is asynchronous), and the private data is sent
     alongside without waiting for the record's answer.
  5. A save counts only when the answer is the save route's own
     (`{ success: true, rev }` with the rev sent).
  6. A save without `rev` (a page running the old code) is refused with 409
     once a save with a position has been stored for the row.
  - Also corrected: the docs and the config warning said one save every 5
    seconds at most; the loop sends up to 30 a minute, so 10,000 sends is
    about 5.5 hours at the most, not 14, and 1,000 is 33 minutes.
- **The rest of the review** (2026-11-22, Todd: go through the full report):
  - Sync: a 4xx stops a body only with the save route's own mark (`refused`);
    any other 4xx is tried again. A gzipped save refused with 400 or 415 is
    sent again as text, and so are that page's later saves. The send window
    uses a clock that doesn't follow the system clock. The oversize report is
    sent again only when the record has grown by a tenth. Conditions and
    randomized routes are taken from the record when a row has no saved
    position and there is no local copy. When the browser copy can't be
    written, the older copy is replaced by the position alone, so it can't be
    taken for the record. The server reads each save body once. Local SQLite
    gets its lock wait set again after a migration's transaction.
  - **The migration.** Timed on Turso with rows saved by the old code: 300
    records of 207 KB took 11.5 s, and 1,000 of 311 KB took 100.8 s, inside
    one transaction that every request waits for. The fill of the status
    columns and `data_bytes` is now outside the migration
    (`backfillStatusColumns`): 25 rows a statement, in the background, with
    its progress recorded so it goes on after a stop. The same 1,000 records:
    2.8 s for the migration, 41.5 s for the fill.
  - Module and API (useAPI, useViewAPI, useTimeline, module.ts): `useViewAPI`
    imports `useRuntimeConfig` (preloading was off in an installed project);
    `api.data`, `private`, `config`, `urls`, `all_data`, `all_config` are
    getters, so a long-lived API object follows a reloaded record; URLs and
    the reset redirect use the app's base URL; `goToView()` sends unsent
    data; the reset, consent and connect logic is in one module
    (`core/participant-actions.js`) used by the API and the middleware (the
    middleware's copy had drifted); `autoSave` and `minWriteInterval` are out
    of the config; dev login and the QR route answer 400, not 500, for bad
    input; the log store's history is capped at 2,000 entries.
  - Docs: every finding corrected (api.md, datastorage.md, configuration.md,
    persistence.md, steps.md, views.md, timeline.md, the template's
    AGENTS.md). The build and deploy settings page describes the token and
    the save rate as they are now.
  - A finding that was wrong: `localState.seqtimeline` and `routes` are read
    by the dev palette's route jumper; they stay.
- **Todd's decisions on what was held back** (2026-11-22), all done:
  - **Reconnecting screen** (`ReconnectingNotice.vue`): when a returning
    participant's record can't be loaded and the browser has no copy, the
    page waits there, tries again every 3 s and when the browser is back
    online, and goes on from the record once it loads.
  - **A 409 with no newer tab known**: the notice says "Your progress was
    saved somewhere else" (the newer-tab case keeps its wording). The copy
    the server refused is set aside under `<key>_conflict` in local storage,
    not deleted, and the next load adds an entry to `smileWarnings`.
  - **Stepper methods with no stepper**: left as they are.
  - **Dependencies**: `lodash`, `clipboard` and `uuid` removed; `crypto-js`
    and `json-stable-stringify` replaced by `utils/sha256.js` and
    `utils/stableStringify.js` and kept as dev dependencies for a test that
    compares the two on fixed and generated data (completion codes are the
    same); `@codenamize/codenamize` is a dev dependency.
  - **`@pinia/nuxt`** is installed by the module (`moduleDependencies`).
  - **Private data** travels in the save's own body (`private`), so a closing
    page needs one request; the `/private` routes remain for older pages.
  - **Size**: a body over 4 MB as text is gzipped by the loop and sent when
    that fits 4 MB; the server takes up to 20 MB once unzipped
    (`MAX_TEXT_BYTES`), and still 4.5 MB on the wire. Local storage holds
    about 5 MB: past that the browser copy keeps the position only.
  - **The engine is out of the store**: `core/sync/engine.js` (803 lines)
    holds it as functions that take the store; `smilestore.js` went from
    1,294 to 495 lines, each engine action a one-line call; the initial
    state is in `stores/initial-state.js`. The engine's private state is
    declared in one place.
  - **Type checking**: `loop.js`, `snapshot.js`, `tabs.js`, `compress.js`,
    `display.js`, `utils/plainJSON.js` and `shared/save-answers.js` are
    `// @ts-check` under the project's strict settings (156 errors to none,
    by annotations).
  - Left as notes: every page load sends one save (a reload records a new
    visit anyway); `maxPerMinute` of 0 would make the loop spin (nothing
    lets a project set it); the `@types/node` version is still `latest`.
- To do: the merge decision.

Old clients: a project upgraded mid-collection has participants whose page
still runs the old code until they reload. The server accepts the old body (no
`rev`) as `rev = previous + 1` for a transition period, so they keep saving.

### Live tests, at the end (Todd, 2026-11-16)
Before deciding on the merge: a deployed build (Vercel and Turso, a test
project) run with realistic data, to check the whole path is robust outside
the test harness.
- A long task with realistic trial records, run to the end by a scripted
  browser and by hand, on a normal connection and a throttled one (slow 3G,
  dropped connections, a phone).
- **Streaming mouse data**: mouse positions recorded at a realistic rate for
  the whole task, so the record grows the way a tracking study's does.
- Measured: record size over time, bytes uploaded in total, save times, failed
  and retried saves, and whether every trial and the full mouse stream are in
  the database at the end.
- The upload volume options below are decided on these numbers.

## Open: upload volume (raised 2026-11-16)

The sync loop sends the whole record on every send. For a long task that adds
up: a 1 MB record sent every few seconds is hundreds of MB per participant,
which matters on slow or metered connections. These are possibilities, not
decisions; step 4 builds the loop so any of them can be added, and the live
tests decide:

- **Compress the body** (done 2026-11-21, see "Step 7 so far")
  (`CompressionStream('gzip')` in the browser, unzip on the server). Trial data is repetitive JSON and should shrink several times
  over. It also leaves more room under the 4 MB cap.
- **Send less often as the record grows**: the minimum time between sends
  rises with the body size (1 s for a small record, up to 30 s or so near the
  cap). A view change, `api.sync()` and the page closing still send at once.
- Already done in step 3: the `resume` sent has only the current View's
  stepper.
- For the live tests to measure as well: the local write. Each one serializes
  the whole record and writes it to localStorage (about 5 MB per origin in
  most browsers, so a record near the 4 MB cap may not fit; the failure is
  reported and saving goes on). Step 3 spaces the writes by their cost.
- **Send only what's new** (the trials added since the last confirmed save).
  The largest saving, but the server then has to merge, which is a new way
  for saving to go wrong. Only if the first two aren't enough.

## Decisions (Todd, 2026-11-15)
1. **Keys with `.` `/` `[` `]` `*` and nested arrays** are allowed. The Firebase
   rule in `validateData` is removed; `toPlainJSON` replaces it.
2. **Bad values in production**: the cleaned value is recorded, with a warning
   in `data.smileWarnings`. Nothing is refused.
3. **Size cap**: 4 MB default; a project can set a lower cap.
4. **Send timing**: 1 s after the last change, at least every 5 s while there
   are changes, at most 30 sends a minute.
5. **`fast-check`** is added as a dev dependency.
