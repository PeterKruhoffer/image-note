import { useState } from "react";
import { Badge, Button, LayerCard, Text } from "@cloudflare/kumo";
import { BookmarkSimpleIcon, CheckCircleIcon } from "@phosphor-icons/react";
import type { NoteCandidate, SavedNote } from "../../notes";

export type SaveNote = (candidate: NoteCandidate) => Promise<SavedNote>;

interface NoteCandidatePickerProps {
  candidates: NoteCandidate[];
  saveNote: SaveNote;
}

export function NoteCandidatePicker({
  candidates,
  saveNote
}: NoteCandidatePickerProps) {
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savedIndex, setSavedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (candidate: NoteCandidate, index: number) => {
    if (savingIndex !== null || savedIndex !== null) return;
    setSavingIndex(index);
    setError(null);
    try {
      await saveNote(candidate);
      setSavedIndex(index);
    } catch (cause) {
      console.error("Failed to save note:", cause);
      setError("The note couldn’t be saved. Please try again.");
    } finally {
      setSavingIndex(null);
    }
  };

  return (
    <section className="space-y-3" aria-label="Suggested notes">
      <div className="flex items-center gap-2">
        <BookmarkSimpleIcon size={18} className="text-kumo-accent" />
        <Text size="sm" bold>
          Choose one note to save
        </Text>
        <Badge variant="secondary">3 suggestions</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {candidates.map((candidate, index) => {
          const isSaved = savedIndex === index;
          const isSaving = savingIndex === index;
          return (
            <LayerCard
              key={`${candidate.title}-${index}`}
              className={`rounded-xl ring p-4 flex flex-col gap-3 ${
                isSaved ? "ring-2 ring-kumo-success" : "ring-kumo-line"
              } ${savedIndex !== null && !isSaved ? "opacity-55" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">
                  {candidate.kind.replace("-", " ")}
                </Badge>
                <Text size="xs" variant="secondary">
                  {Math.round(candidate.confidence * 100)}% confidence
                </Text>
              </div>
              <div>
                <h3 className="font-semibold text-kumo-default leading-snug">
                  {candidate.title}
                </h3>
                {candidate.author && (
                  <p className="mt-1 text-xs text-kumo-subtle">
                    By {candidate.author}
                  </p>
                )}
              </div>
              <p className="text-sm text-kumo-default leading-relaxed line-clamp-4">
                {candidate.summary}
              </p>
              {candidate.topics.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {candidate.topics.slice(0, 4).map((topic) => (
                    <Badge key={topic} variant="secondary">
                      {topic}
                    </Badge>
                  ))}
                </div>
              )}
              <Button
                variant={isSaved ? "secondary" : "primary"}
                size="sm"
                icon={
                  isSaved ? (
                    <CheckCircleIcon size={15} />
                  ) : (
                    <BookmarkSimpleIcon size={15} />
                  )
                }
                disabled={savedIndex !== null || savingIndex !== null}
                onClick={() => choose(candidate, index)}
                className="mt-auto"
              >
                {isSaved ? "Saved" : isSaving ? "Saving…" : "Save this note"}
              </Button>
            </LayerCard>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-sm text-kumo-danger">
          {error}
        </p>
      )}
      {savedIndex !== null && (
        <p className="text-sm text-kumo-success">
          Saved to your library. The other suggestions were not stored.
        </p>
      )}
    </section>
  );
}
