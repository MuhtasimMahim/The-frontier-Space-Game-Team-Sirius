import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The game touches window/WebGL at import time, so load it only in the browser.
const FrontierGame = lazy(() => import("@/frontier/App"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Frontier - Lunar Base Survival Simulation" },
      { name: "description", content: "Land on the Moon, build your base, and survive." },
      { property: "og:title", content: "The Frontier - Lunar Base Survival Simulation" },
      { property: "og:description", content: "Land on the Moon, build your base, and survive." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const fallback = <div className="h-screen w-screen bg-background" />;
  return (
    <div id="app-root" className="h-screen w-screen">
      <ClientOnly fallback={fallback}>
        <Suspense fallback={fallback}>
          <FrontierGame />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
