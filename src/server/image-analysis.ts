import { generateText, Output } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import {
  imageAnalysisResponseSchema,
  type ImageAnalysisRequest
} from "../image-analysis";

const IMAGE_NOTE_SYSTEM_PROMPT = `You turn one screenshot into exactly three concise alternative saved-note candidates.

Analyze only visible evidence. Every candidate must capture the screenshot's single core idea or actionable tip without adding background, implications, commentary, or invented details. Preserve visible code and commands exactly.

Titles should be about 3 to 8 words. Content should be 1 or 2 short sentences. Summaries should be one short sentence. Topics should contain 1 to 5 specific tags. Use null when the author, source URL, or published date is not visible.`;

export async function analyzeImage(ai: Ai, image: ImageAnalysisRequest) {
  const workersai = createWorkersAI({ binding: ai });
  const result = await generateText({
    model: workersai("@cf/google/gemma-4-26b-a4b-it"),
    system: IMAGE_NOTE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Read this screenshot and return three distinct concise note candidates."
          },
          {
            type: "image",
            image: image.url,
            mediaType: image.mediaType
          }
        ]
      }
    ],
    output: Output.object({
      schema: imageAnalysisResponseSchema,
      name: "imageNoteCandidates",
      description: "Exactly three saved-note candidates for one screenshot."
    })
  });

  return imageAnalysisResponseSchema.parse(result.output);
}
