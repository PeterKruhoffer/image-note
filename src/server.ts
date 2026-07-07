import { createWorkersAI } from "workers-ai-provider";
import { DurableObject } from "cloudflare:workers";
import { callable, getAgentByName, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool
} from "ai";
import { z } from "zod";
import {
  noteCandidateSchema,
  noteCandidatesOutputSchema,
  savedNoteSchema,
  type NoteCandidate,
  type SavedNote
} from "./notes";

const ANONYMOUS_ID_COOKIE = "image_mind_anonymous_id";

function readCookie(request: Request, name: string) {
  const prefix = `${name}=`;
  for (const cookie of (request.headers.get("cookie") ?? "").split(";")) {
    const value = cookie.trim();
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return null;
}

function anonymousSubject(request: Request) {
  const id = readCookie(request, ANONYMOUS_ID_COOKIE);
  return id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
    ? `anonymous:${id}`
    : null;
}

function anonymousCookie(id: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ANONYMOUS_ID_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
}

type NoteRow = {
  id: string;
  kind: NoteCandidate["kind"];
  title: string;
  author: string | null;
  content: string;
  summary: string;
  source_url: string | null;
  published_at: string | null;
  topics_json: string;
  confidence: number;
  created_at: string;
};

function rowToNote(row: NoteRow): SavedNote {
  return savedNoteSchema.parse({
    id: row.id,
    kind: row.kind,
    title: row.title,
    author: row.author,
    content: row.content,
    summary: row.summary,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    topics: JSON.parse(row.topics_json) as string[],
    confidence: row.confidence,
    createdAt: row.created_at
  });
}

export class NotesStore extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS saved_notes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT,
        content TEXT NOT NULL,
        summary TEXT NOT NULL,
        source_url TEXT,
        published_at TEXT,
        topics_json TEXT NOT NULL,
        confidence REAL NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS saved_notes_created_at ON saved_notes(created_at DESC)"
    );
  }

  save(input: NoteCandidate): SavedNote {
    const candidate = noteCandidateSchema.parse(input);
    const note: SavedNote = {
      ...candidate,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO saved_notes (
        id, kind, title, author, content, summary, source_url, published_at,
        topics_json, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      note.id,
      note.kind,
      note.title,
      note.author,
      note.content,
      note.summary,
      note.sourceUrl,
      note.publishedAt,
      JSON.stringify(note.topics),
      note.confidence,
      note.createdAt
    );
    return note;
  }

  list(): SavedNote[] {
    return this.ctx.storage.sql
      .exec<NoteRow>("SELECT * FROM saved_notes ORDER BY created_at DESC")
      .toArray()
      .map(rowToNote);
  }

  get(id: string): SavedNote | null {
    const rows = this.ctx.storage.sql
      .exec<NoteRow>("SELECT * FROM saved_notes WHERE id = ? LIMIT 1", id)
      .toArray();
    return rows[0] ? rowToNote(rows[0]) : null;
  }

  delete(id: string): boolean {
    const exists = this.get(id) !== null;
    if (exists) {
      this.ctx.storage.sql.exec("DELETE FROM saved_notes WHERE id = ?", id);
    }
    return exists;
  }
}

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;
  chatRecovery = true;

  onStart() {
    // Configure OAuth popup behavior for MCP servers that require authentication
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url, {
      callbackPath: "/oauth/callback"
    });
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  @callable()
  async saveNote(input: NoteCandidate) {
    const candidate = noteCandidateSchema.parse(input);
    const notes = this.env.NotesStore.getByName(this.name);
    return await notes.save(candidate);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });

    const latestMessage = this.messages.at(-1);
    const hasImage =
      latestMessage?.role === "user" &&
      latestMessage.parts.some(
        (part) =>
          part.type === "file" &&
          typeof part.mediaType === "string" &&
          part.mediaType.startsWith("image/")
      );

    const result = streamText({
      model: workersai("@cf/moonshotai/kimi-k2.6", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are a helpful assistant that can understand images.
You can check the weather, get the user's timezone, run calculations, and schedule tasks.
When the latest user message contains an image, treat it as a screenshot to turn into a saved-note candidate set. Analyze only visible evidence and call createNoteCandidates exactly once with exactly three useful alternative note objects. The three candidates must use the same schema and must be notes, never images.

Keep every candidate brief and to the point. Extract the screenshot's single core idea or actionable tip instead of expanding it into an essay. Titles should be about 3 to 8 words, content should be 1 or 2 short sentences, summaries should be one short sentence, and topics should contain only 1 to 5 specific tags. The candidates may use different concise wording or emphasis, but must not add background, implications, community commentary, use cases, or other details that are not central to the screenshot. Preserve visible code and commands exactly. For a tip about scrollbar-gutter: stable, a good core note is: "Use scrollbar-gutter: stable to reserve scrollbar space and avoid layout shifts when the scrollbar disappears."

Use null when author, source URL, or published date is not visible; never invent those values. Do not save any candidate yourself—the user must choose one in the UI.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`,
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        createNoteCandidates: tool({
          description:
            "Return exactly three concise structured note candidates extracted from the attached screenshot. Capture only the core actionable point in 1 or 2 short sentences per candidate, with no essay or added commentary. Never call this without an image in the latest user message.",
          inputSchema: noteCandidatesOutputSchema,
          execute: async (input) => noteCandidatesOutputSchema.parse(input)
        }),

        // Server-side tool: runs automatically on the server
        getWeather: tool({
          description: "Get the current weather for a city",
          inputSchema: z.object({
            city: z.string().describe("City name")
          }),
          execute: async ({ city }) => {
            // Replace with a real weather API in production
            const conditions = ["sunny", "cloudy", "rainy", "snowy"];
            const temp = Math.floor(Math.random() * 30) + 5;
            return {
              city,
              temperature: temp,
              condition:
                conditions[Math.floor(Math.random() * conditions.length)],
              unit: "celsius"
            };
          }
        }),

        // Client-side tool: no execute function — the browser handles it
        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({})
        }),

        // Approval tool: requires user confirmation before executing
        calculate: tool({
          description:
            "Perform a math calculation with two numbers. Requires user approval for large numbers.",
          inputSchema: z.object({
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
            operator: z
              .enum(["+", "-", "*", "/", "%"])
              .describe("Arithmetic operator")
          }),
          needsApproval: async ({ a, b }) =>
            Math.abs(a) > 1000 || Math.abs(b) > 1000,
          execute: async ({ a, b, operator }) => {
            const ops: Record<string, (x: number, y: number) => number> = {
              "+": (x, y) => x + y,
              "-": (x, y) => x - y,
              "*": (x, y) => x * y,
              "/": (x, y) => x / y,
              "%": (x, y) => x % y
            };
            if (operator === "/" && b === 0) {
              return { error: "Division by zero" };
            }
            return {
              expression: `${a} ${operator} ${b}`,
              result: ops[operator](a, b)
            };
          }
        }),

        scheduleTask: tool({
          description:
            "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", description, {
                idempotent: true
              });
              return `Task scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling task: ${error}`;
            }
          }
        }),

        getScheduledTasks: tool({
          description: "List all tasks that have been scheduled",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = await this.listSchedules();
            return tasks.length > 0 ? tasks : "No scheduled tasks found.";
          }
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled task by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel")
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Task ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling task: ${error}`;
            }
          }
        })
      },
      toolChoice: hasImage
        ? { type: "tool", toolName: "createNoteCandidates" }
        : "auto",
      stopWhen: stepCountIs(hasImage ? 1 : 5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history — that would cause the AI to see the notification
    // as new context and potentially loop.
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
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
    if (url.pathname === "/chat") {
      if (!subject) return new Response("Unauthorized", { status: 401 });
      const agent = await getAgentByName(env.ChatAgent, subject);
      return agent.fetch(request);
    }

    if (url.pathname === "/api/notes" && request.method === "GET") {
      if (!subject) return new Response("Unauthorized", { status: 401 });
      const notes = env.NotesStore.getByName(subject);
      return Response.json({ notes: await notes.list() });
    }

    const noteMatch = url.pathname.match(/^\/api\/notes\/([^/]+)$/);
    if (
      noteMatch &&
      (request.method === "GET" || request.method === "DELETE")
    ) {
      if (!subject) return new Response("Unauthorized", { status: 401 });
      const id = decodeURIComponent(noteMatch[1]);
      const notes = env.NotesStore.getByName(subject);
      if (request.method === "GET") {
        const note = await notes.get(id);
        return note
          ? Response.json({ note })
          : new Response("Not found", { status: 404 });
      }
      const deleted = await notes.delete(id);
      return new Response(null, { status: deleted ? 204 : 404 });
    }

    if (url.pathname === "/oauth/callback") {
      if (!subject) return new Response("Unauthorized", { status: 401 });
      const agent = await getAgentByName(env.ChatAgent, subject);
      return agent.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
