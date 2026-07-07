import { z } from "zod";

export const noteKindSchema = z.enum([
  "tweet",
  "article",
  "social-post",
  "quote",
  "other"
]);

export const noteCandidateSchema = z.object({
  kind: noteKindSchema,
  title: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe("A direct title of roughly 3 to 8 words."),
  author: z.string().trim().min(1).max(200).nullable(),
  content: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe(
      "The screenshot's core useful information in 1 or 2 short sentences. Preserve code or commands exactly. No essay or added commentary."
    ),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .describe("One brief sentence stating only the actionable takeaway."),
  sourceUrl: z.url().max(2_048).nullable(),
  publishedAt: z.string().trim().min(1).max(100).nullable(),
  topics: z
    .array(z.string().trim().min(1).max(64))
    .min(1)
    .max(5)
    .describe("One to five specific topic tags."),
  confidence: z.number().min(0).max(1)
});

export const noteCandidatesSchema = z.array(noteCandidateSchema).length(3);

export const noteCandidatesOutputSchema = z.object({
  candidates: noteCandidatesSchema
});

export const savedNoteSchema = noteCandidateSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().min(1)
});

export const savedNotesResponseSchema = z.object({
  notes: z.array(savedNoteSchema)
});

export type NoteKind = z.infer<typeof noteKindSchema>;
export type NoteCandidate = z.infer<typeof noteCandidateSchema>;
export type SavedNote = z.infer<typeof savedNoteSchema>;
