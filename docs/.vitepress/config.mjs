import footnote from 'markdown-it-footnote'
import Mark from 'markdown-it-mark'
import { sub } from '@mdit/plugin-sub'
import { defineConfig } from 'vitepress'
import { sidebar } from './sidebar.mjs'
import { darkFiguresMarkdown, darkFiguresVite, writeDarkFigures } from './darkFigures.mjs'
import { version } from '../../package.json'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import IconsResolver from 'unplugin-icons/resolver'
import path from 'path'
import { fileURLToPath } from 'node:url'
import fs from 'fs'
const nodeVersion = fs.readFileSync(new URL('../../.node_version', import.meta.url), 'utf-8').trim()
const resolve = (dir) => (dir ? path.resolve(__dirname, '../', dir) : __dirname)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function movePlugin(plugins, pluginAName, order, pluginBName) {
  const pluginBIndex = plugins.findIndex((p) => p.name === pluginBName)
  if (pluginBIndex === -1) return

  const pluginAIndex = plugins.findIndex((p) => p.name === pluginAName)
  if (pluginAIndex === -1) return

  if (order === 'before' && pluginAIndex > pluginBIndex) {
    const pluginA = plugins.splice(pluginAIndex, 1)[0]
    plugins.splice(pluginBIndex, 0, pluginA)
  }

  if (order === 'after' && pluginAIndex < pluginBIndex) {
    const pluginA = plugins.splice(pluginAIndex, 1)[0]
    plugins.splice(pluginBIndex, 0, pluginA)
  }
}

export default defineConfig({
  lang: 'en-US',
  title: 'Smile',
  description: 'a gureckislab joint.',
  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],
  lastUpdated: true,
  markdown: {
    toc: {
      listType: 'ol',
    },
    config: (md) => {
      md.use(sub)
      md.use(footnote)
      md.use(Mark)
      // Each diagram twice, light and dark (darkFigures.mjs)
      md.use(darkFiguresMarkdown)
    },
  },
  // The dark copies of the diagrams are derived, not committed: write them into the build
  buildEnd(siteConfig) {
    console.log(`dark figures: wrote ${writeDarkFigures(siteConfig.outDir)} dark SVG copies`)
  },
  vite: {
    plugins: [
      darkFiguresVite(),
      tailwindcss(),
      Components({
        dirs: [resolve('.vitepress/theme/components')],
        include: [/\.vue$/, /\.vue\?vue/, /\.md$/],
        resolvers: [IconsResolver({ prefix: 'i' })],
      }),
      Icons({
        compiler: 'vue3',
        autoInstall: true,
      }),
      {
        name: 'vp-plugin-order-fix',
        configResolved(c) {
          movePlugin(c.plugins, 'tailwindcss:scan', 'after', 'vitepress')
          movePlugin(c.plugins, 'unplugin-icons', 'after', 'tailwindcss:scan')
          movePlugin(c.plugins, 'unplugin-vue-components', 'after', 'unplugin-icons')
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '../../src'),
      },
    },
  },
  themeConfig: {
    nodeVersion: nodeVersion,
    outline: {
      level: 'deep',
    },
    search: {
      provider: 'local',
    },
    editLink: {
      pattern: 'https://github.com/NYUCCL/smile-nuxt/edit/main/docs/:path',
      text: 'Suggest changes to this page on GitHub',
    },
    nav: [
      { text: 'gureckislab.org', link: 'https://gureckislab.org' },
      {
        text: `v${version}`,
        items: [{ text: 'Release Notes', link: 'https://github.com/NYUCCL/smile-nuxt/releases' }],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/NYUCCL/smile-nuxt' },
      { icon: 'twitter', link: 'https://twitter.com/todd_gureckis' },
      {
        icon: 'youtube',
        link: 'https://youtube.com/playlist?list=PLZmnZklqQaZxiGff7pq9dDU4ifoHcVL9w&si=EgbHNiw7K5gD2Ipx',
      },
    ],
    sidebar,
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2022-present Todd Gureckis',
    },
  },
})
