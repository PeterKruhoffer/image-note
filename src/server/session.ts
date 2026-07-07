import { z } from "zod";

const ANONYMOUS_ID_COOKIE = "image_mind_anonymous_id";
const anonymousIdSchema = z.uuidv4();

function readCookie(request: Request, name: string) {
  const prefix = `${name}=`;
  for (const cookie of (request.headers.get("cookie") ?? "").split(";")) {
    const value = cookie.trim();
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return null;
}

export function anonymousSubject(request: Request) {
  const id = anonymousIdSchema.safeParse(
    readCookie(request, ANONYMOUS_ID_COOKIE)
  );
  return id.success ? `anonymous:${id.data}` : null;
}

export function anonymousCookie(id: string, request: Request) {
  const parsedId = anonymousIdSchema.parse(id);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ANONYMOUS_ID_COOKIE}=${parsedId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
}
