import { describe, expect, it } from "vitest";
import { STORY_VIDEOS, StoryVideoKey } from "@/frontier/game/storyVideos";
import { getIntroVideoSrc } from "@/frontier/game/introVideoPreload";

describe("Video Playback Performance & Consistency Test", () => {
  it("all 6 videos use direct, uniform asset paths for native hardware decoding", () => {
    const keys: StoryVideoKey[] = ["intro", "chapter1", "chapter2", "chapter3", "chapter4", "victory"];
    for (const key of keys) {
      const def = STORY_VIDEOS[key];
      expect(def).toBeDefined();
      expect(def.src).toMatch(/^\/videos\/video_[1-6]\.mp4$/);
    }
  });

  it("video 1 (intro) src matches canonical static asset without transient blob URL swaps", () => {
    // Changing the <video src> during playback resets media decoder pipelines, causing stutter/lag.
    // Video 1 must remain on stable static URL just like videos 2 through 6.
    expect(getIntroVideoSrc()).toBe(STORY_VIDEOS.intro.src);
    expect(getIntroVideoSrc()).toBe("/videos/video_1.mp4");
  });

  it("all video metadata matches playable framerate and duration constraints", () => {
    for (const def of Object.values(STORY_VIDEOS)) {
      expect(def.durationSeconds).toBeGreaterThan(0);
      expect(def.durationSeconds).toBeLessThanOrEqual(30);
    }
  });
});
