import { useCallback, useEffect, useState } from "react";
import { Button, Empty, LayerCard, Text } from "@cloudflare/kumo";
import {
  BookmarkSimpleIcon,
  BooksIcon,
  ChatCircleDotsIcon
} from "@phosphor-icons/react";
import { ThemeToggle } from "../../components/theme-toggle";
import { ensureAnonymousSession } from "../../lib/anonymous-session";
import { savedNotesResponseSchema, type SavedNote } from "../../notes";
import { NoteCard } from "./note-card";

export function LibraryPage() {
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureAnonymousSession();
      const response = await fetch("/api/notes", {
        credentials: "same-origin",
        headers: { accept: "application/json" }
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const payload = savedNotesResponseSchema.parse(await response.json());
      setNotes(payload.notes);
    } catch (cause) {
      console.error("Failed to load notes:", cause);
      setError("Your library couldn’t be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const deleteNote = async (note: SavedNote) => {
    if (!window.confirm(`Delete “${note.title}”?`)) return;
    setDeletingId(note.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/notes/${encodeURIComponent(note.id)}`,
        {
          method: "DELETE",
          credentials: "same-origin"
        }
      );
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      setNotes((current) => current.filter((item) => item.id !== note.id));
    } catch (cause) {
      console.error("Failed to delete note:", cause);
      setError("That note couldn’t be deleted. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-kumo-elevated text-kumo-default">
      <header className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BooksIcon size={24} className="text-kumo-accent" />
            <div>
              <h1 className="text-lg font-semibold">Saved notes</h1>
              <p className="text-xs text-kumo-subtle">
                The ideas you chose to keep
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="primary"
              icon={<ChatCircleDotsIcon size={16} />}
              onClick={() => window.location.assign("/")}
            >
              Back to chat
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8">
        {error && (
          <LayerCard className="mb-5 rounded-xl ring ring-kumo-danger p-4 flex items-center justify-between gap-4">
            <p role="alert" className="text-sm text-kumo-danger">
              {error}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadNotes()}
            >
              Retry
            </Button>
          </LayerCard>
        )}

        {loading ? (
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Loading saved notes"
          >
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-56 rounded-xl bg-kumo-control animate-pulse"
              />
            ))}
          </div>
        ) : notes.length === 0 && !error ? (
          <Empty
            icon={<BookmarkSimpleIcon size={34} />}
            title="Your library is empty"
            contents={
              <div className="space-y-3 text-center">
                <Text size="sm" variant="secondary">
                  Add a screenshot in chat, then choose the note that captures
                  it best.
                </Text>
                <Button
                  variant="primary"
                  onClick={() => window.location.assign("/")}
                >
                  Add a screenshot
                </Button>
              </div>
            }
          />
        ) : (
          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                deleting={deletingId === note.id}
                deleteDisabled={deletingId !== null}
                onDelete={(item) => void deleteNote(item)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
