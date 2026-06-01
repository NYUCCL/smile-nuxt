#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import * as p from '@clack/prompts'
import { downloadTemplate } from 'giget'

const TEMPLATE_SOURCE = 'gh:nyuccl/smile-nuxt/start#main'

function detectPackageManager() {
  const ua = process.env.npm_config_user_agent || ''
  if (ua.startsWith('pnpm')) return 'pnpm'
  if (ua.startsWith('yarn')) return 'yarn'
  if (ua.startsWith('bun')) return 'bun'
  return 'npm'
}

function parseArgs(argv) {
  const args = { name: undefined, install: undefined, git: undefined, force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--no-install') args.install = false
    else if (a === '--install') args.install = true
    else if (a === '--no-git') args.git = false
    else if (a === '--git') args.git = true
    else if (a === '--force' || a === '-f') args.force = true
    else if (a === '--help' || a === '-h') args.help = true
    else if (!a.startsWith('-') && !args.name) args.name = a
  }
  return args
}

function printHelp() {
  console.log(`
create-smile-nuxt — Scaffold a new SMILE experiment

Usage:
  pnpm create @nyuccl/smile-nuxt <project-name> [options]

Options:
  --no-install       Skip installing dependencies
  --no-git           Skip initializing a git repository
  --git              Initialize a git repository (skip the prompt)
  --force, -f        Overwrite an existing non-empty directory
  --help, -h         Show this help
`)
}

function hasGit() {
  const result = spawnSync('git', ['--version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })
  return result.status === 0
}

function initGitRepo(cwd) {
  const opts = { cwd, stdio: 'ignore', shell: process.platform === 'win32' }
  if (spawnSync('git', ['init', '-q', '-b', 'main'], opts).status !== 0) return false
  if (spawnSync('git', ['add', '-A'], opts).status !== 0) return false
  return spawnSync(
    'git',
    ['commit', '-q', '--no-gpg-sign', '-m', 'chore: initial commit from create-smile-nuxt'],
    opts
  ).status === 0
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  p.intro('Create a new SMILE experiment')

  let projectName = args.name
  if (!projectName) {
    const answer = await p.text({
      message: 'Project name',
      placeholder: 'my-experiment',
      validate(value) {
        if (!value) return 'Please enter a project name'
        if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value))
          return 'Use letters, numbers, dashes, dots, or underscores; must start with a letter or number'
      },
    })
    if (p.isCancel(answer)) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    projectName = answer
  }

  const targetDir = resolve(process.cwd(), projectName)

  if (existsSync(targetDir) && readdirSync(targetDir).length > 0 && !args.force) {
    const confirm = await p.confirm({
      message: `Directory ${projectName} is not empty. Overwrite?`,
      initialValue: false,
    })
    if (p.isCancel(confirm) || !confirm) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
  }

  const spinner = p.spinner()
  spinner.start(`Downloading template into ${projectName}`)
  try {
    await downloadTemplate(TEMPLATE_SOURCE, {
      dir: targetDir,
      force: true,
      forceClean: args.force,
    })
    spinner.stop('Template downloaded')
  }
  catch (err) {
    spinner.stop('Failed to download template')
    p.cancel(err?.message || String(err))
    process.exit(1)
  }

  const pkgPath = resolve(targetDir, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    pkg.name = projectName
    pkg.private = true
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  }

  const pm = detectPackageManager()

  let shouldInstall = args.install
  if (shouldInstall === undefined) {
    const answer = await p.confirm({
      message: `Install dependencies with ${pm}?`,
      initialValue: true,
    })
    if (p.isCancel(answer)) {
      shouldInstall = false
    }
    else {
      shouldInstall = answer
    }
  }

  if (shouldInstall) {
    const installSpinner = p.spinner()
    installSpinner.start(`Running ${pm} install`)
    const result = spawnSync(pm, ['install'], {
      cwd: targetDir,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    })
    if (result.status === 0) {
      installSpinner.stop('Dependencies installed')
    }
    else {
      installSpinner.stop(`${pm} install failed — you can run it manually`)
    }
  }

  let shouldGit = args.git
  const gitAvailable = hasGit()
  if (shouldGit === undefined && gitAvailable) {
    const answer = await p.confirm({
      message: 'Initialize a git repository?',
      initialValue: true,
    })
    shouldGit = p.isCancel(answer) ? false : answer
  }
  if (shouldGit && !gitAvailable) {
    p.log.warn('git not found on PATH — skipping repo init')
    shouldGit = false
  }

  if (shouldGit) {
    const gitSpinner = p.spinner()
    gitSpinner.start('Initializing git repository')
    if (initGitRepo(targetDir)) {
      gitSpinner.stop('Git repository initialized')
    }
    else {
      gitSpinner.stop('git init failed — you can run it manually')
    }
  }

  const devCmd = pm === 'npm' ? 'npm run dev' : `${pm} dev`
  const installCmd = pm === 'npm' ? 'npm install' : `${pm} install`

  p.outro(`Done. Next steps:

  cd ${projectName}${shouldInstall ? '' : `\n  ${installCmd}`}
  ${devCmd}

Then open http://localhost:3000`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
