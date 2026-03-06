/* eslint-disable no-undef */
import { createTestingPinia } from '@pinia/testing'
import useSmileStore from '@/core/stores/smilestore' // get access to the global store
import { processQuery } from '@/core/utils/utils'
import { setActivePinia } from 'pinia'

describe('processQuery tests', () => {
  beforeEach(() => {
    // Create and set the active pinia instance
    const pinia = createTestingPinia({ stubActions: false })
    setActivePinia(pinia)
  })

  it('detects when referred from prolific', () => {
    const smilestore = useSmileStore()
    const query = {
      PROLIFIC_PID: '123',
      STUDY_ID: '456',
      SESSION_ID: '789',
    }
    const finalform = {
      prolific_id: query.PROLIFIC_PID,
      study_id: query.STUDY_ID,
      session_id: query.SESSION_ID,
    }
    const service = 'prolific'
    processQuery(query, service)
    expect(smilestore.data.recruitmentService).toBe(service)
    expect(smilestore.recruitmentService).toBe(service)
    expect(smilestore.private.recruitmentInfo).toStrictEqual(finalform) // this is "deep" equality
  })

  it('detects when referred from cloudresearch', () => {
    const smilestore = useSmileStore()
    const query = {
      assignmentId: '123',
      hitId: '456',
      workerId: '789',
    }
    const finalform = {
      assignment_id: query.assignmentId,
      hit_id: query.hitId,
      worker_id: query.workerId,
    }
    const service = 'cloudresearch'
    processQuery(query, service)
    expect(smilestore.data.recruitmentService).toBe(service)
    expect(smilestore.recruitmentService).toBe(service)
    expect(smilestore.private.recruitmentInfo).toStrictEqual(finalform)
  })

  it('detects when referred from mechanical turk', () => {
    const smilestore = useSmileStore()
    const query = {
      assignmentId: '123',
      hitId: '456',
      workerId: '789',
    }
    const finalform = {
      assignment_id: query.assignmentId,
      hit_id: query.hitId,
      worker_id: query.workerId,
    }
    const service = 'mturk'
    processQuery(query, service)
    expect(smilestore.data.recruitmentService).toBe(service)
    expect(smilestore.recruitmentService).toBe(service)
    expect(smilestore.private.recruitmentInfo).toStrictEqual(finalform)
  })

  it('detects when referred from citizen science portal', () => {
    const smilestore = useSmileStore()
    const query = {
      CITIZEN_ID: '123',
      CITIZEN_STUDY_ID: '456',
      CITIZEN_SESSION_ID: '789',
    }
    const finalform = {
      session_id: query.CITIZEN_SESSION_ID,
      study_id: query.CITIZEN_STUDY_ID,
      citizen_id: query.CITIZEN_ID,
    }
    const service = 'citizensci'
    processQuery(query, service)
    expect(smilestore.data.recruitmentService).toBe(service)
    expect(smilestore.recruitmentService).toBe(service)
    expect(smilestore.private.recruitmentInfo).toStrictEqual(finalform)
  })
})
