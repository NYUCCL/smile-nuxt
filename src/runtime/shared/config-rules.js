/**
 * Risk rules and the "when you deploy" summary for a project's build and
 * deploy settings.
 *
 * Plain JS with no imports beyond the schema, so the dev tools' build settings
 * page and a project checker (`pnpm smile:check`, #65) can share them. The
 * caller reads the env files; these functions only reason about values.
 *
 * Input (`ctx`):
 *   deploy        key -> value: what a deploy builds with, i.e. the tracked env
 *                 files (.env, .env.production). Vercel env vars are unknown
 *                 and may add to or override these.
 *   local         key -> value: what this machine uses (all env files + shell).
 *   tracked       keys set in a tracked env file
 *   localOnly     keys set only in an untracked file (.env.local, …) or the shell
 *   devToolsOption  smile.devTools from nuxt.config.ts (boolean | undefined)
 *   unknown       keys in the env files that look like SMILE's but aren't settings
 *
 * A secret's value is never passed in: secrets arrive as { set, kind } where
 * kind is 'bcrypt' | 'plaintext' | 'value'. Every other value is a string, or
 * undefined when unset.
 */
import { SETTINGS, SETTINGS_BY_KEY } from './config-schema.js'

const TRUE = ['include', 'true', '1', 'yes', 'on']
const FALSE = ['exclude', 'false', '0', 'no', 'off']

const norm = v => (typeof v === 'string' ? v.trim().toLowerCase() : '')
const isSet = v => (v && typeof v === 'object' ? !!v.set : v !== undefined && v !== '')

/** Is a value a bcrypt hash? (what scripts/hash-password.js writes) */
export function isBcryptHash(value) {
  return /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(value ?? ''))
}

/** Reduce a secret to what may leave the server. */
export function redactSecret(value) {
  if (value === undefined || value === '') return { set: false }
  return { set: true, kind: isBcryptHash(value) ? 'bcrypt' : 'plaintext' }
}

/** Mirrors module.ts resolveDevToolsBuild for a production build. */
export function devToolsIncluded(value, option) {
  const v = norm(value)
  if (TRUE.includes(v)) return { included: true, from: 'SMILE_DEV_TOOLS' }
  if (FALSE.includes(v)) return { included: false, from: 'SMILE_DEV_TOOLS' }
  if (option !== undefined) return { included: !!option, from: 'smile.devTools' }
  return { included: false, from: 'default' }
}

/** Mirrors server/utils/dev-auth.ts resolveAccess. */
export function resolveAccess(explicit, hasPassword, legacyOpen = false) {
  const e = norm(explicit)
  if (e === 'disabled' || e === 'password' || e === 'open') return e
  if (legacyOpen) return 'open'
  if (hasPassword) return 'password'
  return 'disabled'
}

/** Validate one value against its setting's type. Returns an error message or null. */
export function validateValue(key, value) {
  const s = SETTINGS_BY_KEY[key]
  if (!s || value === undefined || value === '' || typeof value === 'object') return null
  const v = String(value).trim()
  switch (s.type) {
    case 'bool':
      return ['true', 'false'].includes(v) ? null : `should be true or false (is "${v}")`
    case 'enum': {
      const ok = key === 'SMILE_DEV_TOOLS' ? [...TRUE, ...FALSE] : s.values
      return ok.includes(v.toLowerCase()) ? null : `should be one of ${s.values.join(', ')} (is "${v}")`
    }
    case 'int':
      return /^\d+$/.test(v) ? null : `should be a whole number (is "${v}")`
    case 'size':
      return /^\d+x\d+$/.test(v) ? null : `should be WIDTHxHEIGHT, e.g. 800x600 (is "${v}")`
    default:
      return null
  }
}

function accessLine({ id, route, mode, included, password, passwordKey, accessKey, legacy, dataExposed }) {
  const keys = [accessKey, passwordKey, ...(legacy ? ['SMILE_PUBLIC_PRESENTATION'] : [])]
  if (!included) {
    return {
      id, question: `Who can open ${route}?`, status: 'ok', keys,
      answer: 'No one: it isn\'t in the build.',
      explanation: `${route} returns 404 on deploys because the dev tools are left out of the build.`,
    }
  }
  if (mode === 'open') {
    return {
      id, question: `Who can open ${route}?`, status: dataExposed ? 'risk' : 'check', keys,
      answer: 'Anyone with the link, no password.',
      explanation: dataExposed
        ? `${route} and its data endpoints are public: anyone who finds the URL can browse and download every participant's data.`
        : `${route} is public: anyone who finds the URL can walk through the study as you'd present it.`,
      recommendation: `Use ${accessKey}=password with ${passwordKey}, unless a public ${route} is really what you want.`,
    }
  }
  if (mode === 'password') {
    if (password.set) {
      return {
        id, question: `Who can open ${route}?`, status: 'ok', keys,
        answer: 'People with the password.',
        explanation: password.kind === 'bcrypt'
          ? `${passwordKey} is set (a bcrypt hash).`
          : `${passwordKey} is set, as plaintext in a tracked file.`,
        ...(password.kind !== 'bcrypt' && { recommendation: 'Store a hash (pnpm smile:hash-password), in Vercel rather than a tracked file.' }),
      }
    }
    return {
      id, question: `Who can open ${route}?`, status: 'check', keys,
      answer: `People with the password, if ${passwordKey} is set in Vercel.`,
      explanation: `Access is password, but no ${passwordKey} is in the tracked files (it shouldn't be). `
        + `If it isn't set in Vercel either, ${route} returns 404.`,
      recommendation: `Set ${passwordKey} (a hash from pnpm smile:hash-password) in Vercel for the environments that need ${route}.`,
    }
  }
  return {
    id, question: `Who can open ${route}?`, status: id === 'dev' ? 'check' : 'ok', keys,
    answer: `No one, unless Vercel sets ${accessKey} or ${passwordKey}.`,
    explanation: id === 'dev'
      ? `The dev tools are in the build, but access is disabled, so ${route} returns 404: the build carries them for nothing.`
      : `${route} returns 404 on deploys (the default).`,
    recommendation: id === 'dev'
      ? `Set ${passwordKey} in Vercel to use them, or leave the dev tools out of the build.`
      : `To show the study to someone, set ${passwordKey} in Vercel (password access).`,
  }
}

/**
 * What a deploy from this repo will do, as a list of questions with an
 * answer, a status (ok | check | risk), an explanation and a recommendation.
 */
export function deploySummary(ctx) {
  const d = ctx.deploy || {}
  const lines = []

  const tools = devToolsIncluded(d.SMILE_DEV_TOOLS, ctx.devToolsOption)
  const where = tools.from === 'SMILE_DEV_TOOLS'
    ? 'SMILE_DEV_TOOLS in the tracked env files'
    : tools.from === 'smile.devTools' ? 'smile.devTools in nuxt.config.ts' : 'the default'
  lines.push(tools.included
    ? {
        id: 'devtools', question: 'Are the dev tools in the build?', status: 'check', keys: ['SMILE_DEV_TOOLS'],
        answer: 'Yes, on every deploy.',
        explanation: `Set by ${where}, so production builds (the main branch) ship /dev too.`,
        recommendation: 'Leave them out of production: remove it here and set SMILE_DEV_TOOLS=include for Preview only in Vercel.',
      }
    : {
        id: 'devtools', question: 'Are the dev tools in the build?', status: 'ok', keys: ['SMILE_DEV_TOOLS'],
        answer: 'No, unless Vercel sets SMILE_DEV_TOOLS=include.',
        explanation: `Not included by ${where}: /dev returns 404 and participants' deploys carry none of the dev code.`,
        recommendation: 'To use /dev on preview deploys, set SMILE_DEV_TOOLS=include for Preview in Vercel, with a password.',
      })

  const devPassword = d.SMILE_DEV_PASSWORD || { set: false }
  lines.push(accessLine({
    id: 'dev', route: '/dev', included: tools.included,
    mode: resolveAccess(d.SMILE_DEV_ACCESS, devPassword.set), password: devPassword,
    accessKey: 'SMILE_DEV_ACCESS', passwordKey: 'SMILE_DEV_PASSWORD', dataExposed: true,
  }))

  const presPassword = d.SMILE_PRESENTATION_PASSWORD || { set: false }
  lines.push(accessLine({
    id: 'presentation', route: '/presentation', included: true,
    mode: resolveAccess(d.SMILE_PRESENTATION_ACCESS, presPassword.set, norm(d.SMILE_PUBLIC_PRESENTATION) === 'true'),
    password: presPassword, accessKey: 'SMILE_PRESENTATION_ACCESS', passwordKey: 'SMILE_PRESENTATION_PASSWORD',
    legacy: true, dataExposed: false,
  }))

  const url = d.TURSO_DATABASE_URL
  lines.push(url && /^libsql:|^https?:/i.test(url)
    ? {
        id: 'database', question: 'Where does the data go?', status: 'ok', keys: ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'],
        answer: 'The Turso database in TURSO_DATABASE_URL.',
        explanation: 'Set in a tracked env file. Its TURSO_AUTH_TOKEN must be set in Vercel.',
      }
    : {
        id: 'database', question: 'Where does the data go?', status: 'check', keys: ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'],
        answer: 'To the Turso database set in Vercel; without one, nowhere that lasts.',
        explanation: 'TURSO_DATABASE_URL isn\'t in the tracked files (that\'s normal). Without it a deploy writes to a local '
          + 'SQLite file, which a serverless deploy loses.',
        recommendation: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel, for Production and Preview.',
      })

  lines.push({
    id: 'authsecret', question: 'Are participant tokens signed with a real secret?', status: 'check', keys: ['SMILE_AUTH_SECRET'],
    answer: 'Only if SMILE_AUTH_SECRET (or a Turso token) is set in Vercel.',
    explanation: 'The secret signs the tokens that let a participant\'s browser save their data. Without SMILE_AUTH_SECRET it '
      + 'falls back to TURSO_AUTH_TOKEN (rotating it logs everyone out mid-study), then SMILE_DEV_PASSWORD, then a key published in this package.',
    recommendation: 'Set SMILE_AUTH_SECRET in Vercel to a long random string (e.g. openssl rand -hex 32).',
  })

  const autoSave = norm(d.VITE_AUTO_SAVE_DATA) !== 'false'
  const interval = Number(d.VITE_MIN_WRITE_INTERVAL ?? 2000)
  const writes = Number(d.VITE_MAX_WRITES ?? 1000)
  lines.push(autoSave
    ? {
        id: 'saving', question: 'Does data save?', status: 'ok', keys: ['VITE_AUTO_SAVE_DATA', 'VITE_MIN_WRITE_INTERVAL', 'VITE_MAX_WRITES'],
        answer: 'Yes, automatically.',
        explanation: `At most one save every ${Number.isFinite(interval) ? interval : 2000} ms, and up to ${Number.isFinite(writes) ? writes : 1000} saves per visit.`,
      }
    : {
        id: 'saving', question: 'Does data save?', status: 'risk', keys: ['VITE_AUTO_SAVE_DATA'],
        answer: 'Only where the design saves explicitly.',
        explanation: 'VITE_AUTO_SAVE_DATA is false, so nothing is saved as participants go.',
        recommendation: 'Remove VITE_AUTO_SAVE_DATA (or set it to true) unless your design calls api.saveData() itself.',
      })

  return lines
}

/**
 * Findings the deploy summary doesn't already cover:
 * { id, level: 'error' | 'warn' | 'info', keys, message, fix }.
 */
export function checkConfig(ctx) {
  const d = ctx.deploy || {}
  const l = ctx.local || {}
  const tracked = new Set(ctx.tracked || [])
  const localOnly = new Set(ctx.localOnly || [])
  const findings = []
  const add = (level, id, keys, message, fix) => findings.push({ id, level, keys, message, ...(fix && { fix }) })

  // Secrets committed to git.
  for (const s of SETTINGS) {
    if (s.type === 'secret' && tracked.has(s.key)) {
      add('error', `secret-tracked:${s.key}`, [s.key],
        `${s.key} is in a tracked env file (.env or .env.production), so it is committed to git.`,
        'Move it to .env.local, set it in Vercel instead, and change it: anyone with the repo has the old one.')
    }
  }

  // Values that don't parse.
  for (const [profile, values] of [['deploy', d], ['local', l]]) {
    for (const [key, value] of Object.entries(values)) {
      const err = validateValue(key, value)
      if (err && !findings.some(f => f.id === `invalid:${key}`)) {
        add('error', `invalid:${key}`, [key], `${key} ${err}.`,
          profile === 'deploy' ? 'Fix it in the tracked env file.' : 'Fix it in the file it comes from.')
      }
    }
  }

  // Dev tools left out, but access configured (module.ts logs the same at build).
  for (const [profile, values] of [['deploy', d], ['local', l]]) {
    const { included } = devToolsIncluded(values.SMILE_DEV_TOOLS, ctx.devToolsOption)
    const access = norm(values.SMILE_DEV_ACCESS)
    if (!included && (isSet(values.SMILE_DEV_PASSWORD) || access === 'password' || access === 'open')) {
      add('warn', `devtools-excluded-access:${profile}`, ['SMILE_DEV_TOOLS', 'SMILE_DEV_ACCESS', 'SMILE_DEV_PASSWORD'],
        profile === 'deploy'
          ? 'Dev access is configured in the tracked files, but the dev tools aren\'t in the build, so /dev will 404 on deploys.'
          : 'Dev access is configured on this machine, but a production build here would leave the dev tools out, so /dev would 404 (nuxt dev is unaffected).',
        'Set SMILE_DEV_TOOLS=include where you want /dev (e.g. Preview in Vercel), or remove the access settings.')
      break
    }
  }

  // Settings a deploy won't see.
  for (const key of localOnly) {
    const s = SETTINGS_BY_KEY[key]
    if (!s || s.generated) continue
    if (s.phase === 'build' && s.change === 'build') {
      add('info', `local-only:${key}`, [key],
        `${key} is set only on this machine (.env.local or the shell), so deploys build without it.`,
        'If deploys should use it too, put it in .env.')
    }
    else {
      add('info', `local-only:${key}`, [key],
        `${key} is set only on this machine, so deploys don't see it.`,
        'If a deploy needs it, set it in Vercel > Settings > Environment Variables.')
    }
  }

  // Plaintext passwords anywhere.
  for (const key of ['SMILE_DEV_PASSWORD', 'SMILE_PRESENTATION_PASSWORD']) {
    if (l[key]?.set && l[key].kind === 'plaintext') {
      add('info', `plaintext:${key}`, [key], `${key} is stored as plaintext.`,
        'Store a bcrypt hash instead: run pnpm smile:hash-password and paste the result.')
    }
  }

  // Turso URL without a token, or the reverse (local view: both are knowable here).
  if (isSet(l.TURSO_DATABASE_URL) && /^libsql:/i.test(l.TURSO_DATABASE_URL) && !isSet(l.TURSO_AUTH_TOKEN)) {
    add('warn', 'turso-no-token', ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'],
      'TURSO_DATABASE_URL is a Turso database but TURSO_AUTH_TOKEN isn\'t set on this machine, so the dev server can\'t connect.',
      'Add TURSO_AUTH_TOKEN to .env.local.')
  }
  if (!isSet(l.TURSO_DATABASE_URL) && isSet(l.TURSO_AUTH_TOKEN)) {
    add('info', 'turso-token-no-url', ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'],
      'TURSO_AUTH_TOKEN is set but TURSO_DATABASE_URL isn\'t, so the dev server uses local SQLite.')
  }

  // Keys that look like SMILE's but aren't settings: probably typos.
  for (const key of ctx.unknown || []) {
    add('warn', `unknown:${key}`, [key],
      `${key} isn't a SMILE setting, so nothing reads it. A typo?`,
      'Check the spelling against the settings below.')
  }

  // Legacy alias.
  if (norm(l.SMILE_PUBLIC_PRESENTATION) === 'true') {
    add('info', 'legacy-public-presentation', ['SMILE_PUBLIC_PRESENTATION'],
      'SMILE_PUBLIC_PRESENTATION is the old way to make /presentation public.',
      'Use SMILE_PRESENTATION_ACCESS=open instead.')
  }

  // Study behavior worth a second look before launching.
  if (norm(d.VITE_ALLOW_REPEATS) === 'true') {
    add('info', 'allow-repeats', ['VITE_ALLOW_REPEATS'],
      'VITE_ALLOW_REPEATS is true: someone who finished can take the study again from the same browser.')
  }
  const interval = Number(d.VITE_MIN_WRITE_INTERVAL)
  if (d.VITE_MIN_WRITE_INTERVAL !== undefined && Number.isFinite(interval) && interval < 500) {
    add('info', 'fast-writes', ['VITE_MIN_WRITE_INTERVAL'],
      `VITE_MIN_WRITE_INTERVAL is ${interval} ms: busy views can send a save request for nearly every change.`,
      'The default (2000 ms) delays saves without losing any.')
  }

  const order = { error: 0, warn: 1, info: 2 }
  return findings.sort((a, b) => order[a.level] - order[b.level])
}
