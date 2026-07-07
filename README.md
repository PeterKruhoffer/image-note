# Image Mind

Image Mind turns screenshots into concise saved notes. Attach, paste, or drop an
image in chat; the vision model returns exactly three validated candidates and
the user chooses which one to keep.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Before deploying, run:

```bash
npm run check
npm run deploy
```

## Architecture

- `src/server/worker.ts` is the Worker entrypoint and owns request routing.
- `src/server/chat-agent.ts` handles chat, MCP connections, and Workers AI.
- `src/server/notes-store.ts` stores paginated notes in a SQLite-backed Durable
  Object.
- `src/server/worker.ts` owns authenticated routing and API responses.
- `src/server/session.ts` owns the temporary anonymous-session boundary.
- `src/notes.ts` contains shared Zod schemas and TypeScript types.

The original screenshot is kept in chat history but is not copied into a saved
note row.

## Authentication boundary

This project currently uses an anonymous UUID in an HttpOnly, SameSite cookie.
The Worker maps that subject to both the user's `ChatAgent` and `NotesStore`.
This is suitable for local development, not production authentication: there is
no account recovery, cross-device identity, or cryptographic cookie signature.

Before production deployment, replace the anonymous session with a verified
authentication subject and add an abuse-control policy in front of Workers AI.

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
