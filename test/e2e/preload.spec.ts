import { test, expect } from '@playwright/test'
import type { Page, Request } from '@playwright/test'

/**
 * Preloading (#30), in every browser of playwright.config.ts.
 *
 * The playground has a view, /preload_demo, that lists its files under
 * `preload` in design.js and then uses them every way a view can: <img> with
 * a written path, <img> from getPublicUrl(), a CSS background, <video>,
 * <audio> and a fetched JSON file from api.asset().
 *
 * What "preloaded" has to mean for an experiment: when the view shows, its
 * files are in memory, and showing or playing them makes no network request.
 * So the tests cut the network (setOffline) after preloading and check the
 * view still shows everything and plays the video to its end.
 */

const FILES = ['a.png', 'b.png', 'bg.png', 'set/c.png', 'clip.webm', 'clip.mp4', 'tone.wav', 'trials.json']
const isFixture = (url: string) => new URL(url).pathname.startsWith('/preload-test/')
const fileOf = (url: string) => new URL(url).pathname.replace('/preload-test/', '')

/** Records every request for a fixture file from now on. */
function watchRequests(page: Page) {
  const requests: Request[] = []
  page.on('request', (request) => {
    if (isFixture(request.url())) requests.push(request)
  })
  return requests
}

/**
 * Waits until every fixture file has been requested and has finished, and the
 * page has stopped asking for anything else. The second part is for the dev
 * server, which sends the app's own code file by file: cutting the network
 * while a view's component is still on its way would break the app, whatever
 * was preloaded.
 */
async function waitForAllLoaded(page: Page, requests: Request[]) {
  await expect.poll(async () => {
    const done = await Promise.all(requests.map(async request => (await request.response())?.finished().then(() => true).catch(() => false)))
    const finished = new Set(requests.filter((_, i) => done[i]).map(request => fileOf(request.url())))
    return FILES.filter(file => !finished.has(file))
  }, { timeout: 30_000 }).toEqual([])
  await page.waitForLoadState('networkidle')
}

/** Goes to a path of the app without loading the page again. */
async function pushRoute(page: Page, path: string) {
  await page.evaluate((to) => {
    const root = document.querySelector('#__nuxt') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (_to: string) => Promise<unknown> } } } } }
    return root.__vue_app__.config.globalProperties.$router.push(to)
  }, path)
}

/** What the demo view is showing, read from the page. */
async function readView(page: Page) {
  return page.getByTestId('preload-demo').evaluate(async (root) => {
    const images = [...root.querySelectorAll('img')].map(img => ({
      id: img.dataset.testid,
      complete: img.complete,
      width: img.naturalWidth,
    }))
    const video = root.querySelector('video')!
    const audio = root.querySelector('audio')!
    const ready = (media: HTMLMediaElement) => new Promise<void>((resolve, reject) => {
      if (media.readyState >= 3) return resolve()
      media.addEventListener('canplay', () => resolve(), { once: true })
      media.addEventListener('error', () => reject(new Error(`media error ${media.error?.code}`)), { once: true })
      setTimeout(() => reject(new Error('media not ready in 5 s')), 5000)
    })
    await ready(video)
    await ready(audio)
    return {
      images,
      videoSrc: video.src,
      videoDuration: video.duration,
      audioSrc: audio.src,
      audioDuration: audio.duration,
      background: getComputedStyle(root.querySelector('[data-testid="css-background"]')!).backgroundImage,
      trials: root.querySelector('[data-testid="trials"]')!.textContent!.trim(),
    }
  })
}

/** Plays the video from the start to its end, then seeks back into it. */
async function playVideoThrough(page: Page) {
  return page.getByTestId('video').evaluate(async (video: HTMLVideoElement) => {
    video.muted = true
    const ended = new Promise<void>((resolve, reject) => {
      video.addEventListener('ended', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(new Error(`video error ${video.error?.code}`)), { once: true })
      video.addEventListener('stalled', () => reject(new Error('video stalled')), { once: true })
      setTimeout(() => reject(new Error(`video did not end in 15 s (at ${video.currentTime})`)), 15000)
    })
    await video.play()
    await ended
    const seeked = new Promise<void>(resolve => video.addEventListener('seeked', () => resolve(), { once: true }))
    video.currentTime = 1.5
    await seeked
    return { endedAt: video.currentTime > 1.4, readyState: video.readyState }
  })
}

test.describe('Preloading (#30)', () => {
  test('a view\'s files are loaded before it shows, each requested once', async ({ page }) => {
    const requests = watchRequests(page)
    await page.goto('/preload_demo')
    await expect(page.getByTestId('preload-demo')).toBeVisible()

    // The moment the view is there, its images are already drawn
    const images = await page.getByTestId('preload-demo').evaluate(root =>
      [...root.querySelectorAll('img')].map(img => img.complete && img.naturalWidth > 0))
    expect(images).toEqual([true, true, true])

    const view = await readView(page)
    expect(view.videoSrc).toMatch(/^blob:/)
    expect(view.audioSrc).toMatch(/^blob:/)
    expect(view.videoDuration).toBeGreaterThan(2.5)
    expect(view.audioDuration).toBeGreaterThan(0.9)
    expect(view.trials).toBe('2 trials')

    await playVideoThrough(page)
    await page.waitForTimeout(500)

    // One request per file, whole (no byte ranges), and none after the view showed
    const counts: Record<string, number> = {}
    for (const request of requests) counts[fileOf(request.url())] = (counts[fileOf(request.url())] ?? 0) + 1
    // (the playground's other test view asks for a file that does not exist)
    delete counts['not-there.mp4']
    expect(counts).toEqual(Object.fromEntries(FILES.map(file => [file, 1])))
    expect(requests.filter(request => request.headers().range)).toEqual([])
  })

  test('with the network cut after preloading, the view still shows and plays everything', async ({ page, context }) => {
    const requests = watchRequests(page)
    // Another view: the demo view's files load in the background
    await page.goto('/welcome')
    await waitForAllLoaded(page, requests)
    const before = requests.length

    await context.setOffline(true)
    await pushRoute(page, '/preload_demo')
    await expect(page.getByTestId('preload-demo')).toBeVisible()
    // It never needed the loading screen
    await expect(page.getByTestId('preloading')).toHaveCount(0)

    const view = await readView(page)
    expect(view.images.map(image => image.complete && image.width)).toEqual([96, 96, 96])
    expect(view.videoSrc).toMatch(/^blob:/)
    expect(view.trials).toBe('2 trials')
    const played = await playVideoThrough(page)
    expect(played.endedAt).toBe(true)

    // New elements with the same URLs are drawn from memory too
    const again = await page.evaluate(() => Promise.all(['/preload-test/a.png', '/preload-test/b.png', '/preload-test/bg.png'].map(src => new Promise((resolve) => {
      const img = document.createElement('img')
      img.onload = () => resolve(img.naturalWidth)
      img.onerror = () => resolve('error')
      img.src = src
      document.body.appendChild(img)
    }))))
    expect(again).toEqual([96, 96, 96])

    // Nothing was asked of the network for any of it
    expect(requests.length).toBe(before)

    // Control: the network really is cut. A file that was not preloaded fails.
    const notPreloaded = await page.evaluate(() => new Promise((resolve) => {
      const img = document.createElement('img')
      img.onload = () => resolve('loaded')
      img.onerror = () => resolve('error')
      img.src = '/universitylogo.png?not-preloaded'
    }))
    expect(notPreloaded).toBe('error')
    await context.setOffline(false)
  })

  test('the view waits while a file is still loading, then shows', async ({ page }) => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/preload-test/tone.wav', async (route) => {
      await held
      await route.continue()
    })
    await page.goto('/preload_demo')

    const loading = page.getByTestId('preloading')
    await expect(loading).toBeVisible()
    await expect(loading).toHaveAttribute('data-status', 'loading')
    await expect(page.getByTestId('preloading-count')).toHaveText(`${FILES.length - 1} of ${FILES.length} files`)
    await expect(page.getByTestId('preload-demo')).toHaveCount(0)

    release()
    await expect(page.getByTestId('preload-demo')).toBeVisible()
    await expect(loading).toHaveCount(0)
    expect((await readView(page)).audioSrc).toMatch(/^blob:/)
  })

  test('a file that fails twice is tried again and the view shows', async ({ page }) => {
    let attempts = 0
    await page.route('**/preload-test/trials.json', async (route) => {
      attempts += 1
      if (attempts <= 2) await route.fulfill({ status: 503, body: 'busy' })
      else await route.continue()
    })
    await page.goto('/preload_demo')
    await expect(page.getByTestId('preload-demo')).toBeVisible({ timeout: 15_000 })
    expect(attempts).toBe(3)
    expect((await readView(page)).trials).toBe('2 trials')
  })

  test('a file that cannot be loaded keeps the view closed until it can', async ({ page }) => {
    await page.goto('/preload_missing')
    const loading = page.getByTestId('preloading')
    await expect(loading).toHaveAttribute('data-status', 'failed', { timeout: 15_000 })
    await expect(loading).toContainText('Some files could not be loaded')
    // Which file and why is shown on the dev server only
    if (!process.env.SMILE_E2E_BUILD) {
      await expect(page.getByTestId('preloading-failed')).toContainText('not-there.mp4: the server answered with a web page, not the file')
    }
    else {
      await expect(page.getByTestId('preloading-failed')).toHaveCount(0)
    }
    await expect(page.getByTestId('preload-demo')).toHaveCount(0)

    // The file appears on the server; the next try opens the view
    await page.route('**/preload-test/not-there.mp4', route => route.fulfill({ status: 200, contentType: 'video/mp4', body: 'now there' }))
    await page.getByTestId('preloading-retry').click()
    await expect(page.getByTestId('preload-demo')).toBeVisible()
  })

  test('the dev tools\' view of the experiment waits and shows the same way', async ({ page, context }) => {
    const requests = watchRequests(page)
    await page.goto('/dev/welcome')
    await waitForAllLoaded(page, requests)
    await context.setOffline(true)
    await pushRoute(page, '/dev/preload_demo')
    await expect(page.getByTestId('preload-demo')).toBeVisible()
    const view = await readView(page)
    expect(view.images.map(image => image.width)).toEqual([96, 96, 96])
    expect(view.videoSrc).toMatch(/^blob:/)
    await context.setOffline(false)
  })
})
