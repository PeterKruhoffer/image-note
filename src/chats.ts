import { z } from "zod";

export const chatIdSchema = z.union([z.literal("legacy"), z.uuid()]);
export const chatTitleSchema = z.string().trim().min(1).max(80);

export const chatSummarySchema = z.object({
  id: chatIdSchema,
  title: chatTitleSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export const chatsResponseSchema = z.object({
  chats: z.array(chatSummarySchema)
});

export const chatResponseSchema = z.object({ chat: chatSummarySchema });

export const deleteChatResponseSchema = z.object({
  replacement: chatSummarySchema.nullable()
});

export type ChatSummary = z.infer<typeof chatSummarySchema>;
