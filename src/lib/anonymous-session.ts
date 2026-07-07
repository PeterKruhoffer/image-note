let sessionPromise: Promise<void> | null = null;

export function ensureAnonymousSession() {
  sessionPromise ??= fetch("/api/session", {
    method: "POST",
    credentials: "same-origin"
  }).then((response) => {
    if (!response.ok) {
      sessionPromise = null;
      throw new Error(`Session setup failed (${response.status})`);
    }
  });
  return sessionPromise;
}
