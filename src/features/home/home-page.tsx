import {
  memo,
  startTransition,
  Suspense,
  use,
  useActionState,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition
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
import { Link } from "react-router";
import { ThemeToggle } from "../../components/theme-toggle";
import { imageAnalysisResponseSchema } from "../../image-analysis";
import { savedNoteSchema, type NoteCandidate } from "../../notes";
import {
  createImageAttachment,
  IMAGE_INPUT_ACCEPT,
  isSupportedImage,
  prepareImage,
  type ImageAttachment,
  type PreparedImage
} from "./image-attachments";

const MAX_CONCURRENT_JOBS = 4;

type JobPhase = "queued" | "preparing" | "analyzing" | "complete" | "error";

interface HomeJob extends ImageAttachment {
  phase: JobPhase;
  imagePreparation?: Promise<ImagePreparationResult>;
  analysis?: Promise<AnalysisResult>;
  error?: string;
}

interface SetupFailure {
  ok: false;
  error: string;
}

type ImagePreparationResult = { ok: true; image: PreparedImage } | SetupFailure;

type AnalysisResult = { ok: true; candidates: NoteCandidate[] } | SetupFailure;

const ACTIVE_PHASES = new Set<JobPhase>(["preparing", "analyzing"]);

function phaseLabel(phase: JobPhase) {
  switch (phase) {
    case "queued":
      return "In queue";
    case "preparing":
      return "Preparing image";
    case "analyzing":
      return "Reading image";
    case "complete":
      return "Suggestions ready";
    case "error":
      return "Needs attention";
  }
}

function createJobResources(file: File) {
  const imagePreparation: Promise<ImagePreparationResult> = prepareImage(
    file
  ).then(
    (image) => ({ ok: true, image }),
    (cause) => {
      console.error("Failed to prepare home image:", cause);
      return {
        ok: false,
        error: "The image could not be prepared. Try a smaller screenshot."
      };
    }
  );

  const analysis: Promise<AnalysisResult> = imagePreparation.then(
    async (prepared) => {
      if (!prepared.ok) return prepared;
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            accept: "application/json",
            "content-type": "application/json"
          },
          body: JSON.stringify(prepared.image)
        });
        if (!response.ok)
          throw new Error(`Request failed (${response.status})`);
        const { candidates } = imageAnalysisResponseSchema.parse(
          await response.json()
        );
        return { ok: true, candidates };
      } catch (cause) {
        console.error("Failed to analyze home image:", cause);
        return {
          ok: false,
          error: "The image analysis did not complete."
        };
      }
    }
  );

  return { imagePreparation, analysis };
}

function SuggestionSet({
  candidates,
  saveNote
}: {
  candidates: NoteCandidate[];
  saveNote: (candidate: NoteCandidate) => Promise<void>;
}) {
  const [saveState, saveAction, isSaving] = useActionState<
    { savedIndex: number | null; error: string | null },
    { candidate: NoteCandidate; index: number }
  >(
    async (
      _previous: { savedIndex: number | null; error: string | null },
      selection: { candidate: NoteCandidate; index: number }
    ) => {
      try {
        await saveNote(selection.candidate);
        return { savedIndex: selection.index, error: null };
      } catch (cause) {
        console.error("Failed to save home suggestion:", cause);
        return {
          savedIndex: null,
          error: "This note could not be saved. Try it again."
        };
      }
    },
    { savedIndex: null, error: null }
  );
  const [optimisticIndex, chooseOptimistically] = useOptimistic(
    saveState.savedIndex,
    (_current, index: number) => index
  );

  const choose = (candidate: NoteCandidate, index: number) => {
    if (isSaving || saveState.savedIndex !== null) return;
    startTransition(() => {
      chooseOptimistically(index);
      saveAction({ candidate, index });
    });
  };

  return (
    <div className="home-suggestions">
      <div className="home-suggestion-heading">
        <span>Three readings</span>
        <span>Choose the one worth keeping</span>
      </div>
      <div className="home-suggestion-grid">
        {candidates.map((candidate, index) => {
          const saved = saveState.savedIndex === index;
          const saving = isSaving && optimisticIndex === index;
          const inactive =
            optimisticIndex !== null && optimisticIndex !== index;
          return (
            <button
              type="button"
              key={`${candidate.title}-${index}`}
              className={`home-suggestion ${saved ? "is-saved" : ""} ${
                inactive ? "is-inactive" : ""
              }`}
              disabled={isSaving || saveState.savedIndex !== null}
              onClick={() => choose(candidate, index)}
            >
              <span className="home-suggestion-number">0{index + 1}</span>
              <span className="home-suggestion-kind">
                {candidate.kind.replace("-", " ")}
              </span>
              <strong>{candidate.title}</strong>
              <span className="home-suggestion-summary">
                {candidate.summary}
              </span>
              <span className="home-suggestion-topics">
                {candidate.topics.slice(0, 3).join(" / ")}
              </span>
              <span className="home-suggestion-action">
                {saved ? (
                  <>
                    <CheckIcon size={14} weight="bold" /> Saved to library
                  </>
                ) : saving ? (
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
      {saveState.error && (
        <p role="alert" className="home-inline-error">
          {saveState.error}
        </p>
      )}
    </div>
  );
}

function AnalyzedImageJob({
  jobId,
  analysis,
  onPhaseChange
}: {
  jobId: string;
  analysis: Promise<AnalysisResult>;
  onPhaseChange: (id: string, phase: JobPhase, error?: string) => void;
}) {
  const result = use(analysis);
  const reportPhase = useEffectEvent(onPhaseChange);

  useEffect(() => {
    if (result.ok) reportPhase(jobId, "complete");
    else reportPhase(jobId, "error", result.error);
  }, [jobId, result]);

  const saveNote = useCallback(async (candidate: NoteCandidate) => {
    const response = await fetch("/api/notes", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(candidate)
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    const payload = (await response.json()) as { note?: unknown };
    savedNoteSchema.parse(payload.note);
  }, []);

  return result.ok ? (
    <SuggestionSet candidates={result.candidates} saveNote={saveNote} />
  ) : null;
}

function JobLoadingState({
  stage,
  title,
  description
}: {
  stage: string;
  title: string;
  description: string;
}) {
  return (
    <div className="home-analysis-thinking" aria-live="polite">
      <span className="home-scan-line" />
      <div>
        <span className="home-analysis-kicker">{stage}</span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

function SetupFailureView({
  jobId,
  error,
  onPhaseChange
}: {
  jobId: string;
  error: string;
  onPhaseChange: (id: string, phase: JobPhase, error?: string) => void;
}) {
  const reportPhase = useEffectEvent(onPhaseChange);
  useEffect(() => reportPhase(jobId, "error", error), [error, jobId]);
  return (
    <JobLoadingState
      stage="Setup interrupted"
      title="This image needs another try."
      description={error}
    />
  );
}

function PreparedImageJob({
  jobId,
  imagePreparation,
  analysis,
  onPhaseChange
}: {
  jobId: string;
  imagePreparation: Promise<ImagePreparationResult>;
  analysis: Promise<AnalysisResult>;
  onPhaseChange: (id: string, phase: JobPhase, error?: string) => void;
}) {
  const prepared = use(imagePreparation);
  const reportPhase = useEffectEvent(onPhaseChange);
  useEffect(() => {
    if (prepared.ok) reportPhase(jobId, "analyzing");
  }, [jobId, prepared]);

  if (!prepared.ok) {
    return (
      <SetupFailureView
        jobId={jobId}
        error={prepared.error}
        onPhaseChange={onPhaseChange}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <JobLoadingState
          stage="Stage 02 / Analysis"
          title="Looking for what matters..."
          description="Extracting three distinct, concise notes from this image."
        />
      }
    >
      <AnalyzedImageJob
        jobId={jobId}
        analysis={analysis}
        onPhaseChange={onPhaseChange}
      />
    </Suspense>
  );
}

function ImageViewer({ job, onClose }: { job: HomeJob; onClose: () => void }) {
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
      className="home-image-viewer"
      aria-modal="true"
      aria-label={`Full-size preview of ${job.file.name}`}
    >
      <div className="home-image-viewer-bar">
        <div>
          <span>Source image</span>
          <strong>{job.file.name}</strong>
        </div>
        <div className="home-image-viewer-actions">
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
        className={`home-image-viewer-canvas ${actualSize ? "is-actual-size" : ""}`}
      >
        <button
          type="button"
          className="home-image-viewer-backdrop"
          aria-label="Close image viewer"
          onClick={onClose}
        />
        <img src={job.preview} alt={job.file.name} />
      </div>
      <span className="home-image-viewer-hint">
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
  job: HomeJob;
  index: number;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onPhaseChange: (id: string, phase: JobPhase, error?: string) => void;
}) {
  const active = ACTIVE_PHASES.has(job.phase);
  const [viewerOpen, setViewerOpen] = useState(false);

  return (
    <article className="home-job" data-home-job={job.id}>
      <div className="home-job-meta">
        <span className="home-job-index">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="home-job-title">
          <strong title={job.file.name}>{job.file.name}</strong>
          <span>{Math.max(1, Math.round(job.file.size / 1024))} KB</span>
        </div>
        <span className={`home-status is-${job.phase}`}>
          {active && <SpinnerGapIcon size={13} className="animate-spin" />}
          {job.phase === "complete" && <CheckIcon size={13} weight="bold" />}
          {job.phase === "error" && <WarningCircleIcon size={13} />}
          {phaseLabel(job.phase)}
        </span>
        {!active && (
          <button
            type="button"
            className="home-icon-button"
            aria-label={`Remove ${job.file.name}`}
            onClick={() => onRemove(job.id)}
          >
            <XIcon size={16} />
          </button>
        )}
      </div>

      <div className="home-job-body">
        <div className="home-source">
          <button
            type="button"
            className="home-source-button"
            aria-label={`View ${job.file.name} full size`}
            onClick={() => setViewerOpen(true)}
          >
            <img src={job.preview} alt={`Source: ${job.file.name}`} />
            <span>
              <ImageIcon size={15} /> View full size
            </span>
          </button>
          <div className="home-source-caption">
            <span>Source image</span>
            <span>Image {String(index + 1).padStart(2, "0")}</span>
          </div>
        </div>
        <div className="home-output">
          {job.phase === "queued" && (
            <div className="home-waiting">
              <span>Waiting on the desk</span>
              <p>Start the run when your contact sheet is ready.</p>
            </div>
          )}
          {job.imagePreparation && job.analysis && job.phase !== "error" && (
            <Suspense
              fallback={
                <JobLoadingState
                  stage="Stage 01 / Image"
                  title="Optimizing the screenshot..."
                  description="Preparing a readable image without blocking the rest of the desk."
                />
              }
            >
              <PreparedImageJob
                jobId={job.id}
                imagePreparation={job.imagePreparation}
                analysis={job.analysis}
                onPhaseChange={onPhaseChange}
              />
            </Suspense>
          )}
          {job.phase === "error" && (
            <div className="home-job-error">
              <WarningCircleIcon size={22} />
              <div>
                <strong>The analysis could not finish this image.</strong>
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

export function HomePage() {
  const [jobs, setJobs] = useState<HomeJob[]>([]);
  const [running, setRunning] = useState(false);
  const [isStartingRun, startRunTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobsRef = useRef(jobs);
  const scrollAnchorRef = useRef<{ id: string; top: number } | null>(null);
  jobsRef.current = jobs;

  const updateJobsPreservingScroll = useCallback(
    (update: (current: HomeJob[]) => HomeJob[]) => {
      if (!scrollAnchorRef.current) {
        const anchor = Array.from(
          document.querySelectorAll<HTMLElement>("[data-home-job]")
        ).find((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.bottom > 0 && bounds.top < window.innerHeight;
        });
        if (anchor?.dataset.homeJob) {
          scrollAnchorRef.current = {
            id: anchor.dataset.homeJob,
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
      `[data-home-job="${CSS.escape(anchor.id)}"]`
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
          ...createImageAttachment(file),
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
      startTransition(() => {
        updateJobsPreservingScroll((current) =>
          current.map((job) => (job.id === id ? { ...job, phase, error } : job))
        );
      });
    },
    [updateJobsPreservingScroll]
  );

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
      const resources = new Map(
        next.map((job) => [job.id, createJobResources(job.file)])
      );
      startTransition(() => {
        updateJobsPreservingScroll((current) =>
          current.map((job) => {
            const setup = resources.get(job.id);
            return setup ? { ...job, ...setup, phase: "preparing" } : job;
          })
        );
      });
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
      startRunTransition(() => {
        updateJobsPreservingScroll((current) =>
          current.map((job) =>
            job.id === id
              ? {
                  ...job,
                  phase: "queued",
                  error: undefined,
                  imagePreparation: undefined,
                  analysis: undefined
                }
              : job
          )
        );
        setRunning(true);
      });
    },
    [startRunTransition, updateJobsPreservingScroll]
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
      className="home-shell"
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
        <div className="home-drop-overlay">
          <UploadSimpleIcon size={42} />
          <strong>Release the images</strong>
          <span>They will join the contact sheet</span>
        </div>
      )}

      <header className="home-header">
        <Link to="/" className="home-brand">
          <span>IM</span>
          <strong>Image Mind</strong>
        </Link>
        <nav aria-label="Primary navigation">
          <Link to="/library">
            <BooksIcon size={15} /> Library
          </Link>
          <ThemeToggle />
          <UserButton />
        </nav>
      </header>

      <main>
        <section className="home-intro">
          <div className="home-intro-grid">
            <h1>
              Drop the images.
              <br />
              <em>Keep the ideas.</em>
            </h1>
            <div className="home-method">
              <span>
                <b>01</b> Add images
              </span>
              <span>
                <b>02</b> Analyze in parallel
              </span>
              <span>
                <b>03</b> Keep your best notes
              </span>
            </div>
          </div>
        </section>

        <section className="home-controls" aria-label="Image upload controls">
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
            className="home-add-button"
            onClick={() => fileInputRef.current?.click()}
          >
            <span>
              <PlusIcon size={23} />
            </span>
            <strong>Add images</strong>
            <small>Browse, drop, or paste a collection</small>
          </button>
          <div className="home-run-panel">
            <div>
              <span className="home-run-count">{jobs.length}</span>
              <span>images on desk</span>
            </div>
            <div>
              <span className="home-run-count">{completeCount}</span>
              <span>finished</span>
            </div>
            <button
              type="button"
              disabled={queuedCount === 0 || running || isStartingRun}
              onClick={() =>
                startRunTransition(() => {
                  setRunning(true);
                })
              }
            >
              {running || isStartingRun ? (
                <>
                  <SpinnerGapIcon size={17} className="animate-spin" />
                  Analyzing
                </>
              ) : (
                <>
                  Analyze {queuedCount || "the"}{" "}
                  {queuedCount === 1 ? "image" : "images"}{" "}
                  <ArrowRightIcon size={17} />
                </>
              )}
            </button>
          </div>
        </section>
        {inputError && (
          <p role="alert" className="home-input-error">
            {inputError}
          </p>
        )}

        {jobs.length === 0 ? (
          <section className="home-empty">
            <div className="home-empty-mark">
              <ImageIcon size={48} weight="thin" />
            </div>
            <p>Your contact sheet is empty.</p>
            <span>
              PNG, JPEG, or WebP. Add one image or an entire visual backlog.
            </span>
          </section>
        ) : (
          <section className="home-desk" aria-label="Image analysis jobs">
            <div className="home-desk-heading">
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
