import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The game touches window/WebGL at import time, so load it only in the browser.
const FrontierGame = lazy(() => import("@/frontier/App"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Frontier — Lunar South Pole Survival" },
      {
        name: "description",
        content:
          "Play solo or with an online crew. Land at the Lunar South Pole, build camps, and survive under Artemis Protocol.",
      },
      { property: "og:title", content: "The Frontier" },
      {
        property: "og:description",
        content:
          "Solo or online crew lunar survival — Chapters 1–4 across Nobile, Mons Mouton, Malapert, and Cabeus.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const fallback = (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#080C1A] text-white select-none">
      <div className="text-xs font-bold tracking-[0.25em] uppercase text-[#7EE0B8] mb-3">
        Artemis Protocol
      </div>
      <div className="text-4xl font-black tracking-tight">The Frontier</div>
      <div className="mt-4 w-10 h-10 rounded-full border-2 border-[#7EE0B8] border-t-transparent animate-spin" />
      <p className="mt-4 text-sm text-[#AAB6DC]">Loading lunar ops…</p>
    </div>
  );
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
