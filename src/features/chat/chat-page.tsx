import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";
import { Text } from "@cloudflare/kumo";
import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { ImageIcon } from "@phosphor-icons/react";
import { useAgent } from "agents/react";
import type { MCPServersState } from "agents";
import type { NoteCandidate } from "../../notes";
import { savedNoteSchema } from "../../notes";
import type { ChatAgent } from "../../server";
import { ensureAnonymousSession } from "../../lib/anonymous-session";
import {
  createAttachment,
  fileToDataUri,
  type Attachment
} from "./attachments";
import { ChatComposer } from "./chat-composer";
import { ChatHeader } from "./chat-header";
import { MessageList } from "./message-list";

export function ChatPage() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toasts = useKumoToastManager();
  const [mcpState, setMcpState] = useState<MCPServersState>({
    prompts: [],
    resources: [],
    servers: {},
    tools: []
  });

  const revokePendingAttachmentPreviews = useEffectEvent(() => {
    for (const attachment of attachments) {
      URL.revokeObjectURL(attachment.preview);
    }
  });

  useEffect(() => () => revokePendingAttachmentPreviews(), []);

  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
    basePath: "chat",
    query: async () => {
      await ensureAnonymousSession();
      return {};
    },
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (error: Event) => console.error("WebSocket error:", error),
      []
    ),
    onMcpUpdate: useCallback((state: MCPServersState) => {
      setMcpState(state);
    }, []),
    onMessage: useCallback(
      (message: MessageEvent) => {
        try {
          const data = JSON.parse(String(message.data));
          if (data.type === "scheduled-task") {
            toasts.add({
              title: "Scheduled task completed",
              description: data.description,
              timeout: 0
            });
          }
        } catch {
          // Not JSON or not our event
        }
      },
      [toasts]
    )
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    stop,
    status
  } = useAgentChat({
    agent,
    experimental_throttle: 100,
    onToolCall: async (event) => {
      if (
        "addToolOutput" in event &&
        event.toolCall.toolName === "getUserTimezone"
      ) {
        event.addToolOutput({
          toolCallId: event.toolCall.toolCallId,
          output: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            localTime: new Date().toLocaleTimeString()
          }
        });
      }
    }
  });

  const isStreaming = status === "streaming" || status === "submitted";

  const saveNote = useCallback(
    async (candidate: NoteCandidate) => {
      const saved = await agent.stub.saveNote(candidate);
      return savedNoteSchema.parse(saved);
    },
    [agent]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const images = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );
    if (images.length === 0) return;
    setAttachments((current) => [...current, ...images.map(createAttachment)]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const attachment = current.find((item) => item.id === id);
      if (attachment) URL.revokeObjectURL(attachment.preview);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget === event.target) setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      if (event.dataTransfer.files.length > 0) {
        addFiles(event.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        addFiles(files);
      }
    },
    [addFiles]
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming) return;
    setInput("");

    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; mediaType: string; url: string }
    > = [];
    if (text) parts.push({ type: "text", text });

    for (const attachment of attachments) {
      const dataUri = await fileToDataUri(attachment.file);
      parts.push({
        type: "file",
        mediaType: attachment.mediaType,
        url: dataUri
      });
    }

    for (const attachment of attachments) {
      URL.revokeObjectURL(attachment.preview);
    }
    setAttachments([]);

    sendMessage({ role: "user", parts });
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, attachments, isStreaming, sendMessage]);

  const addMcpServer = useCallback(
    async (name: string, url: string) => {
      await agent.stub.addServer(name, url);
    },
    [agent]
  );

  const removeMcpServer = useCallback(
    async (serverId: string) => {
      await agent.stub.removeServer(serverId);
    },
    [agent]
  );

  return (
    <div
      className="flex flex-col h-screen bg-kumo-elevated relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-kumo-elevated/80 backdrop-blur-sm border-2 border-dashed border-kumo-brand rounded-xl m-2 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-kumo-brand">
            <ImageIcon size={40} />
            <Text variant="heading3" as="span">
              Drop images here
            </Text>
          </div>
        </div>
      )}

      <ChatHeader
        connected={connected}
        showDebug={showDebug}
        onShowDebugChange={setShowDebug}
        servers={mcpState.servers}
        toolCount={mcpState.tools.length}
        onAddServer={addMcpServer}
        onRemoveServer={removeMcpServer}
        onClearHistory={clearHistory}
      />
      <MessageList
        messages={messages}
        showDebug={showDebug}
        isStreaming={isStreaming}
        onSuggestedPrompt={(prompt) =>
          sendMessage({
            role: "user",
            parts: [{ type: "text", text: prompt }]
          })
        }
        addToolApprovalResponse={addToolApprovalResponse}
        saveNote={saveNote}
        endRef={messagesEndRef}
      />
      <ChatComposer
        input={input}
        onInputChange={setInput}
        attachments={attachments}
        connected={connected}
        isStreaming={isStreaming}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        onAddFiles={addFiles}
        onRemoveAttachment={removeAttachment}
        onPaste={handlePaste}
        onSend={() => void send()}
        onStop={stop}
      />
    </div>
  );
}
