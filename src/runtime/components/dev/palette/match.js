/**
 * Matching for the `:` command palette: what you've typed against command
 * names (and their aliases) and view names.
 *
 * Ranking, best first: an exact match, then a prefix, then a substring, then
 * a fuzzy match (the letters in order, with gaps). Ties keep the list's own
 * order, so `:d` picks `dev` (modes come first) over `db` or `dark`.
 */

const EXACT = 3000
const PREFIX = 2000
const SUBSTRING = 1000
const FUZZY = 0

/**
 * Score one text against a query.
 * @param {string} query - what's typed (case is ignored)
 * @param {string} text - a name to match
 * @returns {{ score: number, indices: number[] } | null} null if it doesn't
 *   match; indices are the matched letters in text, for bolding
 */
export function scoreText(query, text) {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (!q) return { score: 0, indices: [] }
  const range = (from, n) => Array.from({ length: n }, (_, i) => from + i)

  if (t === q) return { score: EXACT, indices: range(0, q.length) }
  if (t.startsWith(q)) return { score: PREFIX, indices: range(0, q.length) }
  const at = t.indexOf(q)
  if (at >= 0) return { score: SUBSTRING - at, indices: range(at, q.length) }

  // Fuzzy: each letter in order. Fewer gaps and earlier letters score higher;
  // a letter at the start of a word (after - _ space or a case change) gets a bonus.
  const indices = []
  let from = 0
  let score = FUZZY + 500
  for (const ch of q) {
    const i = t.indexOf(ch, from)
    if (i < 0) return null
    if (indices.length && i !== indices.at(-1) + 1) score -= 10 + (i - indices.at(-1))
    if (i === 0 || /[-_\s/]/.test(t[i - 1]) || (text[i] !== t[i] && text[i - 1] === t[i - 1])) score += 5
    indices.push(i)
    from = i + 1
  }
  return { score: score - indices[0], indices }
}

/**
 * Match a query against a list of items, best first.
 * @param {string} query
 * @param {object[]} items
 * @param {(item: object) => string[]} keys - the names to try for an item;
 *   the first is the one shown, the rest are aliases
 * @returns {{ item: object, score: number, indices: number[], alias: string|null }[]}
 *   indices bold letters of the shown name; alias is set when only an alias matched
 */
export function matchItems(query, items, keys) {
  const results = []
  items.forEach((item, order) => {
    const [name, ...aliases] = keys(item)
    let best = null
    const onName = scoreText(query, name)
    if (onName) best = { score: onName.score, indices: onName.indices, alias: null }
    for (const alias of aliases) {
      const m = scoreText(query, alias)
      // an alias must beat the name clearly, and loses ties to it
      if (m && (!best || m.score > best.score)) best = { score: m.score - 1, indices: [], alias }
    }
    if (best) results.push({ item, order, ...best })
  })
  results.sort((a, b) => b.score - a.score || a.order - b.order)
  return results.map(r => ({ item: r.item, score: r.score, indices: r.indices, alias: r.alias }))
}

/**
 * Split what's typed into a command word and its argument: "go  welcome " ->
 * { head: 'go', arg: 'welcome', spaced: true }. spaced: a space follows the
 * command word (so `go ` lists views).
 */
export function parseInput(text) {
  const trimmed = text.trimStart()
  const space = trimmed.search(/\s/)
  if (space < 0) return { head: trimmed, arg: '', spaced: false }
  return { head: trimmed.slice(0, space), arg: trimmed.slice(space).trim(), spaced: true }
}

/**
 * Split a name into runs for display, bolding the matched letters:
 * ('dev', [0]) -> [{ text: 'd', hit: true }, { text: 'ev', hit: false }]
 */
export function highlight(text, indices = []) {
  const hits = new Set(indices)
  const runs = []
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(i)
    if (runs.length && runs.at(-1).hit === hit) runs.at(-1).text += text[i]
    else runs.push({ text: text[i], hit })
  }
  return runs
}
