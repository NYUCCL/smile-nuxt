import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  readLocalCopy, chooseCopy, cleanResume, repairData, buildResume, resumeForServer,
  serializeParts, snapshotText, saveBodyText, legacyDataKey, isPlainObject, SNAPSHOT_VERSION,
} from '../../../src/runtime/core/sync/snapshot.js'
import { BAD_VALUES } from '../../fixtures/bad-values.js'

/**
 * Step 3 of plans/sync_engine.md: the snapshot's plain functions. Reading the
 * local copy and choosing between it and the server's must work, without
 * throwing, whatever either copy holds.
 */

const KEY = 'smilestore-test'
const PID = 'p-1'

/** A stand-in for localStorage */
function storageWith(entries = {}) {
  const map = new Map(Object.entries(entries))
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
  }
}

const stepperState = at => ({ data: { stepperState: { id: '/', currentIndex: at, states: [] } } })

function v1(overrides = {}) {
  return {
    v: SNAPSHOT_VERSION,
    participantId: PID,
    rev: 5,
    savedRev: 3,
    local: { reset: false, totalWrites: 2, lastWrite: 1000, approxDataSize: 10 },
    data: { studyData: [{ trial: 1 }], from: 'local' },
    resume: { view: 'stroop', viewSteppers: { stroop: stepperState(4) }, conditions: { a: 'x' } },
    ...overrides,
  }
}

const localV1 = overrides => readLocalCopy(storageWith({ [KEY]: JSON.stringify(v1(overrides)) }), KEY)

function oldFormat({ state = { viewSteppers: { stroop: stepperState(2) }, conditions: { a: 'x' }, totalWrites: 4 }, backup } = {}) {
  const entries = {}
  if (state !== null) entries[KEY] = JSON.stringify(state)
  if (backup) entries[legacyDataKey(KEY)] = JSON.stringify(backup)
  return readLocalCopy(storageWith(entries), KEY)
}

const serverCopy = (overrides = {}) => ({
  ok: true,
  rev: 4,
  data: { studyData: [], from: 'server' },
  resume: { view: 'consent', viewSteppers: { consent: stepperState(1) } },
  ...overrides,
})

describe('readLocalCopy', () => {
  it('reads nothing from an empty storage', () => {
    const copy = readLocalCopy(storageWith(), KEY)
    expect(copy).toMatchObject({ format: 'none', data: null, resume: null, rev: 0, notes: [] })
  })

  it('reads a snapshot', () => {
    const copy = localV1()
    expect(copy).toMatchObject({ format: 'v1', participantId: PID, rev: 5, savedRev: 3 })
    expect(copy.data.from).toBe('local')
    expect(copy.resume.view).toBe('stroop')
    expect(copy.resume.viewSteppers.stroop.data.stepperState.currentIndex).toBe(4)
    expect(copy.local).toEqual({ reset: false, totalWrites: 2, lastWrite: 1000, approxDataSize: 10 })
    expect(copy.notes).toEqual([])
  })

  it('reads a snapshot written before the participant has a record', () => {
    const copy = localV1({ participantId: null, data: null })
    expect(copy).toMatchObject({ format: 'v1', participantId: null, data: null })
    expect(copy.resume.view).toBe('stroop')
    expect(copy.notes).toEqual([])
  })

  it.each([
    ['text that is not JSON', '{not json'],
    ['JSON cut short', JSON.stringify(v1()).slice(0, 40)],
    ['an empty string', ''],
    ['a number', '12'],
    ['an array', '[1,2]'],
    ['null', 'null'],
    ['a string', '"hello"'],
  ])('skips %s and says why', (_name, raw) => {
    const copy = readLocalCopy(storageWith({ [KEY]: raw }), KEY)
    expect(copy.format).toBe('bad')
    expect(copy.data).toBeNull()
    expect(copy.resume).toBeNull()
    expect(copy.notes.length).toBeGreaterThan(0)
  })

  it('keeps the usable parts of a snapshot with damaged fields', () => {
    const copy = localV1({ rev: 'seven', savedRev: -2, data: [1, 2], resume: { view: 7, viewSteppers: { a: stepperState(1), b: 'broken' }, conditions: 'x' }, local: 'nope' })
    expect(copy.format).toBe('v1')
    expect(copy.rev).toBe(0)
    expect(copy.savedRev).toBe(0)
    expect(copy.data).toBeNull()
    expect(copy.resume).toEqual({ viewSteppers: { a: stepperState(1) } })
    expect(copy.local).toEqual({})
    expect(copy.notes.join('\n')).toMatch(/rev is not a count/)
    expect(copy.notes.join('\n')).toMatch(/data is not an object/)
    expect(copy.notes.join('\n')).toMatch(/viewSteppers\.b/)
  })

  it('never reports savedRev above rev', () => {
    expect(localV1({ rev: 2, savedRev: 9 }).savedRev).toBe(2)
  })

  it('does not throw when storage does', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
    }
    const copy = readLocalCopy(storage, KEY)
    expect(copy.format).toBe('none')
    expect(copy.notes.join('\n')).toMatch(/blocked/)
    expect(readLocalCopy(null, KEY).format).toBe('none')
    expect(readLocalCopy({}, KEY).format).toBe('none')
  })

  describe('the format before the snapshot', () => {
    it('reads localState and the data backup', () => {
      const copy = oldFormat({ backup: { participantId: PID, rev: 9, savedRev: 6, data: { from: 'backup' } } })
      expect(copy).toMatchObject({ format: 'old', participantId: PID, rev: 9, savedRev: 6 })
      expect(copy.data.from).toBe('backup')
      expect(copy.resume.viewSteppers.stroop.data.stepperState.currentIndex).toBe(2)
      expect(copy.resume.view).toBeUndefined()
      expect(copy.local).toEqual({ totalWrites: 4 })
    })

    it('reads localState alone', () => {
      const copy = oldFormat()
      expect(copy).toMatchObject({ format: 'old', participantId: null, data: null })
      expect(copy.resume.conditions).toEqual({ a: 'x' })
    })

    it('reads the data backup alone', () => {
      const copy = oldFormat({ state: null, backup: { participantId: PID, rev: 2, savedRev: 0, data: { from: 'backup' } } })
      expect(copy).toMatchObject({ format: 'old', participantId: PID, rev: 2, resume: null })
    })

    it('skips a damaged backup and keeps the position', () => {
      for (const backup of [{ participantId: PID, rev: 2, data: 'text' }, { rev: 2, data: {} }, [1]]) {
        const copy = oldFormat({ backup })
        expect(copy.data).toBeNull()
        expect(copy.resume.viewSteppers.stroop).toBeTruthy()
      }
    })

    it('does not carry the route lists the old format stored', () => {
      const copy = oldFormat({ state: { routes: [{ name: 'a' }], seqtimeline: [{ name: 'a' }], conditions: {} } })
      expect(copy.resume).toEqual({ conditions: {} })
    })
  })

  it('whatever is stored, reading does not throw and gives the same shape', () => {
    fc.assert(fc.property(fc.oneof(fc.string(), fc.json()), fc.oneof(fc.constant(undefined), fc.string(), fc.json()), (main, backup) => {
      const entries = { [KEY]: main }
      if (backup !== undefined) entries[legacyDataKey(KEY)] = backup
      const copy = readLocalCopy(storageWith(entries), KEY)
      expect(['none', 'v1', 'old', 'bad']).toContain(copy.format)
      expect(copy.data === null || isPlainObject(copy.data)).toBe(true)
      expect(copy.resume === null || isPlainObject(copy.resume)).toBe(true)
      expect(Number.isSafeInteger(copy.rev) && copy.rev >= 0).toBe(true)
      expect(Number.isSafeInteger(copy.savedRev) && copy.savedRev >= 0).toBe(true)
      expect(Array.isArray(copy.notes)).toBe(true)
    }), { numRuns: 300 })
  })
})

describe('cleanResume', () => {
  it('returns null for nothing, and for something that is not an object', () => {
    expect(cleanResume(null)).toEqual({ resume: null, notes: [] })
    expect(cleanResume(undefined).resume).toBeNull()
    expect(cleanResume('x').resume).toBeNull()
    expect(cleanResume([1]).notes).toHaveLength(1)
    expect(cleanResume({}).resume).toBeNull()
  })

  it('keeps each part with the right type and drops the rest', () => {
    const { resume, notes } = cleanResume({
      view: 'stroop',
      viewSteppers: {},
      conditions: [],
      randomizedRoutes: { a: ['x'] },
      possibleConditions: null,
      verifiedVisibility: 'yes',
      privateDataId: 'abc',
      useSeed: false,
      somethingElse: 1,
    })
    expect(resume).toEqual({ view: 'stroop', viewSteppers: {}, randomizedRoutes: { a: ['x'] }, privateDataId: 'abc', useSeed: false })
    expect(notes).toHaveLength(3)
  })
})

describe('chooseCopy', () => {
  const choose = (local, server) => chooseCopy({ participantId: PID, local, server })

  it('uses the local copy when its rev is higher, and says to send it', () => {
    const choice = choose(localV1({ rev: 7, savedRev: 4 }), serverCopy({ rev: 4 }))
    expect(choice).toMatchObject({ source: 'local', rev: 7, savedRev: 4, send: true })
    expect(choice.data.from).toBe('local')
    expect(choice.resume.view).toBe('stroop')
  })

  it('uses the server copy when its rev is higher, the position with it', () => {
    const choice = choose(localV1({ rev: 3, savedRev: 3 }), serverCopy({ rev: 8 }))
    expect(choice).toMatchObject({ source: 'server', rev: 8, savedRev: 8, send: false })
    expect(choice.data.from).toBe('server')
    expect(choice.resume.view).toBe('consent')
  })

  it('uses the local copy when the revs are equal, with nothing to send', () => {
    const choice = choose(localV1({ rev: 4, savedRev: 2 }), serverCopy({ rev: 4 }))
    expect(choice).toMatchObject({ source: 'local', rev: 4, savedRev: 4, send: false })
  })

  it('uses the server copy when there is no local one', () => {
    const choice = choose(readLocalCopy(storageWith(), KEY), serverCopy())
    expect(choice).toMatchObject({ source: 'server', rev: 4, send: false })
    expect(choice.resume.view).toBe('consent')
  })

  it('uses the server copy when the local one does not parse', () => {
    const choice = choose(readLocalCopy(storageWith({ [KEY]: '{oops' }), KEY), serverCopy())
    expect(choice.source).toBe('server')
    expect(choice.notes.join('\n')).toMatch(/does not parse/)
  })

  it('uses the server copy when the local one belongs to another participant', () => {
    const choice = choose(localV1({ participantId: 'someone-else', rev: 99 }), serverCopy())
    expect(choice.source).toBe('server')
    expect(choice.data.from).toBe('server')
    expect(choice.resume.view).toBe('consent')
    expect(choice.notes.join('\n')).toMatch(/another participant/)
  })

  it('never takes the position from another participant, even when the server has none', () => {
    const choice = choose(localV1({ participantId: 'someone-else' }), serverCopy({ resume: null }))
    expect(choice.source).toBe('server')
    expect(choice.resume).toBeNull()
  })

  it('does not use a local copy written before the participant existed', () => {
    const choice = choose(localV1({ participantId: null, data: null, rev: 50 }), serverCopy())
    expect(choice.source).toBe('server')
    expect(choice.resume.view).toBe('consent')
  })

  it('keeps the local position when the newer server copy has no resume', () => {
    for (const resume of [null, undefined, {}, 'text', [1]]) {
      const choice = choose(localV1({ rev: 1, savedRev: 1 }), serverCopy({ rev: 6, resume }))
      expect(choice.source).toBe('server')
      expect(choice.resume.view).toBe('stroop')
    }
  })

  it('keeps the local position when the local record is damaged', () => {
    const choice = choose(localV1({ data: 'broken' }), serverCopy({ resume: null }))
    expect(choice.source).toBe('server')
    expect(choice.resume.view).toBe('stroop')
  })

  it('uses the local copy when the server could not be reached', () => {
    const choice = choose(localV1({ rev: 7, savedRev: 4 }), { ok: false })
    expect(choice).toMatchObject({ source: 'local', rev: 7, savedRev: 4, send: true })
  })

  it('loads nothing when the server could not be reached and there is no local copy', () => {
    for (const local of [readLocalCopy(storageWith(), KEY), localV1({ participantId: 'someone-else' }), localV1({ data: null })]) {
      const choice = choose(local, { ok: false })
      expect(choice.source).toBe('none')
      expect(choice.data).toBeNull()
    }
  })

  it.each([
    ['null', null],
    ['a string', 'text'],
    ['an array', [1, 2]],
    ['a number', 3],
    ['missing', undefined],
  ])('uses the local copy when the server\'s data is %s, with a rev the server will accept', (_name, data) => {
    const choice = choose(localV1({ rev: 2, savedRev: 2 }), serverCopy({ rev: 6, data }))
    expect(choice).toMatchObject({ source: 'local', send: true })
    expect(choice.rev).toBeGreaterThan(6)
  })

  it('starts the record again when neither copy can be used, keeping the position it can read', () => {
    const choice = choose(localV1({ data: 'broken' }), serverCopy({ rev: 6, data: null, resume: null }))
    expect(choice).toMatchObject({ source: 'fresh', data: null, send: true })
    expect(choice.rev).toBeGreaterThan(6)
    expect(choice.resume.view).toBe('stroop')
    expect(choice.notes.join('\n')).toMatch(/neither copy/)

    const none = choose(readLocalCopy(storageWith(), KEY), serverCopy({ data: 'x', resume: 5 }))
    expect(none).toMatchObject({ source: 'fresh', data: null, resume: null })
  })

  it('treats a server rev that is not a count as 0', () => {
    for (const rev of [undefined, null, '4', -1, 1.5, Number.NaN]) {
      const choice = choose(localV1({ rev: 1, savedRev: 0 }), serverCopy({ rev }))
      expect(choice).toMatchObject({ source: 'local', rev: 1, savedRev: 0, send: true })
    }
  })

  describe('a local copy in the old format (a participant saved by the code before this)', () => {
    const backup = (rev, savedRev) => ({ participantId: PID, rev, savedRev, data: { from: 'backup' } })

    it('uses the local record when it has unsaved changes, with a rev above the server\'s', () => {
      // The old backup counted changes and the server counts saves: 3 here
      // is below the server's 40, and the local copy must still win
      const choice = choose(oldFormat({ backup: backup(3, 2) }), serverCopy({ rev: 40, resume: null }))
      expect(choice).toMatchObject({ source: 'local', send: true, savedRev: 40 })
      expect(choice.rev).toBeGreaterThan(40)
      expect(choice.data.from).toBe('backup')
      expect(choice.resume.viewSteppers.stroop.data.stepperState.currentIndex).toBe(2)
    })

    it('uses the server record when the backup has nothing unsaved, with the local position', () => {
      const choice = choose(oldFormat({ backup: backup(90, 90) }), serverCopy({ rev: 4, resume: null }))
      expect(choice).toMatchObject({ source: 'server', rev: 4, send: false })
      expect(choice.data.from).toBe('server')
      expect(choice.resume.viewSteppers.stroop.data.stepperState.currentIndex).toBe(2)
    })

    it('uses the server record and the local position when there is no backup', () => {
      const choice = choose(oldFormat(), serverCopy({ rev: 0, resume: null }))
      expect(choice).toMatchObject({ source: 'server', rev: 0 })
      expect(choice.resume.conditions).toEqual({ a: 'x' })
    })

    it('does not use another participant\'s backup', () => {
      const choice = choose(oldFormat({ backup: { ...backup(9, 1), participantId: 'someone-else' } }), serverCopy())
      expect(choice.source).toBe('server')
      expect(choice.data.from).toBe('server')
    })
  })

  it('whatever the two copies hold, choosing does not throw and the result can be used', () => {
    const anyJSONText = fc.oneof(fc.string(), fc.json())
    const stored = fc.oneof(
      anyJSONText,
      fc.record({
        v: fc.oneof(fc.constant(1), fc.anything()),
        participantId: fc.oneof(fc.constant(PID), fc.constant('other'), fc.anything()),
        rev: fc.oneof(fc.nat(50), fc.anything()),
        savedRev: fc.oneof(fc.nat(50), fc.anything()),
        data: fc.oneof(fc.dictionary(fc.string(), fc.jsonValue()), fc.jsonValue()),
        resume: fc.oneof(fc.dictionary(fc.string(), fc.jsonValue()), fc.jsonValue()),
      }, { requiredKeys: [] }).map(value => JSON.stringify(value) ?? 'null'),
    )
    const server = fc.oneof(
      fc.constant({ ok: false }),
      fc.record({
        ok: fc.constant(true),
        rev: fc.oneof(fc.nat(50), fc.anything()),
        data: fc.oneof(fc.dictionary(fc.string(), fc.jsonValue()), fc.anything()),
        resume: fc.anything(),
      }),
    )
    fc.assert(fc.property(stored, fc.option(stored, { nil: undefined }), server, (main, backup, serverAnswer) => {
      const entries = { [KEY]: main }
      if (backup !== undefined) entries[legacyDataKey(KEY)] = backup
      const local = readLocalCopy(storageWith(entries), KEY)
      const choice = chooseCopy({ participantId: PID, local, server: serverAnswer })

      expect(['local', 'server', 'fresh', 'none']).toContain(choice.source)
      expect(Number.isSafeInteger(choice.rev) && choice.rev >= 0).toBe(true)
      expect(choice.savedRev).toBeLessThanOrEqual(choice.rev)
      expect(choice.resume === null || isPlainObject(choice.resume)).toBe(true)
      if (choice.source === 'local' || choice.source === 'server') expect(isPlainObject(choice.data)).toBe(true)
      else expect(choice.data).toBeNull()
      // Only this participant's record is ever used
      if (choice.source === 'local') expect(local.participantId).toBe(PID)
      if (choice.source === 'none') expect(serverAnswer.ok).toBe(false)
      // What is to be sent has a rev the server will take as newer
      if (choice.send && serverAnswer.ok) {
        const serverRev = Number.isSafeInteger(serverAnswer.rev) && serverAnswer.rev >= 0 ? serverAnswer.rev : 0
        expect(choice.rev).toBeGreaterThan(serverRev)
      }
    }), { numRuns: 500 })
  })
})

describe('repairData', () => {
  const template = () => ({ studyData: [], browserData: [], routeOrder: [], conditions: {}, smileConfig: { mode: 'x' }, trialNum: 0, done: false })

  it('leaves a good record as it is', () => {
    const data = { ...template(), studyData: [{ a: 1 }], pageData_stroop: { visit_0: { timestamps: [1], data: [{ r: 1 }] } }, extra: 'kept' }
    const before = JSON.stringify(data)
    const { data: repaired, notes } = repairData(data, template())
    expect(JSON.stringify(repaired)).toBe(before)
    expect(notes).toEqual([])
  })

  it('replaces lists and objects that have the wrong shape, and adds missing ones', () => {
    const { data, notes } = repairData({ studyData: 'x', browserData: null, conditions: [1], extra: 5 }, template())
    expect(data.studyData).toEqual([])
    expect(data.browserData).toEqual([])
    expect(data.routeOrder).toEqual([])
    expect(data.conditions).toEqual({})
    expect(data.smileConfig).toEqual({ mode: 'x' })
    expect(data.extra).toBe(5)
    expect(data.trialNum).toBeUndefined()
    expect(notes.length).toBe(3)
  })

  it('removes route entries that are not objects', () => {
    const { data, notes } = repairData({ ...template(), routeOrder: [{ route: 'a' }, null, 'x', { route: 'b' }] }, template())
    expect(data.routeOrder).toEqual([{ route: 'a' }, { route: 'b' }])
    expect(notes).toHaveLength(1)
  })

  it('repairs page data so recording can append to it', () => {
    const { data } = repairData({
      ...template(),
      pageData_a: 'text',
      pageData_b: { visit_0: null, visit_1: { timestamps: 'x', data: [1] }, visit_2: { timestamps: [1] } },
    }, template())
    expect(data.pageData_a).toEqual({})
    expect(data.pageData_b.visit_0).toEqual({ timestamps: [], data: [] })
    expect(data.pageData_b.visit_1).toEqual({ timestamps: [], data: [1] })
    expect(data.pageData_b.visit_2).toEqual({ timestamps: [1], data: [] })
  })

  it('refuses what is not an object', () => {
    for (const value of [null, 'x', [1], 3]) expect(repairData(value, template()).data).toBeNull()
  })

  it('whatever the record holds, the result can be appended to', () => {
    fc.assert(fc.property(fc.dictionary(fc.oneof(fc.string(), fc.constantFrom('studyData', 'routeOrder', 'conditions', 'pageData_x')), fc.jsonValue()), (record) => {
      const { data } = repairData(record, template())
      expect(Array.isArray(data.studyData)).toBe(true)
      expect(Array.isArray(data.browserData)).toBe(true)
      expect(data.routeOrder.every(isPlainObject)).toBe(true)
      expect(isPlainObject(data.conditions)).toBe(true)
      for (const key of Object.keys(data).filter(k => k.startsWith('pageData_'))) {
        for (const visit of Object.values(data[key])) {
          expect(Array.isArray(visit.timestamps) && Array.isArray(visit.data)).toBe(true)
        }
      }
    }), { numRuns: 300 })
  })
})

describe('the resume sent to the server', () => {
  const localState = {
    viewSteppers: { consent: stepperState(1), stroop: stepperState(4) },
    conditions: { a: 'x' },
    randomizedRoutes: {},
    possibleConditions: {},
    verifiedVisibility: true,
    privateDataId: 'priv',
    useSeed: true,
    routes: [{ name: 'not part of resume' }],
    totalWrites: 9,
  }

  it('resume is the View and the parts of localState a reload restores', () => {
    const resume = buildResume('stroop', localState)
    expect(Object.keys(resume).sort()).toEqual(['conditions', 'possibleConditions', 'privateDataId', 'randomizedRoutes', 'useSeed', 'verifiedVisibility', 'view', 'viewSteppers'])
    expect(resume.view).toBe('stroop')
    expect(buildResume(undefined, localState).view).toBeNull()
  })

  it('has only the current View\'s stepper', () => {
    const sent = resumeForServer(buildResume('stroop', localState))
    expect(Object.keys(sent.viewSteppers)).toEqual(['stroop'])
    expect(sent.conditions).toEqual({ a: 'x' })
    expect(sent.view).toBe('stroop')
  })

  it('has no stepper when the current View has none', () => {
    expect(resumeForServer(buildResume('thanks', localState)).viewSteppers).toEqual({})
    expect(resumeForServer(buildResume(null, localState)).viewSteppers).toEqual({})
    expect(resumeForServer({ view: 'a', viewSteppers: 'broken' }).viewSteppers).toEqual({})
    expect(resumeForServer(null)).toEqual({})
  })
})

describe('the snapshot\'s text', () => {
  it('is one JSON value holding the record and the position', () => {
    const data = { studyData: [{ a: 1 }] }
    const resume = buildResume('stroop', { viewSteppers: { stroop: stepperState(3) } })
    const parts = serializeParts(data, resume)
    expect(parts).toMatchObject({ ok: true, cleaned: false })
    const stored = JSON.parse(snapshotText({ participantId: PID, rev: 3, savedRev: 2, local: { totalWrites: 1, viewSteppers: 'not local' }, ...parts }))
    expect(stored).toEqual({
      v: SNAPSHOT_VERSION,
      participantId: PID,
      rev: 3,
      savedRev: 2,
      local: { totalWrites: 1 },
      data,
      resume: JSON.parse(JSON.stringify(resume)),
    })
  })

  it('reads back as it was written', () => {
    const parts = serializeParts({ a: 1 }, buildResume('stroop', { viewSteppers: { stroop: stepperState(3) }, conditions: {} }))
    const text = snapshotText({ participantId: PID, rev: 3, savedRev: 2, local: {}, ...parts })
    const copy = readLocalCopy(storageWith({ [KEY]: text }), KEY)
    expect(copy).toMatchObject({ format: 'v1', participantId: PID, rev: 3, savedRev: 2, data: { a: 1 } })
    expect(copy.resume.view).toBe('stroop')
    expect(copy.notes).toEqual([])
  })

  it('holds a null record before the participant has one', () => {
    const parts = serializeParts(null, buildResume('welcome', {}))
    expect(parts.ok).toBe(true)
    expect(JSON.parse(snapshotText({ participantId: null, rev: 1, savedRev: 0, local: {}, ...parts })).data).toBeNull()
  })

  it('odd counters are written as 0, a participant id that is not text as null', () => {
    const parts = serializeParts({}, {})
    const stored = JSON.parse(snapshotText({ participantId: { x: 1 }, rev: Number.NaN, savedRev: -4, local: null, ...parts }))
    expect(stored).toMatchObject({ participantId: null, rev: 0, savedRev: 0, local: {} })
  })

  it('says so when the record is not an object', () => {
    for (const data of ['text', [1], 4]) expect(serializeParts(data, {}).ok).toBe(false)
    expect(serializeParts({}, 'text').ok).toBe(false)
  })

  for (const bad of BAD_VALUES.filter(b => !b.slow)) {
    it(`a bad value in the record or in a stepper still gives valid JSON: ${bad.name}`, () => {
      const data = { studyData: [bad.make()], good: 'kept' }
      const resume = buildResume('stroop', { viewSteppers: { stroop: { data: { stepperState: bad.make() } } } })
      const parts = serializeParts(data, resume)
      expect(parts.ok).toBe(true)

      const stored = JSON.parse(snapshotText({ participantId: PID, rev: 1, savedRev: 0, local: {}, ...parts }))
      expect(stored.data.good).toBe('kept')
      expect(stored.resume.view).toBe('stroop')

      const body = JSON.parse(saveBodyText({ rev: 1, dataText: parts.dataText, resumeText: parts.resumeText }))
      expect(body.rev).toBe(1)
      expect(body.data.good).toBe('kept')
      expect(isPlainObject(body.resume)).toBe(true)
    })
  }

  it('whatever is recorded, the snapshot and the save body are valid JSON', () => {
    fc.assert(fc.property(fc.anything({ withBigInt: true, withDate: true, withMap: true, withSet: true, withTypedArray: true }), (value) => {
      const parts = serializeParts({ value, good: 'kept' }, buildResume('v', { viewSteppers: { v: { data: value } } }))
      expect(parts.ok).toBe(true)
      expect(JSON.parse(snapshotText({ participantId: PID, rev: 1, savedRev: 0, local: {}, ...parts })).data.good).toBe('kept')
      expect(JSON.parse(saveBodyText({ rev: 2, ...parts })).data.good).toBe('kept')
    }), { numRuns: 300 })
  })
})
