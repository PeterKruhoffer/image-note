import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { UserButton } from "@clerk/react";
import { Button, LayerCard } from "@cloudflare/kumo";
import {
  ArrowLeftIcon,
  ArticleIcon,
  BookmarkSimpleIcon,
  ChatCircleDotsIcon,
  GridFourIcon,
  HashIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  QuotesIcon,
  SparkleIcon,
  XIcon
} from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { ThemeToggle } from "../../components/theme-toggle";
import {
  savedNotesResponseSchema,
  type NoteKind,
  type SavedNote
} from "../../notes";
import { NoteCard } from "./note-card";

type Category = "all" | "article" | "social" | "quote" | "other";
type SortOrder = "newest" | "oldest" | "title";
type ViewMode = "grid" | "list";

const CATEGORY_LABELS: Record<Category, string> = {
  all: "Everything",
  article: "Articles",
  social: "Social",
  quote: "Quotes",
  other: "Other"
};

const CATEGORY_META: Array<{
  id: Exclude<Category, "all">;
  description: string;
  icon: ReactNode;
}> = [
  {
    id: "article",
    description: "Long reads and useful references",
    icon: <ArticleIcon size={22} />
  },
  {
    id: "social",
    description: "Posts, threads and quick ideas",
    icon: <ChatCircleDotsIcon size={22} />
  },
  {
    id: "quote",
    description: "Words worth returning to",
    icon: <QuotesIcon size={22} />
  },
  {
    id: "other",
    description: "Everything that defies a label",
    icon: <SparkleIcon size={22} />
  }
];

function categoryForKind(kind: NoteKind): Exclude<Category, "all"> {
  if (kind === "tweet" || kind === "social-post") return "social";
  return kind;
}

export function LibraryPage() {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [topic, setTopic] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/notes?limit=100", {
        credentials: "same-origin",
        headers: { accept: "application/json" }
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const payload = savedNotesResponseSchema.parse(await response.json());
      setNotes(payload.notes);
      setNextCursor(payload.nextCursor);
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

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        cursor: nextCursor,
        limit: "100"
      });
      const response = await fetch(`/api/notes?${queryParams}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" }
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const payload = savedNotesResponseSchema.parse(await response.json());
      setNotes((current) => [...current, ...payload.notes]);
      setNextCursor(payload.nextCursor);
    } catch (cause) {
      console.error("Failed to load more notes:", cause);
      setError("More notes couldn’t be loaded. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  };

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

  const categoryCounts = useMemo(() => {
    const counts: Record<Exclude<Category, "all">, number> = {
      article: 0,
      social: 0,
      quote: 0,
      other: 0
    };
    for (const note of notes) counts[categoryForKind(note.kind)] += 1;
    return counts;
  }, [notes]);

  const topicSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      for (const item of note.topics) {
        counts.set(item, (counts.get(item) ?? 0) + 1);
      }
    }
    const entries = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    return { total: entries.length, popular: entries.slice(0, 10) };
  }, [notes]);

  const topics = topicSummary.popular;

  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const result = notes.filter((note) => {
      if (category !== "all" && categoryForKind(note.kind) !== category) {
        return false;
      }
      if (topic && !note.topics.includes(topic)) return false;
      if (!normalizedQuery) return true;
      const searchable = [
        note.title,
        note.author,
        note.summary,
        note.content,
        note.kind.replace("-", " "),
        ...note.topics
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return searchable.includes(normalizedQuery);
    });

    return result.sort((a, b) => {
      if (sortOrder === "title") return a.title.localeCompare(b.title);
      const difference =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return sortOrder === "newest" ? difference : -difference;
    });
  }, [category, notes, query, sortOrder, topic]);

  const hasFilters = Boolean(query.trim() || category !== "all" || topic);
  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setTopic(null);
  };

  const topTopic = topics[0]?.[0] ?? "—";

  return (
    <div className="library-shell">
      <header className="library-header">
        <button
          type="button"
          className="library-brand"
          onClick={() => void navigate("/")}
          aria-label="Back to home"
        >
          <span className="library-brand-mark">IM</span>
          <span>
            <strong>Image Mind</strong>
            <small>Library</small>
          </span>
        </button>
        <div className="library-header-actions">
          <ThemeToggle />
          <UserButton />
          <Button
            variant="primary"
            icon={<ArrowLeftIcon size={16} />}
            onClick={() => void navigate("/")}
          >
            Back to home
          </Button>
        </div>
      </header>

      <main className="library-main">
        {error && (
          <LayerCard className="library-error">
            <p role="alert">{error}</p>
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
          <LibrarySkeleton />
        ) : notes.length === 0 && !error ? (
          <EmptyLibrary onAdd={() => void navigate("/")} />
        ) : (
          <>
            <section
              className="library-overview"
              aria-label="Library search and summary"
            >
              <div className="library-search-wrap">
                <MagnifyingGlassIcon size={24} aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search a phrase, person, topic, or idea…"
                  aria-label="Search your library"
                />
                {query ? (
                  <button
                    type="button"
                    className="library-clear-search"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <XIcon size={16} />
                  </button>
                ) : (
                  <kbd>/</kbd>
                )}
              </div>

              <dl className="library-stats">
                <div>
                  <dt>Collected</dt>
                  <dd>{notes.length}</dd>
                </div>
                <div>
                  <dt>Topics</dt>
                  <dd>{topicSummary.total}</dd>
                </div>
                <div>
                  <dt>Top thread</dt>
                  <dd title={topTopic}>{topTopic}</dd>
                </div>
              </dl>
            </section>

            <section className="library-browse" aria-labelledby="browse-title">
              <div className="library-section-heading">
                <div>
                  <span>01</span>
                  <h2 id="browse-title">Browse by shelf</h2>
                </div>
                <button
                  type="button"
                  className={category === "all" ? "is-placeholder" : ""}
                  aria-hidden={category === "all"}
                  tabIndex={category === "all" ? -1 : 0}
                  onClick={() => setCategory("all")}
                >
                  Show everything
                </button>
              </div>

              <div className="library-category-grid">
                {CATEGORY_META.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={category === item.id ? "is-active" : ""}
                    aria-pressed={category === item.id}
                    onClick={() =>
                      setCategory((current) =>
                        current === item.id ? "all" : item.id
                      )
                    }
                  >
                    <span className="library-category-icon">{item.icon}</span>
                    <span className="library-category-count">
                      {categoryCounts[item.id].toString().padStart(2, "0")}
                    </span>
                    <strong>{CATEGORY_LABELS[item.id]}</strong>
                    <small>{item.description}</small>
                  </button>
                ))}
              </div>

              {topics.length > 0 && (
                <div className="library-topic-row" aria-label="Popular topics">
                  <span>
                    <HashIcon size={15} /> Popular threads
                  </span>
                  <div>
                    {topics.map(([item, count]) => (
                      <button
                        key={item}
                        type="button"
                        className={topic === item ? "is-active" : ""}
                        aria-pressed={topic === item}
                        onClick={() =>
                          setTopic((current) =>
                            current === item ? null : item
                          )
                        }
                      >
                        {item} <small>{count}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section
              className="library-collection"
              aria-labelledby="notes-title"
            >
              <div className="library-section-heading library-results-heading">
                <div>
                  <span>02</span>
                  <h2 id="notes-title">
                    {hasFilters ? "Matching notes" : "Recently saved"}
                  </h2>
                  <small>
                    {filteredNotes.length}{" "}
                    {filteredNotes.length === 1 ? "note" : "notes"}
                  </small>
                </div>
                <div className="library-result-actions">
                  {hasFilters && (
                    <button type="button" onClick={clearFilters}>
                      Clear filters
                    </button>
                  )}
                  <label>
                    <span className="sr-only">Sort notes</span>
                    <select
                      value={sortOrder}
                      onChange={(event) =>
                        setSortOrder(event.target.value as SortOrder)
                      }
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="title">A–Z</option>
                    </select>
                  </label>
                  <div
                    className="library-view-toggle"
                    aria-label="View options"
                  >
                    <button
                      type="button"
                      className={viewMode === "grid" ? "is-active" : ""}
                      aria-label="Grid view"
                      aria-pressed={viewMode === "grid"}
                      onClick={() => setViewMode("grid")}
                    >
                      <GridFourIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className={viewMode === "list" ? "is-active" : ""}
                      aria-label="List view"
                      aria-pressed={viewMode === "list"}
                      onClick={() => setViewMode("list")}
                    >
                      <ListBulletsIcon size={17} />
                    </button>
                  </div>
                </div>
              </div>

              {filteredNotes.length > 0 ? (
                <div className={`library-notes is-${viewMode}`}>
                  {filteredNotes.map((note, index) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      index={index}
                      viewMode={viewMode}
                      deleting={deletingId === note.id}
                      deleteDisabled={deletingId !== null}
                      onTopicSelect={setTopic}
                      onDelete={(item) => void deleteNote(item)}
                    />
                  ))}
                </div>
              ) : (
                <div className="library-no-results">
                  <MagnifyingGlassIcon size={27} />
                  <h3>Nothing surfaced yet</h3>
                  <p>
                    Try a broader phrase, another shelf, or clear your current
                    filters.
                  </p>
                  <button type="button" onClick={clearFilters}>
                    Clear search and filters
                  </button>
                </div>
              )}

              {nextCursor && (
                <div className="library-load-more">
                  <p>There are more notes beyond this page.</p>
                  <Button
                    variant="secondary"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? "Loading…" : "Load more notes"}
                  </Button>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="library-skeleton" aria-label="Loading saved notes">
      <div className="library-skeleton-search" />
      <div className="library-skeleton-categories">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} />
        ))}
      </div>
      <div className="library-skeleton-notes">
        {[0, 1, 2].map((item) => (
          <div key={item} />
        ))}
      </div>
    </div>
  );
}

function EmptyLibrary({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="library-empty">
      <div className="library-empty-mark">
        <BookmarkSimpleIcon size={36} />
        <span>00</span>
      </div>
      <p className="library-eyebrow">Your personal knowledge library</p>
      <h1>A good library starts with one useful thought.</h1>
      <p>
        Add a screenshot, choose the note that captures it best, and it will be
        waiting here when you need it.
      </p>
      <Button variant="primary" onClick={onAdd}>
        Add your first screenshot
      </Button>
    </section>
  );
}
