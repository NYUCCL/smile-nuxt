import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Keeps old-version (pre-Nuxt) content out of the docs. The docs will ship to
 * coding agents (plans/docs_in_dev_tools.md), and agents repeat what the docs
 * say, so code that no longer works must not come back.
 */

const docsDir = resolve(__dirname, '../../docs')

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(path)
    return entry.name.endsWith('.md') ? [path] : []
  })
}

// What each pattern means, so a failure says what to fix.
const STALE = [
  [/@\/core\//, 'an old import path (@/core/...); composables are auto-imported now'],
  [/@\/runtime\//, 'internal module paths (@/runtime/...); a project gets these components and composables auto-imported'],
  [/\bsrc\/(user|core)\b/, 'an old folder (src/user or src/core); use the start/ layout (components/, public/, assets/)'],
  [/fire(base|store)/i, 'Firebase/Firestore; data is in SQLite locally and Turso when deployed'],
  [/\bnpm run (getdata|dashboard|update_config)\b/, 'an old command that no longer exists'],
  [/\bEXP_DEPLOY_MODE\b|\.env\.deploy/, 'old deploy settings'],
]

describe('docs: no old-version content', () => {
  const files = markdownFiles(docsDir)

  it('finds the docs pages', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  for (const [pattern, meaning] of STALE) {
    it(`no ${meaning}`, () => {
      const hits = []
      for (const file of files) {
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (pattern.test(line)) hits.push(`${relative(docsDir, file)}:${i + 1}: ${line.trim()}`)
        })
      }
      expect(hits, `found ${meaning}`).toEqual([])
    })
  }
})
