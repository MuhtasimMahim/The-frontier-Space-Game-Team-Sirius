export interface StoryVideoDef {
  id: string;
  title: string;
  subtitle: string;
  src: string;
  chapterId?: "chapter1" | "chapter2" | "chapter3" | "chapter4" | "victory" | "intro";
  badge: string;
  accent: string;
  durationSeconds: number;
}

export const STORY_VIDEOS: Record<string, StoryVideoDef> = {
  intro: {
    id: "intro",
    title: "Team Sirius Assemble",
    subtitle: "Four astronauts, four vital roles — united to build humanity's lunar frontier.",
    src: "/videos/video_1.mp4",
    chapterId: "intro",
    badge: "TEAM DISPATCH",
    accent: "#7EE0B8",
    durationSeconds: 5,
  },
  chapter1: {
    id: "chapter1",
    title: "Landing & Camp Sirius",
    subtitle: "Touchdown at Nobile Rim 1: deploy solar arrays, prospect ice, and enter Habitat A.",
    src: "/videos/video_2.mp4",
    chapterId: "chapter1",
    badge: "CHAPTER 1 · BASE",
    accent: "#7EE0B8",
    durationSeconds: 6,
  },
  chapter2: {
    id: "chapter2",
    title: "Power at Mons Mouton",
    subtitle: "Survey polar sunlight, raise the Solar Tower, and haul energy packs by rover.",
    src: "/videos/video_3.mp4",
    chapterId: "chapter2",
    badge: "CHAPTER 2 · POWER",
    accent: "#FFD166",
    durationSeconds: 6,
  },
  chapter3: {
    id: "chapter3",
    title: "Comms at Malapert Massif",
    subtitle: "Climb the massif, aim the dish at Earth, and shelter before the solar storm hits.",
    src: "/videos/video_4.mp4",
    chapterId: "chapter3",
    badge: "CHAPTER 3 · COMMS",
    accent: "#8FD3FF",
    durationSeconds: 13,
  },
  chapter4: {
    id: "chapter4",
    title: "Exploring Cabeus Crater",
    subtitle: "Upgrade the rover with headlights and heaters to mine ice in the pitch-dark crater.",
    src: "/videos/video_5.mp4",
    chapterId: "chapter4",
    badge: "CHAPTER 4 · EXPLORATION",
    accent: "#C7A6FF",
    durationSeconds: 19,
  },
  victory: {
    id: "victory",
    title: "Four Camps United!",
    subtitle: "The South Pole network is complete: power, comms, and water flow across all outposts.",
    src: "/videos/video_6.mp4",
    chapterId: "victory",
    badge: "MISSION ACCOMPLISHED",
    accent: "#FFD166",
    durationSeconds: 25,
  },
};

export function getVideoForChapter(chapterId: string): StoryVideoDef | null {
  if (chapterId in STORY_VIDEOS) {
    return STORY_VIDEOS[chapterId] ?? null;
  }
  return null;
}
