#!/usr/bin/env node
const codenamize = require('@codenamize/codenamize')

const args = process.argv.slice(2)
const codename = codenamize({
  seed: args[0],
  particles: ['noun', 'adjective', 'noun'],
})
console.log(codename)
