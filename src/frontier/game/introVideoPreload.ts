/**
 * Prefetches the title intro (video_1) into a blob URL while the title screen
 * is open, so Solo/Online can open the modal without a cold network hitch.
 * Other story videos are left alone.
 */
import { STORY_VIDEOS } from "./storyVideos";

const INTRO_SRC = STORY_VIDEOS.intro.src;

let blobUrl: string | null = null;
let inflight: Promise<string> | null = null;
let linkEl: HTMLLinkElement | null = null;

function ensurePreloadLink() {
  if (typeof document === "undefined" || linkEl) return;
  linkEl = document.createElement("link");
  linkEl.rel = "preload";
  linkEl.as = "video";
  linkEl.href = INTRO_SRC;
  linkEl.type = "video/mp4";
  document.head.appendChild(linkEl);
}

/** Start (or reuse) the intro prefetch. Safe to call many times. */
export function startIntroVideoPreload(): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve(INTRO_SRC);
  if (blobUrl) return Promise.resolve(blobUrl);
  if (inflight) return inflight;

  ensurePreloadLink();

  inflight = fetch(INTRO_SRC, { credentials: "same-origin", cache: "force-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`intro preload ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      blobUrl = URL.createObjectURL(blob);
      return blobUrl;
    })
    .catch(() => {
      inflight = null;
      return INTRO_SRC;
    });

  return inflight;
}

/** Blob URL when ready, otherwise the public path (still fine with HTTP cache). */
export function getIntroVideoSrc(): string {
  return blobUrl ?? INTRO_SRC;
}

export function isIntroVideoPreloaded(): boolean {
  return blobUrl != null;
}
