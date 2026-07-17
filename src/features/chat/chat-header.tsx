import type { MCPServersState } from "agents";
import { UserButton } from "@clerk/react";
import { Badge, Button, Switch, Text } from "@cloudflare/kumo";
import {
  BooksIcon,
  BugIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  ImageIcon,
  SidebarSimpleIcon,
  TrashIcon
} from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { ThemeToggle } from "../../components/theme-toggle";
import { McpServerMenu } from "./mcp-server-menu";

interface ChatHeaderProps {
  onOpenSidebar: () => void;
  connected: boolean;
  showDebug: boolean;
  onShowDebugChange: (showDebug: boolean) => void;
  servers: MCPServersState["servers"];
  toolCount: number;
  onAddServer: (name: string, url: string) => Promise<void>;
  onRemoveServer: (serverId: string) => Promise<void>;
  onClearHistory: () => void;
}

export function ChatHeader({
  onOpenSidebar,
  connected,
  showDebug,
  onShowDebugChange,
  servers,
  toolCount,
  onAddServer,
  onRemoveServer,
  onClearHistory
}: ChatHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="px-3 py-4 sm:px-5 bg-kumo-base border-b border-kumo-line">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            shape="square"
            icon={<SidebarSimpleIcon size={19} />}
            aria-label="Open chat history"
            className="md:hidden"
            onClick={onOpenSidebar}
          />
          <h1 className="text-lg font-semibold text-kumo-default">
            <ImageIcon size={20} className="mr-2 inline-block" />
            Image Mind
          </h1>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            <ChatCircleDotsIcon size={12} weight="bold" className="mr-1" />
            Image notes
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 xl:flex">
            <CircleIcon
              size={8}
              weight="fill"
              className={connected ? "text-kumo-success" : "text-kumo-danger"}
            />
            <Text size="xs" variant="secondary">
              {connected ? "Connected" : "Disconnected"}
            </Text>
          </div>
          <div className="hidden items-center gap-1.5 xl:flex">
            <BugIcon size={14} className="text-kumo-inactive" />
            <Switch
              checked={showDebug}
              onCheckedChange={onShowDebugChange}
              size="sm"
              aria-label="Toggle debug mode"
            />
          </div>
          <ThemeToggle />
          <UserButton />
          <Button
            variant="secondary"
            icon={<BooksIcon size={16} />}
            onClick={() => void navigate("/library")}
          >
            <span className="hidden sm:inline">Library</span>
          </Button>
          <div className="hidden sm:block">
            <McpServerMenu
              servers={servers}
              toolCount={toolCount}
              onAddServer={onAddServer}
              onRemoveServer={onRemoveServer}
            />
          </div>
          <Button
            variant="secondary"
            icon={<TrashIcon size={16} />}
            className="hidden sm:inline-flex"
            onClick={onClearHistory}
          >
            Clear
          </Button>
        </div>
      </div>
    </header>
  );
}
