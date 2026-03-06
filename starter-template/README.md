# My SMILE Experiment

Built with [@gureckislab/smile](https://github.com/nyuccl/smile-ui) — a Nuxt module for online behavioral research.

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

```bash
pnpm build                  # Build for production
pnpm preview                # Preview production build locally
```

Configure your database in `.env.local`:
```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
```

## Documentation

See the [SMILE documentation](https://github.com/nyuccl/smile-ui/tree/main/docs) for the full API reference, built-in components, and deployment guides.
