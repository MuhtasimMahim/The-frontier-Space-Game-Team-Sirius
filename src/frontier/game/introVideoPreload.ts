/**
 * Pre-warms the title intro (video_1) in browser media cache while the title screen
 * is open, so Solo/Online can open the modal instantly.
 * Always maintains the stable static asset URL to prevent browser video decoder pipeline resets.
 */
import { STORY_VIDEOS } from "./storyVideos";

const INTRO_SRC = STORY_VIDEOS.intro.src;

let linkEl: HTMLLinkElement | null = null;
let preloaded = false;

function ensurePreloadLink() {
  if (typeof document === "undefined" || linkEl) return;
  linkEl = document.createElement("link");
  linkEl.rel = "preload";
  linkEl.as = "video";
  linkEl.href = INTRO_SRC;
  linkEl.type = "video/mp4";
  document.head.appendChild(linkEl);
}

/** Warms the intro video in browser cache using native media preloading. */
export function startIntroVideoPreload(): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve(INTRO_SRC);
  ensurePreloadLink();
  preloaded = true;
  return Promise.resolve(INTRO_SRC);
}

/** Stable static URL to avoid decoder teardown or frame stutter */
export function getIntroVideoSrc(): string {
  return INTRO_SRC;
}

export function isIntroVideoPreloaded(): boolean {
  return preloaded;
}
