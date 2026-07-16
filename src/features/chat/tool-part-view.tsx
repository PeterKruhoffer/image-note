import { Badge, Button, LayerCard, Text } from "@cloudflare/kumo";
import {
  CheckCircleIcon,
  GearIcon,
  ImageIcon,
  XCircleIcon
} from "@phosphor-icons/react";
import {
  getToolName,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage
} from "ai";
import {
  noteCandidateBatchOutputSchema,
  noteCandidatesOutputSchema
} from "../../notes";
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

type AnyToolUIPart = ToolUIPart | DynamicToolUIPart;

function InvalidImageToolOutput({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex justify-start">
      <LayerCard className="max-w-[85%] px-4 py-3 rounded-xl ring ring-kumo-line">
        <Text size="sm" bold>
          {title}
        </Text>
        <Text size="xs" variant="secondary">
          {description}
        </Text>
      </LayerCard>
    </div>
  );
}

function ImageToolLoading({ children }: { children: string }) {
  return (
    <div className="flex justify-start">
      <LayerCard className="max-w-[85%] px-4 py-3 rounded-xl ring ring-kumo-line">
        <div className="flex items-center gap-2">
          <ImageIcon size={16} className="text-kumo-accent animate-pulse" />
          <Text size="sm">{children}</Text>
        </div>
      </LayerCard>
    </div>
  );
}

function NoteCandidatesOutput({
  output,
  saveNote
}: {
  output: unknown;
  saveNote: SaveNote;
}) {
  const parsed = noteCandidatesOutputSchema.safeParse(output);
  if (!parsed.success) {
    return (
      <InvalidImageToolOutput
        title="Couldn’t display note suggestions"
        description="The screenshot analysis returned an unexpected format. Please try again."
      />
    );
  }

  return (
    <NoteCandidatePicker
      candidates={parsed.data.candidates}
      saveNote={saveNote}
    />
  );
}

function NoteCandidatesPart({
  part,
  saveNote
}: {
  part: AnyToolUIPart;
  saveNote: SaveNote;
}) {
  switch (part.state) {
    case "output-available":
      return <NoteCandidatesOutput output={part.output} saveNote={saveNote} />;
    case "input-available":
    case "input-streaming":
      return (
        <ImageToolLoading>Turning your screenshot into notes…</ImageToolLoading>
      );
    default:
      return null;
  }
}

function NoteCandidateBatchOutput({
  output,
  saveNote
}: {
  output: unknown;
  saveNote: SaveNote;
}) {
  const parsed = noteCandidateBatchOutputSchema.safeParse(output);
  if (!parsed.success) {
    return (
      <InvalidImageToolOutput
        title="Couldn’t display batch suggestions"
        description="The image analysis returned an unexpected format. Please try again."
      />
    );
  }

  return (
    <section className="space-y-6" aria-label="Notes from attached images">
      <div className="flex items-center gap-2">
        <ImageIcon size={18} className="text-kumo-accent" />
        <Text size="sm" bold>
          Notes from {parsed.data.images.length} images
        </Text>
        <Badge variant="secondary">Separate results</Badge>
      </div>
      {parsed.data.images.map((image) => (
        <div
          key={image.imageIndex}
          className="border-l-2 border-kumo-line pl-4"
        >
          <NoteCandidatePicker
            candidates={image.candidates}
            saveNote={saveNote}
            sourceLabel={`Image ${image.imageIndex}`}
          />
        </div>
      ))}
    </section>
  );
}

function NoteCandidateBatchPart({
  part,
  saveNote
}: {
  part: AnyToolUIPart;
  saveNote: SaveNote;
}) {
  switch (part.state) {
    case "output-available":
      return (
        <NoteCandidateBatchOutput output={part.output} saveNote={saveNote} />
      );
    case "input-available":
    case "input-streaming":
      return (
        <ImageToolLoading>
          Turning your images into separate notes…
        </ImageToolLoading>
      );
    default:
      return null;
  }
}

export function ToolPartView({
  part,
  addToolApprovalResponse,
  saveNote
}: ToolPartViewProps) {
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);

  if (toolName === "createNoteCandidates") {
    return <NoteCandidatesPart part={part} saveNote={saveNote} />;
  }

  if (toolName === "createNoteCandidateBatch") {
    return <NoteCandidateBatchPart part={part} saveNote={saveNote} />;
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
