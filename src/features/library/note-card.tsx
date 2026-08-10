import {
  ArrowSquareOutIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  TrashIcon
} from "@phosphor-icons/react";
import type { SavedNote } from "../../notes";

interface NoteCardProps {
  note: SavedNote;
  index: number;
  viewMode: "grid" | "list";
  deleting: boolean;
  deleteDisabled: boolean;
  onTopicSelect: (topic: string) => void;
  onDelete: (note: SavedNote) => void;
}

const KIND_LABELS: Record<SavedNote["kind"], string> = {
  tweet: "Tweet",
  article: "Article",
  "social-post": "Social post",
  quote: "Quote",
  other: "Note"
};

export function NoteCard({
  note,
  index,
  viewMode,
  deleting,
  deleteDisabled,
  onTopicSelect,
  onDelete
}: NoteCardProps) {
  const sourceName = getSourceName(note.sourceUrl);

  return (
    <article className="library-note-card">
      <div className="library-note-index">
        {(index + 1).toString().padStart(2, "0")}
      </div>
      <div className="library-note-content">
        <div className="library-note-meta">
          <span>{KIND_LABELS[note.kind]}</span>
          {sourceName && <span>{sourceName}</span>}
        </div>

        <div className="library-note-heading">
          <h3>{note.title}</h3>
          {note.author && <p>By {note.author}</p>}
        </div>

        <p className="library-note-summary">{note.summary}</p>

        {note.topics.length > 0 && (
          <div className="library-note-topics" aria-label="Topics">
            {note.topics.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => onTopicSelect(topic)}
              >
                #{topic}
              </button>
            ))}
          </div>
        )}

        <details className="library-note-details">
          <summary>
            <span>{viewMode === "list" ? "View full note" : "Read note"}</span>
            <CaretDownIcon size={14} />
          </summary>
          <p>{note.content}</p>
        </details>
      </div>

      <footer className="library-note-footer">
        <div>
          <CalendarBlankIcon size={14} />
          <span>{formatNoteDate(note.publishedAt ?? note.createdAt)}</span>
        </div>
        <div className="library-note-actions">
          {note.sourceUrl && (
            <a
              href={note.sourceUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open source for ${note.title}`}
              title="Open source"
            >
              <ArrowSquareOutIcon size={17} />
            </a>
          )}
          <button
            type="button"
            disabled={deleteDisabled}
            onClick={() => onDelete(note)}
            aria-label={`Delete ${note.title}`}
            title={deleting ? "Deleting…" : "Delete note"}
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </footer>
    </article>
  );
}

function getSourceName(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function formatNoteDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
      }).format(date);
}
