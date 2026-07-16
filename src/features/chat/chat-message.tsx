import { BrainIcon, CaretDownIcon } from "@phosphor-icons/react";
import { isToolUIPart, type UIMessage } from "ai";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import type { SaveNote } from "./note-candidate-picker";
import {
  ToolPartView,
  type ToolApprovalResponseHandler
} from "./tool-part-view";

interface ChatMessageProps {
  message: UIMessage;
  showDebug: boolean;
  isStreaming: boolean;
  isLastAssistant: boolean;
  addToolApprovalResponse: ToolApprovalResponseHandler;
  saveNote: SaveNote;
}

export function ChatMessage({
  message,
  showDebug,
  isStreaming,
  isLastAssistant,
  addToolApprovalResponse,
  saveNote
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const imageParts = message.parts.filter(
    (part): part is Extract<typeof part, { type: "file" }> =>
      part.type === "file" &&
      (part as { mediaType?: string }).mediaType?.startsWith("image/") === true
  );

  return (
    <div className="space-y-2">
      {showDebug && (
        <pre className="text-[11px] text-kumo-subtle bg-kumo-control rounded-lg p-3 overflow-auto max-h-64">
          {JSON.stringify(message, null, 2)}
        </pre>
      )}

      {message.parts.filter(isToolUIPart).map((part) => (
        <ToolPartView
          key={part.toolCallId}
          part={part}
          addToolApprovalResponse={addToolApprovalResponse}
          saveNote={saveNote}
        />
      ))}

      {message.parts
        .filter(
          (part) =>
            part.type === "reasoning" &&
            (part as { text?: string }).text?.trim()
        )
        .map((part, index) => {
          const reasoning = part as {
            type: "reasoning";
            text: string;
            state?: "streaming" | "done";
          };
          const isDone = reasoning.state === "done" || !isStreaming;
          return (
            <div key={index} className="flex justify-start">
              <details className="max-w-[85%] w-full" open={!isDone}>
                <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-sm select-none">
                  <BrainIcon size={14} className="text-purple-400" />
                  <span className="font-medium text-kumo-default">
                    Reasoning
                  </span>
                  {isDone ? (
                    <span className="text-xs text-kumo-success">Complete</span>
                  ) : (
                    <span className="text-xs text-kumo-brand">Thinking...</span>
                  )}
                  <CaretDownIcon
                    size={14}
                    className="ml-auto text-kumo-inactive"
                  />
                </summary>
                <pre className="mt-2 px-3 py-2 rounded-lg bg-kumo-control text-xs text-kumo-default whitespace-pre-wrap overflow-auto max-h-64">
                  {reasoning.text}
                </pre>
              </details>
            </div>
          );
        })}

      {imageParts.map((part, index) => (
        <div
          key={`file-${index}`}
          className={`flex ${isUser ? "justify-end" : "justify-start"}`}
        >
          <div className="relative">
            <img
              src={part.url}
              alt={
                imageParts.length > 1 ? `Attachment ${index + 1}` : "Attachment"
              }
              className="max-h-64 rounded-xl border border-kumo-line object-contain"
            />
            {imageParts.length > 1 && (
              <span className="absolute left-2 top-2 rounded-md bg-kumo-contrast/85 px-2 py-1 text-xs font-medium text-kumo-inverse shadow-sm">
                Image {index + 1}
              </span>
            )}
          </div>
        </div>
      ))}

      {message.parts
        .filter((part) => part.type === "text")
        .map((part, index) => {
          const text = (part as { type: "text"; text: string }).text;
          if (!text) return null;

          if (isUser) {
            return (
              <div key={index} className="flex justify-end">
                <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse leading-relaxed">
                  {text}
                </div>
              </div>
            );
          }

          return (
            <div key={index} className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base text-kumo-default leading-relaxed">
                <Streamdown
                  className="sd-theme rounded-2xl rounded-bl-md p-3"
                  plugins={{ code }}
                  controls={false}
                  isAnimating={isLastAssistant && isStreaming}
                >
                  {text}
                </Streamdown>
              </div>
            </div>
          );
        })}
    </div>
  );
}
