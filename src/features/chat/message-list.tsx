import type { Ref } from "react";
import { Button, Empty } from "@cloudflare/kumo";
import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import { ChatMessage } from "./chat-message";
import type { SaveNote } from "./note-candidate-picker";
import type { ToolApprovalResponseHandler } from "./tool-part-view";

const SUGGESTED_PROMPTS = [
  "What's the weather in Paris?",
  "What timezone am I in?",
  "Calculate 5000 * 3",
  "Remind me in 5 minutes to take a break"
];

interface MessageListProps {
  messages: UIMessage[];
  showDebug: boolean;
  isStreaming: boolean;
  onSuggestedPrompt: (prompt: string) => void;
  addToolApprovalResponse: ToolApprovalResponseHandler;
  saveNote: SaveNote;
  endRef: Ref<HTMLDivElement>;
}

export function MessageList({
  messages,
  showDebug,
  isStreaming,
  onSuggestedPrompt,
  addToolApprovalResponse,
  saveNote,
  endRef
}: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        {messages.length === 0 && (
          <Empty
            icon={<ChatCircleDotsIcon size={32} />}
            title="Start a conversation"
            contents={
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    size="sm"
                    disabled={isStreaming}
                    onClick={() => onSuggestedPrompt(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            }
          />
        )}

        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            showDebug={showDebug}
            isStreaming={isStreaming}
            isLastAssistant={
              message.role === "assistant" && index === messages.length - 1
            }
            addToolApprovalResponse={addToolApprovalResponse}
            saveNote={saveNote}
          />
        ))}

        <div ref={endRef} />
      </div>
    </div>
  );
}
