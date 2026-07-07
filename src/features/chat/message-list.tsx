import type { Ref } from "react";
import { Empty, Text } from "@cloudflare/kumo";
import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import { ChatMessage } from "./chat-message";
import type { SaveNote } from "./note-candidate-picker";
import type { ToolApprovalResponseHandler } from "./tool-part-view";

interface MessageListProps {
  messages: UIMessage[];
  showDebug: boolean;
  isStreaming: boolean;
  addToolApprovalResponse: ToolApprovalResponseHandler;
  saveNote: SaveNote;
  endRef: Ref<HTMLDivElement>;
}

export function MessageList({
  messages,
  showDebug,
  isStreaming,
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
            title="Turn a screenshot into a note"
            contents={
              <Text size="sm" variant="secondary">
                Paste, drop, or attach an image to create three concise note
                candidates.
              </Text>
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
