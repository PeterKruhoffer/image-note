import "./styles.css";
import { ClerkProvider, Show, SignIn } from "@clerk/react";
import { createRoot } from "react-dom/client";
import App from "./app";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is not configured");
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
    <Show when="signed-out">
      <main className="flex min-h-screen items-center justify-center bg-kumo-elevated px-5 py-10">
        <SignIn routing="hash" withSignUp />
      </main>
    </Show>
    <Show when="signed-in">
      <App />
    </Show>
  </ClerkProvider>
);
