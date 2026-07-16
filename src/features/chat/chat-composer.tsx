import type { ClipboardEvent, RefObject } from "react";
import { Button, InputArea } from "@cloudflare/kumo";
import {
  PaperPlaneRightIcon,
  PaperclipIcon,
  StopIcon,
  XIcon
} from "@phosphor-icons/react";
import { MAX_IMAGES_PER_MESSAGE } from "../../image-limits";
import { IMAGE_INPUT_ACCEPT, type Attachment } from "./attachments";

interface ChatComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  attachments: Attachment[];
  attachmentError: string | null;
  connected: boolean;
  isStreaming: boolean;
  isPreparingAttachments: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onPaste: (event: ClipboardEvent) => void;
  onSend: () => void;
  onStop: () => void;
}

function getComposerPlaceholder(
  isPreparingAttachments: boolean,
  hasAttachments: boolean
) {
  if (isPreparingAttachments) return "Preparing images...";
  if (hasAttachments) return "Add a message or send images...";
  return "Send a message...";
}

export function ChatComposer({
  input,
  onInputChange,
  attachments,
  attachmentError,
  connected,
  isStreaming,
  isPreparingAttachments,
  textareaRef,
  fileInputRef,
  onAddFiles,
  onRemoveAttachment,
  onPaste,
  onSend,
  onStop
}: ChatComposerProps) {
  return (
    <div className="border-t border-kumo-line bg-kumo-base">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
        className="max-w-3xl mx-auto px-5 py-4"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={IMAGE_INPUT_ACCEPT}
          aria-label="Upload image attachments"
          className="hidden"
          onChange={(event) => {
            if (event.target.files) onAddFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {attachments.length > 0 && (
          <div className="mb-2">
            <div className="mb-1.5 text-xs text-kumo-subtle">
              {attachments.length} of {MAX_IMAGES_PER_MESSAGE} images
            </div>
            <div className="flex gap-2 flex-wrap">
              {attachments.map((attachment, index) => (
                <div
                  key={attachment.id}
                  className="relative group rounded-lg border border-kumo-line bg-kumo-control overflow-hidden"
                >
                  <img
                    src={attachment.preview}
                    alt={attachment.file.name}
                    className="h-16 w-16 object-cover"
                  />
                  {attachments.length > 1 && (
                    <span className="absolute bottom-1 left-1 rounded bg-kumo-contrast/80 px-1.5 py-0.5 text-[10px] font-medium text-kumo-inverse">
                      {index + 1}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    className="absolute top-0.5 right-0.5 rounded-full bg-kumo-contrast/80 text-kumo-inverse p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${attachment.file.name}`}
                  >
                    <XIcon size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {attachmentError && (
          <p role="alert" className="mb-2 text-sm text-kumo-danger">
            {attachmentError}
          </p>
        )}

        <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm focus-within:ring-2 focus-within:ring-kumo-ring focus-within:border-transparent transition-shadow">
          <Button
            type="button"
            variant="ghost"
            shape="square"
            aria-label="Attach images"
            icon={<PaperclipIcon size={18} />}
            onClick={() => fileInputRef.current?.click()}
            disabled={!connected || isStreaming || isPreparingAttachments}
            className="mb-0.5"
          />
          <InputArea
            ref={textareaRef}
            value={input}
            onValueChange={onInputChange}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            onInput={(event) => {
              const element = event.currentTarget;
              element.style.height = "auto";
              element.style.height = `${element.scrollHeight}px`;
            }}
            onPaste={onPaste}
            placeholder={getComposerPlaceholder(
              isPreparingAttachments,
              attachments.length > 0
            )}
            disabled={!connected || isStreaming || isPreparingAttachments}
            rows={1}
            className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-40"
          />
          {isStreaming ? (
            <Button
              type="button"
              variant="secondary"
              shape="square"
              aria-label="Stop generation"
              icon={<StopIcon size={18} />}
              onClick={onStop}
              className="mb-0.5"
            />
          ) : (
            <Button
              type="submit"
              variant="primary"
              shape="square"
              aria-label="Send message"
              disabled={
                (!input.trim() && attachments.length === 0) ||
                !connected ||
                isPreparingAttachments
              }
              icon={<PaperPlaneRightIcon size={18} />}
              className="mb-0.5"
            />
          )}
        </div>
      </form>
    </div>
  );
}
