import { getAgentByName } from "agents";
import { chatIdSchema, chatTitleSchema } from "../chats";
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

function parseChatId(segment: string) {
  try {
    return chatIdSchema.safeParse(decodeURIComponent(segment));
  } catch {
    return chatIdSchema.safeParse(null);
  }
}

function chatAgentName(subject: string, chatId: string) {
  return chatId === "legacy" ? subject : `${subject}|${chatId}`;
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
    const chatConnectionMatch = url.pathname.match(
      /^\/chat\/([^/]+)(?:\/.*)?$/
    );
    if (chatConnectionMatch) {
      if (!subject) return new Response("Unauthorized", { status: 401 });
      const chatId = parseChatId(chatConnectionMatch[1]);
      if (!chatId.success) return apiError(400, "Invalid chat ID");
      const chats = env.NotesStore.getByName(subject);
      if (!(await chats.hasChat(chatId.data))) {
        return apiError(404, "Chat not found");
      }
      const agent = await getAgentByName(
        env.ChatAgent,
        chatAgentName(subject, chatId.data)
      );
      return agent.fetch(request);
    }

    if (url.pathname === "/api/chats" && request.method === "GET") {
      if (!subject) return apiError(401, "Unauthorized");
      const chats = env.NotesStore.getByName(subject);
      return Response.json({ chats: await chats.listChats() });
    }

    if (url.pathname === "/api/chats" && request.method === "POST") {
      if (!subject) return apiError(401, "Unauthorized");
      const chats = env.NotesStore.getByName(subject);
      return Response.json({ chat: await chats.createChat() }, { status: 201 });
    }

    const chatApiMatch = url.pathname.match(/^\/api\/chats\/([^/]+)$/);
    if (chatApiMatch && request.method === "DELETE") {
      if (!subject) return apiError(401, "Unauthorized");
      const chatId = parseChatId(chatApiMatch[1]);
      if (!chatId.success) return apiError(400, "Invalid chat ID");

      const chats = env.NotesStore.getByName(subject);
      if (!(await chats.hasChat(chatId.data))) {
        return apiError(404, "Chat not found");
      }

      const agent = await getAgentByName(
        env.ChatAgent,
        chatAgentName(subject, chatId.data)
      );
      await agent.scheduleDeletion();

      const result = await chats.deleteChat(chatId.data);
      if (!result.deleted) return apiError(404, "Chat not found");
      return Response.json({ replacement: result.replacement });
    }

    if (chatApiMatch && request.method === "PATCH") {
      if (!subject) return apiError(401, "Unauthorized");
      const chatId = parseChatId(chatApiMatch[1]);
      if (!chatId.success) return apiError(400, "Invalid chat ID");

      const payload = await request.json().catch(() => null);
      const title = chatTitleSchema.safeParse(
        payload && typeof payload === "object" && "title" in payload
          ? payload.title
          : null
      );
      if (!title.success) return apiError(400, "Invalid chat title");

      const chats = env.NotesStore.getByName(subject);
      const chat = await chats.touchChat(chatId.data, title.data);
      return chat ? Response.json({ chat }) : apiError(404, "Chat not found");
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

    const oauthMatch = url.pathname.match(/^\/oauth\/callback(?:\/([^/]+))?$/);
    if (oauthMatch) {
      if (!subject) return new Response("Unauthorized", { status: 401 });
      const chatId = parseChatId(oauthMatch[1] ?? "legacy");
      if (!chatId.success) return apiError(400, "Invalid chat ID");
      const chats = env.NotesStore.getByName(subject);
      if (!(await chats.hasChat(chatId.data))) {
        return apiError(404, "Chat not found");
      }
      const agent = await getAgentByName(
        env.ChatAgent,
        chatAgentName(subject, chatId.data)
      );
      return agent.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
