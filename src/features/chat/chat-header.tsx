import type { MCPServersState } from "agents";
import { Badge, Button, Switch, Text } from "@cloudflare/kumo";
import {
  BooksIcon,
  BugIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  ImageIcon,
  TrashIcon
} from "@phosphor-icons/react";
import { ThemeToggle } from "../../components/theme-toggle";
import { McpServerMenu } from "./mcp-server-menu";

interface ChatHeaderProps {
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
  connected,
  showDebug,
  onShowDebugChange,
  servers,
  toolCount,
  onAddServer,
  onRemoveServer,
  onClearHistory
}: ChatHeaderProps) {
  return (
    <header className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-kumo-default">
            <ImageIcon size={20} className="mr-2 inline-block" />
            Image Mind
          </h1>
          <Badge variant="secondary">
            <ChatCircleDotsIcon size={12} weight="bold" className="mr-1" />
            Image notes
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CircleIcon
              size={8}
              weight="fill"
              className={connected ? "text-kumo-success" : "text-kumo-danger"}
            />
            <Text size="xs" variant="secondary">
              {connected ? "Connected" : "Disconnected"}
            </Text>
          </div>
          <div className="flex items-center gap-1.5">
            <BugIcon size={14} className="text-kumo-inactive" />
            <Switch
              checked={showDebug}
              onCheckedChange={onShowDebugChange}
              size="sm"
              aria-label="Toggle debug mode"
            />
          </div>
          <ThemeToggle />
          <Button
            variant="secondary"
            icon={<BooksIcon size={16} />}
            onClick={() => window.location.assign("/library")}
          >
            Library
          </Button>
          <McpServerMenu
            servers={servers}
            toolCount={toolCount}
            onAddServer={onAddServer}
            onRemoveServer={onRemoveServer}
          />
          <Button
            variant="secondary"
            icon={<TrashIcon size={16} />}
            onClick={onClearHistory}
          >
            Clear
          </Button>
        </div>
      </div>
    </header>
  );
}
