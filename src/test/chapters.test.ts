import { describe, expect, it } from "vitest";
import {
  CHAPTERS,
  clampCrewSize,
  emptyCrewVotes,
  getChapter,
  playableChapters,
  tallyChapterVotes,
} from "@/frontier/game/chapters";
import { SimulationManager } from "@/frontier/game/simulation";

describe("Chapter catalog & crew votes", () => {
  it("lists all four story chapters and the sandbox as playable", () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual([
      "chapter1",
      "chapter2",
      "chapter3",
      "chapter4",
      "full",
    ]);
    expect(playableChapters().map((c) => c.id)).toEqual([
      "chapter1",
      "chapter2",
      "chapter3",
      "chapter4",
      "full",
    ]);
    expect(getChapter("chapter2").missionMode).toBe("chapter2");
    expect(getChapter("chapter4").siteId).toBe(12);
  });

  it("tallies majority votes and reports ties without a winner", () => {
    expect(tallyChapterVotes(["chapter1", "chapter1", "full"]).winner).toBe("chapter1");
    expect(tallyChapterVotes(["chapter1", "full"]).tied).toBe(true);
    expect(tallyChapterVotes(["chapter1", "full"]).winner).toBeNull();
    expect(tallyChapterVotes([null, undefined, "chapter2"]).winner).toBe("chapter2");
    expect(tallyChapterVotes([null, undefined]).totalVotes).toBe(0);
    expect(tallyChapterVotes([]).winner).toBeNull();
  });

  it("clamps crew size and resets empty vote seats", () => {
    expect(clampCrewSize(1)).toBe(2);
    expect(clampCrewSize(9)).toBe(4);
    expect(emptyCrewVotes(3)).toEqual([null, null, null]);
  });

  it("solo enterChapter opens Chapter 1 briefing immediately", () => {
    const sim = new SimulationManager(7);
    sim.openChapterSelect("solo");
    expect(sim.state.phase).toBe("chapters");
    expect(sim.state.playMode).toBe("solo");

    sim.enterChapter("chapter1");
    expect(sim.state.phase).toBe("briefing");
    expect(sim.state.missionMode).toBe("chapter1");
    expect(sim.state.selectedChapterId).toBe("chapter1");
  });

  it("crew votes resolve to the winning chapter before briefing", () => {
    const sim = new SimulationManager(8);
    sim.openChapterSelect("crew");
    sim.setCrewSize(3);
    expect(sim.state.crewVotes).toHaveLength(3);

    sim.castChapterVote(0, "chapter1");
    sim.castChapterVote(1, "full");
    sim.castChapterVote(2, "chapter1");

    const winner = tallyChapterVotes(sim.state.crewVotes).winner;
    expect(winner).toBe("chapter1");

    sim.startVotedChapter("chapter1");
    expect(sim.state.phase).toBe("briefing");
    expect(sim.state.playMode).toBe("crew");
    expect(sim.state.selectedChapterId).toBe("chapter1");
  });

  it("solo sandbox chapter opens landing-site select", () => {
    const sim = new SimulationManager(9);
    sim.openChapterSelect("solo");
    sim.enterChapter("full");
    expect(sim.state.phase).toBe("selecting");
    expect(sim.state.missionMode).toBe("full");
  });

  it("online lobby mode opens chapters phase without hotseat votes", () => {
    const sim = new SimulationManager(10);
    sim.openChapterSelect("online");
    expect(sim.state.phase).toBe("chapters");
    expect(sim.state.playMode).toBe("online");

    sim.startVotedChapter("chapter2");
    expect(sim.state.phase).toBe("briefing");
    expect(sim.state.missionMode).toBe("chapter2");
    expect(sim.state.playMode).toBe("online");
  });
});
