import { Suspense } from "react";
import { Toasty } from "@cloudflare/kumo/components/toast";
import { ChatPage } from "./features/chat/chat-page";
import { LibraryPage } from "./features/library/library-page";

export default function App() {
  const isLibrary = window.location.pathname === "/library";

  return (
    <Toasty>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-kumo-inactive">
            Loading...
          </div>
        }
      >
        {isLibrary ? <LibraryPage /> : <ChatPage />}
      </Suspense>
    </Toasty>
  );
}
