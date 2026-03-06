module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: ['plugin:vue/essential', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['vue', 'import'],
  settings: {
    'import/resolver': {
      alias: {
        map: [
          ['@', './src'], // default @ -> ./src alias in Vue, it exists even if vue.config.js is not present
          /*
           *... add your own webpack aliases if you have them in vue.config.js/other webpack config file
           * if you forget to add them, eslint-plugin-import will not throw linting error in .vue imports that contain the webpack alias you forgot to add
           */
        ],
        extensions: ['.vue', '.json', '.js'],
      },
    },
  },
  rules: {
    'no-unused-vars': 'off',
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        js: 'never',
        vue: 'always',
      },
    ],
    'vue/no-multiple-template-root': 'off',
  },
}
