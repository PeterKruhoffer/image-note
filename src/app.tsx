import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";

const LibraryPage = lazy(() =>
  import("./features/library/library-page").then((module) => ({
    default: module.LibraryPage
  }))
);
const HomePage = lazy(() =>
  import("./features/home/home-page").then((module) => ({
    default: module.HomePage
  }))
);

const router = createBrowserRouter([
  { path: "/", Component: HomePage },
  { path: "/library", Component: LibraryPage },
  { path: "*", element: <Navigate to="/" replace /> }
]);

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="app-state flex items-center justify-center h-screen text-kumo-inactive">
          Loading...
        </div>
      }
    >
      <RouterProvider router={router} />
    </Suspense>
  );
}
