#!/usr/bin/env node

// Generate a bcrypt hash for SMILE_DEV_PASSWORD so you never store the
// dev/presentation password in plaintext. Run with: pnpm smile:hash-password
// then paste the printed line into .env.local (local) or your Vercel project's
// environment variables (deployed). The login handler accepts either a bcrypt
// hash (starts with "$2") or a plaintext value.

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
  console.log(`\nAdd this to your .env.local (or your Vercel env vars):\nSMILE_DEV_PASSWORD=${hash}`)
  rl.close()
})
