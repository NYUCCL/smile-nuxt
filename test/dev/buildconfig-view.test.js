/**
 * @fileoverview The dev tools' build & deploy settings page: one setting's
 * row (BuildConfigSetting) and the page that loads and lists them
 * (BuildConfigView).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import BuildConfigSetting from '../../src/runtime/components/dev/buildconfig/BuildConfigSetting.vue'
import BuildConfigView from '../../src/runtime/components/dev/buildconfig/BuildConfigView.vue'
import { createStore, createFakeApi, mountComponent } from '../components/mount'
import { setFlags, resetFlags } from '../setup/flags'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))

/**
 * A setting as /_smile/dev-config sends it.
 * @param {object} [more] - Fields to replace
 * @returns {object} The setting
 */
const setting = (more = {}) => ({
  key: 'VITE_PROJECT_NAME',
  group: 'study',
  type: 'string',
  phase: 'build',
  description: 'The name of the study.',
  default: 'smile',
  howToChange: 'Edit .env in the project folder.',
  value: 'memory',
  source: '.env',
  deployValue: 'memory',
  deploySource: '.env',
  alsoIn: [],
  localOnly: false,
  generated: false,
  secret: false,
  unused: false,
  configPath: null,
  ...more,
})

let wrapper
let pinia
beforeEach(() => {
  let store;
  ({ pinia, store } = createStore())
  fake.api = createFakeApi(store, {
    config: {
      smileVersion: '0.9.0',
      maxWrites: 1000,
      autoSave: true,
      responsiveUI: true,
      colorMode: 'system',
      labURL: 'https://lab.example',
      windowsizerRequest: { width: 800, height: 600 },
    },
  })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  resetFlags()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('BuildConfigSetting', () => {
  const mountSetting = (more) => {
    wrapper = mountComponent(BuildConfigSetting, { pinia, props: { setting: setting(more) } })
  }
  const head = () => wrapper.find('[data-testid="value"]').text()
  const tags = () => wrapper.findAll('.bc-tag').map(t => t.text())
  // The detail list as { term: text }
  const detail = () => {
    const terms = wrapper.findAll('dt').map(d => d.text())
    const values = wrapper.findAll('dd').map(d => d.text())
    return Object.fromEntries(terms.map((t, i) => [t, values[i]]))
  }

  it('shows the key, the value and the file it comes from', () => {
    mountSetting()
    expect(wrapper.find('.bc-name').text()).toBe('VITE_PROJECT_NAME')
    expect(head()).toBe('memory.env')
    expect(wrapper.attributes('id')).toBe('sd-setting-VITE_PROJECT_NAME')
    expect(tags()).toEqual([])
  })

  it.each([
    ['environment', 'shell environment'],
    ['.env.git.local', 'generated'],
    ['.env.local', '.env.local'],
  ])('names the source %s as "%s"', (source, label) => {
    mountSetting({ source })
    expect(wrapper.find('.bc-now .bc-from').text()).toBe(label)
  })

  it('an empty value is shown as (empty)', () => {
    mountSetting({ value: '', deployValue: '' })
    expect(wrapper.find('.bc-value').text()).toBe('(empty)')
  })

  it.each([
    ['bcrypt', 'set (bcrypt hash)'],
    ['plain', 'set (plaintext)'],
  ])('a %s secret is shown as set, never its value', (kind, text) => {
    const value = { set: true, kind }
    mountSetting({ value, deployValue: value, secret: true })
    expect(wrapper.find('.bc-value').text()).toBe(text)
    expect(detail().Read).toBe('at build time · secret')
  })

  it('a secret that is not set shows its default', () => {
    const value = { set: false }
    mountSetting({ value, deployValue: value, default: 'not set (no password)' })
    expect(head()).toBe('not set')
  })

  it('an unset setting shows the short form of its default', () => {
    mountSetting({ value: null, deployValue: null, default: 'exclude (or smile.devTools in nuxt.config)' })
    expect(head()).toBe('excludedefault')
    expect(wrapper.find('.bc-value').classes()).toContain('is-default')
    expect(detail().Default).toBe('exclude (or smile.devTools in nuxt.config)')
  })

  it('an unset setting without a default says not set', () => {
    mountSetting({ value: null, deployValue: null, default: 'not set' })
    expect(head()).toBe('not set')
  })

  it('a setting only this machine has is tagged, and the deploy line says what deploys get', () => {
    mountSetting({ value: 'local-name', source: '.env.local', deployValue: null, deploySource: null, localOnly: true })
    expect(tags()).toEqual(['this machine only'])
    expect(detail().Deploys).toBe('not in the tracked files, so not set (default: smile), unless Vercel sets it')
  })

  it('an unset default is not repeated in the deploy line', () => {
    mountSetting({ value: 'x', source: '.env.local', deployValue: null, deploySource: null, localOnly: true, default: 'not set (no analytics)' })
    expect(detail().Deploys).toBe('not in the tracked files, so not set (no analytics), unless Vercel sets it')
  })

  it('a different value on deploys is tagged and shown with its file', () => {
    mountSetting({ value: 'local-name', source: '.env.local', deployValue: 'memory', deploySource: '.env' })
    expect(tags()).toEqual(['differs on deploy'])
    expect(detail().Deploys).toBe('memoryfrom .env')
  })

  it('a generated setting is never said to differ on deploys', () => {
    mountSetting({ value: 'abc1234', source: '.env.git.local', deployValue: null, generated: true })
    expect(tags()).toEqual([])
    expect(detail().Deploys).toBeUndefined()
  })

  it('lists the other files that set it', () => {
    mountSetting({ alsoIn: [{ file: '.env.local', value: 'other' }, { file: '.env.docs', value: '' }, { file: '.env.secret', value: { set: true, kind: 'plain' } }] })
    expect(wrapper.findAll('.bc-also').map(a => a.text())).toEqual(['.env.local: other', '.env.docs: (empty)', '.env.secret: set (plaintext)'])
  })

  it.each([
    [{ phase: 'build' }, 'at build time'],
    [{ phase: 'server' }, 'by the server, per request'],
    [{ phase: 'server', secret: true, unused: true }, 'by the server, per request · secret · not used by SMILE'],
  ])('says when the setting is read: %o', (more, text) => {
    mountSetting(more)
    expect(detail().Read).toBe(text)
  })

  it('shows the description and how to change it', () => {
    mountSetting()
    expect(wrapper.find('.bc-detail > .sd-help').text()).toBe('The name of the study.')
    expect(detail()['Change it']).toBe('Edit .env in the project folder.')
  })

  describe('the running app\'s value', () => {
    const running = () => detail()['Running app']

    it('is not mentioned when it matches the files', () => {
      mountSetting({ key: 'VITE_MAX_WRITES', type: 'int', value: '1000', deployValue: '1000', configPath: 'maxWrites' })
      expect(tags()).toEqual([])
      expect(running()).toBeUndefined()
    })

    it('a number the app has changed is tagged and shown', () => {
      mountSetting({ key: 'VITE_MAX_WRITES', type: 'int', value: '500', deployValue: '500', configPath: 'maxWrites' })
      expect(tags()).toEqual(['changed at runtime'])
      expect(running()).toContain('1000')
    })

    it.each([
      ['VITE_RESPONSIVE_UI', 'responsiveUI', 'true', null],
      ['VITE_RESPONSIVE_UI', 'responsiveUI', 'false', 'true'],
      // Auto save is on unless the file says false
      ['VITE_AUTO_SAVE_DATA', 'autoSave', 'yes', null],
      ['VITE_AUTO_SAVE_DATA', 'autoSave', 'false', 'true'],
    ])('a switch: %s=%s against the running app', (key, configPath, value, shown) => {
      mountSetting({ key, type: 'bool', value, deployValue: value, configPath })
      if (shown === null) expect(running()).toBeUndefined()
      else expect(running()).toContain(shown)
    })

    it.each([
      ['800x600', null],
      ['1024x768', '800x600'],
    ])('a size: %s against the running app\'s 800x600', (value, shown) => {
      mountSetting({ key: 'VITE_WINDOWSIZER_REQUEST', type: 'size', value, deployValue: value, configPath: 'windowsizerRequest' })
      if (shown === null) expect(running()).toBeUndefined()
      else expect(running()).toContain(shown)
    })

    it.each([
      ['auto', null],
      ['system', null],
      ['dark', 'system'],
    ])('the color mode: %s against the running app\'s system', (value, shown) => {
      mountSetting({ key: 'VITE_COLOR_MODE', value, deployValue: value, configPath: 'colorMode' })
      if (shown === null) expect(running()).toBeUndefined()
      else expect(running()).toContain(shown)
    })

    it('a text setting is compared as it is', () => {
      mountSetting({ key: 'VITE_LAB_URL', value: ' https://lab.example ', deployValue: ' https://lab.example ', configPath: 'labURL' })
      expect(running()).toBeUndefined()
    })

    it.each([
      ['an unset setting', { value: null, deployValue: null, configPath: 'maxWrites' }],
      ['a secret', { value: { set: true, kind: 'plain' }, deployValue: { set: true, kind: 'plain' }, configPath: 'maxWrites' }],
      ['a setting the app does not have', { configPath: 'notInConfig' }],
    ])('is not compared for %s', (_name, more) => {
      mountSetting(more)
      expect(running()).toBeUndefined()
      expect(tags()).toEqual([])
    })
  })
})

describe('BuildConfigView', () => {
  const BODY = {
    vercelLinked: true,
    files: {
      '.env': { exists: true, tracked: true },
      '.env.local': { exists: true, tracked: false },
      '.env.git.local': { exists: true, tracked: false },
      '.env.docs': { exists: false, tracked: false },
    },
    summary: [
      { id: 'devtools', status: 'ok', question: 'Dev tools on the deploy?', answer: 'No', explanation: 'They are left out of the build.', recommendation: null, keys: ['NUXT_PUBLIC_SMILE_DEV_TOOLS'] },
      { id: 'password', status: 'risk', question: 'Password?', answer: 'None', explanation: 'Anyone with the link gets in.', recommendation: 'Set a password.', keys: ['NUXT_SMILE_PASSWORD'] },
      { id: 'data', status: 'check', question: 'Where does data go?', answer: 'SQLite', explanation: 'A local file.', recommendation: null, keys: [] },
    ],
    findings: [
      { id: 'f1', level: 'error', message: 'A secret is in a tracked file', fix: 'Move it to .env.local.', keys: ['NUXT_SMILE_PASSWORD'] },
      { id: 'f2', level: 'warn', message: 'Two files set the same key', fix: null, keys: [] },
      { id: 'f3', level: 'info', message: 'An unknown key is set', fix: 'Remove it.', keys: [] },
    ],
    groups: [
      { id: 'study', title: 'Study' },
      { id: 'access', title: 'Access' },
      { id: 'unused', title: 'Nothing here' },
    ],
    settings: [
      setting(),
      setting({ key: 'VITE_MAX_WRITES', description: 'The most saves one participant may make.' }),
      setting({ key: 'NUXT_SMILE_PASSWORD', group: 'access', description: 'The password for the deploy.' }),
      setting({ key: 'NUXT_PUBLIC_SMILE_DEV_TOOLS', group: 'access', description: 'Whether deploys include the dev tools.' }),
    ],
  }

  /**
   * Mounts the page with the server answering as given.
   * @param {object} [answer] - How the server answers
   * @param {number} [answer.status] - The HTTP status
   * @param {object} [answer.body] - The JSON body
   * @param {Function} [answer.json] - In place of body: the response's json(), which may throw
   * @returns {Promise<import('vitest').Mock>} The fetch spy
   */
  async function mountView({ status = 200, body = BODY, json } = {}) {
    const fetch = vi.fn(async () => ({ status, ok: status >= 200 && status < 300, json: json ?? (async () => body) }))
    vi.stubGlobal('fetch', fetch)
    wrapper = mountComponent(BuildConfigView, { pinia, attachTo: document.body })
    await flushPromises()
    return fetch
  }
  const groups = () => wrapper.findAll('.bc-subgroup').map(g => [g.find('h3').text(), g.findAll('.bc-name').map(n => n.text())])
  const error = () => wrapper.find('[role="alert"]')

  it('asks the dev server for the settings, and says so while waiting', async () => {
    let answer
    const fetch = vi.fn(() => new Promise((resolve) => {
      answer = resolve
    }))
    vi.stubGlobal('fetch', fetch)
    wrapper = mountComponent(BuildConfigView, { pinia })
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith('/_smile/dev-config', { headers: { accept: 'application/json' } })
    expect(wrapper.text()).toContain('Reading the project\'s settings…')
    expect(wrapper.find('button[aria-label="Reload"]').attributes('disabled')).toBeDefined()
    answer({ status: 200, ok: true, json: async () => BODY })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Reading the project\'s settings…')
    expect(wrapper.find('button[aria-label="Reload"]').attributes('disabled')).toBeUndefined()
  })

  it('counts the risks and the things to check, from the summary and the findings', async () => {
    await mountView()
    expect(wrapper.findAll('.bc-count').map(c => c.text())).toEqual(['2 risk', '2 to check'])
  })

  it('says all OK when there is nothing to look at', async () => {
    await mountView({ body: { ...BODY, summary: [BODY.summary[0]], findings: [BODY.findings[2]] } })
    expect(wrapper.findAll('.bc-count').map(c => c.text())).toEqual(['all OK'])
  })

  it('lists the env files that exist, with who sees each', async () => {
    await mountView()
    const sources = wrapper.find('[data-testid="sources"]').findAll('.bc-source').map(s => s.text())
    expect(sources).toEqual(['.envdeploys', '.env.localthis machine', '.env.git.localgenerated', 'Vercellinked · its variables win on deploys'])
    const titles = wrapper.find('[data-testid="sources"]').findAll('.bc-source').map(s => s.attributes('title'))
    expect(titles.slice(0, 3)).toEqual([
      'Committed to git: deploys build with it',
      'Not in git: only this machine sees it',
      'Written by SMILE from git on each dev start',
    ])
  })

  it('says so when there are no env files and Vercel is not linked', async () => {
    await mountView({ body: { ...BODY, files: {}, vercelLinked: false } })
    const sources = wrapper.find('[data-testid="sources"]').text()
    expect(sources).toContain('no env files (all defaults)')
    expect(sources).toContain('not linked: pnpm smile:setup-deploy')
  })

  it('shows what a deploy will do, one line per question', async () => {
    await mountView()
    const line = wrapper.find('[data-testid="deploy-password"]')
    expect(line.find('details').classes()).toContain('is-risk')
    expect(line.find('.bc-icon').attributes('aria-label')).toBe('Risk')
    expect(line.find('.bc-q').text()).toBe('Password?')
    expect(line.find('.bc-a').text()).toBe('None')
    expect(line.find('.sd-help').text()).toBe('Anyone with the link gets in.')
    expect(line.find('.bc-rec').text()).toBe('Recommended: Set a password.')
    expect(line.findAll('.bc-key').map(k => k.text())).toEqual(['NUXT_SMILE_PASSWORD'])
    // A line without a recommendation has no "Recommended"
    expect(wrapper.find('[data-testid="deploy-devtools"]').find('.bc-rec').exists()).toBe(false)
    expect(wrapper.find('[data-testid="deploy-devtools"]').find('.bc-icon').attributes('aria-label')).toBe('OK')
    expect(wrapper.find('[data-testid="deploy-data"]').find('.bc-icon').attributes('aria-label')).toBe('Check')
  })

  it('lists the findings with their fixes', async () => {
    await mountView()
    const findings = wrapper.findAll('[data-testid="finding"]')
    expect(findings.map(f => f.find('.bc-a').text())).toEqual(['A secret is in a tracked file', 'Two files set the same key', 'An unknown key is set'])
    expect(findings.map(f => f.find('details').classes().find(c => c.startsWith('is-')))).toEqual(['is-error', 'is-warn', 'is-info'])
    expect(findings[0].find('.sd-help').text()).toBe('Move it to .env.local.')
    expect(findings[1].find('.sd-help').exists()).toBe(false)
    expect(wrapper.find('#bc-findings').text()).toBe('Also worth a look3')
  })

  it('has no findings section when there are none', async () => {
    await mountView({ body: { ...BODY, findings: [] } })
    expect(wrapper.find('#bc-findings').exists()).toBe(false)
  })

  it('lists every setting under its group, leaving out groups without settings', async () => {
    await mountView()
    expect(groups()).toEqual([
      ['Study', ['VITE_PROJECT_NAME', 'VITE_MAX_WRITES']],
      ['Access', ['NUXT_SMILE_PASSWORD', 'NUXT_PUBLIC_SMILE_DEV_TOOLS']],
    ])
    expect(wrapper.find('#bc-all').text()).toContain('All settings 4')
  })

  it('the filter keeps settings whose key or description has the text, in any case', async () => {
    await mountView()
    const filter = wrapper.find('input[aria-label="Filter settings"]')
    await filter.setValue('  smile_p ')
    expect(groups()).toEqual([['Access', ['NUXT_SMILE_PASSWORD']]])
    await filter.setValue('SAVES')
    expect(groups()).toEqual([['Study', ['VITE_MAX_WRITES']]])
  })

  it('says so when no setting matches the filter', async () => {
    await mountView()
    await wrapper.find('input[aria-label="Filter settings"]').setValue('zzz')
    expect(groups()).toEqual([])
    expect(wrapper.find('[data-testid="all-settings"]').text()).toContain('No setting matches "zzz".')
  })

  it('a click on a key in a summary line clears the filter, opens that setting and scrolls to it', async () => {
    vi.useFakeTimers()
    await mountView()
    // With this filter the password's row is not in the list
    await wrapper.find('input[aria-label="Filter settings"]').setValue('max')
    const row = () => document.getElementById('sd-setting-NUXT_SMILE_PASSWORD')
    expect(row()).toBeNull()
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    // The next frame comes after the list is drawn again without the filter
    vi.stubGlobal('requestAnimationFrame', (fn) => {
      setTimeout(fn, 16)
      return 0
    })
    await wrapper.find('[data-testid="deploy-password"]').find('.bc-key').trigger('click')
    expect(wrapper.find('input[aria-label="Filter settings"]').element.value).toBe('')
    vi.advanceTimersByTime(16)
    expect(row().open).toBe(true)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(row().classList.contains('sd-flash')).toBe(true)
    vi.advanceTimersByTime(1200)
    expect(row().classList.contains('sd-flash')).toBe(false)
    delete HTMLElement.prototype.scrollIntoView
  })

  it('a click on a finding\'s key that has no setting row does nothing', async () => {
    vi.stubGlobal('requestAnimationFrame', (fn) => {
      fn()
      return 0
    })
    await mountView({ body: { ...BODY, findings: [{ id: 'f1', level: 'info', message: 'An unknown key', fix: null, keys: ['NOT_A_SETTING'] }] } })
    await wrapper.find('[data-testid="finding"]').find('.bc-key').trigger('click')
    expect(wrapper.findAll('details').filter(d => d.element.open)).toHaveLength(0)
  })

  it('the reload button reads the settings again', async () => {
    const fetch = await mountView()
    fetch.mockImplementation(async () => ({ status: 200, ok: true, json: async () => ({ ...BODY, findings: [] }) }))
    await wrapper.find('button[aria-label="Reload"]').trigger('click')
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(wrapper.find('#bc-findings').exists()).toBe(false)
  })

  it('on a deploy (no such route) says the page works only in the local dev server', async () => {
    await mountView({ status: 404, body: {} })
    expect(error().text()).toContain('it works only in the local dev server (pnpm dev)')
    expect(wrapper.find('.bc-cols').exists()).toBe(false)
  })

  it('on a dev server without the route says to restart it', async () => {
    setFlags({ dev: true })
    await mountView({ status: 404, body: {} })
    expect(error().text()).toContain('Restart it (press r in its terminal, or run pnpm dev again) and reload.')
    // The top bar marks a local dev server
    expect(wrapper.find('.sd-local-chip').text()).toBe('local')
  })

  it('shows the server\'s error message', async () => {
    await mountView({ status: 500, body: { error: 'Could not read .env' } })
    expect(error().text()).toBe('Could not read .env')
  })

  it('shows the status when the server\'s error has no readable body', async () => {
    await mountView({ status: 502, json: async () => {
      throw new Error('not JSON')
    } })
    expect(error().text()).toBe('The server answered 502.')
  })

  it('shows the reason when the request itself fails, and a reload that works clears it', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetch)
    wrapper = mountComponent(BuildConfigView, { pinia })
    await flushPromises()
    expect(error().text()).toBe('Failed to fetch')
    fetch.mockImplementation(async () => ({ status: 200, ok: true, json: async () => BODY }))
    await wrapper.find('button[aria-label="Reload"]').trigger('click')
    await flushPromises()
    expect(error().exists()).toBe(false)
    expect(wrapper.find('.bc-cols').exists()).toBe(true)
  })

  it('shows the mode\'s name and the smile version in the top bar', async () => {
    await mountView()
    expect(wrapper.find('nav').text()).toContain('Build & deploy settings')
    expect(wrapper.find('nav').text()).toContain('0.9.0')
    expect(wrapper.find('.sd-local-chip').exists()).toBe(false)
  })
})
