/**
 * Parse an env file the way dotenv does (Vite and Nuxt both use dotenv), so
 * the build settings page reports the values the build actually sees:
 * `[export] KEY = value` or `KEY: value`, # comments, '…' "…" `…` quotes
 * (which may span lines; \n and \r expand in double quotes only), last
 * assignment wins. Variable expansion (${VAR}) is not done.
 */
const KEY = /^[\w.-]+$/

export function parseEnv(src: string): Record<string, string> {
  const text = src.replace(/\r\n?/g, '\n')
  const out: Record<string, string> = {}
  let i = 0

  while (i < text.length) {
    let end = text.indexOf('\n', i)
    if (end === -1) end = text.length
    let line = text.slice(i, end).trimStart()
    let next = end + 1

    if (line.startsWith('export ')) line = line.slice(7).trimStart()
    const eq = line.indexOf('=')
    const colon = line.search(/:\s/)
    const sep = eq !== -1 && (colon === -1 || eq < colon) ? eq : colon
    const key = sep > 0 ? line.slice(0, sep).trim() : ''

    if (key && KEY.test(key) && !line.startsWith('#')) {
      let rest = line.slice(sep + 1).trimStart()
      const quote = rest[0]
      let value: string | undefined

      if (quote === '"' || quote === '\'' || quote === '`') {
        // Closing quote on this line, or a later one (multi-line value)
        const startInText = end - rest.length
        const close = text.indexOf(quote, startInText + 1)
        if (close !== -1) {
          const lineEnd = text.indexOf('\n', close)
          const after = text.slice(close + 1, lineEnd === -1 ? text.length : lineEnd)
          if (/^\s*(?:#.*)?$/.test(after)) {
            value = text.slice(startInText + 1, close)
            next = lineEnd === -1 ? text.length : lineEnd + 1
          }
        }
        if (value !== undefined && quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r')
      }

      if (value === undefined) {
        const hash = rest.indexOf('#')
        if (hash !== -1) rest = rest.slice(0, hash)
        value = rest.trim()
      }
      out[key] = value
    }
    i = next
  }
  return out
}
