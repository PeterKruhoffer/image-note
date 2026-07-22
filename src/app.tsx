import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";

const ChatPage = lazy(() =>
  import("./features/chat/chat-page").then((module) => ({
    default: module.ChatPage
  }))
);
const LibraryPage = lazy(() =>
  import("./features/library/library-page").then((module) => ({
    default: module.LibraryPage
  }))
);
const PlaygroundPage = lazy(() =>
  import("./features/playground/playground-page").then((module) => ({
    default: module.PlaygroundPage
  }))
);

const router = createBrowserRouter([
  { path: "/", Component: ChatPage },
  { path: "/playground", Component: PlaygroundPage },
  { path: "/library", Component: LibraryPage },
  { path: "*", element: <Navigate to="/" replace /> }
]);

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen text-kumo-inactive">
          Loading...
        </div>
      }
    >
      <RouterProvider router={router} />
    </Suspense>
  );
}
