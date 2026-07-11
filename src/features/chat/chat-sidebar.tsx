import { Button } from "@cloudflare/kumo";
import {
  ChatCircleDotsIcon,
  PlusIcon,
  TrashIcon,
  XIcon
} from "@phosphor-icons/react";
import type { ChatSummary } from "../../chats";

interface ChatSidebarProps {
  chats: ChatSummary[];
  activeChatId: string;
  creating: boolean;
  deletingChatId: string | null;
  mobile?: boolean;
  onSelect: (chat: ChatSummary) => void;
  onCreate: () => void;
  onDelete: (chat: ChatSummary) => void;
  onClose?: () => void;
}

function formattedDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date);
}

export function ChatSidebar({
  chats,
  activeChatId,
  creating,
  deletingChatId,
  mobile = false,
  onSelect,
  onCreate,
  onDelete,
  onClose
}: ChatSidebarProps) {
  return (
    <aside
      className={`${mobile ? "w-[min(20rem,calc(100vw-2rem))]" : "w-72"} flex h-full shrink-0 flex-col border-r border-kumo-line bg-kumo-base`}
      aria-label="Chat history"
    >
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2 text-kumo-default">
          <ChatCircleDotsIcon size={21} weight="duotone" />
          <span className="font-semibold">Chats</span>
        </div>
        {mobile && (
          <Button
            variant="ghost"
            shape="square"
            size="sm"
            icon={<XIcon size={17} />}
            aria-label="Close chat history"
            onClick={onClose}
          />
        )}
      </div>

      <div className="px-3 pb-3">
        <Button
          variant="primary"
          className="w-full justify-center"
          icon={<PlusIcon size={16} weight="bold" />}
          loading={creating}
          onClick={onCreate}
        >
          New chat
        </Button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <p className="px-2 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-kumo-inactive">
          History
        </p>
        <div className="space-y-1">
          {chats.map((chat) => {
            const active = chat.id === activeChatId;
            const deleting = deletingChatId === chat.id;
            return (
              <div key={chat.id} className="group relative">
                <button
                  type="button"
                  className={`w-full rounded-lg py-2.5 pl-3 pr-11 text-left transition-colors ${
                    active
                      ? "bg-kumo-tint text-kumo-default"
                      : "text-kumo-subtle hover:bg-kumo-tint/70 hover:text-kumo-default"
                  }`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelect(chat)}
                >
                  <span className="block truncate text-sm font-medium">
                    {chat.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-kumo-inactive">
                    {formattedDate(chat.updatedAt)}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  shape="square"
                  size="sm"
                  icon={<TrashIcon size={15} />}
                  aria-label={`Delete ${chat.title}`}
                  title={`Delete ${chat.title}`}
                  loading={deleting}
                  disabled={deletingChatId !== null}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 text-kumo-inactive hover:text-kumo-danger focus:opacity-100 md:opacity-0 md:group-hover:opacity-100 ${
                    active ? "md:opacity-100" : ""
                  }`}
                  onClick={() => onDelete(chat)}
                />
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
