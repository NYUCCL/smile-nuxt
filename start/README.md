# My SMILE Experiment

Built with [@nyuccl/smile](https://github.com/nyuccl/smile-nuxt) — a Nuxt module for online behavioral research.

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy env template and fill in your secrets
cp .env.example .env.local

# Start developing
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see your experiment.

## Project Structure

```
├── design.js              # Experiment timeline (page sequence)
├── components/            # Your custom views and components
│   ├── MyTaskView.vue     # Your experiment task (edit this!)
│   └── InformedConsentText.vue
├── public/                # Static assets (images, stimuli)
├── .env                   # Tracked config defaults
├── .env.local             # Your secrets (gitignored)
└── nuxt.config.ts         # Nuxt configuration
```

## Key Files

- **`design.js`** — Defines the experiment flow. Add/remove/reorder pages here.
- **`components/MyTaskView.vue`** — Your custom task. This is where your experiment logic goes.
- **`components/InformedConsentText.vue`** — Edit your IRB consent text here.
- **`.env`** — Default settings (UI, branding, behavior). Safe to commit.
- **`.env.local`** — Secrets (database, passwords). Never committed.

## Development

```bash
pnpm dev                    # Start dev server (http://localhost:3000)
```

Three modes are available in a single build:
- `http://localhost:3000/` — Production experiment flow
- `http://localhost:3000/dev/` — Dev mode with sidebar + console
- `http://localhost:3000/presentation/` — Presentation mode with nav bar

## Deployment

This template includes a GitHub Action (`.github/workflows/deploy.yml`) that auto-deploys to Vercel on every push to `main`. The deploy URL uses your experiment's SMILE codename (e.g. `tiger-brave-castle.vercel.app`).

### Setup

1. Create a [Vercel account](https://vercel.com) and a new project
2. Get your [Vercel token](https://vercel.com/account/tokens), org ID, and project ID
3. Add these as GitHub repo secrets (`Settings > Secrets and variables > Actions`):
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
4. Add your database secrets in the Vercel dashboard (`Settings > Environment Variables`):
   - `TURSO_DATABASE_URL` — your Turso database URL
   - `TURSO_AUTH_TOKEN` — your Turso auth token
   - `SMILE_DEV_PASSWORD` — password for `/dev` and `/presentation` modes

Push to `main` and your experiment will be live.

### Local preview

```bash
pnpm build                  # Build for production
pnpm preview                # Preview production build locally
```

## Testing

This template includes example E2E tests using [Playwright](https://playwright.dev) that verify your experiment flow works end-to-end, including database persistence.

```bash
# Install Playwright browsers (first time only)
npx playwright install chromium

# Run E2E tests (starts dev server automatically)
pnpm test:e2e

# Run with interactive UI
pnpm test:e2e:ui
```

Tests are in `test/e2e/`. The included `experiment.spec.ts` covers:
- Welcome page renders
- Navigation through consent and demographics
- Guards block skipping ahead
- Participant record is created in the database on consent
- Route history is recorded
- State persists across page refresh

Add your own tests as you build your experiment — test your custom task interactions, verify data recording, and catch regressions before deploying.

## Documentation

See the [SMILE documentation](https://github.com/nyuccl/smile-nuxt/tree/main/docs) for the full API reference, built-in components, and deployment guides.
