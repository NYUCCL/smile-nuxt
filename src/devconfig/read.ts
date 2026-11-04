/**
 * Read a project's build and deploy settings for the dev tools' build
 * settings page: each setting's value on this machine and on a deploy, where
 * it comes from, and the risk findings. Secrets are reduced to { set, kind }
 * here, before anything else sees them.
 *
 * Runs in the Nuxt process (dev server only); see ./handler.ts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from './envparse'
import { GROUPS, CHANGE, SETTINGS, SECRET_KEYS } from '../runtime/shared/config-schema.js'
import { checkConfig, deploySummary, redactSecret } from '../runtime/shared/config-rules.js'

/** Every env file the page looks at (fixed list, project root only). */
export const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.git.local',
] as const
export type EnvFile = typeof ENV_FILES[number]

/** What `nuxt dev` sees, highest priority first (Vite's order; the generated git file only sets its own keys). */
const LOCAL_ORDER: EnvFile[] = ['.env.git.local', '.env.development.local', '.env.development', '.env.local', '.env']
/** What a deploy builds with: the tracked files, highest first. CI has no *.local files. */
const DEPLOY_ORDER: EnvFile[] = ['.env.production', '.env']
const TRACKED = new Set<EnvFile>(DEPLOY_ORDER)

const SECRETS = new Set(SECRET_KEYS)
const KNOWN = new Set(SETTINGS.map(s => s.key))
/** Prefixes of keys we'd expect in the schema: an unknown one is likely a typo. */
const OWN_PREFIXES = ['SMILE_', 'TURSO_', 'VITE_SONA_']

type Redacted = { set: boolean, kind?: 'bcrypt' | 'plaintext' }
type Shown = string | Redacted | undefined

export interface ReadOptions {
  rootDir: string
  /** The process environment (the shell, plus what Nuxt and nuxt.config loaded). */
  env: Record<string, string | undefined>
  /** `smile.devTools` from nuxt.config.ts */
  devToolsOption?: boolean
}

function show(key: string, value: string | undefined): Shown {
  if (value === undefined) return undefined
  return SECRETS.has(key) ? redactSecret(value) as Redacted : value
}

export function readFiles(rootDir: string): Partial<Record<EnvFile, Record<string, string>>> {
  const files: Partial<Record<EnvFile, Record<string, string>>> = {}
  for (const name of ENV_FILES) {
    const path = join(rootDir, name)
    if (existsSync(path)) {
      try {
        files[name] = parseEnv(readFileSync(path, 'utf8'))
      }
      catch {
        files[name] = {}
      }
    }
  }
  return files
}

export function readBuildConfig({ rootDir, env, devToolsOption }: ReadOptions) {
  const files = readFiles(rootDir)
  const fileValue = (file: EnvFile, key: string) => files[file]?.[key]

  const local: Record<string, Shown> = {}
  const deploy: Record<string, Shown> = {}
  const tracked: string[] = []
  const localOnly: string[] = []

  const settings = SETTINGS.map((s) => {
    // Every setting has a key (config-schema.js is plain JS, so TS can't tell)
    const key = s.key as string
    const setIn = ENV_FILES.filter(f => fileValue(f, key) !== undefined)

    // This machine: the shell wins if it holds a value no file has (Nuxt
    // copies .env into process.env, so a value equal to a file's came from it).
    const shellValue = env[key]
    const fromShell = shellValue !== undefined && !setIn.some(f => fileValue(f, key) === shellValue)
    const localFile = LOCAL_ORDER.find(f => fileValue(f, key) !== undefined)
    let source: string | null = null
    let localRaw: string | undefined
    if (fromShell) {
      source = 'environment'
      localRaw = shellValue
    }
    else if (localFile) {
      source = localFile
      localRaw = fileValue(localFile, key)
    }

    const deployFile = DEPLOY_ORDER.find(f => fileValue(f, key) !== undefined)
    const deployRaw = deployFile ? fileValue(deployFile, key) : undefined

    local[key] = show(key, localRaw)
    deploy[key] = show(key, deployRaw)
    if (deployFile) tracked.push(key)
    else if (localRaw !== undefined) localOnly.push(key)

    const alsoIn = setIn
      .filter(f => f !== source)
      .map(f => ({ file: f, value: show(key, fileValue(f, key)), tracked: TRACKED.has(f) }))

    return {
      ...s,
      secret: s.type === 'secret',
      howToChange: CHANGE[s.change as keyof typeof CHANGE],
      value: local[key] ?? null,
      source,
      alsoIn,
      deployValue: deploy[key] ?? null,
      deploySource: deployFile ?? null,
      localOnly: !deployFile && localRaw !== undefined,
    }
  })

  // Keys that look like ours but aren't settings: probably typos.
  const unknown = new Set<string>()
  for (const name of ENV_FILES) {
    for (const key of Object.keys(files[name] || {})) {
      if (!KNOWN.has(key) && OWN_PREFIXES.some(p => key.startsWith(p))) unknown.add(key)
    }
  }

  const ctx = { deploy, local, tracked, localOnly, devToolsOption, unknown: [...unknown] }
  return {
    groups: GROUPS,
    settings,
    summary: deploySummary(ctx),
    findings: checkConfig(ctx),
    files: Object.fromEntries(ENV_FILES.map(f => [f, { exists: !!files[f], tracked: TRACKED.has(f) }])),
    devToolsOption: devToolsOption ?? null,
    vercelLinked: existsSync(join(rootDir, '.vercel', 'project.json')),
  }
}
