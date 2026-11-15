import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORY_VIDEOS } from "@/frontier/game/storyVideos";

describe("introVideoPreload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("pre-warms the intro with stable asset src without mutating to blob url", async () => {
    const mod = await import("@/frontier/game/introVideoPreload");
    const first = await mod.startIntroVideoPreload();
    const second = await mod.startIntroVideoPreload();

    // Stable path ensures browser hardware video decoder is never aborted/reset mid-playback
    expect(first).toBe(STORY_VIDEOS.intro.src);
    expect(second).toBe(STORY_VIDEOS.intro.src);
    expect(mod.isIntroVideoPreloaded()).toBe(true);
    expect(mod.getIntroVideoSrc()).toBe(STORY_VIDEOS.intro.src);
  });

  it("always provides the canonical video path for hardware streaming", async () => {
    const mod = await import("@/frontier/game/introVideoPreload");
    const src = mod.getIntroVideoSrc();
    expect(src).toBe("/videos/video_1.mp4");
  });
});
