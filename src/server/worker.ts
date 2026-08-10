import { imageAnalysisRequestSchema } from "../image-analysis";
import { noteIdSchema } from "../notes";
import { NotesStore, parseNotesListInput } from "./notes-store";
import { authenticatedSubject } from "./auth";
import { analyzeImage } from "./image-analysis";

export { NotesStore };

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
    const subject = await authenticatedSubject(request, env);

    if (url.pathname === "/api/analyze" && request.method === "POST") {
      if (!subject) return apiError(401, "Unauthorized");
      const image = imageAnalysisRequestSchema.safeParse(
        await request.json().catch(() => null)
      );
      if (!image.success) return apiError(400, "Invalid image payload");

      try {
        return Response.json(await analyzeImage(env.AI, image.data));
      } catch (cause) {
        console.error("Image analysis failed:", cause);
        return apiError(502, "Image analysis failed");
      }
    }

    if (url.pathname === "/api/notes") {
      if (!subject) return apiError(401, "Unauthorized");
      const notes = env.NotesStore.getByName(subject);
      if (request.method === "GET") {
        const listInput = parseNotesListInput(url.searchParams);
        if (!listInput) return apiError(400, "Invalid pagination parameters");
        return Response.json(await notes.list(listInput));
      }
      if (request.method === "POST") {
        try {
          const note = await notes.save(await request.json().catch(() => null));
          return Response.json({ note }, { status: 201 });
        } catch {
          return apiError(400, "Invalid note");
        }
      }
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

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
