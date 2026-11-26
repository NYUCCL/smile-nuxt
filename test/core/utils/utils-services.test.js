/**
 * @fileoverview utils/utils.js: reading the URL's query, the recruitment
 * services processQuery recognises (and what it does when ids are missing),
 * and the PANDA setup in initService.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import useSmileStore from '../../../src/runtime/stores/smilestore'
import useLog from '../../../src/runtime/stores/log'
import processQueryDefault, { processQuery, getQueryParams, initService } from '../../../src/runtime/utils/utils.js'

describe('utils', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    store = useSmileStore()
    useLog().log.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('getQueryParams', () => {
    const withSearch = (search) => {
      vi.stubGlobal('location', { ...window.location, search })
    }

    it('returns the query of the current URL as an object', () => {
      withSearch('?PROLIFIC_PID=abc&STUDY_ID=s1&x=1')
      expect(getQueryParams()).toEqual({ PROLIFIC_PID: 'abc', STUDY_ID: 's1', x: '1' })
    })

    it('decodes values, and keeps the last of a repeated key', () => {
      withSearch('?name=a%20b&plus=c+d&k=1&k=2&empty=')
      expect(getQueryParams()).toEqual({ name: 'a b', plus: 'c d', k: '2', empty: '' })
    })

    it('returns an empty object when there is no query', () => {
      withSearch('')
      expect(getQueryParams()).toEqual({})
    })

    it('returns an empty object where there is no window', () => {
      vi.stubGlobal('window', undefined)
      expect(getQueryParams()).toEqual({})
    })
  })

  describe('processQuery', () => {
    it('is also the default export', () => {
      expect(processQueryDefault).toBe(processQuery)
    })

    it('does nothing without a query', () => {
      expect(() => processQuery(undefined, 'prolific')).not.toThrow()
      expect(() => processQuery(null, 'prolific')).not.toThrow()
      expect(store.data.recruitmentService).toBe('web')
      expect(store.private.recruitmentInfo).toEqual({})
    })

    // Each service is only set when all of its required ids are in the URL
    const incomplete = [
      ['prolific', { PROLIFIC_PID: '1', STUDY_ID: '2' }],
      ['prolific', { PROLIFIC_PID: '1', SESSION_ID: '3' }],
      ['prolific', { STUDY_ID: '2', SESSION_ID: '3' }],
      ['cloudresearch', { assignmentId: 'a', hitId: 'h' }],
      ['cloudresearch', { assignmentId: 'a', workerId: 'w' }],
      ['cloudresearch', { hitId: 'h', workerId: 'w' }],
      ['citizensci', { CITIZEN_ID: '1', CITIZEN_STUDY_ID: '2' }],
      ['citizensci', { CITIZEN_ID: '1', CITIZEN_SESSION_ID: '3' }],
      ['citizensci', { CITIZEN_STUDY_ID: '2', CITIZEN_SESSION_ID: '3' }],
      ['sona', {}],
      ['sona_paid', {}],
      ['spark', { participant_ID: 'p' }],
      ['panda', {}],
      ['unknown_service', { PROLIFIC_PID: '1', STUDY_ID: '2', SESSION_ID: '3' }],
    ]
    it.each(incomplete)('leaves the service as it was for %s with %j', (service, query) => {
      processQuery(query, service)
      expect(store.data.recruitmentService).toBe('web')
      expect(store.private.recruitmentInfo).toEqual({})
      expect(useLog().log).not.toHaveBeenCalled()
    })

    it('does not take one service\'s ids for another service', () => {
      processQuery({ PROLIFIC_PID: '1', STUDY_ID: '2', SESSION_ID: '3' }, 'cloudresearch')
      processQuery({ assignmentId: 'a', hitId: 'h', workerId: 'w' }, 'prolific')
      processQuery({ survey_code: 'c' }, 'spark')
      expect(store.data.recruitmentService).toBe('web')
    })

    it('SONA (credit): stores the survey code with the study\'s SONA settings', () => {
      vi.stubEnv('VITE_SONA_URL', 'https://school.sona-systems.com')
      vi.stubEnv('VITE_SONA_EXPERIMENT_ID', '123')
      vi.stubEnv('VITE_SONA_CREDIT_TOKEN', 'tok')
      processQuery({ survey_code: '98765' }, 'sona')
      expect(store.data.recruitmentService).toBe('sona')
      expect(store.private.recruitmentInfo).toEqual({
        survey_code: '98765',
        url: 'https://school.sona-systems.com',
        experimentId: '123',
        creditToken: 'tok',
      })
      expect(useLog().log).toHaveBeenCalledWith('SONA (credit) mode')
    })

    it('SONA (paid): uses the paid study\'s settings, not the credit study\'s', () => {
      vi.stubEnv('VITE_SONA_URL', 'https://credit.example')
      vi.stubEnv('VITE_SONA_PAID_URL', 'https://paid.example')
      vi.stubEnv('VITE_SONA_PAID_EXPERIMENT_ID', '456')
      vi.stubEnv('VITE_SONA_PAID_CREDIT_TOKEN', 'paidtok')
      processQuery({ survey_code: '111' }, 'sona_paid')
      expect(store.data.recruitmentService).toBe('sona_paid')
      expect(store.private.recruitmentInfo).toEqual({
        survey_code: '111',
        url: 'https://paid.example',
        experimentId: '456',
        creditToken: 'paidtok',
      })
    })

    it('SPARK: stores the ids, age and gender, and the completion URL', () => {
      processQuery({ subject_ID: 's1', participant_ID: 'p1', age: '9', gender: 'f' }, 'spark')
      expect(store.data.recruitmentService).toBe('spark')
      expect(store.private.recruitmentInfo).toEqual({
        subject_ID: 's1',
        participant_ID: 'p1',
        age: '9',
        gender: 'f',
        completionUrl: 'https://spark.hartleylab.org/completed',
      })
    })

    it('SPARK: needs only the subject id', () => {
      processQuery({ subject_ID: 's1' }, 'spark')
      expect(store.private.recruitmentInfo.subject_ID).toBe('s1')
      expect(store.private.recruitmentInfo.participant_ID).toBeUndefined()
    })

    it('PANDA: stores the id in the private data and in the record', () => {
      processQuery({ ID: 'panda-7' }, 'panda')
      expect(store.data.recruitmentService).toBe('panda')
      expect(store.data.panda_id).toBe('panda-7')
      expect(store.private.recruitmentInfo).toEqual({ panda_id: 'panda-7' })
    })

    it('marks the record as changed when a service is set', () => {
      store.browserEphemeral.unsavedChanges = false
      processQuery({ ID: 'panda-7' }, 'panda')
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
    })
  })

  describe('initService', () => {
    it('returns true and touches nothing for services without setup', () => {
      localStorage.setItem('smilestore-study', 'kept')
      for (const service of ['prolific', 'cloudresearch', 'sona', 'spark', undefined]) {
        expect(initService(service)).toBe(true)
      }
      expect(localStorage.getItem('smilestore-study')).toBe('kept')
    })

    it('PANDA: stops in the hidden iframe (a window 0 wide) and leaves localStorage alone', () => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(0)
      localStorage.setItem('smilestore-study', 'kept')
      expect(initService('panda')).toBe(false)
      expect(localStorage.getItem('smilestore-study')).toBe('kept')
      expect(useLog().log).toHaveBeenCalledWith('PANDA: hidden iframe detected, cancelling navigation')
    })

    it('PANDA: in the visible iframe, removes the study\'s stored state and nothing else', () => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024)
      localStorage.setItem('smilestore-study', 'a')
      localStorage.setItem('smilestore-study_dev', 'b')
      localStorage.setItem('other-app', 'kept')
      localStorage.setItem('my-smilestore', 'kept')
      expect(initService('panda')).toBe(true)
      expect(localStorage.getItem('smilestore-study')).toBeNull()
      expect(localStorage.getItem('smilestore-study_dev')).toBeNull()
      expect(localStorage.getItem('other-app')).toBe('kept')
      expect(localStorage.getItem('my-smilestore')).toBe('kept')
    })
  })
})
