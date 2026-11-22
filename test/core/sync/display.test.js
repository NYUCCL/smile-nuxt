import { describe, it, expect } from 'vitest'
import { syncDisplay } from '../../../src/runtime/core/sync/display.js'

const sync = (status, error = null, retryAt = null) => ({ status, error, retryAt })
const state = input => syncDisplay(input).state

describe('syncDisplay: what the indicators show for the state of saving', () => {
  it('no record yet, whatever is waiting', () => {
    expect(state({ loaded: false, sync: sync('saved'), unsaved: true })).toBe('none')
    expect(state({ loaded: false, sync: sync('pending') })).toBe('none')
  })

  it('saved, pending and saving', () => {
    expect(syncDisplay({ loaded: true, sync: sync('saved') })).toMatchObject({ state: 'saved', label: 'Saved', active: false, problem: false })
    expect(syncDisplay({ loaded: true, sync: sync('pending') })).toMatchObject({ state: 'pending', active: true, problem: false })
    expect(syncDisplay({ loaded: true, sync: sync('saving') })).toMatchObject({ state: 'saving', active: true, problem: false })
  })

  it('a change the loop has not picked up yet counts as pending', () => {
    expect(state({ loaded: true, sync: sync('saved'), unsaved: true })).toBe('pending')
  })

  it('offline and a failed save that will be tried again, with the message', () => {
    const error = { kind: 'retrying', status: 0, message: 'Failed to fetch' }
    expect(syncDisplay({ loaded: true, sync: sync('offline', error) })).toMatchObject({ state: 'offline', detail: 'Failed to fetch', problem: true })
    expect(syncDisplay({ loaded: true, sync: sync('error', error, 123) })).toMatchObject({ state: 'retrying', detail: 'Failed to fetch', problem: true })
    // Before the row exists too: the create is what failed
    expect(state({ loaded: false, sync: sync('offline', error) })).toBe('offline')
  })

  it('saving that has stopped names why', () => {
    for (const kind of ['oversize', 'limit', 'refused', 'conflict']) {
      const d = syncDisplay({ loaded: true, sync: sync('error', { kind, status: 400, message: 'm' }) })
      expect(d).toMatchObject({ state: 'stopped', detail: 'm', problem: true, active: false })
      expect(d.label).toMatch(/^Not saved: /)
    }
    expect(syncDisplay({ loaded: true, sync: sync('error', { kind: 'new-kind', message: 'm' }) }).label).toBe('Not saved')
  })

  it('another tab has the participant: paused, whatever the loop says', () => {
    expect(syncDisplay({ loaded: true, sync: sync('saving'), otherTab: 'newer-tab' })).toMatchObject({ state: 'paused', problem: true })
    expect(state({ loaded: true, sync: sync('error', { kind: 'conflict', message: 'm' }), otherTab: 'conflict' })).toBe('paused')
  })

  it('never throws on a missing or odd sync state', () => {
    expect(state({ loaded: true, sync: undefined })).toBe('saved')
    expect(state({ loaded: true, sync: null })).toBe('saved')
    expect(state({ loaded: true, sync: { status: 'error' } })).toBe('retrying')
    expect(state({ loaded: true, sync: { status: 'something-new' } })).toBe('saved')
  })
})
