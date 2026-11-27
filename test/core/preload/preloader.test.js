/**
 * The preloader with the browser's fetch, Image and URL replaced (#30). What
 * the real browsers do with what it holds is in test/e2e/preload.spec.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effect } from 'vue'
import { createPreloader, kindOf, PRELOAD_DEFAULTS } from '../../../src/runtime/core/preload/preloader.js'

/** Lets every settled promise run its callbacks. */
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}

/**
 * A fetch whose answers the test gives one by one.
 * @returns {object} `{ fetch, calls, answer(url, response), fail(url, error) }`
 */
function fakeFetch() {
  const waiting = new Map() // url -> [{ resolve, reject, signal }]
  const calls = []
  const fetch = vi.fn((url, init = {}) => new Promise((resolve, reject) => {
    calls.push(url)
    if (!waiting.has(url)) waiting.set(url, [])
    const item = { resolve, reject }
    waiting.get(url).push(item)
    init.signal?.addEventListener('abort', () => {
      waiting.set(url, waiting.get(url).filter(other => other !== item))
      reject(new DOMException('aborted', 'AbortError'))
    })
  }))
  const next = url => waiting.get(url).shift()
  return {
    fetch,
    calls,
    answer: (url, response) => next(url).resolve(response),
    fail: (url, error = new TypeError('Failed to fetch')) => next(url).reject(error),
  }
}

/**
 * A response whose body is read in chunks.
 * @param {string[]} chunks - The body, in pieces
 * @param {object} [init] - What the server says
 * @param {number} [init.status] - The status
 * @param {string|null} [init.type] - The content-type header
 * @param {boolean} [init.stream] - false for a body that can't be read in chunks
 * @returns {object} What the preloader reads of a Response
 */
function response(chunks = ['data'], { status = 200, type = 'video/mp4', stream = true } = {}) {
  const parts = chunks.map(chunk => new TextEncoder().encode(chunk))
  let i = 0
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => (name === 'content-type' ? type : null) },
    body: stream ? { getReader: () => ({ read: async () => (i < parts.length ? { done: false, value: parts[i++] } : { done: true }) }) } : null,
    blob: async () => new Blob(parts),
  }
}

/** Images made by the fake createImage, newest last. */
let images
const createImage = () => {
  const image = { src: '', onload: null, onerror: null, decode: vi.fn(async () => {}) }
  images.push(image)
  return image
}
let objectUrls
let net
let waits

/**
 * A preloader on the fakes.
 * @param {object} [options] - Options over the fakes
 * @returns {object} The preloader
 */
function make(options = {}) {
  return createPreloader({
    fetch: net.fetch,
    createImage,
    createObjectURL: (blob) => {
      objectUrls.push(blob)
      return `blob:test/${objectUrls.length}`
    },
    revokeObjectURL: vi.fn(),
    now: () => 0,
    wait: (ms) => {
      waits.push(ms)
      return Promise.resolve()
    },
    ...options,
  })
}

beforeEach(() => {
  images = []
  objectUrls = []
  waits = []
  net = fakeFetch()
})

describe('kindOf', () => {
  it.each(['a.png', 'a.JPG', 'a.jpeg', 'a.gif', 'a.webp', 'a.avif', 'a.svg', '/x/a.png?v=2#top'])('%s is an image', (url) => {
    expect(kindOf(url)).toBe('image')
  })

  it.each(['a.mp4', 'a.webm', 'a.mov', 'a.mp3', 'a.wav', 'a.ogg', 'a.m4a', 'A.MP4?x=1'])('%s is media', (url) => {
    expect(kindOf(url)).toBe('media')
  })

  it.each(['a.json', 'a.csv', 'a', 'a.png/b', 'folder.mp4/readme'])('%s is another file', (url) => {
    expect(kindOf(url)).toBe('file')
  })
})

describe('an image', () => {
  it('is loaded into an Image object at its own URL, decoded and kept', async () => {
    const preloader = make()
    const loading = preloader.load('/a.png')
    expect(preloader.status('/a.png')).toBe('loading')
    expect(images[0].src).toBe('/a.png')
    images[0].onload()
    const entry = await loading
    expect(entry).toMatchObject({ url: '/a.png', kind: 'image', status: 'ready', attempts: 1, error: null })
    expect(images[0].decode).toHaveBeenCalledTimes(1)
    expect(net.fetch).not.toHaveBeenCalled()
  })

  it('keeps its own URL', async () => {
    const preloader = make()
    const loading = preloader.load('/a.png')
    images[0].onload()
    await loading
    expect(preloader.resolve('/a.png')).toBe('/a.png')
  })

  it('is ready even when it cannot be decoded ahead', async () => {
    const preloader = make()
    const loading = preloader.load('/a.svg')
    images[0].decode = vi.fn(async () => {
      throw new Error('EncodingError')
    })
    images[0].onload()
    expect((await loading).status).toBe('ready')
  })

  it('is ready in a browser without decode()', async () => {
    const preloader = make()
    const loading = preloader.load('/a.png')
    delete images[0].decode
    images[0].onload()
    expect((await loading).status).toBe('ready')
  })

  it('is tried again when it fails, then reported', async () => {
    const preloader = make({ retries: 2 })
    const loading = preloader.load('/a.png')
    images[0].onerror()
    await flush()
    images[1].onerror()
    await flush()
    images[2].onerror()
    const entry = await loading
    expect(entry).toMatchObject({ status: 'failed', attempts: 3, error: 'the image could not be loaded' })
    expect(waits).toEqual([500, 1000])
  })

  it('that loads on the second attempt is ready', async () => {
    const preloader = make()
    const loading = preloader.load('/a.png')
    images[0].onerror()
    await flush()
    images[1].onload()
    expect(await loading).toMatchObject({ status: 'ready', attempts: 2, error: null })
  })

  it('that gets no answer in time fails that attempt', async () => {
    vi.useFakeTimers()
    try {
      const preloader = make({ retries: 0, imageTimeout: 1000 })
      const loading = preloader.load('/a.png')
      await vi.advanceTimersByTimeAsync(1000)
      expect(await loading).toMatchObject({ status: 'failed', error: 'no answer in 1 s' })
      expect(images[0].src).toBe('')
      expect(images[0].onload).toBeNull()
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('a video, a sound or another file', () => {
  it('is fetched whole into a Blob with a blob: URL', async () => {
    const preloader = make()
    const loading = preloader.load('/v.mp4')
    net.answer('/v.mp4', response(['abc', 'de']))
    const entry = await loading
    expect(entry).toMatchObject({ kind: 'media', status: 'ready', bytes: 5, attempts: 1 })
    expect(preloader.resolve('/v.mp4')).toBe('blob:test/1')
    expect(objectUrls[0].size).toBe(5)
    expect(objectUrls[0].type).toBe('video/mp4')
    expect(images).toHaveLength(0)
  })

  it('keeps its own URL until it is in memory', () => {
    const preloader = make()
    preloader.load('/v.mp4')
    expect(preloader.resolve('/v.mp4')).toBe('/v.mp4')
    expect(preloader.resolve('/never-asked.mp4')).toBe('/never-asked.mp4')
  })

  it('gets its type from the file name when the server sends none or a generic one', async () => {
    const preloader = make()
    const one = preloader.load('/a.webm')
    net.answer('/a.webm', response(['x'], { type: 'application/octet-stream' }))
    await one
    const two = preloader.load('/b.mp3?v=3')
    net.answer('/b.mp3?v=3', response(['x'], { type: null }))
    await two
    const three = preloader.load('/trials.json')
    net.answer('/trials.json', response(['{}'], { type: 'Application/JSON; charset=utf-8' }))
    await three
    expect(objectUrls.map(blob => blob.type)).toEqual(['video/webm', 'audio/mpeg', 'application/json'])
  })

  it('is read with blob() when the body is not a stream', async () => {
    const preloader = make()
    const loading = preloader.load('/v.mp4')
    net.answer('/v.mp4', response(['abcd'], { stream: false }))
    expect(await loading).toMatchObject({ status: 'ready', bytes: 4 })
  })

  it('counts the bytes as they arrive', async () => {
    const preloader = make()
    const seen = []
    effect(() => seen.push(preloader.entries.get('/v.mp4')?.bytes))
    const loading = preloader.load('/v.mp4')
    net.answer('/v.mp4', response(['abc', 'de', 'f']))
    await loading
    expect(seen).toEqual(expect.arrayContaining([0, 3, 5, 6]))
  })

  it('is not tried again when the server says it is missing', async () => {
    const preloader = make()
    const loading = preloader.load('/gone.mp4')
    net.answer('/gone.mp4', response([], { status: 404 }))
    expect(await loading).toMatchObject({ status: 'failed', attempts: 1, error: 'the server answered 404' })
    expect(net.calls).toEqual(['/gone.mp4'])
    expect(preloader.resolve('/gone.mp4')).toBe('/gone.mp4')
  })

  it('is not accepted when the server answers with a web page (a path with no file, in an app with a catch-all page)', async () => {
    const preloader = make()
    const loading = preloader.load('/typo.mp4')
    net.answer('/typo.mp4', response(['<!DOCTYPE html>'], { type: 'text/html; charset=utf-8' }))
    expect(await loading).toMatchObject({
      status: 'failed',
      attempts: 1,
      error: 'the server answered with a web page, not the file (is the path right?)',
    })
    expect(preloader.resolve('/typo.mp4')).toBe('/typo.mp4')
  })

  it('a web page is accepted when a web page was asked for', async () => {
    const preloader = make()
    const loading = preloader.load('/instructions.html')
    net.answer('/instructions.html', response(['<p>hi</p>'], { type: 'text/html' }))
    expect((await loading).status).toBe('ready')
  })

  it.each([500, 503, 408, 429])('is tried again after a %i', async (status) => {
    const preloader = make()
    const loading = preloader.load('/v.mp4')
    net.answer('/v.mp4', response([], { status }))
    await flush()
    net.answer('/v.mp4', response(['ok']))
    expect(await loading).toMatchObject({ status: 'ready', attempts: 2, error: null })
  })

  it('is tried again when the connection fails, with a longer pause each time', async () => {
    const preloader = make({ retries: 3, retryDelay: 100 })
    const loading = preloader.load('/v.mp4')
    for (let i = 0; i < 4; i += 1) {
      net.fail('/v.mp4')
      await flush()
    }
    expect(await loading).toMatchObject({ status: 'failed', attempts: 4, error: 'the download failed (Failed to fetch)' })
    expect(waits).toEqual([100, 200, 400])
  })

  it('a failure without a message still says what failed', async () => {
    const preloader = make({ retries: 0 })
    const loading = preloader.load('/v.mp4')
    net.fail('/v.mp4', {})
    expect((await loading).error).toBe('the download failed')
  })

  it('a download that receives nothing for too long is stopped and tried again', async () => {
    vi.useFakeTimers()
    try {
      const preloader = make({ retries: 1, stallTimeout: 2000 })
      const loading = preloader.load('/v.mp4')
      await vi.advanceTimersByTimeAsync(2000)
      await flush()
      expect(preloader.entries.get('/v.mp4')).toMatchObject({ attempts: 2, error: 'the download stopped for 2 s' })
      net.answer('/v.mp4', response(['ok']))
      expect((await loading).status).toBe('ready')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('a slow download that keeps receiving is not stopped', async () => {
    vi.useFakeTimers()
    try {
      const preloader = make({ retries: 0, stallTimeout: 1000 })
      const loading = preloader.load('/v.mp4')
      let step = 0
      net.answer('/v.mp4', {
        ...response(),
        body: { getReader: () => ({ read: () => new Promise((resolve) => {
          step += 1
          setTimeout(() => resolve(step > 5 ? { done: true } : { done: false, value: new Uint8Array(10) }), 800)
        }) }) },
      })
      await vi.advanceTimersByTimeAsync(800 * 6)
      expect(await loading).toMatchObject({ status: 'ready', bytes: 50 })
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('loading the same file twice', () => {
  it('makes one request while it is loading', async () => {
    const preloader = make()
    const one = preloader.load('/v.mp4')
    const two = preloader.load('/v.mp4')
    expect(two).toBe(one)
    net.answer('/v.mp4', response())
    await one
    expect(net.calls).toHaveLength(1)
  })

  it('makes no request once it is in memory', async () => {
    const preloader = make()
    const one = preloader.load('/v.mp4')
    net.answer('/v.mp4', response())
    await one
    expect((await preloader.load('/v.mp4')).status).toBe('ready')
    expect(net.calls).toHaveLength(1)
  })

  it('tries a failed file again', async () => {
    const preloader = make({ retries: 0 })
    const one = preloader.load('/v.mp4')
    net.fail('/v.mp4')
    expect((await one).status).toBe('failed')
    const two = preloader.load('/v.mp4')
    net.answer('/v.mp4', response())
    expect(await two).toMatchObject({ status: 'ready', attempts: 1, error: null })
  })
})

describe('the queue', () => {
  it('loads at most `concurrency` files at once, in the order asked', async () => {
    const preloader = make({ concurrency: 2 })
    const all = preloader.loadAll(['/1.mp4', '/2.mp4', '/3.mp4', '/4.mp4'])
    expect(net.calls).toEqual(['/1.mp4', '/2.mp4'])
    expect(preloader.status('/3.mp4')).toBe('queued')
    net.answer('/2.mp4', response())
    await flush()
    expect(net.calls).toEqual(['/1.mp4', '/2.mp4', '/3.mp4'])
    net.answer('/1.mp4', response())
    await flush()
    net.answer('/3.mp4', response())
    net.answer('/4.mp4', response())
    expect((await all).ok).toBe(true)
  })

  it('a failed file frees its place', async () => {
    const preloader = make({ concurrency: 1, retries: 0 })
    preloader.loadAll(['/1.mp4', '/2.mp4'])
    net.fail('/1.mp4')
    await flush()
    expect(net.calls).toEqual(['/1.mp4', '/2.mp4'])
  })

  it('urgent files go before the ones that are waiting, in their own order', async () => {
    const preloader = make({ concurrency: 1 })
    preloader.loadAll(['/bg1.mp4', '/bg2.mp4', '/bg3.mp4'])
    preloader.loadAll(['/now1.mp4', '/now2.mp4'], { urgent: true })
    for (const url of ['/bg1.mp4', '/now1.mp4', '/now2.mp4', '/bg2.mp4', '/bg3.mp4']) {
      expect(net.calls.at(-1)).toBe(url)
      net.answer(url, response())
      await flush()
    }
  })

  it('an urgent file that was already waiting moves to the front', async () => {
    const preloader = make({ concurrency: 1 })
    preloader.loadAll(['/1.mp4', '/2.mp4', '/3.mp4', '/4.mp4'])
    preloader.loadAll(['/4.mp4', '/new.mp4', '/1.mp4'], { urgent: true })
    for (const url of ['/1.mp4', '/4.mp4', '/new.mp4', '/2.mp4', '/3.mp4']) {
      expect(net.calls.at(-1)).toBe(url)
      net.answer(url, response())
      await flush()
    }
    expect(net.calls).toHaveLength(5)
  })

  it('load() takes the urgent option too', async () => {
    const preloader = make({ concurrency: 1 })
    preloader.loadAll(['/1.mp4', '/2.mp4'])
    preloader.load('/now.mp4', { urgent: true })
    net.answer('/1.mp4', response())
    await flush()
    expect(net.calls.at(-1)).toBe('/now.mp4')
  })
})

describe('loadAll', () => {
  it('reports what is in memory and what failed, and never rejects', async () => {
    let clock = 0
    const preloader = make({ retries: 0, now: () => clock })
    const all = preloader.loadAll(['/a.png', '/v.mp4', '/gone.mp4', '/v.mp4'])
    images[0].onload()
    net.answer('/v.mp4', response(['12345']))
    net.answer('/gone.mp4', response([], { status: 404 }))
    clock = 1234.4
    expect(await all).toEqual({
      ok: false,
      total: 3,
      ready: 2,
      failed: [{ url: '/gone.mp4', error: 'the server answered 404' }],
      bytes: 5,
      ms: 1234,
    })
  })

  it('an empty list is done at once', async () => {
    expect(await make().loadAll([])).toEqual({ ok: true, total: 0, ready: 0, failed: [], bytes: 0, ms: 0 })
  })

  it('records how long each file took', async () => {
    let clock = 100
    const preloader = make({ now: () => clock })
    const loading = preloader.load('/v.mp4')
    clock = 350
    net.answer('/v.mp4', response())
    expect((await loading).ms).toBe(250)
  })
})

describe('progress and report', () => {
  it('count a set of files without loading anything', async () => {
    const preloader = make({ retries: 0 })
    const urls = ['/a.png', '/v.mp4', '/gone.mp4', '/not-asked.mp4']
    expect(preloader.progress(urls)).toEqual({ total: 4, ready: 0, failed: 0, fraction: 0 })
    const all = preloader.loadAll(urls.slice(0, 3))
    images[0].onload()
    net.answer('/v.mp4', response())
    net.fail('/gone.mp4')
    await all
    expect(preloader.progress(urls)).toEqual({ total: 4, ready: 2, failed: 1, fraction: 0.5 })
    expect(preloader.report(urls)).toMatchObject({ ok: false, total: 4, ready: 2, failed: [{ url: '/gone.mp4' }], ms: 0 })
    expect(preloader.status('/not-asked.mp4')).toBe('none')
    expect(net.calls).toEqual(['/v.mp4', '/gone.mp4'])
  })

  it('an empty set is complete', () => {
    expect(make().progress([])).toEqual({ total: 0, ready: 0, failed: 0, fraction: 1 })
    expect(make().report([]).ok).toBe(true)
  })

  it('progress is reactive', async () => {
    const preloader = make()
    const seen = []
    effect(() => seen.push(preloader.progress(['/a.png', '/b.png']).ready))
    const all = preloader.loadAll(['/a.png', '/b.png'])
    images[0].onload()
    await flush()
    images[1].onload()
    await all
    expect(seen.at(0)).toBe(0)
    expect(seen).toContain(1)
    expect(seen.at(-1)).toBe(2)
  })
})

describe('release', () => {
  it('lets go of the files given and revokes their blob: URLs', async () => {
    const revokeObjectURL = vi.fn()
    const preloader = make({ revokeObjectURL })
    const all = preloader.loadAll(['/a.png', '/v.mp4', '/w.mp4'])
    images[0].onload()
    net.answer('/v.mp4', response())
    net.answer('/w.mp4', response())
    await all
    preloader.release(['/a.png', '/v.mp4', '/never.mp4'])
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/1')
    expect(preloader.status('/v.mp4')).toBe('none')
    expect(preloader.status('/a.png')).toBe('none')
    expect(preloader.resolve('/v.mp4')).toBe('/v.mp4')
    expect(preloader.status('/w.mp4')).toBe('ready')
  })

  it('with no list lets go of everything that has finished, and leaves what is loading', async () => {
    const preloader = make({ retries: 0 })
    const done = preloader.loadAll(['/v.mp4', '/gone.mp4'])
    net.answer('/v.mp4', response())
    net.fail('/gone.mp4')
    await done
    preloader.load('/slow.mp4')
    preloader.release()
    expect([...preloader.entries.keys()]).toEqual(['/slow.mp4'])
  })

  it('a released file is fetched again by the next load', async () => {
    const preloader = make()
    const one = preloader.load('/v.mp4')
    net.answer('/v.mp4', response())
    await one
    preloader.release(['/v.mp4'])
    const two = preloader.load('/v.mp4')
    net.answer('/v.mp4', response())
    await two
    expect(net.calls).toHaveLength(2)
    expect(preloader.resolve('/v.mp4')).toBe('blob:test/2')
  })
})

describe('without options', () => {
  it('uses the browser\'s own fetch, Image, URL and clock', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(['x']))
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:real/1')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    try {
      const preloader = createPreloader()
      expect((await preloader.load('/v.mp4')).status).toBe('ready')
      expect(fetchSpy).toHaveBeenCalledWith('/v.mp4', expect.objectContaining({ signal: expect.anything() }))
      expect(preloader.resolve('/v.mp4')).toBe('blob:real/1')
      preloader.release()
      expect(revokeSpy).toHaveBeenCalledWith('blob:real/1')
    }
    finally {
      fetchSpy.mockRestore()
      createSpy.mockRestore()
      revokeSpy.mockRestore()
    }
  })

  it('pauses with a real timer before a retry, and makes a real Image', async () => {
    vi.useFakeTimers()
    const made = []
    const RealImage = globalThis.Image
    globalThis.Image = class {
      constructor() {
        made.push(this)
      }
    }
    try {
      const preloader = createPreloader({ retries: 1 })
      const loading = preloader.load('/a.png')
      made[0].onerror()
      await vi.advanceTimersByTimeAsync(PRELOAD_DEFAULTS.retryDelay)
      made[1].onload()
      expect((await loading).status).toBe('ready')
    }
    finally {
      globalThis.Image = RealImage
      vi.useRealTimers()
    }
  })
})
