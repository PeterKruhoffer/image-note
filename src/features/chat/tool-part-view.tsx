import { Badge, Button, LayerCard, Text } from "@cloudflare/kumo";
import {
  CheckCircleIcon,
  GearIcon,
  ImageIcon,
  XCircleIcon
} from "@phosphor-icons/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { noteCandidatesOutputSchema } from "../../notes";
import { NoteCandidatePicker, type SaveNote } from "./note-candidate-picker";

export type ToolApprovalResponseHandler = (response: {
  id: string;
  approved: boolean;
}) => void;

interface ToolPartViewProps {
  part: UIMessage["parts"][number];
  addToolApprovalResponse: ToolApprovalResponseHandler;
  saveNote: SaveNote;
}

export function ToolPartView({
  part,
  addToolApprovalResponse,
  saveNote
}: ToolPartViewProps) {
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);

  if (toolName === "createNoteCandidates") {
    if (part.state === "output-available") {
      const parsed = noteCandidatesOutputSchema.safeParse(part.output);
      if (!parsed.success) {
        return (
          <div className="flex justify-start">
            <LayerCard className="max-w-[85%] px-4 py-3 rounded-xl ring ring-kumo-line">
              <Text size="sm" bold>
                Couldn’t display note suggestions
              </Text>
              <Text size="xs" variant="secondary">
                The screenshot analysis returned an unexpected format. Please
                try again.
              </Text>
            </LayerCard>
          </div>
        );
      }
      return (
        <NoteCandidatePicker
          candidates={parsed.data.candidates}
          saveNote={saveNote}
        />
      );
    }

    if (part.state === "input-available" || part.state === "input-streaming") {
      return (
        <div className="flex justify-start">
          <LayerCard className="max-w-[85%] px-4 py-3 rounded-xl ring ring-kumo-line">
            <div className="flex items-center gap-2">
              <ImageIcon size={16} className="text-kumo-accent animate-pulse" />
              <Text size="sm">Turning your screenshot into notes…</Text>
            </div>
          </LayerCard>
        </div>
      );
    }
  }

  if (part.state === "output-available") {
    return (
      <div className="flex justify-start">
        <LayerCard className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2 mb-1">
            <GearIcon size={14} className="text-kumo-inactive" />
            <Text size="xs" variant="secondary" bold>
              {toolName}
            </Text>
            <Badge variant="secondary">Done</Badge>
          </div>
          <div className="font-mono">
            <Text size="xs" variant="secondary">
              {JSON.stringify(part.output, null, 2)}
            </Text>
          </div>
        </LayerCard>
      </div>
    );
  }

  if ("approval" in part && part.state === "approval-requested") {
    const approvalId = (part.approval as { id?: string })?.id;
    return (
      <div className="flex justify-start">
        <LayerCard className="max-w-[85%] px-4 py-3 rounded-xl ring-2 ring-kumo-warning">
          <div className="flex items-center gap-2 mb-2">
            <GearIcon size={14} className="text-kumo-warning" />
            <Text size="sm" bold>
              Approval needed: {toolName}
            </Text>
          </div>
          <div className="font-mono mb-3">
            <Text size="xs" variant="secondary">
              {JSON.stringify(part.input, null, 2)}
            </Text>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircleIcon size={14} />}
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: true });
                }
              }}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<XCircleIcon size={14} />}
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: false });
                }
              }}
            >
              Reject
            </Button>
          </div>
        </LayerCard>
      </div>
    );
  }

  if (
    part.state === "output-denied" ||
    ("approval" in part &&
      (part.approval as { approved?: boolean })?.approved === false)
  ) {
    return (
      <div className="flex justify-start">
        <LayerCard className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2">
            <XCircleIcon size={14} className="text-kumo-danger" />
            <Text size="xs" variant="secondary" bold>
              {toolName}
            </Text>
            <Badge variant="secondary">Rejected</Badge>
          </div>
        </LayerCard>
      </div>
    );
  }

  if (part.state === "input-available" || part.state === "input-streaming") {
    return (
      <div className="flex justify-start">
        <LayerCard className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2">
            <GearIcon size={14} className="text-kumo-inactive animate-spin" />
            <Text size="xs" variant="secondary">
              Running {toolName}...
            </Text>
          </div>
        </LayerCard>
      </div>
    );
  }

  return null;
}
