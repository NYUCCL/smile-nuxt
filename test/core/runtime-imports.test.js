import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * The module's own runtime files import what they use. The auto-imports the
 * module registers (src/module.ts addImports) are for the consumer's code:
 * Nuxt doesn't apply them to the module's files in a consumer's node_modules,
 * so a runtime file that leans on one works in the playground and breaks in a
 * real project (the dev tools layout did, with "useAPI is not defined").
 */
const AUTO_IMPORTS = ['useAPI', 'useViewAPI', 'useTimeline', 'useStepper', 'useSmileColorMode', 'getColorMode', 'setColorMode', 'useSmileStore', 'useLog', 'cn']

const runtime = join(import.meta.dirname, '../../src/runtime')

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(?:vue|js|ts)$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })
}

// The code, without comments (a comment may mention a call)
const code = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// Each import statement, up to its from '…' (braces may span lines)
const imports = text => text.match(/^import\s[\s\S]*?\sfrom\s+['"][^'"]+['"]/gm) || []

describe('runtime files import what they use', () => {
  it('never relies on the module\'s auto-imports', () => {
    const missing = []
    for (const path of files(runtime)) {
      const text = code(readFileSync(path, 'utf-8'))
      for (const name of AUTO_IMPORTS) {
        const used = new RegExp(`(?<![\\w.$])${name}\\(`).test(text)
        const imported = imports(text).some(statement => new RegExp(`\\b${name}\\b`).test(statement))
          || new RegExp(`(function|const|let)\\s+${name}\\b`).test(text) // defined here
        if (used && !imported) missing.push(`${relative(runtime, path)}: ${name}`)
      }
    }
    expect(missing).toEqual([])
  })
})
