import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORY_VIDEOS } from "@/frontier/game/storyVideos";

describe("introVideoPreload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("fetches the intro once and returns a blob URL", async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: "video/mp4" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => blob,
    });
    vi.stubGlobal("fetch", fetchMock);
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:intro-test");

    const mod = await import("@/frontier/game/introVideoPreload");
    const first = await mod.startIntroVideoPreload();
    const second = await mod.startIntroVideoPreload();

    expect(first).toBe("blob:intro-test");
    expect(second).toBe("blob:intro-test");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(STORY_VIDEOS.intro.src);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(mod.isIntroVideoPreloaded()).toBe(true);
    expect(mod.getIntroVideoSrc()).toBe("blob:intro-test");
  });

  it("falls back to the public path if fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")),
    );

    const mod = await import("@/frontier/game/introVideoPreload");
    const src = await mod.startIntroVideoPreload();
    expect(src).toBe(STORY_VIDEOS.intro.src);
    expect(mod.isIntroVideoPreloaded()).toBe(false);
  });
});
