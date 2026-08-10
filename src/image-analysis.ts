import { z } from "zod";
import { MAX_IMAGE_BYTES } from "./image-limits";
import { noteCandidatesOutputSchema } from "./notes";

export const imageMediaTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

// Include room for the data URI prefix and base64 padding.
const MAX_DATA_URI_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 64;

export const imageAnalysisRequestSchema = z
  .object({
    mediaType: imageMediaTypeSchema,
    url: z.string().max(MAX_DATA_URI_LENGTH)
  })
  .refine(
    ({ mediaType, url }) => url.startsWith(`data:${mediaType};base64,`),
    "The image data URI does not match its media type."
  );

export const imageAnalysisResponseSchema = noteCandidatesOutputSchema;

export type ImageAnalysisRequest = z.infer<typeof imageAnalysisRequestSchema>;
