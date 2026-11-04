/**
 * The example components import SMILE's components from the module source
 * (`@/runtime/...`), since the docs site isn't a Nuxt app. A project gets those
 * components auto-imported, so the code shown to readers (ComponentViewer) and
 * shipped to agents (scripts/build-agent-docs.mjs) leaves those imports out,
 * along with any <script setup> block that's then empty.
 * @param {string} code - an example component's source
 * @returns {string} the source as a project would write it
 */
export function forReaders(code) {
  return code
    .replace(/^import .* from '@\/runtime\/[^']*'\n/gm, '')
    .replace(/<script setup>\s*<\/script>\n*/g, '')
}
