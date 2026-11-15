import { describe, expect, it } from "vitest";
import { STORY_VIDEOS, getVideoForChapter } from "../frontier/game/storyVideos";

describe("storyVideos", () => {
  it("defines all six mission videos", () => {
    expect(Object.keys(STORY_VIDEOS)).toEqual([
      "intro",
      "chapter1",
      "chapter2",
      "chapter3",
      "chapter4",
      "victory",
    ]);
  });

  it("links every video to a valid /videos/video_*.mp4 path", () => {
    for (const [key, video] of Object.entries(STORY_VIDEOS)) {
      expect(video.src).toMatch(/^\/videos\/video_[1-6]\.mp4$/);
      expect(video.title.length).toBeGreaterThan(0);
      expect(video.subtitle.length).toBeGreaterThan(0);
      expect(video.badge.length).toBeGreaterThan(0);
      expect(video.durationSeconds).toBeGreaterThan(0);
    }
  });

  it("retrieves videos by chapter id", () => {
    expect(getVideoForChapter("chapter1")?.title).toContain("Landing");
    expect(getVideoForChapter("chapter2")?.title).toContain("Mons Mouton");
    expect(getVideoForChapter("chapter3")?.title).toContain("Malapert");
    expect(getVideoForChapter("chapter4")?.title).toContain("Cabeus");
    expect(getVideoForChapter("victory")?.title).toContain("Four Camps");
    expect(getVideoForChapter("unknown")).toBeNull();
  });
});
