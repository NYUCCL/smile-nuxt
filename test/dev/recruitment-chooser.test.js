/**
 * @fileoverview The dev tools' landing page (/dev/): the study's details,
 * the recruitment service cards, and one service's setup page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import RecruitmentChooserView from '../../src/runtime/components/dev/RecruitmentChooserView.vue'
import { copyText } from '../../src/runtime/utils/clipboard.js'
import { setFlags, resetFlags } from '../setup/flags'
import { createStore, createFakeApi, mountComponent } from '../components/mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useViewAPI', async original => ({ ...(await original()), default: () => fake.api }))
vi.mock('../../src/runtime/utils/clipboard.js', () => ({ copyText: vi.fn(async () => true) }))

const URLS = {
  prolific: '/welcome/prolific/?PROLIFIC_PID=abc',
  cloudresearch: '/welcome/cloudresearch/?workerId=abc',
  citizensci: '/welcome/citizensci/',
  sona: '/welcome/sona/?survey_code=1',
  sona_paid: '/welcome/sona_paid/?survey_code=1',
  spark: '/welcome/spark/',
  panda: '/welcome/panda/?ID=1',
  web: '/welcome',
}

/**
 * Mounts the page.
 * @param {object} [config] - Config values to set on the store
 * @returns {object} The wrapper
 */
function mountChooser(config = {}) {
  const { pinia, store } = createStore((s) => {
    s.config = { ...s.config, projectName: '', projectRef: '', codeName: '', smileVersion: '', deployURL: '', github: {}, ...config }
  })
  fake.api = createFakeApi(store, { urls: URLS, getCoreStaticUrl: vi.fn(name => `/base/_smile/${name}`) })
  return mountComponent(RecruitmentChooserView, { pinia })
}

const DEPLOYED = { deployURL: 'https://study.example/' }
const cards = wrapper => wrapper.findAll('[data-slot="card"]')
const cardFor = (wrapper, name) => cards(wrapper).find(c => c.find('[data-slot="card-title"]').text() === name)
// The row of the details list with a given label: its value cell
const detail = (wrapper, label) => wrapper.findAll('dt').find(dt => dt.text() === label)?.element.nextElementSibling
const modeRows = wrapper => wrapper.findAll('.border-t.text-xs > div')

/**
 * Opens a service's setup page from its card.
 * @param {object} wrapper - The wrapper
 * @param {string} name - The service's name on the card
 */
async function openService(wrapper, name) {
  await cardFor(wrapper, name).find('[data-slot="card-header"] button').trigger('click')
}

describe('RecruitmentChooserView', () => {
  beforeEach(() => {
    vi.mocked(copyText).mockClear()
  })
  afterEach(() => {
    resetFlags()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('the study\'s details', () => {
    it('shows the SMILE logo from the module\'s own files', () => {
      const wrapper = mountChooser()
      expect(wrapper.find('img[alt="SMILE"]').attributes('src')).toBe('/base/_smile/images/smile.svg')
      expect(fake.api.getCoreStaticUrl).toHaveBeenCalledWith('images/smile.svg')
    })

    it('shows the project, code name and version', () => {
      const wrapper = mountChooser({ projectName: 'my-study', codeName: 'brave-otter', smileVersion: '1.2.3' })
      expect(detail(wrapper, 'Project').textContent).toContain('my-study')
      expect(detail(wrapper, 'Code Name').textContent).toContain('brave-otter')
      expect(detail(wrapper, 'Version').textContent).toContain('1.2.3')
    })

    it('falls back to the project ref, and says what is not set', () => {
      let wrapper = mountChooser({ projectRef: 'owner-repo-main' })
      expect(detail(wrapper, 'Project').textContent).toContain('owner-repo-main')
      wrapper = mountChooser()
      for (const label of ['Project', 'Code Name', 'Version']) {
        expect(detail(wrapper, label).textContent).toContain('(not set)')
      }
    })

    it('shows the repo, branch and last commit when the study is in a GitHub repo', () => {
      const wrapper = mountChooser({
        github: { owner: 'nyuccl', repoName: 'study', branch: 'main', lastCommitHash: 'abc1234', lastCommitMsg: 'fix typo', commitURL: 'https://github.com/nyuccl/study/commit/abc1234' },
      })
      const repo = detail(wrapper, 'Repo')
      expect(repo.querySelector('a').getAttribute('href')).toBe('https://github.com/nyuccl/study')
      expect(repo.textContent).toContain('nyuccl/study')
      expect(repo.textContent).toContain('(main)')
      const commit = detail(wrapper, 'Commit')
      expect(commit.querySelector('a').getAttribute('href')).toBe('https://github.com/nyuccl/study/commit/abc1234')
      expect(commit.textContent).toContain('fix typo')
    })

    it('shows ? for an unknown branch and no commit link without a hash', () => {
      const wrapper = mountChooser({ github: { owner: 'nyuccl', repoName: 'study' } })
      expect(detail(wrapper, 'Repo').textContent).toContain('(?)')
      expect(detail(wrapper, 'Commit').querySelector('a')).toBeNull()
    })

    it('has no repo or commit row without a repo', () => {
      const wrapper = mountChooser()
      expect(detail(wrapper, 'Repo')).toBeUndefined()
      expect(detail(wrapper, 'Commit')).toBeUndefined()
    })

    it('has no database row outside the browser', () => {
      expect(detail(mountChooser(), 'Database')).toBeUndefined()
    })

    it('in the browser asks the server for the database and shows its type and address', async () => {
      setFlags({ client: true })
      const fetchMock = vi.fn(async () => ({ json: async () => ({ type: 'sqlite', url: 'file:local.db' }) }))
      vi.stubGlobal('fetch', fetchMock)
      const wrapper = mountChooser()
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledWith('/api/db-info')
      expect(detail(wrapper, 'Database').textContent).toContain('sqlite')
      expect(detail(wrapper, 'Database').textContent).toContain('file:local.db')
    })

    it('has no database row when that request fails', async () => {
      setFlags({ client: true })
      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new Error('offline')
      }))
      const wrapper = mountChooser()
      await flushPromises()
      expect(detail(wrapper, 'Database')).toBeUndefined()
    })

    it('the copy buttons copy the project, code name, version, repo address and commit', async () => {
      const wrapper = mountChooser({
        projectName: 'my-study',
        codeName: 'brave-otter',
        smileVersion: '1.2.3',
        github: { owner: 'nyuccl', repoName: 'study', lastCommitHash: 'abc1234', lastCommitMsg: 'fix typo' },
      })
      for (const label of ['Project', 'Code Name', 'Version', 'Repo', 'Commit']) {
        detail(wrapper, label).querySelector('button').click()
      }
      await flushPromises()
      expect(vi.mocked(copyText).mock.calls.map(c => c[0])).toEqual(['my-study', 'brave-otter', '1.2.3', 'https://github.com/nyuccl/study', 'abc1234'])
    })

    it('a copy button shows a check mark for 2 seconds', async () => {
      vi.useFakeTimers()
      const wrapper = mountChooser({ codeName: 'brave-otter' })
      const button = () => detail(wrapper, 'Code Name').querySelector('button')
      expect(button().querySelector('.lucide-check')).toBeNull()
      button().click()
      await vi.advanceTimersByTimeAsync(0)
      expect(button().querySelector('.lucide-check')).not.toBeNull()
      expect(detail(wrapper, 'Version').querySelector('.lucide-check')).toBeNull()
      await vi.advanceTimersByTimeAsync(2000)
      expect(button().querySelector('.lucide-check')).toBeNull()
    })
  })

  describe('the addresses of the three modes', () => {
    it('on a deployment are built from the deploy address, without its last slash, and can be copied', async () => {
      const wrapper = mountChooser(DEPLOYED)
      expect(modeRows(wrapper).map(r => r.find('code').text())).toEqual([
        'https://study.example/dev/',
        'https://study.example/',
        'https://study.example/presentation/',
      ])
      expect(wrapper.text()).not.toContain('Deploy your study to get shareable URLs.')
      await modeRows(wrapper)[2].find('button').trigger('click')
      expect(copyText).toHaveBeenCalledWith('https://study.example/presentation/')
    })

    it('locally cannot be copied, and the page says to deploy', async () => {
      const wrapper = mountChooser()
      expect(wrapper.text()).toContain('Deploy your study to get shareable URLs.')
      const button = modeRows(wrapper)[0].find('button')
      expect(button.attributes('disabled')).toBeDefined()
      button.element.disabled = false
      await button.trigger('click')
      expect(copyText).not.toHaveBeenCalled()
    })

    it('locally in the browser use the address of the page', () => {
      setFlags({ client: true })
      vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => null })))
      const wrapper = mountChooser()
      expect(modeRows(wrapper)[0].find('code').text()).toBe(`${window.location.origin}/dev/`)
    })

    it('a QR code for the study is shown only on a deployment', () => {
      expect(mountChooser().find('img[alt="QR Code"]').exists()).toBe(false)
      const wrapper = mountChooser(DEPLOYED)
      const address = `/api/qr?url=${encodeURIComponent('https://study.example')}`
      expect(wrapper.find('img[alt="QR Code"]').attributes('src')).toBe(address)
      expect(wrapper.find('a[download="qr.svg"]').attributes('href')).toBe(address)
    })
  })

  describe('the service cards', () => {
    it('there is one card for each of the eight services', () => {
      const names = cards(mountChooser()).map(c => c.find('[data-slot="card-title"]').text())
      expect(names).toEqual(['Prolific', 'CloudResearch', 'Citizen Science', 'SONA', 'SONA Paid', 'SPARK', 'PANDA', 'Anonymous Web User'])
    })

    it('each card\'s button starts the study as that service, inside dev mode', () => {
      const wrapper = mountChooser()
      const link = cardFor(wrapper, 'Prolific').find('[data-slot="card-content"] a')
      expect(link.text()).toBe('Prolific')
      expect(link.attributes('href')).toBe('/dev/welcome/prolific/?PROLIFIC_PID=abc')
      expect(link.classes()).toContain('is-blue')
      expect(cardFor(wrapper, 'Anonymous Web User').find('[data-slot="card-content"] a').attributes('href')).toBe('/dev/welcome')
    })
  })

  describe('a service\'s setup page', () => {
    it('opens from the card\'s info button with the name, description and steps', async () => {
      const wrapper = mountChooser()
      await openService(wrapper, 'SONA')
      expect(wrapper.find('h1').text()).toBe('SONA')
      expect(wrapper.text()).toContain('"for credit" pool of students')
      expect(wrapper.findAll('ol li')).toHaveLength(6)
      // The steps are HTML
      expect(wrapper.find('ol li code').text()).toBe('%SURVEY_CODE%')
      expect(cards(wrapper)).toHaveLength(0)
    })

    it('has a button that starts the study as that service', async () => {
      const wrapper = mountChooser()
      await openService(wrapper, 'PANDA')
      const link = wrapper.findAll('a').find(a => a.text().includes('Test as PANDA'))
      expect(link.attributes('href')).toBe('/dev/welcome/panda/?ID=1')
      expect(link.classes()).toContain('is-coral')
    })

    it('back returns to the cards', async () => {
      const wrapper = mountChooser()
      await openService(wrapper, 'SPARK')
      await wrapper.findAll('button').find(b => b.text() === 'Back to all services').trigger('click')
      expect(cards(wrapper)).toHaveLength(8)
      expect(wrapper.find('h1').text()).toBe('Welcome to Smile Developer Mode')
    })

    it.each([
      ['Prolific', 'https://study.example/welcome/prolific'],
      ['CloudResearch', 'https://study.example/welcome/cloudresearch'],
      ['Citizen Science', 'https://study.example/welcome/citizensci'],
      ['SONA', 'https://study.example/welcome/sona/?survey_code=%SURVEY_CODE%'],
      ['SONA Paid', 'https://study.example/welcome/sona_paid/?survey_code=%SURVEY_CODE%'],
      ['SPARK', 'https://study.example/welcome/spark'],
      ['PANDA', 'https://study.example/welcome/panda'],
      ['Anonymous Web User', 'https://study.example/welcome'],
    ])('on a deployment gives the study address for %s, and copies it', async (name, address) => {
      const wrapper = mountChooser(DEPLOYED)
      await openService(wrapper, name)
      const code = wrapper.find('code.select-all')
      expect(code.text()).toBe(address)
      const copy = wrapper.findAll('button').find(b => b.text() === 'Copy')
      await copy.trigger('click')
      await flushPromises()
      expect(copyText).toHaveBeenCalledWith(address)
      expect(copy.text()).toBe('Copied!')
      expect(wrapper.text()).not.toContain('This is a local development URL')
    })

    it('locally crosses the address out, warns that it cannot be shared and has no copy button', async () => {
      const wrapper = mountChooser()
      await openService(wrapper, 'Prolific')
      expect(wrapper.text()).toContain('This is a local development URL and cannot be shared with participants.')
      const code = wrapper.find('code.line-through')
      expect(code.text()).toBe('https://your-app.vercel.app/welcome/prolific')
      expect(wrapper.findAll('button').find(b => b.text() === 'Copy')).toBeUndefined()
    })
  })
})
