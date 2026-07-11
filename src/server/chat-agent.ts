import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable, MCP_SERVER_ID_MAX_LENGTH } from "agents";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import { httpUrlSchema } from "../notes";
import { IMAGE_NOTE_SYSTEM_PROMPT } from "./chat-prompt";
import { createChatTools } from "./chat-tools";

const mcpServerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: httpUrlSchema
});

const mcpServerIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(MCP_SERVER_ID_MAX_LENGTH);

function conversationIdentity(agentName: string) {
  const separator = agentName.lastIndexOf("|");
  return separator === -1
    ? { ownerId: agentName, chatId: "legacy" }
    : {
        ownerId: agentName.slice(0, separator),
        chatId: agentName.slice(separator + 1)
      };
}

function suggestedChatTitle(
  message: (typeof AIChatAgent.prototype.messages)[number]
) {
  const text = message.parts.find(
    (part): part is Extract<typeof part, { type: "text" }> =>
      part.type === "text"
  )?.text;
  if (!text?.trim()) return "Image chat";

  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length > 60
    ? `${normalized.slice(0, 57).trimEnd()}…`
    : normalized;
}

export class ChatAgent extends AIChatAgent<Env> {
  static options = { sendIdentityOnConnect: false };

  maxPersistedMessages = 100;
  chatRecovery = true;

  onStart() {
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
  async addServer(name: unknown, url: unknown) {
    const server = mcpServerSchema.parse({ name, url });
    const { chatId } = conversationIdentity(this.name);
    return await this.addMcpServer(server.name, server.url, {
      callbackPath: `/oauth/callback/${encodeURIComponent(chatId)}`
    });
  }

  @callable()
  async removeServer(input: unknown) {
    const serverId = mcpServerIdSchema.parse(input);
    await this.removeMcpServer(serverId);
  }

  @callable()
  async saveNote(input: unknown) {
    const { ownerId } = conversationIdentity(this.name);
    const notes = this.env.NotesStore.getByName(ownerId);
    return await notes.save(input);
  }

  async scheduleDeletion() {
    // Agent.destroy() aborts its isolate. Scheduling it on an alarm gives the
    // cleanup its own invocation and lets this RPC return successfully.
    await this._cf_scheduleDestroy();
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const latestMessage = this.messages.at(-1);
    if (latestMessage?.role === "user") {
      const { ownerId, chatId } = conversationIdentity(this.name);
      const chats = this.env.NotesStore.getByName(ownerId);
      await chats.touchChat(chatId, suggestedChatTitle(latestMessage));
    }
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
      system: IMAGE_NOTE_SYSTEM_PROMPT,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages"
      }),
      tools: createChatTools(this.mcp.getAITools()),
      toolChoice: hasImage
        ? { type: "tool", toolName: "createNoteCandidates" }
        : "auto",
      stopWhen: stepCountIs(hasImage ? 1 : 5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}
