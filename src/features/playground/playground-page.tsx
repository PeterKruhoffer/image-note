import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { UserButton } from "@clerk/react";
import {
  ArrowRightIcon,
  BooksIcon,
  CheckIcon,
  ImageIcon,
  PlusIcon,
  SpinnerGapIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  XIcon
} from "@phosphor-icons/react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Link } from "react-router";
import { chatResponseSchema } from "../../chats";
import { ThemeToggle } from "../../components/theme-toggle";
import { MAX_IMAGE_BYTES_PER_MESSAGE } from "../../image-limits";
import {
  noteCandidatesOutputSchema,
  savedNoteSchema,
  type NoteCandidate
} from "../../notes";
import type { ChatAgent } from "../../server/chat-agent";
import {
  createAttachment,
  IMAGE_INPUT_ACCEPT,
  isSupportedImage,
  prepareImage,
  type Attachment,
  type PreparedImage
} from "../chat/attachments";

const MAX_CONCURRENT_JOBS = 4;

type JobPhase =
  | "queued"
  | "preparing"
  | "connecting"
  | "analyzing"
  | "complete"
  | "error";

interface PlaygroundJob extends Attachment {
  phase: JobPhase;
  chatId?: string;
  image?: PreparedImage;
  error?: string;
}

const ACTIVE_PHASES = new Set<JobPhase>([
  "preparing",
  "connecting",
  "analyzing"
]);

function phaseLabel(phase: JobPhase) {
  switch (phase) {
    case "queued":
      return "In queue";
    case "preparing":
      return "Preparing image";
    case "connecting":
      return "Waking agent";
    case "analyzing":
      return "Reading image";
    case "complete":
      return "Suggestions ready";
    case "error":
      return "Needs attention";
  }
}

function getCandidates(messages: UIMessage[]) {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const message = messages[messageIndex];
    if (!message) continue;
    for (const part of message.parts) {
      if (
        !isToolUIPart(part) ||
        getToolName(part) !== "createNoteCandidates" ||
        part.state !== "output-available"
      ) {
        continue;
      }
      const output = noteCandidatesOutputSchema.safeParse(part.output);
      if (output.success) return output.data.candidates;
    }
  }
  return null;
}

function SuggestionSet({
  candidates,
  saveNote
}: {
  candidates: NoteCandidate[];
  saveNote: (candidate: NoteCandidate) => Promise<void>;
}) {
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
      console.error("Failed to save playground suggestion:", cause);
      setError("This note could not be saved. Try it again.");
    } finally {
      setSavingIndex(null);
    }
  };

  return (
    <div className="playground-suggestions">
      <div className="playground-suggestion-heading">
        <span>Three readings</span>
        <span>Choose the one worth keeping</span>
      </div>
      <div className="playground-suggestion-grid">
        {candidates.map((candidate, index) => {
          const saved = savedIndex === index;
          const inactive = savedIndex !== null && !saved;
          return (
            <button
              type="button"
              key={`${candidate.title}-${index}`}
              className={`playground-suggestion ${saved ? "is-saved" : ""} ${
                inactive ? "is-inactive" : ""
              }`}
              disabled={savingIndex !== null || savedIndex !== null}
              onClick={() => void choose(candidate, index)}
            >
              <span className="playground-suggestion-number">0{index + 1}</span>
              <span className="playground-suggestion-kind">
                {candidate.kind.replace("-", " ")}
              </span>
              <strong>{candidate.title}</strong>
              <span className="playground-suggestion-summary">
                {candidate.summary}
              </span>
              <span className="playground-suggestion-topics">
                {candidate.topics.slice(0, 3).join(" / ")}
              </span>
              <span className="playground-suggestion-action">
                {saved ? (
                  <>
                    <CheckIcon size={14} weight="bold" /> Saved to library
                  </>
                ) : savingIndex === index ? (
                  <>
                    <SpinnerGapIcon size={14} className="animate-spin" /> Saving
                  </>
                ) : (
                  <>
                    Keep this note <ArrowRightIcon size={14} />
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="playground-inline-error">
          {error}
        </p>
      )}
    </div>
  );
}

function PlaygroundAgent({
  job,
  onPhaseChange
}: {
  job: PlaygroundJob & { chatId: string; image: PreparedImage };
  onPhaseChange: (id: string, phase: JobPhase, error?: string) => void;
}) {
  const sent = useRef(false);
  const [connected, setConnected] = useState(false);
  const reportPhase = useEffectEvent(onPhaseChange);
  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
    name: job.chatId,
    basePath: `chat/${encodeURIComponent(job.chatId)}`,
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (cause: Event) =>
        console.error("Playground agent connection failed:", cause),
      []
    )
  });
  const { messages, sendMessage, status, error } = useAgentChat({
    agent,
    experimental_throttle: 100,
    getInitialMessages: async (): Promise<UIMessage[]> => []
  });
  const candidates = getCandidates(messages);

  useEffect(() => {
    if (!connected || sent.current) return;
    sent.current = true;
    reportPhase(job.id, "analyzing");
    sendMessage({
      role: "user",
      parts: [{ type: "file", ...job.image }]
    });
  }, [connected, job.id, job.image, sendMessage]);

  useEffect(() => {
    if (candidates) reportPhase(job.id, "complete");
  }, [candidates, job.id]);

  useEffect(() => {
    if (error) {
      console.error("Playground image analysis failed:", error);
      reportPhase(job.id, "error", "The image analysis did not complete.");
    }
  }, [error, job.id]);

  const saveNote = useCallback(
    async (candidate: NoteCandidate) => {
      savedNoteSchema.parse(await agent.stub.saveNote(candidate));
    },
    [agent]
  );

  if (candidates) {
    return <SuggestionSet candidates={candidates} saveNote={saveNote} />;
  }

  return (
    <div className="playground-agent-thinking" aria-live="polite">
      <span className="playground-scan-line" />
      <div>
        <span className="playground-agent-kicker">Agent online</span>
        <strong>
          {status === "submitted"
            ? "Opening the image..."
            : "Looking for what matters..."}
        </strong>
        <p>Extracting three distinct, concise notes from this image.</p>
      </div>
    </div>
  );
}

function ImageViewer({
  job,
  onClose
}: {
  job: PlaygroundJob;
  onClose: () => void;
}) {
  const [actualSize, setActualSize] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeViewer = useEffectEvent(onClose);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeViewer();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <dialog
      open
      className="playground-image-viewer"
      aria-modal="true"
      aria-label={`Full-size preview of ${job.file.name}`}
    >
      <div className="playground-image-viewer-bar">
        <div>
          <span>Source image</span>
          <strong>{job.file.name}</strong>
        </div>
        <div className="playground-image-viewer-actions">
          <button
            type="button"
            onClick={() => setActualSize((current) => !current)}
          >
            {actualSize ? "Fit to screen" : "View at 100%"}
          </button>
          <a href={job.preview} target="_blank" rel="noreferrer">
            Open original
          </a>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close image viewer"
          >
            <XIcon size={19} />
          </button>
        </div>
      </div>
      <div
        className={`playground-image-viewer-canvas ${actualSize ? "is-actual-size" : ""}`}
      >
        <button
          type="button"
          className="playground-image-viewer-backdrop"
          aria-label="Close image viewer"
          onClick={onClose}
        />
        <img src={job.preview} alt={job.file.name} />
      </div>
      <span className="playground-image-viewer-hint">
        {actualSize ? "Scroll to inspect the full image" : "Fit to screen"} /
        Esc to close
      </span>
    </dialog>,
    document.body
  );
}

const ImageJob = memo(function ImageJob({
  job,
  index,
  onRemove,
  onRetry,
  onPhaseChange
}: {
  job: PlaygroundJob;
  index: number;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onPhaseChange: (id: string, phase: JobPhase, error?: string) => void;
}) {
  const active = ACTIVE_PHASES.has(job.phase);
  const [viewerOpen, setViewerOpen] = useState(false);

  return (
    <article className="playground-job" data-playground-job={job.id}>
      <div className="playground-job-meta">
        <span className="playground-job-index">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="playground-job-title">
          <strong title={job.file.name}>{job.file.name}</strong>
          <span>{Math.max(1, Math.round(job.file.size / 1024))} KB</span>
        </div>
        <span className={`playground-status is-${job.phase}`}>
          {active && <SpinnerGapIcon size={13} className="animate-spin" />}
          {job.phase === "complete" && <CheckIcon size={13} weight="bold" />}
          {job.phase === "error" && <WarningCircleIcon size={13} />}
          {phaseLabel(job.phase)}
        </span>
        {!active && (
          <button
            type="button"
            className="playground-icon-button"
            aria-label={`Remove ${job.file.name}`}
            onClick={() => onRemove(job.id)}
          >
            <XIcon size={16} />
          </button>
        )}
      </div>

      <div className="playground-job-body">
        <div className="playground-source">
          <button
            type="button"
            className="playground-source-button"
            aria-label={`View ${job.file.name} full size`}
            onClick={() => setViewerOpen(true)}
          >
            <img src={job.preview} alt={`Source: ${job.file.name}`} />
            <span>
              <ImageIcon size={15} /> View full size
            </span>
          </button>
          <div className="playground-source-caption">
            <span>Source image</span>
            <span>Agent {String(index + 1).padStart(2, "0")}</span>
          </div>
        </div>
        <div className="playground-output">
          {job.phase === "queued" && (
            <div className="playground-waiting">
              <span>Waiting on the desk</span>
              <p>Start the run when your contact sheet is ready.</p>
            </div>
          )}
          {job.phase === "preparing" && (
            <div className="playground-agent-thinking" aria-live="polite">
              <span className="playground-scan-line" />
              <div>
                <span className="playground-agent-kicker">
                  Setting the desk
                </span>
                <strong>{phaseLabel(job.phase)}...</strong>
                <p>Each image gets a separate durable agent and context.</p>
              </div>
            </div>
          )}
          {job.chatId && job.image && job.phase !== "error" && (
            <PlaygroundAgent
              job={
                job as PlaygroundJob & { chatId: string; image: PreparedImage }
              }
              onPhaseChange={onPhaseChange}
            />
          )}
          {job.phase === "error" && (
            <div className="playground-job-error">
              <WarningCircleIcon size={22} />
              <div>
                <strong>The agent could not finish this image.</strong>
                <p>{job.error ?? "Try preparing the image again."}</p>
              </div>
              <button type="button" onClick={() => onRetry(job.id)}>
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
      {viewerOpen && (
        <ImageViewer job={job} onClose={() => setViewerOpen(false)} />
      )}
    </article>
  );
});

export function PlaygroundPage() {
  const [jobs, setJobs] = useState<PlaygroundJob[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobsRef = useRef(jobs);
  const scrollAnchorRef = useRef<{ id: string; top: number } | null>(null);
  jobsRef.current = jobs;

  const updateJobsPreservingScroll = useCallback(
    (update: (current: PlaygroundJob[]) => PlaygroundJob[]) => {
      if (!scrollAnchorRef.current) {
        const anchor = Array.from(
          document.querySelectorAll<HTMLElement>("[data-playground-job]")
        ).find((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.bottom > 0 && bounds.top < window.innerHeight;
        });
        if (anchor?.dataset.playgroundJob) {
          scrollAnchorRef.current = {
            id: anchor.dataset.playgroundJob,
            top: anchor.getBoundingClientRect().top
          };
        }
      }
      setJobs(update);
    },
    []
  );

  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    scrollAnchorRef.current = null;
    if (!anchor) return;
    const element = document.querySelector<HTMLElement>(
      `[data-playground-job="${CSS.escape(anchor.id)}"]`
    );
    if (!element) return;
    const offset = element.getBoundingClientRect().top - anchor.top;
    if (Math.abs(offset) > 0.5) window.scrollBy(0, offset);
  }, [jobs]);

  useEffect(
    () => () => {
      for (const job of jobsRef.current) URL.revokeObjectURL(job.preview);
    },
    []
  );

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    const images = incoming.filter(isSupportedImage);
    if (images.length === 0) {
      setInputError("Use PNG, JPEG, or WebP images.");
      return;
    }
    setInputError(
      images.length < incoming.length
        ? "Some files were skipped. Use PNG, JPEG, or WebP images."
        : null
    );
    startTransition(() => {
      setJobs((current) => [
        ...current,
        ...images.map((file) => ({
          ...createAttachment(file),
          phase: "queued" as const
        }))
      ]);
    });
  }, []);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const files = Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (files.length === 0) return;
      event.preventDefault();
      addFiles(files);
    },
    [addFiles]
  );

  const updatePhase = useCallback(
    (id: string, phase: JobPhase, error?: string) => {
      updateJobsPreservingScroll((current) =>
        current.map((job) => (job.id === id ? { ...job, phase, error } : job))
      );
    },
    [updateJobsPreservingScroll]
  );

  const prepareJob = useEffectEvent(async (job: PlaygroundJob) => {
    try {
      const image = await prepareImage(job.file, MAX_IMAGE_BYTES_PER_MESSAGE);
      const response = await fetch("/api/chats", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json" }
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const { chat } = chatResponseSchema.parse(await response.json());
      updateJobsPreservingScroll((current) =>
        current.map((item) =>
          item.id === job.id
            ? { ...item, image, chatId: chat.id, phase: "connecting" }
            : item
        )
      );
    } catch (cause) {
      console.error("Failed to start playground agent:", cause);
      updatePhase(
        job.id,
        "error",
        "The image could not be prepared or its agent could not be created."
      );
    }
  });

  useEffect(() => {
    if (!running) return;
    const activeCount = jobs.filter((job) =>
      ACTIVE_PHASES.has(job.phase)
    ).length;
    const available = Math.max(0, MAX_CONCURRENT_JOBS - activeCount);
    const next = jobs
      .filter((job) => job.phase === "queued")
      .slice(0, available);

    if (next.length > 0) {
      const ids = new Set(next.map((job) => job.id));
      updateJobsPreservingScroll((current) =>
        current.map((job) =>
          ids.has(job.id) ? { ...job, phase: "preparing" } : job
        )
      );
      for (const job of next) void prepareJob(job);
      return;
    }

    if (activeCount === 0) setRunning(false);
  }, [jobs, running, updateJobsPreservingScroll]);

  const removeJob = useCallback(
    (id: string) => {
      updateJobsPreservingScroll((current) => {
        const job = current.find((item) => item.id === id);
        if (job) URL.revokeObjectURL(job.preview);
        return current.filter((item) => item.id !== id);
      });
    },
    [updateJobsPreservingScroll]
  );

  const retryJob = useCallback(
    (id: string) => {
      updateJobsPreservingScroll((current) =>
        current.map((job) =>
          job.id === id
            ? {
                ...job,
                phase: "queued",
                error: undefined,
                chatId: undefined,
                image: undefined
              }
            : job
        )
      );
      setRunning(true);
    },
    [updateJobsPreservingScroll]
  );

  const clearFinished = () => {
    updateJobsPreservingScroll((current) => {
      const removed = current.filter((job) => !ACTIVE_PHASES.has(job.phase));
      for (const job of removed) URL.revokeObjectURL(job.preview);
      return current.filter((job) => ACTIVE_PHASES.has(job.phase));
    });
  };

  const queuedCount = jobs.filter((job) => job.phase === "queued").length;
  const completeCount = jobs.filter((job) => job.phase === "complete").length;

  return (
    <div
      className="playground-shell"
      onPaste={handlePaste}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes("Files")) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length > 0)
          addFiles(event.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="playground-drop-overlay">
          <UploadSimpleIcon size={42} />
          <strong>Release the images</strong>
          <span>They will join the contact sheet</span>
        </div>
      )}

      <header className="playground-header">
        <Link to="/playground" className="playground-brand">
          <span>IM</span>
          <strong>Image Mind</strong>
        </Link>
        <nav aria-label="Primary navigation">
          <Link to="/">Chat</Link>
          <Link to="/library">
            <BooksIcon size={15} /> Library
          </Link>
          <ThemeToggle />
          <UserButton />
        </nav>
      </header>

      <main>
        <section className="playground-intro">
          <div className="playground-eyebrow">
            <span>Playground 01</span>
            <span>Parallel image desk</span>
          </div>
          <div className="playground-intro-grid">
            <h1>
              Drop the chat.
              <br />
              <em>Keep the ideas.</em>
            </h1>
            <div className="playground-thesis">
              <p>
                Upload a stack of images. Each one gets its own agent, its own
                context, and three concise ways to remember what matters.
              </p>
              <div className="playground-method">
                <span>
                  <b>01</b> Add images
                </span>
                <span>
                  <b>02</b> Agents read in parallel
                </span>
                <span>
                  <b>03</b> Keep your best notes
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          className="playground-controls"
          aria-label="Image upload controls"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={IMAGE_INPUT_ACCEPT}
            className="hidden"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="playground-add-button"
            onClick={() => fileInputRef.current?.click()}
          >
            <span>
              <PlusIcon size={23} />
            </span>
            <strong>Add images</strong>
            <small>Browse, drop, or paste a collection</small>
          </button>
          <div className="playground-run-panel">
            <div>
              <span className="playground-run-count">{jobs.length}</span>
              <span>images on desk</span>
            </div>
            <div>
              <span className="playground-run-count">{completeCount}</span>
              <span>finished</span>
            </div>
            <button
              type="button"
              disabled={queuedCount === 0 || running}
              onClick={() => setRunning(true)}
            >
              {running ? (
                <>
                  <SpinnerGapIcon size={17} className="animate-spin" /> Agents
                  working
                </>
              ) : (
                <>
                  Run {queuedCount || "the"}{" "}
                  {queuedCount === 1 ? "agent" : "agents"}{" "}
                  <ArrowRightIcon size={17} />
                </>
              )}
            </button>
          </div>
        </section>
        {inputError && (
          <p role="alert" className="playground-input-error">
            {inputError}
          </p>
        )}

        {jobs.length === 0 ? (
          <section className="playground-empty">
            <div className="playground-empty-mark">
              <ImageIcon size={48} weight="thin" />
            </div>
            <p>Your contact sheet is empty.</p>
            <span>
              PNG, JPEG, or WebP. Add one image or an entire visual backlog.
            </span>
          </section>
        ) : (
          <section className="playground-desk" aria-label="Image analysis jobs">
            <div className="playground-desk-heading">
              <span>
                Contact sheet / {String(jobs.length).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={clearFinished}
                disabled={jobs.every((job) => ACTIVE_PHASES.has(job.phase))}
              >
                <TrashIcon size={14} /> Clear inactive
              </button>
            </div>
            {jobs.map((job, index) => (
              <ImageJob
                key={job.id}
                job={job}
                index={index}
                onRemove={removeJob}
                onRetry={retryJob}
                onPhaseChange={updatePhase}
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
