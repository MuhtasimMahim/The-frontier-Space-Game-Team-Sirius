/** Stable chapter ids used by UI, voting, and mission launch. */
export type ChapterId = "chapter1" | "chapter2" | "chapter3" | "chapter4" | "full";

export type ChapterStatus = "playable" | "coming_soon";

/** solo = single player; crew = same-device vote; online = Colyseus room co-op */
export type PlayMode = "solo" | "crew" | "online";

export interface ChapterDef {
  id: ChapterId;
  /** Display number; null for the free sandbox. */
  number: number | null;
  title: string;
  campName: string;
  siteName: string;
  /** Landing-site id from CONFIG.SITES when the chapter pins one. */
  siteId: number | null;
  summary: string;
  status: ChapterStatus;
  /** Which simulation mission mode this chapter boots into. */
  missionMode: "chapter1" | "chapter2" | "chapter3" | "chapter4" | "full";
}

/** Story chapters the crew can see and vote on, plus the free sandbox. */
export const CHAPTERS: readonly ChapterDef[] = [
  {
    id: "chapter1",
    number: 1,
    title: "Landing & Camp Sirius",
    campName: "Camp Sirius",
    siteName: "Nobile Rim 1",
    siteId: 4,
    summary:
      "Touch down on a sunlit polar rim, deploy solar arrays, prospect crater ice, and pressurize Habitat A.",
    status: "playable",
    missionMode: "chapter1",
  },
  {
    id: "chapter2",
    number: 2,
    title: "Power at Mons Mouton",
    campName: "Camp Helios",
    siteName: "Mons Mouton",
    siteId: 11,
    summary:
      "Survey a sunlit plateau, raise the Solar Tower, and fly energy packs back to Camp Sirius by cargo hopper.",
    status: "playable",
    missionMode: "chapter2",
  },
  {
    id: "chapter3",
    number: 3,
    title: "Comms at Malapert",
    campName: "Camp Relay",
    siteName: "Malapert Massif",
    siteId: 3,
    summary:
      "Climb the massif, aim the Main Antenna at Earth, connect the relay, and shelter from a solar storm.",
    status: "playable",
    missionMode: "chapter3",
  },
  {
    id: "chapter4",
    number: 4,
    title: "Explore near Cabeus",
    campName: "Camp Horizon",
    siteName: "Peak near Cabeus B",
    siteId: 12,
    summary:
      "Find buried ice with ground radar, take an upgraded rover into a pitch-dark crater, and fly water to the network.",
    status: "playable",
    missionMode: "chapter4",
  },
  {
    id: "full",
    number: null,
    title: "Full 4-Site Sandbox",
    campName: "Open Expedition",
    siteName: "Player choice",
    siteId: null,
    summary: "Skip the chapter brief and pick any landing site for a free-play network run.",
    status: "playable",
    missionMode: "full",
  },
] as const;

export function getChapter(id: ChapterId): ChapterDef {
  const found = CHAPTERS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown chapter: ${id}`);
  return found;
}

export function playableChapters(): ChapterDef[] {
  return CHAPTERS.filter((c) => c.status === "playable");
}

export interface VoteTally {
  /** Winning chapter, or null if nobody voted / unresolved tie. */
  winner: ChapterId | null;
  counts: Partial<Record<ChapterId, number>>;
  totalVotes: number;
  tied: boolean;
  /** Playable chapters that tied for first place (empty unless tied). */
  tiedIds: ChapterId[];
}

/**
 * Majority chapter vote. Ignores null / empty seats.
 * Ties among equal top counts leave `winner` null and list `tiedIds`
 * so the host can break the tie or revote.
 */
export function tallyChapterVotes(votes: readonly (ChapterId | null | undefined)[]): VoteTally {
  const counts: Partial<Record<ChapterId, number>> = {};
  let totalVotes = 0;

  for (const v of votes) {
    if (!v) continue;
    const chapter = CHAPTERS.find((c) => c.id === v);
    if (!chapter || chapter.status !== "playable") continue;
    counts[v] = (counts[v] ?? 0) + 1;
    totalVotes += 1;
  }

  if (totalVotes === 0) {
    return { winner: null, counts, totalVotes: 0, tied: false, tiedIds: [] };
  }

  let best = 0;
  for (const n of Object.values(counts)) {
    if ((n ?? 0) > best) best = n ?? 0;
  }

  const tiedIds = (Object.keys(counts) as ChapterId[]).filter((id) => (counts[id] ?? 0) === best);
  const tied = tiedIds.length > 1;

  return {
    winner: tied ? null : (tiedIds[0] ?? null),
    counts,
    totalVotes,
    tied,
    tiedIds: tied ? tiedIds : [],
  };
}

export const CREW_SIZE_MIN = 2;
export const CREW_SIZE_MAX = 4;

export function clampCrewSize(n: number): number {
  return Math.max(CREW_SIZE_MIN, Math.min(CREW_SIZE_MAX, Math.floor(n)));
}

export function emptyCrewVotes(size: number): (ChapterId | null)[] {
  return Array.from({ length: clampCrewSize(size) }, () => null);
}
