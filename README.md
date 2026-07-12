# Image Mind

Image Mind turns screenshots into concise saved notes. Attach, paste, or drop an
image in chat; the vision model returns exactly three validated candidates and
the user chooses which one to keep.

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
- `src/server/chat-agent.ts` handles chat, MCP connections, and Workers AI.
- `src/server/notes-store.ts` stores paginated notes in a SQLite-backed Durable
  Object.
- `src/server/worker.ts` owns authenticated routing and API responses.
- `src/server/auth.ts` verifies Clerk sessions and produces the stable user
  identity used to address Durable Objects.
- `src/notes.ts` contains shared Zod schemas and TypeScript types.

The original screenshot is kept in chat history but is not copied into a saved
note row.

## Authentication boundary

The React app requires a Clerk session before rendering chat or the library.
The Worker independently verifies every API, WebSocket, and MCP OAuth callback
request, then maps the verified Clerk user ID to that user's `NotesStore` and
chat agents. Client-provided user IDs are never trusted.

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
npx wrangler types
```

Relevant documentation:

- [Cloudflare Agents](https://developers.cloudflare.com/agents/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
