/**
 * Every setting that changes how a SMILE project builds, deploys and behaves:
 * what it does, its default, when it is read, and where to change it.
 *
 * Plain data with no imports, so the dev tools' build settings page (via its
 * dev-server route) and a project checker (`pnpm smile:check`, #65) can share
 * it. Keep it in step with core/config.js, utils/utils.js,
 * server/utils/dev-auth.ts, server/utils/db.ts and module.ts.
 *
 * Fields:
 *   key          env var name
 *   group        section id (see GROUPS)
 *   type         bool | enum | int | string | size | url | secret
 *   values       allowed values (enum)
 *   default      what the code does when it is unset (display text)
 *   phase        build: baked in at `nuxt build` (VITE_* are inlined into the
 *                client bundle, so also public) | runtime: read from
 *                process.env on the server per request
 *   change       where to change it (see CHANGE)
 *   configPath   the matching path in the client's api.config, if any
 *   unused       read into api.config, but nothing in SMILE acts on it
 *   description  one or two sentences
 */

export const GROUPS = [
  { id: 'access', title: 'Dev & presentation access' },
  { id: 'database', title: 'Database & participant tokens' },
  { id: 'saving', title: 'Data saving' },
  { id: 'experiment', title: 'Experiment' },
  { id: 'display', title: 'Display & branding' },
  { id: 'recruitment', title: 'Recruitment (SONA)' },
  { id: 'generated', title: 'Generated from git' },
]

/** Where a setting is changed, by kind. */
export const CHANGE = {
  // A VITE_* setting: baked into the build from the tracked files.
  build:
    'Set it in .env (tracked by git, so every deploy uses it). .env.local overrides it on your machine only. '
    + 'Restart the dev server after changing it; deploys pick it up on the next build.',
  // SMILE_DEV_TOOLS: build-time, and usually different per deploy target.
  devTools:
    'Set it in Vercel > Settings > Environment Variables, e.g. include for Preview only, so production builds '
    + 'leave the dev tools out. Setting it in .env applies to every deploy; smile.devTools in nuxt.config.ts is the default '
    + 'when the variable is unset. Read when the project is built.',
  // A non-secret server setting read at runtime.
  runtime:
    'For a deploy, set it in Vercel > Settings > Environment Variables (Production and/or Preview); it takes effect '
    + 'without a rebuild. Locally it only matters for a production build (nuxt build && nuxt preview): use .env.local.',
  // A secret.
  secret:
    'For a deploy, set it in Vercel > Settings > Environment Variables. Locally, put it in .env.local (gitignored), '
    + 'never in .env, which is committed.',
  password:
    'For a deploy, set it in Vercel > Settings > Environment Variables. Store a bcrypt hash rather than the password: '
    + 'run pnpm smile:hash-password. Locally, .env.local only (never .env, which is committed).',
  generated: 'Generated from git by scripts/generate_git_env.sh into .env.git.local on install and on each dev start. Don\'t edit it.',
}

export const SETTINGS = [
  // --- Dev & presentation access -------------------------------------------
  {
    key: 'SMILE_DEV_TOOLS', group: 'access', type: 'enum', values: ['include', 'exclude'],
    default: 'exclude (or smile.devTools in nuxt.config.ts)', phase: 'build', change: 'devTools',
    description: 'Whether a production build ships the developer tools: /dev and its data endpoints. '
      + 'nuxt dev always has them. Also accepts true/false, 1/0, yes/no, on/off.',
  },
  {
    key: 'SMILE_DEV_ACCESS', group: 'access', type: 'enum', values: ['disabled', 'password', 'open'],
    default: 'disabled, or password if SMILE_DEV_PASSWORD is set', phase: 'runtime', change: 'runtime',
    description: 'Who can open /dev on a deployed site. disabled: it 404s. password: needs SMILE_DEV_PASSWORD. '
      + 'open: anyone, including the data endpoints. Has no effect if the build left the dev tools out.',
  },
  {
    key: 'SMILE_DEV_PASSWORD', group: 'access', type: 'secret', default: 'not set', phase: 'runtime', change: 'password',
    description: 'The password for /dev when its access is password. Plaintext or a bcrypt hash.',
  },
  {
    key: 'SMILE_PRESENTATION_ACCESS', group: 'access', type: 'enum', values: ['disabled', 'password', 'open'],
    default: 'disabled, or password if SMILE_PRESENTATION_PASSWORD is set', phase: 'runtime', change: 'runtime',
    description: 'Who can open /presentation on a deployed site: a participant-like walkthrough for showing the study. '
      + 'Presentation mode is always in the build.',
  },
  {
    key: 'SMILE_PRESENTATION_PASSWORD', group: 'access', type: 'secret', default: 'not set', phase: 'runtime', change: 'password',
    description: 'The password for /presentation when its access is password. Plaintext or a bcrypt hash.',
  },
  {
    key: 'SMILE_PUBLIC_PRESENTATION', group: 'access', type: 'bool', default: 'false', phase: 'runtime', change: 'runtime',
    description: 'Legacy: true is the same as SMILE_PRESENTATION_ACCESS=open. Prefer SMILE_PRESENTATION_ACCESS.',
  },

  // --- Database & tokens -----------------------------------------------------
  {
    key: 'TURSO_DATABASE_URL', group: 'database', type: 'url', default: 'file:.data/experiment.db (local SQLite)',
    phase: 'runtime', change: 'runtime',
    description: 'Where participant data is stored. A libsql:// URL is a Turso database; unset is a local SQLite file, '
      + 'which a serverless deploy can\'t keep.',
  },
  {
    key: 'TURSO_AUTH_TOKEN', group: 'database', type: 'secret', default: 'not set', phase: 'runtime', change: 'secret',
    description: 'The access token for the Turso database.',
  },
  {
    key: 'SMILE_AUTH_SECRET', group: 'database', type: 'secret', default: 'TURSO_AUTH_TOKEN, else SMILE_DEV_PASSWORD, else a built-in key',
    phase: 'runtime', change: 'secret',
    description: 'Signs participant and dev session tokens. Without it, rotating the Turso token or dev password logs '
      + 'every participant out mid-study; with none of them, tokens use a key published in the package.',
  },

  // --- Data saving -----------------------------------------------------------
  {
    key: 'VITE_AUTO_SAVE_DATA', group: 'saving', type: 'bool', default: 'true', phase: 'build', change: 'build',
    configPath: 'autoSave',
    description: 'Save participant data automatically as it changes. Only the value false turns it off; then nothing '
      + 'is saved unless the design saves explicitly.',
  },
  {
    key: 'VITE_MAX_WRITES', group: 'saving', type: 'int', default: '1000', phase: 'build', change: 'build',
    configPath: 'maxWrites',
    description: 'Saves allowed per page load. After this many, saves stop.',
  },
  {
    key: 'VITE_MIN_WRITE_INTERVAL', group: 'saving', type: 'int', default: '2000', phase: 'build', change: 'build',
    configPath: 'minWriteInterval',
    description: 'Milliseconds between saves. A save sooner than this is delayed, not dropped.',
  },
  {
    key: 'VITE_MAX_STEPS', group: 'saving', type: 'int', default: '5000', phase: 'build', change: 'build',
    configPath: 'maxSteps',
    description: 'The most rows a stepper (trial) table may have.',
  },

  // --- Experiment ------------------------------------------------------------
  {
    key: 'VITE_ALLOW_REPEATS', group: 'experiment', type: 'bool', default: 'false', phase: 'build', change: 'build',
    configPath: 'allowRepeats',
    description: 'Let someone who already finished take the study again from the same browser.',
  },
  {
    key: 'VITE_RANDOM_SEED', group: 'experiment', type: 'string', default: 'not set (a new seed per participant)',
    phase: 'build', change: 'build', configPath: 'randomSeed',
    unused: true, description: 'A fixed seed for the random number generator. Read into api.config.randomSeed, but SMILE '
      + 'seeds each participant itself; use api.randomSeed() in the design to fix a seed.',
  },
  {
    key: 'VITE_UNPAID_STUDY', group: 'experiment', type: 'bool', default: 'false', phase: 'build', change: 'build',
    configPath: 'unpaidStudy',
    unused: true, description: 'Marks the study as unpaid. Read into api.config.unpaidStudy for your own views.',
  },
  {
    key: 'VITE_DEPLOY_URL', group: 'experiment', type: 'url', default: 'not set', phase: 'build', change: 'build',
    configPath: 'deployURL',
    description: 'The study\'s public URL, used for the recruitment links and QR code in the dev tools.',
  },
  {
    key: 'VITE_CODE_NAME_DEPLOY_URL', group: 'experiment', type: 'url', default: 'not set', phase: 'build', change: 'build',
    configPath: 'codeNameURL',
    unused: true, description: 'The code-name URL of the deploy (<codename>.vercel.app). Read into api.config.codeNameURL.',
  },
  {
    key: 'VITE_GOOGLE_ANALYTICS', group: 'experiment', type: 'string', default: 'not set', phase: 'build', change: 'build',
    configPath: 'googleAnalyticsID',
    unused: true, description: 'A Google Analytics ID (G-…). Read into api.config.googleAnalyticsID; SMILE doesn\'t load analytics itself.',
  },

  // --- Display & branding ----------------------------------------------------
  {
    key: 'VITE_COLOR_MODE', group: 'display', type: 'enum', values: ['light', 'dark', 'system', 'auto'],
    default: 'light', phase: 'build', change: 'build', configPath: 'colorMode',
    description: 'The participant view\'s color mode. system (or auto) follows the participant\'s OS setting.',
  },
  {
    key: 'VITE_RESPONSIVE_UI', group: 'display', type: 'bool', default: 'false', phase: 'build', change: 'build',
    configPath: 'responsiveUI',
    description: 'Let the built-in views\' layout adapt to small screens.',
  },
  {
    key: 'VITE_WINDOWSIZER_REQUEST', group: 'display', type: 'size', default: 'not set (no minimum)', phase: 'build',
    change: 'build', configPath: 'windowsizerRequest',
    description: 'The minimum window size participants are asked for, as WIDTHxHEIGHT (e.g. 800x600).',
  },
  {
    key: 'VITE_WINDOWSIZER_AGGRESSIVE', group: 'display', type: 'bool', default: 'false', phase: 'build', change: 'build',
    configPath: 'windowsizerAggressive',
    description: 'After the window-size check, cover the study whenever the window gets smaller than the requested size.',
  },
  {
    key: 'VITE_ANONYMOUS_MODE', group: 'display', type: 'bool', default: 'false', phase: 'build', change: 'build',
    configPath: 'anonymousMode',
    description: 'Hide lab branding (e.g. for blind review).',
  },
  {
    key: 'VITE_LAB_URL', group: 'display', type: 'url', default: 'not set', phase: 'build', change: 'build',
    configPath: 'labURL', description: 'The lab\'s website, linked from the study.',
  },
  {
    key: 'VITE_BRAND_LOGO_FN', group: 'display', type: 'string', default: 'not set', phase: 'build', change: 'build',
    configPath: 'brandLogoFn', description: 'The logo file in public/ shown in the study\'s header.',
  },

  // --- Recruitment -----------------------------------------------------------
  ...[['', 'credit'], ['PAID_', 'paid']].flatMap(([p, label]) => [
    {
      key: `VITE_SONA_${p}URL`, group: 'recruitment', type: 'url', default: 'not set', phase: 'build', change: 'build',
      description: `Your SONA site (${label} studies), for the completion link.`,
    },
    {
      key: `VITE_SONA_${p}EXPERIMENT_ID`, group: 'recruitment', type: 'string', default: 'not set', phase: 'build',
      change: 'build', description: `The SONA experiment id (${label} studies).`,
    },
    {
      key: `VITE_SONA_${p}CREDIT_TOKEN`, group: 'recruitment', type: 'string', default: 'not set', phase: 'build',
      change: 'build',
      description: `The SONA credit token (${label} studies). It is part of the completion URL, so it is in the public bundle by design.`,
    },
  ]),

  // --- Generated -------------------------------------------------------------
  ...[
    ['VITE_PROJECT_NAME', 'The project name (from the git remote, else the folder).'],
    ['VITE_GIT_OWNER', 'The GitHub owner.'],
    ['VITE_GIT_REPO_NAME', 'The repository name.'],
    ['VITE_GIT_BRANCH_NAME', 'The branch; a branch is an experiment.'],
    ['VITE_GIT_HASH', 'The short commit hash.'],
    ['VITE_GIT_LAST_MSG', 'The last commit message.'],
    ['VITE_DEPLOY_BASE_PATH', '/owner/repo/branch/.'],
    ['VITE_PROJECT_REF', 'owner-repo-branch: the key the database files data under.'],
    ['VITE_CODE_NAME', 'The deterministic code name of owner/repo/branch.'],
  ].map(([key, description]) => ({
    key, group: 'generated', type: 'string', default: 'from git', phase: 'build', change: 'generated', generated: true, description,
  })),
]

export const SETTINGS_BY_KEY = Object.fromEntries(SETTINGS.map(s => [s.key, s]))

/** Keys whose value must never leave the server. */
export const SECRET_KEYS = SETTINGS.filter(s => s.type === 'secret').map(s => s.key)
