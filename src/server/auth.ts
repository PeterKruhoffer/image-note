import { createClerkClient } from "@clerk/backend";

export async function authenticatedSubject(request: Request, env: Env) {
  try {
    const requestState = await createClerkClient({
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      secretKey: env.CLERK_SECRET_KEY
    }).authenticateRequest(request, {
      authorizedParties: [new URL(request.url).origin]
    });

    if (!requestState.isAuthenticated) return null;
    return `clerk:user:${requestState.toAuth().userId}`;
  } catch (error) {
    console.error("Clerk authentication failed", error);
    return null;
  }
}
