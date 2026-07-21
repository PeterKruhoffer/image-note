import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";
import { Text } from "@cloudflare/kumo";
import { getAgentMessages, useAgentChat } from "@cloudflare/ai-chat/react";
import { ImageIcon } from "@phosphor-icons/react";
import { useAgent } from "agents/react";
import type { MCPServersState } from "agents";
import type { UIMessage } from "ai";
import type { ChatSummary } from "../../chats";
import {
  MAX_IMAGE_BYTES_PER_MESSAGE,
  MAX_IMAGES_PER_MESSAGE
} from "../../image-limits";
import type { NoteCandidate } from "../../notes";
import { savedNoteSchema } from "../../notes";
import type { ChatAgent } from "../../server/chat-agent";
import {
  createAttachment,
  isSupportedImage,
  prepareImage,
  type Attachment
} from "./attachments";
import { ChatComposer } from "./chat-composer";
import { ChatHeader } from "./chat-header";
import { ChatSidebar } from "./chat-sidebar";
import { MessageList } from "./message-list";
import { useChatHistory } from "./use-chat-history";

const CHAT_PREFETCH_TTL = 30_000;
const prefetchedMessages = new Map<
  string,
  { promise: Promise<UIMessage[]>; timeout: number }
>();

function prefetchChatMessages(chatId: string) {
  const cached = prefetchedMessages.get(chatId);
  if (cached) return cached.promise;

  const promise = getAgentMessages<UIMessage>({
    url: `/chat/${encodeURIComponent(chatId)}/get-messages`,
    credentials: "same-origin"
  });
  const timeout = window.setTimeout(() => {
    if (prefetchedMessages.get(chatId)?.promise === promise) {
      prefetchedMessages.delete(chatId);
    }
  }, CHAT_PREFETCH_TTL);
  prefetchedMessages.set(chatId, { promise, timeout });
  return promise;
}

function consumeChatMessages(chatId: string) {
  const promise = prefetchChatMessages(chatId);
  const cached = prefetchedMessages.get(chatId);
  if (cached) {
    window.clearTimeout(cached.timeout);
    prefetchedMessages.delete(chatId);
  }
  return promise;
}

export function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    chats,
    activeChat,
    activeChatId,
    loading,
    creating,
    deletingChatId,
    error,
    loadChats,
    selectChat,
    createChat,
    deleteChat,
    recordActivity
  } = useChatHistory();

  const handleSelectChat = useCallback(
    (chat: ChatSummary) => {
      startTransition(() => selectChat(chat));
      setSidebarOpen(false);
    },
    [selectChat]
  );

  const handleCreateChat = useCallback(async () => {
    if (await createChat()) setSidebarOpen(false);
  }, [createChat]);

  const handleDeleteChat = useCallback(
    async (chat: ChatSummary) => {
      if (!window.confirm(`Delete “${chat.title}”? This can’t be undone.`)) {
        return;
      }
      const deletingActiveChat = activeChatId === chat.id;
      if ((await deleteChat(chat)) && deletingActiveChat) {
        setSidebarOpen(false);
      }
    },
    [activeChatId, deleteChat]
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-kumo-elevated text-kumo-inactive">
        Loading chats…
      </div>
    );
  }

  if (error && !activeChatId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-kumo-elevated px-5 text-center">
        <p role="alert" className="text-sm text-kumo-danger">
          {error}
        </p>
        <button
          type="button"
          className="rounded-lg bg-kumo-base px-4 py-2 text-sm text-kumo-default ring ring-kumo-line"
          onClick={() => void loadChats()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!activeChat) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-kumo-elevated">
      {error && (
        <div
          role="alert"
          className="fixed left-1/2 top-3 z-[80] -translate-x-1/2 rounded-lg bg-kumo-base px-4 py-2 text-sm text-kumo-danger shadow-lg ring ring-kumo-danger/30"
        >
          {error}
        </div>
      )}
      <div className="hidden md:block">
        <ChatSidebar
          chats={chats}
          activeChatId={activeChat.id}
          creating={creating}
          deletingChatId={deletingChatId}
          onSelect={handleSelectChat}
          onPrefetch={(chat) => void prefetchChatMessages(chat.id)}
          onCreate={() => void handleCreateChat()}
          onDelete={(chat) => void handleDeleteChat(chat)}
        />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-[60] flex md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close chat history"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative h-full shadow-xl">
            <ChatSidebar
              mobile
              chats={chats}
              activeChatId={activeChat.id}
              creating={creating}
              deletingChatId={deletingChatId}
              onSelect={handleSelectChat}
              onPrefetch={(chat) => void prefetchChatMessages(chat.id)}
              onCreate={() => void handleCreateChat()}
              onDelete={(chat) => void handleDeleteChat(chat)}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      <ChatConversation
        key={activeChat.id}
        chatId={activeChat.id}
        onOpenSidebar={() => setSidebarOpen(true)}
        onActivity={recordActivity}
      />
    </div>
  );
}

interface ChatConversationProps {
  chatId: string;
  onOpenSidebar: () => void;
  onActivity: (chatId: string, title: string) => void;
}

function ChatConversation({
  chatId,
  onOpenSidebar,
  onActivity
}: ChatConversationProps) {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    name: chatId,
    basePath: `chat/${encodeURIComponent(chatId)}`,
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (error: Event) => console.error("WebSocket error:", error),
      []
    ),
    onMcpUpdate: useCallback((state: MCPServersState) => {
      setMcpState(state);
    }, [])
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
    getInitialMessages: () => consumeChatMessages(chatId)
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

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (isStreaming || isPreparingAttachments) return;

      const images = Array.from(files).filter(isSupportedImage);
      if (images.length === 0) {
        setAttachmentError("Attach a PNG, JPEG, or WebP image.");
        return;
      }

      const available = MAX_IMAGES_PER_MESSAGE - attachments.length;
      const accepted = images.slice(0, Math.max(0, available));
      if (accepted.length > 0) {
        setAttachments((current) => [
          ...current,
          ...accepted.map(createAttachment)
        ]);
      }
      setAttachmentError(
        accepted.length < images.length
          ? `You can attach up to ${MAX_IMAGES_PER_MESSAGE} images at a time.`
          : null
      );
    },
    [attachments.length, isPreparingAttachments, isStreaming]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachmentError(null);
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
    if (
      (!text && attachments.length === 0) ||
      isStreaming ||
      isPreparingAttachments
    )
      return;

    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; mediaType: string; url: string }
    > = [];
    if (text) parts.push({ type: "text", text });

    setAttachmentError(null);
    setIsPreparingAttachments(attachments.length > 0);
    try {
      const imageBudget = Math.floor(
        MAX_IMAGE_BYTES_PER_MESSAGE / Math.max(1, attachments.length)
      );
      for (const attachment of attachments) {
        const image = await prepareImage(attachment.file, imageBudget);
        parts.push({ type: "file", ...image });
      }
    } catch (cause) {
      console.error("Failed to prepare image attachments:", cause);
      setAttachmentError(
        "One of the images couldn’t be prepared. Try a smaller PNG, JPEG, or WebP image."
      );
      setIsPreparingAttachments(false);
      return;
    }

    setInput("");
    for (const attachment of attachments) {
      URL.revokeObjectURL(attachment.preview);
    }
    setAttachments([]);
    setIsPreparingAttachments(false);

    const normalizedTitle = text.replace(/\s+/g, " ");
    const title = normalizedTitle
      ? normalizedTitle.length > 60
        ? `${normalizedTitle.slice(0, 57).trimEnd()}…`
        : normalizedTitle
      : "Image chat";
    onActivity(chatId, title);
    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title })
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
    } catch (cause) {
      console.error("Failed to update chat history:", cause);
    }
    sendMessage({ role: "user", parts });
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [
    input,
    attachments,
    isStreaming,
    isPreparingAttachments,
    sendMessage,
    onActivity,
    chatId
  ]);

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
      className="relative flex h-screen min-w-0 flex-1 flex-col bg-kumo-elevated"
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
        onOpenSidebar={onOpenSidebar}
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
        addToolApprovalResponse={addToolApprovalResponse}
        saveNote={saveNote}
        endRef={messagesEndRef}
      />
      <ChatComposer
        input={input}
        onInputChange={setInput}
        attachments={attachments}
        attachmentError={attachmentError}
        connected={connected}
        isStreaming={isStreaming}
        isPreparingAttachments={isPreparingAttachments}
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
