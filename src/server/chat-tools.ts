import { tool, type ToolSet } from "ai";
import { noteCandidatesOutputSchema } from "../notes";

export function createChatTools(mcpTools: ToolSet) {
  return {
    ...mcpTools,
    createNoteCandidates: tool({
      description:
        "Return exactly three concise structured note candidates extracted from the attached screenshot. Capture only the core actionable point in 1 or 2 short sentences per candidate, with no essay or added commentary. Never call this without an image in the latest user message.",
      inputSchema: noteCandidatesOutputSchema,
      execute: async (input) => input
    })
  };
}
