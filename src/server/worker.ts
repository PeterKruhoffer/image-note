import { getAgentByName } from "agents";
import { noteIdSchema } from "../notes";
import { ChatAgent } from "./chat-agent";
import { NotesStore, parseNotesListInput } from "./notes-store";
import { anonymousCookie, anonymousSubject } from "./session";

export { ChatAgent, NotesStore };

function apiError(status: number, error: string) {
  return Response.json({ error }, { status });
}

function parseNoteId(segment: string) {
  try {
    return noteIdSchema.safeParse(decodeURIComponent(segment));
  } catch {
    return noteIdSchema.safeParse(null);
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/session" && request.method === "POST") {
      const existingSubject = anonymousSubject(request);
      if (existingSubject) return Response.json({ ready: true });

      const id = crypto.randomUUID();
      return Response.json(
        { ready: true },
        { headers: { "set-cookie": anonymousCookie(id, request) } }
      );
    }

    const subject = anonymousSubject(request);
    if (url.pathname === "/chat" || url.pathname.startsWith("/chat/")) {
      if (!subject) return new Response("Unauthorized", { status: 401 });
      const agent = await getAgentByName(env.ChatAgent, subject);
      return agent.fetch(request);
    }

    if (url.pathname === "/api/notes" && request.method === "GET") {
      if (!subject) return apiError(401, "Unauthorized");
      const listInput = parseNotesListInput(url.searchParams);
      if (!listInput) return apiError(400, "Invalid pagination parameters");

      const notes = env.NotesStore.getByName(subject);
      return Response.json(await notes.list(listInput));
    }

    const noteMatch = url.pathname.match(/^\/api\/notes\/([^/]+)$/);
    if (
      noteMatch &&
      (request.method === "GET" || request.method === "DELETE")
    ) {
      if (!subject) return apiError(401, "Unauthorized");
      const id = parseNoteId(noteMatch[1]);
      if (!id.success) return apiError(400, "Invalid note ID");

      const notes = env.NotesStore.getByName(subject);
      if (request.method === "GET") {
        const note = await notes.get(id.data);
        return note ? Response.json({ note }) : apiError(404, "Note not found");
      }
      const deleted = await notes.delete(id.data);
      return deleted
        ? new Response(null, { status: 204 })
        : apiError(404, "Note not found");
    }

    if (url.pathname === "/oauth/callback") {
      if (!subject) return new Response("Unauthorized", { status: 401 });
      const agent = await getAgentByName(env.ChatAgent, subject);
      return agent.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
