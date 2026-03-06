const { defineConfig } = require('cypress')
const { loadEnv } = require('vite')

console.log(`${process.cwd()}/../env/`)
const environ = loadEnv('git', `${process.cwd()}/../env/`, '')
console.log(environ)

module.exports = defineConfig({
  env: environ,
  e2e: {
    baseUrl: environ.VITE_DEPLOY_URL,
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
  component: {
    devServer: {
      framework: 'vue',
      bundler: 'vite',
    },
  },
})
