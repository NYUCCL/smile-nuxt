# Server-side logic

Most of your experiment runs in the participant's browser. But sometimes
you need code to run on the server instead — to keep an API key secret, to
talk to a database from a place the client can't reach, to call an LLM, or
to do something expensive you don't want sitting in a participant's
browser. This page covers how to add server-side endpoints to a
<SmileText/> experiment.

## When you need a server route

A non-exhaustive list:

- **Calling an LLM or paid API** — you can't put `OPENAI_API_KEY` in the
  client bundle without leaking it. The call has to happen server-side.
- **Calling any external service that requires authentication** — Twilio,
  Stripe, your university's REDCap instance, a private dataset host.
- **Querying a database that isn't your Smile experiment database** — a
  pre-screen results table, a stimulus database, a separate participant
  registry.
- **Heavy or sensitive computation** — anything you'd rather not ship as
  JavaScript (a scoring algorithm you don't want participants to see,
  matchmaking logic, a Monte Carlo simulation).
- **Hiding the shape of a request** — sometimes you want the client to
  send a small opaque payload and have the server fan it out into a
  several-step orchestration.

For ordinary data recording (`recordPageData`, `recordStep`), you don't
need a server route — Smile already handles that. See
[Data Storage](/coding/datastorage).

## Where the code lives

Nuxt scans a `server/api/` folder at your project root and turns each file
into an HTTP endpoint automatically. There's no `server/` folder in the
starter — create one when you need it:

```
my-experiment/
├── components/
├── design.js
├── nuxt.config.ts
├── public/
└── server/
    └── api/
        ├── score.post.ts        →  POST /api/score
        ├── stimuli.get.ts       →  GET  /api/stimuli
        └── llm/
            └── complete.post.ts →  POST /api/llm/complete
```

A few conventions:

- The filename suffix (`.get.ts`, `.post.ts`, `.put.ts`, `.delete.ts`)
  restricts the route to that HTTP method. A file with no suffix accepts
  any method.
- Folder structure becomes URL structure. `server/api/llm/complete.post.ts`
  is served at `POST /api/llm/complete`.
- Square brackets create dynamic segments. `server/api/stimuli/[id].get.ts`
  matches `GET /api/stimuli/cat`, `GET /api/stimuli/dog`, etc.
- Files can be `.ts` or `.js` — TypeScript works without any extra setup
  in a <SmileText/> project.

## A minimal endpoint

```ts
// server/api/hello.get.ts
export default defineEventHandler(() => {
  return { message: 'Hello from the server' }
})
```

That's the entire file. Nuxt auto-imports `defineEventHandler`, so no
import statement is needed (this works the same way the `ref`/`computed`
auto-imports work in `.vue` files). The return value is automatically
serialized to JSON.

Test it from a `.vue` component:

```vue
<script setup>
const { data } = await useFetch('/api/hello')
// data.value === { message: 'Hello from the server' }
</script>
```

Or imperatively:

```js
const result = await $fetch('/api/hello')
```

`$fetch` (also auto-imported) is the right choice from `design.js` or from
inside event handlers; `useFetch` is the right choice in `<script setup>`
where you want SSR-aware reactive state.

## Reading the request

`defineEventHandler` gives you a single `event` argument. Use h3's helpers
to pull data out of it:

```ts
// server/api/score.post.ts
import { defineEventHandler, readBody, getQuery, getHeader } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)        // POST body (JSON)
  const query = getQuery(event)             // ?key=value
  const ua = getHeader(event, 'user-agent') // request header

  return { received: body, query, ua }
})
```

`readBody`, `getQuery`, `getHeader`, `getRouterParam`, `setResponseHeader`,
and friends all come from
[h3](https://h3.dev), the HTTP framework Nuxt uses
under the hood. The full list is in
[the h3 docs](https://h3.dev/utils/request).

## Keeping secrets out of the client

The whole point of server routes for API calls is that the secret never
touches the browser. The standard pattern in Nuxt is to put secrets in
`nuxt.config.ts`'s `runtimeConfig.private` block and read them server-side
with `useRuntimeConfig()`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nyuccl/smile-nuxt'],
  runtimeConfig: {
    // Server-only — never exposed to the client bundle
    openaiApiKey: process.env.OPENAI_API_KEY,
    // Public — gets bundled into the client
    public: {
      experimentName: 'cat-or-dog',
    },
  },
})
```

```ts
// server/api/llm/complete.post.ts
import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const { prompt } = await readBody<{ prompt: string }>(event)

  if (!prompt || prompt.length > 2000) {
    throw createError({
      statusCode: 400,
      statusMessage: 'prompt is required and must be ≤ 2000 chars',
    })
  }

  const res = await $fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    },
  })

  return { reply: res.choices[0].message.content }
})
```

Then store the actual key in `.env.local` (gitignored — see
[Configuring](/coding/configuration)):

```ini
# .env.local
OPENAI_API_KEY=sk-...
```

For deployed experiments, set the same variable in the Vercel dashboard
(Settings → Environment Variables) — never commit it.

## Calling your endpoint from the experiment

From a Smile view component, talking to your endpoint looks like any
other async call:

```vue
<script setup>
const api = useViewAPI()
const response = ref('')

async function ask() {
  const { reply } = await $fetch('/api/llm/complete', {
    method: 'POST',
    body: { prompt: api.persist.userPrompt },
  })
  response.value = reply
  api.recordStep({ prompt: api.persist.userPrompt, reply })
}
</script>

<template>
  <Button @click="ask">Ask the model</Button>
  <p v-if="response">{{ response }}</p>
</template>
```

In dev mode (`pnpm dev`), Nuxt runs both the client and the server
together, so `/api/*` is served from the same `localhost:3000` as your
experiment. In production (Vercel), Nuxt's Vercel preset turns each route
into a serverless function automatically.

## Error handling

Throwing from inside a handler turns into an HTTP error response. Use h3's
`createError` to control the status code and message:

```ts
import { defineEventHandler, createError } from 'h3'

export default defineEventHandler((event) => {
  if (!event.context.auth) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required',
    })
  }
  // ... happy path
})
```

The client's `$fetch` rejects with the matching status, so you can
`try/catch` it in your component.

## Dynamic routes and route params

For a route like `server/api/stimuli/[id].get.ts`:

```ts
import { defineEventHandler, getRouterParam } from 'h3'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  return { id, url: `https://stimuli.example.com/${id}.jpg` }
})
```

Useful when you want a small lookup endpoint that doesn't expose your
backing store directly.

## Things to be aware of

- **Cold starts on serverless.** On Vercel, each route is a serverless
  function. The first call after idle time can take a couple seconds to
  spin up. If your task has strict timing, warm the function during
  instructions or pre-load before participants need it.
- **Function timeouts.** Vercel's default is 10 seconds (longer on Pro).
  Anything longer — long LLM streams, big jobs — needs a streaming
  response or a different deployment target.
- **Don't bypass the experiment's own data writes.** Routes you write
  here are for *outbound* calls (to LLMs, external APIs, etc.). Don't
  rebuild Smile's participant/data storage in your own routes — let
  `recordPageData`/`recordStep` handle that.
- **Avoid leaking server stack traces.** In production Nuxt will hide
  them, but in dev they're visible. If you `console.log` the API key by
  accident, scrub the log before sharing screenshots.

## Further reading

- [Nuxt — Server routes](https://nuxt.com/docs/guide/directory-structure/server)
- [h3 — Utilities](https://h3.dev/utils/request)
- [Runtime config & env](https://nuxt.com/docs/guide/going-further/runtime-config)
- [Data Storage](/coding/datastorage) — Smile's built-in participant data flow
- [Configuring](/coding/configuration) — env var conventions
