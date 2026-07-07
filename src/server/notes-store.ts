import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import {
  noteCandidateSchema,
  noteIdSchema,
  savedNoteSchema,
  type SavedNote
} from "../notes";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const noteCursorSchema = z.object({
  createdAt: z.iso.datetime(),
  id: noteIdSchema
});

const notesListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  cursor: z.string().max(256).optional()
});

type NoteCursor = z.infer<typeof noteCursorSchema>;

export type NotesListInput = {
  limit: number;
  cursor?: NoteCursor;
};

export type NotesPage = {
  notes: SavedNote[];
  nextCursor: string | null;
};

type NoteRow = {
  id: string;
  kind: string;
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

function decodeCursor(value: string): NoteCursor | null {
  try {
    return noteCursorSchema.parse(JSON.parse(atob(value)));
  } catch {
    return null;
  }
}

function encodeCursor(note: SavedNote) {
  return btoa(JSON.stringify({ createdAt: note.createdAt, id: note.id }));
}

export function parseNotesListInput(
  searchParams: URLSearchParams
): NotesListInput | null {
  const query = notesListQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined
  });
  if (!query.success) return null;

  if (!query.data.cursor) return { limit: query.data.limit };
  const cursor = decodeCursor(query.data.cursor);
  return cursor ? { limit: query.data.limit, cursor } : null;
}

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
    topics: JSON.parse(row.topics_json),
    confidence: row.confidence,
    createdAt: row.created_at
  });
}

export class NotesStore extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
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
        "CREATE INDEX IF NOT EXISTS saved_notes_created_at_id ON saved_notes(created_at DESC, id DESC)"
      );
    });
  }

  save(input: unknown): SavedNote {
    const candidate = noteCandidateSchema.parse(input);
    const note = savedNoteSchema.parse({
      ...candidate,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    });
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

  list({ limit, cursor }: NotesListInput): NotesPage {
    const rows = cursor
      ? this.ctx.storage.sql
          .exec<NoteRow>(
            `SELECT * FROM saved_notes
             WHERE created_at < ? OR (created_at = ? AND id < ?)
             ORDER BY created_at DESC, id DESC
             LIMIT ?`,
            cursor.createdAt,
            cursor.createdAt,
            cursor.id,
            limit + 1
          )
          .toArray()
      : this.ctx.storage.sql
          .exec<NoteRow>(
            `SELECT * FROM saved_notes
             ORDER BY created_at DESC, id DESC
             LIMIT ?`,
            limit + 1
          )
          .toArray();

    const hasNextPage = rows.length > limit;
    const notes = rows.slice(0, limit).map(rowToNote);
    return {
      notes,
      nextCursor:
        hasNextPage && notes.length > 0
          ? encodeCursor(notes[notes.length - 1])
          : null
    };
  }

  get(input: unknown): SavedNote | null {
    const id = noteIdSchema.parse(input);
    const rows = this.ctx.storage.sql
      .exec<NoteRow>("SELECT * FROM saved_notes WHERE id = ? LIMIT 1", id)
      .toArray();
    return rows[0] ? rowToNote(rows[0]) : null;
  }

  delete(input: unknown): boolean {
    const id = noteIdSchema.parse(input);
    const cursor = this.ctx.storage.sql.exec(
      "DELETE FROM saved_notes WHERE id = ?",
      id
    );
    return cursor.rowsWritten > 0;
  }
}
