import { Badge, Button, LayerCard, Text } from "@cloudflare/kumo";
import {
  ArrowSquareOutIcon,
  CalendarBlankIcon,
  TrashIcon
} from "@phosphor-icons/react";
import type { SavedNote } from "../../notes";

interface NoteCardProps {
  note: SavedNote;
  deleting: boolean;
  deleteDisabled: boolean;
  onDelete: (note: SavedNote) => void;
}

export function NoteCard({
  note,
  deleting,
  deleteDisabled,
  onDelete
}: NoteCardProps) {
  return (
    <LayerCard className="rounded-xl ring ring-kumo-line p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="secondary">{note.kind.replace("-", " ")}</Badge>
        <Text size="xs" variant="secondary">
          {Math.round(note.confidence * 100)}% confidence
        </Text>
      </div>
      <div>
        <h2 className="font-semibold leading-snug">{note.title}</h2>
        {note.author && (
          <p className="mt-1 text-xs text-kumo-subtle">By {note.author}</p>
        )}
      </div>
      <p className="text-sm leading-relaxed text-kumo-default">
        {note.summary}
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer text-kumo-accent">
          Read extracted text
        </summary>
        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-kumo-subtle">
          {note.content}
        </p>
      </details>
      {note.topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {note.topics.map((topic) => (
            <Badge key={topic} variant="secondary">
              {topic}
            </Badge>
          ))}
        </div>
      )}
      <div className="pt-3 border-t border-kumo-line space-y-2">
        {(note.publishedAt || note.createdAt) && (
          <div className="flex items-center gap-1.5 text-xs text-kumo-subtle">
            <CalendarBlankIcon size={13} />
            {formatNoteDate(note.publishedAt ?? note.createdAt)}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          {note.sourceUrl ? (
            <a
              href={note.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-kumo-accent hover:underline"
            >
              Open source <ArrowSquareOutIcon size={14} />
            </a>
          ) : (
            <span />
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<TrashIcon size={14} />}
            disabled={deleteDisabled}
            onClick={() => onDelete(note)}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </LayerCard>
  );
}

function formatNoteDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
