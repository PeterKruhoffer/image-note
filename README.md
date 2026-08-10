# Image Mind

Image Mind turns screenshots into concise saved notes. Add, paste, or drop a
collection of images on the homepage; the vision model returns three
validated candidates for each image and the user chooses which ones to keep.

## Development

```bash
pnpm install
cp .env.example .env.local
cp .dev.vars.example .dev.vars
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). Before deploying, run:

```bash
pnpm check
pnpm deploy
```

## Architecture

- `src/server/worker.ts` is the Worker entrypoint and owns request routing.
- `src/server/image-analysis.ts` runs authenticated image analysis with Workers
  AI.
- `src/server/notes-store.ts` stores paginated notes in a SQLite-backed Durable
  Object.
- `src/server/auth.ts` verifies Clerk sessions and produces the stable user
  identity used to address Durable Objects.
- `src/notes.ts` contains shared Zod schemas and TypeScript types.

Uploaded screenshots are compressed in the browser before analysis. Images are
not copied into saved note rows.

## Authentication boundary

The React app requires a Clerk session before rendering the homepage or the
library. The Worker independently verifies every API request, then maps the
verified Clerk user ID to that user's `NotesStore`. Client-provided user IDs are
never trusted.

For local development, put the Clerk publishable key in `.env.local` and both
the publishable and secret keys in `.dev.vars`, using the included examples.
Never commit either local file.

Before deploying, expose `VITE_CLERK_PUBLISHABLE_KEY` to the Vite build and add
the Worker credentials with Wrangler:

```bash
pnpm wrangler secret put CLERK_PUBLISHABLE_KEY
pnpm wrangler secret put CLERK_SECRET_KEY
```

Existing notes created under anonymous development sessions are not migrated
to Clerk accounts automatically.

## Cloudflare configuration

Bindings and Durable Object migrations live in `wrangler.jsonc`. After changing
bindings, regenerate the environment types:

```bash
pnpm types
```

Migration `v3` retires the removed `ChatAgent` namespace and permanently
deletes its stored chat history when deployed. Saved notes remain in the
separate `NotesStore` namespace.

Relevant documentation:

- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
