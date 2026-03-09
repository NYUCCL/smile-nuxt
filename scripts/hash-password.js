#!/usr/bin/env node

import bcrypt from 'bcryptjs'
import { createInterface } from 'node:readline'

const rl = createInterface({ input: process.stdin, output: process.stdout })

rl.question('Enter dev password: ', async (password) => {
  if (!password) {
    console.error('Error: Password cannot be empty.')
    rl.close()
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 12)
  console.log(`\nAdd this to your .env or .env.local:\nSMILE_DEV_PASSWORD=${hash}`)
  rl.close()
})
