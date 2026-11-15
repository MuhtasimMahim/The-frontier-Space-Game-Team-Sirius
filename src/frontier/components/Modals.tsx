import React, { useState } from "react";
import { CONFIG, type FactDef } from "../game/config";
import { gameSim, type GameState } from "../game/simulation";
import {
  CAMPAIGN_ORDER,
  STORY,
  STORY_CHAPTERS,
  chapterRoles,
  isStoryChapter,
  nextChapterId,
  roleSeat,
  type StoryChapterDef,
} from "../game/storyline";
import { getChapter } from "../game/chapters";
import { STORY_VIDEOS, getVideoForChapter } from "../game/storyVideos";
import { StoryVideoModal } from "./StoryVideoModal";

const factHeading = (title: string) => (/[?!.:]$/.test(title) ? title : `${title}:`);

const StoryBriefing: React.FC<{ state: GameState; def: StoryChapterDef }> = ({ state, def }) => {
  const videoDef = getVideoForChapter(def.id);
  const [showVideo, setShowVideo] = useState<boolean>(Boolean(videoDef));
  const roles = chapterRoles(def);
  const crew = state.playMode === "crew" ? state.crewSize : 1;
  const seats = Array.from({ length: crew }, (_, seat) =>
    roles.filter((r) => roleSeat(def, r, crew) === seat),
  );
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-6 select-none font-gotham text-white luna-gradient overflow-y-auto">
      {showVideo && videoDef && (
        <StoryVideoModal video={videoDef} onClose={() => setShowVideo(false)} />
      )}
      <div className="max-w-5xl w-full luna-panel rounded-[24px] p-8 flex flex-col gap-6 shadow-2xl my-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-extrabold tracking-widest uppercase px-3 py-1 rounded-full border"
              style={{
                color: def.accent,
                borderColor: `${def.accent}66`,
                backgroundColor: `${def.accent}22`,
              }}
            >
              {def.badge}
            </span>
            {videoDef && (
              <button
                onClick={() => setShowVideo(true)}
                className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm border"
                style={{
                  color: def.accent,
                  borderColor: `${def.accent}88`,
                  backgroundColor: `${def.accent}22`,
                }}
                title="Watch Mission Animated Story"
              >
                <span>▶</span>
                <span>Watch Story</span>
              </button>
            )}
          </div>
          <span className="text-xs font-mono text-[#CFD8F7]">
            {def.campName.toUpperCase()} · {def.latitudeLabel.toUpperCase()} ·{" "}
            {Math.round(state.selectedSite.sunlight * 100)}% SUNLIGHT
          </span>
        </div>

        <div>
          <h1 className="text-4xl font-black text-white">{def.title}</h1>
          <p className="text-base text-[#DFE6FF] mt-2 leading-relaxed">{def.summary}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <div className="md:col-span-7 flex flex-col gap-4">
            <div className="rounded-[16px] bg-[#080C1A]/60 border border-white/10 p-5 flex flex-col gap-2.5 text-sm text-[#E4EBFF] leading-relaxed">
              <div className="text-xs font-bold uppercase tracking-wider text-[#FFD166]">
                Mission Story
              </div>
              {def.narrative.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <div className="rounded-[16px] bg-[#080C1A]/60 border border-white/10 p-5 flex flex-col gap-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#FFD166]">
                Mission Steps
              </div>
              <ol className="flex flex-col gap-2 text-sm text-[#E4EBFF]">
                {def.steps.map((step, i) => (
                  <li key={step.id} className="flex items-center gap-2.5">
                    <span
                      className="w-5 h-5 rounded-full text-[#0F2A3A] font-black text-xs flex items-center justify-center shrink-0"
                      style={{ backgroundColor: def.accent }}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1">{step.title}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#AAB6DC]">
                      {step.role}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="md:col-span-5 flex flex-col gap-4">
            <div className="rounded-[16px] bg-[#080C1A]/60 border border-white/10 p-4 flex flex-col gap-2 text-xs text-[#CFD8F7]">
              <div className="font-bold uppercase tracking-wider text-[#8FD3FF]">Crew Roles</div>
              {crew === 1 ? (
                <div>
                  <strong className="text-white">Solo:</strong> you play every role ·{" "}
                  {roles.join(", ")}
                </div>
              ) : (
                seats.map((r, seat) => (
                  <div key={seat}>
                    <strong className="text-white">Crew Member {seat + 1}:</strong>{" "}
                    {r.length ? r.join(", ") : "Support (help anywhere)"}
                  </div>
                ))
              )}
              <div className="text-[11px] text-[#AAB6DC]">
                Roles are suggestions: anyone can do any step.
              </div>
            </div>

            <div className="rounded-[16px] bg-[#080C1A]/60 border border-white/10 p-4 flex flex-col gap-2 text-xs text-[#CFD8F7]">
              <div className="font-bold uppercase tracking-wider text-[#8FD3FF]">Controls</div>
              <div>
                <strong className="text-white">Mouse:</strong> Look around (GTA orbit) · Click to
                lock cursor · <strong className="text-white">Wheel:</strong> Zoom
              </div>
              <div>
                <strong className="text-white">W A S D:</strong> Move relative to view · Drive rover
                · <strong className="text-white">Shift:</strong> Boost
              </div>
              <div>
                <strong className="text-white">Space:</strong> Jump · Exit rover ·{" "}
                <strong className="text-white">E / Hold E:</strong> Act ·{" "}
                <strong className="text-white">Esc:</strong> Unlock cursor / Pause
              </div>
              {def.id === "chapter3" && (
                <div>
                  <strong className="text-white">Aiming the dish:</strong> Mouse or A/D turn, W/S
                  tilt, hold E to lock, Space to step away
                </div>
              )}
              {def.id === "chapter4" && (
                <div>
                  <strong className="text-white">Dark crater:</strong> the rover upgrade adds
                  headlights; your helmet lamp switches on in shadow
                </div>
              )}
              <div>
                <strong className="text-white">Esc:</strong> Pause · Follow the glowing beacon
              </div>
            </div>

            <div className="rounded-[16px] bg-[#14215C]/70 border border-[#8FD3FF]/30 p-4 text-xs text-[#DFE6FF] leading-relaxed">
              {def.scienceNote}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <button
            onClick={() => gameSim.openChapterSelect(state.playMode)}
            className="px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-sm font-bold text-white cursor-pointer"
          >
            ← Back to Chapters
          </button>
          <button
            onClick={() => gameSim.launchBriefingMission()}
            className="px-8 py-4 rounded-full text-[#0F2A3A] font-black text-lg tracking-wide shadow-2xl transition-all cursor-pointer flex items-center gap-2 hover:scale-[1.02] active:scale-95 uppercase"
            style={{ backgroundColor: def.accent }}
          >
            <span>Board Hopper to {def.campName}</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Title Screen (Matches TitleUI.luau)
export const TitleUI: React.FC<{ state: GameState }> = ({ state }) => {
  const [showIntroVideo, setShowIntroVideo] = useState<boolean>(false);
  const [pendingMode, setPendingMode] = useState<"solo" | "online" | "crew" | null>(null);

  const startModeWithIntro = (mode: "solo" | "online" | "crew") => {
    setPendingMode(mode);
    setShowIntroVideo(true);
  };

  const handleCloseIntro = () => {
    setShowIntroVideo(false);
    const targetMode = pendingMode ?? "solo";
    setPendingMode(null);
    gameSim.openChapterSelect(targetMode);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-between p-12 select-none font-gotham text-white luna-gradient overflow-hidden">
      {showIntroVideo && (
        <StoryVideoModal video={STORY_VIDEOS.intro} onClose={handleCloseIntro} />
      )}
      {/* Left Column: Badge, Title, Subtitle, Start Buttons, Resource Chips */}
      <div className="max-w-2xl flex flex-col gap-5 z-10">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 border border-white/20 w-fit backdrop-blur-md">
          <div className="w-2.5 h-2.5 rounded-full border-2 border-[#FFD166]" />
          <span className="text-xs font-bold tracking-wider text-[#E4EBFF] uppercase">
            {CONFIG.TEXTS.titleBadge}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-7xl md:text-8xl font-black tracking-tight leading-[0.95] text-white font-nunito whitespace-pre-line drop-shadow-2xl">
          {CONFIG.TEXTS.titleName}
        </h1>

        {/* Subtitle */}
        <p className="text-xl text-[#DFE6FF] leading-relaxed whitespace-pre-line font-medium max-w-lg">
          {CONFIG.TEXTS.titleSubtitle}
        </p>

        {/* Solo / Online Crew / Same-device vote / Resume */}
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <button
            onClick={() => startModeWithIntro("solo")}
            className="px-7 h-16 rounded-full bg-[#7EE0B8] hover:bg-[#68d4a7] text-[#0F2A3A] font-extrabold text-xl tracking-wide shadow-2xl transition-all cursor-pointer flex items-center justify-center gap-3 hover:scale-105 active:scale-95 uppercase"
          >
            <span>Solo Expedition</span>
            <span>→</span>
          </button>

          <button
            onClick={() => startModeWithIntro("online")}
            className="px-7 h-16 rounded-full bg-[#8FD3FF] hover:bg-[#6fc4f5] text-[#0F2A3A] font-extrabold text-xl tracking-wide shadow-2xl transition-all cursor-pointer flex items-center justify-center gap-3 hover:scale-105 active:scale-95 uppercase"
          >
            <span>Online Crew</span>
            <span>→</span>
          </button>

          <button
            onClick={() => startModeWithIntro("crew")}
            className="px-5 h-14 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white font-bold text-sm tracking-wide shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-105 active:scale-95 uppercase"
          >
            <span>Same Device</span>
          </button>

          {state.hasCheckpoint && state.checkpointInfo && (
            <button
              onClick={() => gameSim.resumeCheckpoint()}
              className="px-6 h-16 rounded-full bg-[#FFD166] hover:bg-[#f5c44f] text-[#0F2A3A] font-extrabold text-base tracking-wide shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-105 active:scale-95 uppercase"
            >
              <span>
                Resume Day {state.checkpointInfo.day} ({state.checkpointInfo.siteName})
              </span>
            </button>
          )}
        </div>

        {/* Bottom Educational Resource Chips */}
        <div className="flex flex-wrap items-center gap-3 mt-8">
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#14215C]/60 border border-white/10 text-xs font-bold text-white">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-[#FFD166]" />
            <span>{CONFIG.TEXTS.titleChipEnergy}</span>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#14215C]/60 border border-white/10 text-xs font-bold text-white">
            <div className="w-2.5 h-2.5 rounded-full bg-[#8FD3FF]" />
            <span>{CONFIG.TEXTS.titleChipWater}</span>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#14215C]/60 border border-white/10 text-xs font-bold text-white">
            <div className="w-2.5 h-2.5 rounded-full bg-[#7EE0B8]" />
            <span>{CONFIG.TEXTS.titleChipFood}</span>
          </div>
        </div>

        <div className="text-xs text-[#CFD8F7]/70 mt-2">{CONFIG.TEXTS.titleCrew}</div>
      </div>

      {/* Decorative Realistic Moon in Right Corner */}
      <div className="hidden lg:block relative w-[380px] h-[380px] mr-12 pointer-events-none">
        <div className="absolute inset-0 rounded-full bg-white/10 blur-2xl animate-pulse" />
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#7d87a6] via-[#adb6cc] to-[#ffffff] shadow-2xl overflow-hidden border border-white/30">
          <div className="absolute w-24 h-24 rounded-full bg-[#5d6788]/40 top-12 left-16 border border-white/10" />
          <div className="absolute w-32 h-32 rounded-full bg-[#5d6788]/50 bottom-16 right-12 border border-white/10" />
          <div className="absolute w-16 h-16 rounded-full bg-[#4d5778]/45 bottom-28 left-20 border border-white/10" />
        </div>
      </div>
    </div>
  );
};

// Chapter 1 Mission Briefing Screen (Nobile Rim 1 — Camp Sirius)
export const BriefingUI: React.FC<{ state: GameState }> = ({ state }) => {
  const ch = CONFIG.CHAPTER_1;
  if (isStoryChapter(state.missionMode))
    return <StoryBriefing state={state} def={STORY_CHAPTERS[state.missionMode]} />;

  const videoDef = getVideoForChapter("chapter1");
  const [showVideo, setShowVideo] = useState<boolean>(Boolean(videoDef));

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-6 select-none font-gotham text-white luna-gradient overflow-y-auto">
      {showVideo && videoDef && (
        <StoryVideoModal video={videoDef} onClose={() => setShowVideo(false)} />
      )}
      <div className="max-w-4xl w-full luna-panel rounded-[24px] p-8 flex flex-col gap-6 shadow-2xl my-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-extrabold tracking-widest uppercase px-3 py-1 rounded-full bg-[#7EE0B8]/20 text-[#7EE0B8] border border-[#7EE0B8]/40">
              {ch.briefingBadge}
            </span>
            {videoDef && (
              <button
                onClick={() => setShowVideo(true)}
                className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm border bg-[#7EE0B8]/20 border-[#7EE0B8]/50 text-[#7EE0B8]"
                title="Watch Chapter 1 Story Video"
              >
                <span>▶</span>
                <span>Watch Story</span>
              </button>
            )}
          </div>
          <span className="text-xs font-mono text-[#CFD8F7]">
            SITE: {state.selectedSite.name.toUpperCase()} ·{" "}
            {Math.round(state.selectedSite.sunlight * 100)}% POLAR SUNLIGHT
          </span>
        </div>

        <div>
          <h1 className="text-4xl font-black text-white">{ch.briefingTitle}</h1>
          <p className="text-base text-[#DFE6FF] mt-2 leading-relaxed">{ch.briefingSummary}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <div className="md:col-span-7 rounded-[16px] bg-[#080C1A]/60 border border-white/10 p-5 flex flex-col gap-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[#FFD166]">
              Mission Checklist
            </div>
            <ol className="flex flex-col gap-2.5 text-sm text-[#E4EBFF]">
              {ch.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#7EE0B8] text-[#0F2A3A] font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="md:col-span-5 flex flex-col gap-4 justify-between">
            <div className="rounded-[16px] bg-[#080C1A]/60 border border-white/10 p-4 flex flex-col gap-2 text-xs text-[#CFD8F7]">
              <div className="font-bold uppercase tracking-wider text-[#8FD3FF]">
                Flight Controls
              </div>
              <div>
                <strong className="text-white">W A S D / Arrows:</strong> Walk &amp; steer rover
              </div>
              <div>
                <strong className="text-white">Space:</strong> Jump on foot · Exit rover (stays
                parked)
              </div>
              <div>
                <strong className="text-white">E at Rover:</strong> Board again where you left it
              </div>
              <div>
                <strong className="text-white">E / Hold E:</strong> Operate consoles, solar, ice
                &amp; airlock
              </div>
              <div>
                <strong className="text-white">Shift (in Rover):</strong> Short speed boost (3x
                battery)
              </div>
              <div>
                <strong className="text-white">Esc:</strong> Pause / exit menu
              </div>
            </div>

            <div className="rounded-[16px] bg-[#14215C]/70 border border-[#8FD3FF]/30 p-4 text-xs text-[#DFE6FF] leading-relaxed">
              {ch.scienceNote}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <button
            onClick={() => gameSim.openChapterSelect(state.playMode)}
            className="px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-sm font-bold text-white cursor-pointer"
          >
            ← Back to Chapters
          </button>

          <button
            onClick={() => gameSim.launchBriefingMission()}
            className="px-8 py-4 rounded-full bg-[#7EE0B8] hover:bg-[#68d4a7] text-[#0F2A3A] font-black text-lg tracking-wide shadow-2xl transition-all cursor-pointer flex items-center gap-2 hover:scale-[1.02] active:scale-95 uppercase"
          >
            <span>Launch Descent to Nobile Rim 1</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// In-mission pause / exit menu (Esc)
export const PauseMenuUI: React.FC<{ state: GameState }> = ({ state }) => {
  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center p-6 select-none font-gotham text-white bg-black/70 backdrop-blur-md">
      <div className="max-w-md w-full luna-panel rounded-[24px] p-8 flex flex-col gap-5 shadow-2xl">
        <div className="flex flex-col gap-1 border-b border-white/10 pb-4">
          <div className="text-xs font-extrabold tracking-widest uppercase text-[#FFD166]">
            Mission Paused
          </div>
          <h2 className="text-3xl font-black text-white">Exit Menu</h2>
          <p className="text-sm text-[#CFD8F7] mt-1">
            Day {state.day} · {state.selectedSite.name}
            {state.missionMode !== "full" ? ` · ${gameSim.campName()}` : ""}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => gameSim.closePauseMenu()}
            className="w-full py-4 rounded-full bg-[#7EE0B8] hover:bg-[#68d4a7] text-[#0F2A3A] font-extrabold text-lg tracking-wide shadow-xl transition-all cursor-pointer uppercase hover:scale-[1.02] active:scale-95"
          >
            Resume Mission
          </button>

          <button
            onClick={() => gameSim.saveCheckpoint(false)}
            className="w-full py-3.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-base tracking-wide transition-all cursor-pointer uppercase"
          >
            Save Checkpoint
          </button>

          <button
            onClick={() => gameSim.exitToTitle()}
            className="w-full py-3.5 rounded-full bg-white/10 hover:bg-white/20 border border-[#FF9D9D]/40 text-[#FF9D9D] font-bold text-base tracking-wide transition-all cursor-pointer uppercase"
          >
            Exit to Title
          </button>
        </div>

        <div className="rounded-[16px] bg-[#080C1A]/60 border border-white/10 p-3.5 flex flex-col gap-1 text-xs text-[#CFD8F7]">
          <div className="font-bold uppercase tracking-wider text-[#8FD3FF]">Controls</div>
          <div>
            <strong className="text-white">Mouse:</strong> Look around (GTA orbit) · Click to lock
            cursor · Scroll to zoom
          </div>
          <div>
            <strong className="text-white">W A S D:</strong> Move relative to camera view · Steer
            rover
          </div>
          <div>
            <strong className="text-white">Esc:</strong> Unlock cursor / pause
          </div>
        </div>

        <p className="text-xs text-center text-[#AAB6DC]">Press Esc again to resume</p>
      </div>
    </div>
  );
};

// Result Screen (Matches ResultUI.luau for Win / Lose)
export const ResultUI: React.FC<{ state: GameState }> = ({ state }) => {
  const isWon = state.phase === "won";
  const story = isStoryChapter(state.missionMode) ? STORY_CHAPTERS[state.missionMode] : null;
  const next = isWon && state.missionMode !== "full" ? nextChapterId(state.missionMode) : null;
  const nextDef = next ? getChapter(next) : null;
  const campaignComplete = CAMPAIGN_ORDER.every((id) => state.campaignDone.includes(id));
  const victoryVideo = STORY_VIDEOS.victory;
  const [showVictoryVideo, setShowVictoryVideo] = useState<boolean>(
    isWon && (story?.id === "chapter4" || state.missionMode === "full"),
  );

  if (story) {
    const stats: { label: string; value: React.ReactNode; color: string }[] = [
      { label: CONFIG.TEXTS.resultDays, value: `${state.stats.daysTaken} d`, color: "#FFFFFF" },
      {
        label: "Mission steps",
        value: `${isWon ? story.steps.length : Math.min(state.story.stepIndex, story.steps.length)} / ${story.steps.length}`,
        color: story.accent,
      },
      story.id === "chapter3"
        ? {
            label: "Storm exposure",
            value: `${Math.round(state.story.stormDose)} s`,
            color: state.story.stormDose > 0 ? "#FFB36B" : "#7EE0B8",
          }
        : story.id === "chapter4"
          ? {
              label: "Ice water delivered",
              value: `${state.stats.waterDelivered} W`,
              color: "#8FD3FF",
            }
          : {
              label: "Energy packs flown",
              value: `${state.story.packsLoaded} / ${STORY.PACK_TOTAL}`,
              color: "#FFD166",
            },
      {
        label: CONFIG.TEXTS.resultDeaths,
        value: `${state.stats.oxygenDeaths}`,
        color: "#FFB36B",
      },
    ];
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center p-8 select-none font-gotham text-white luna-gradient overflow-y-auto">
        {showVictoryVideo && victoryVideo && (
          <StoryVideoModal video={victoryVideo} onClose={() => setShowVictoryVideo(false)} />
        )}
        <div className="max-w-4xl w-full flex flex-col gap-6 my-auto">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div
                className="text-xs font-bold font-mono tracking-widest uppercase mb-1"
                style={{ color: story.accent }}
              >
                Chapter {story.number} complete · {story.campName}
              </div>
              <h1 className="text-5xl font-black text-white">{story.winTitle}</h1>
              <p className="text-base text-[#DFE6FF] mt-3 leading-relaxed">{story.winText}</p>
            </div>
            {isWon && (
              <button
                onClick={() => setShowVictoryVideo(true)}
                className="px-4 py-2 rounded-full bg-[#FFD166]/20 hover:bg-[#FFD166]/30 border border-[#FFD166]/50 text-[#FFD166] text-xs font-black tracking-wider cursor-pointer flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-md uppercase mt-2"
                title="Watch Victory Animated Video"
              >
                <span>▶</span>
                <span>Victory Video</span>
              </button>
            )}
          </div>

          {story.id === "chapter4" && campaignComplete && (
            <div className="luna-gold-panel rounded-[18px] p-5 text-sm text-[#FFF3D1] leading-relaxed">
              <div className="font-black text-[#FFD166] uppercase tracking-wider mb-1">
                Campaign complete: the South Pole network is online
              </div>
              Camp Sirius, Camp Helios, Camp Relay and Camp Horizon now share power, a link to
              Earth, and ice water. Try the Full 4-Base Network sandbox to run them all at once.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="luna-panel rounded-[18px] p-4 flex flex-col gap-1">
                <span className="text-xs text-[#CFD8F7]">{s.label}</span>
                <span className="text-2xl font-black font-mono-num" style={{ color: s.color }}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>

          <div className="luna-panel rounded-[18px] p-5 flex flex-col gap-3 text-xs leading-relaxed text-[#DFE6FF]">
            <div className="font-bold text-sm text-white uppercase tracking-wider">
              {CONFIG.TEXTS.lessonsTitle}
            </div>
            {state.seenFacts
              .map((id) => CONFIG.FACTS.find((f) => f.id === id))
              .filter((f): f is FactDef => Boolean(f))
              .slice(-3)
              .map((f) => (
                <p key={f.id}>
                  <strong className="text-white">{factHeading(f.title)}</strong> {f.body}
                </p>
              ))}
            <p className="text-[#AAB6DC]">{story.scienceNote}</p>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            {nextDef && (
              <button
                onClick={() => gameSim.startChapterFromResults(nextDef.id)}
                className="flex-1 py-4 rounded-full bg-[#FFD166] hover:bg-[#f5c44f] text-[#0F2A3A] font-extrabold text-lg tracking-wide shadow-2xl transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 uppercase"
              >
                <span>Next: Chapter {nextDef.number}</span>
                <span>→</span>
              </button>
            )}
            {story.id === "chapter4" && (
              <button
                onClick={() => gameSim.startChapterFromResults("full")}
                className="flex-1 py-4 rounded-full bg-[#FFD166] hover:bg-[#f5c44f] text-[#0F2A3A] font-extrabold text-lg tracking-wide shadow-2xl transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 uppercase"
              >
                <span className="whitespace-nowrap">Network Sandbox</span>
                <span>→</span>
              </button>
            )}
            <button
              onClick={() => gameSim.replayChapter()}
              className="flex-1 py-4 rounded-full bg-[#7EE0B8] hover:bg-[#68d4a7] text-[#0F2A3A] font-extrabold text-lg tracking-wide shadow-2xl transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 uppercase"
            >
              <span>Replay Chapter</span>
              <span>↺</span>
            </button>
            <button
              onClick={() => gameSim.openChapterSelect(state.playMode)}
              className="flex-1 py-4 rounded-full bg-white/10 hover:bg-white/20 text-white font-extrabold text-lg tracking-wide transition-all cursor-pointer uppercase"
            >
              Chapter Select
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-8 select-none font-gotham text-white luna-gradient overflow-y-auto">
      {showVictoryVideo && victoryVideo && (
        <StoryVideoModal video={victoryVideo} onClose={() => setShowVictoryVideo(false)} />
      )}
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 my-auto">
        {/* LEFT COLUMN: Mission Header, 2x2 Summary Tiles, Crew Log, Restart Button */}
        <div className="md:col-span-7 flex flex-col gap-6">
          {/* Header */}
          <div>
            <div className="flex items-center justify-between gap-4">
              <div
                className="text-xs font-bold font-mono tracking-widest uppercase mb-1"
                style={{ color: isWon ? "#7EE0B8" : "#FF9D9D" }}
              >
                {isWon ? CONFIG.TEXTS.resultWonTag : CONFIG.TEXTS.resultLostTag}
              </div>
              {isWon && (
                <button
                  onClick={() => setShowVictoryVideo(true)}
                  className="px-4 py-1.5 rounded-full bg-[#FFD166]/20 hover:bg-[#FFD166]/30 border border-[#FFD166]/50 text-[#FFD166] text-xs font-black tracking-wider cursor-pointer flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all shadow-md uppercase"
                  title="Watch Victory Animated Video"
                >
                  <span>▶</span>
                  <span>Victory Video</span>
                </button>
              )}
            </div>
            <h1 className="text-5xl font-black text-white">
              {isWon
                ? state.missionMode === "chapter1"
                  ? "Camp Sirius Operational!"
                  : CONFIG.TEXTS.resultWon
                : CONFIG.TEXTS.resultLost}
            </h1>
            <p className="text-sm text-[#DFE6FF] mt-2">
              {isWon
                ? state.missionMode === "chapter1"
                  ? "You calibrated Camp Sirius at Nobile Rim 1, aligned polar solar arrays, refined candidate crater ice, and pressurized Habitat A! Continue into the 4-site network or start a new run."
                  : state.modules.C.status === "active"
                    ? "All four lunar network bases and Research Lab C are operational! Humanity’s permanent outpost is secured on the lunar frontier."
                    : "All four lunar network outposts operated together for 5 consecutive days! Humanity’s cooperative foothold on the Moon is secured."
                : "Water or food supplies ran empty for 4 days, or the 60-day window closed. Restore your last checkpoint to try a new resource plan!"}
            </p>
          </div>

          {/* 2x2 Summary Tiles */}
          <div className="grid grid-cols-2 gap-4">
            {/* Tile 1: Days */}
            <div className="luna-panel rounded-[18px] p-5 flex flex-col justify-between">
              <span className="text-xs text-[#CFD8F7]">{CONFIG.TEXTS.resultDays}</span>
              <div className="text-3xl font-black font-mono-num text-white mt-1">
                {state.stats.daysTaken}{" "}
                <span className="text-base font-normal text-white/60">{CONFIG.TEXTS.unitDay}</span>
              </div>
            </div>

            {/* Tile 2: Water Trips */}
            <div className="luna-panel rounded-[18px] p-5 flex flex-col justify-between">
              <span className="text-xs text-[#CFD8F7]">{CONFIG.TEXTS.resultTrips}</span>
              <div className="text-3xl font-black font-mono-num text-[#8FD3FF] mt-1">
                {state.stats.waterTrips}{" "}
                <span className="text-base font-normal text-[#8FD3FF]/60">
                  {CONFIG.TEXTS.unitCount}
                </span>
              </div>
            </div>

            {/* Tile 3: Oxygen Deaths */}
            <div className="luna-panel rounded-[18px] p-5 flex flex-col justify-between">
              <span className="text-xs text-[#CFD8F7]">{CONFIG.TEXTS.resultDeaths}</span>
              <div className="text-3xl font-black font-mono-num text-[#FFB36B] mt-1">
                {state.stats.oxygenDeaths}{" "}
                <span className="text-base font-normal text-[#FFB36B]/60">events</span>
              </div>
            </div>

            {/* Tile 4: Landing Site */}
            <div className="luna-panel rounded-[18px] p-5 flex flex-col justify-between">
              <span className="text-xs text-[#CFD8F7]">{CONFIG.TEXTS.resultSite}</span>
              <div className="text-xl font-black text-white mt-1 truncate">
                {state.selectedSite.name}
              </div>
            </div>
          </div>

          {/* Crew Log Table */}
          <div className="luna-panel rounded-[18px] p-5 flex flex-col gap-3">
            <div className="text-xs font-mono font-bold text-[#8FD3FF] tracking-wider">
              {CONFIG.TEXTS.crewLogTitle}
            </div>
            <div className="grid grid-cols-5 text-xs text-[#CFD8F7]/70 border-b border-white/10 pb-2 font-mono uppercase">
              <span>Crew Member</span>
              <span className="text-right">Arrays Deployed</span>
              <span className="text-right">Water Transport</span>
              <span className="text-right">Modules Built</span>
              <span className="text-right">Repairs</span>
            </div>
            <div className="grid grid-cols-5 text-sm font-semibold text-white py-1">
              <span>Commander (You)</span>
              <span className="text-right font-mono-num">{state.stats.panelsBuilt}</span>
              <span className="text-right font-mono-num text-[#8FD3FF]">
                {state.stats.waterDelivered} W
              </span>
              <span className="text-right font-mono-num">{state.stats.modulesBuilt}</span>
              <span className="text-right font-mono-num">
                {state.stats.repairs + state.stats.moduleRepairs}
              </span>
            </div>
          </div>

          {/* Continue / Resume Checkpoint / Restart Buttons */}
          <div className="flex flex-col gap-3">
            {nextDef && (
              <button
                onClick={() => gameSim.startChapterFromResults(nextDef.id)}
                className="w-full py-4 rounded-full bg-[#FFD166] hover:bg-[#f5c44f] text-[#0F2A3A] font-extrabold text-lg tracking-wide shadow-2xl transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 uppercase"
              >
                <span>
                  Next: Chapter {nextDef.number} · {nextDef.title}
                </span>
                <span>→</span>
              </button>
            )}

            {isWon && state.missionMode === "chapter1" && (
              <button
                onClick={() => gameSim.continueAfterChapter1()}
                className="w-full py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-extrabold text-base tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2 uppercase"
              >
                <span>Continue into Full 4-Base Network</span>
                <span>→</span>
              </button>
            )}

            {!isWon && state.hasCheckpoint && (
              <button
                onClick={() => gameSim.resumeCheckpoint()}
                className="w-full py-4 rounded-full bg-[#FFD166] hover:bg-[#f5c44f] text-[#0F2A3A] font-extrabold text-lg tracking-wide shadow-2xl transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 uppercase"
              >
                <span>Resume Last Checkpoint</span>
                <span>↺</span>
              </button>
            )}

            <button
              onClick={() => gameSim.restartGame()}
              className="w-full py-4 rounded-full bg-[#7EE0B8] hover:bg-[#68d4a7] text-[#0F2A3A] font-extrabold text-xl tracking-wide shadow-2xl transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 uppercase"
            >
              <span>{CONFIG.TEXTS.restartLabel}</span>
              <span>↺</span>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Hall of Fame & Today's Science Lessons */}
        <div className="md:col-span-5 flex flex-col gap-6">
          {/* Hall of Fame Panel */}
          <div className="luna-gold-panel rounded-[20px] p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#FFD166]" />
                <span className="font-bold text-sm text-white uppercase tracking-wider">
                  {CONFIG.TEXTS.recordsTitle}
                </span>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#FFD166] text-[#0F2A3A] font-black uppercase">
                {isWon
                  ? state.hallRank
                    ? `YOUR RANK #${state.hallRank}`
                    : "NOT IN TOP 5"
                  : "TOP 5 ON THIS DEVICE"}
              </span>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              {state.hall.length === 0 && (
                <div className="text-xs text-[#CFD8F7]">
                  No completed missions yet. Win to set the first record!
                </div>
              )}
              {state.hall.map((h, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between text-xs py-1.5 px-3 rounded-lg font-mono text-white ${isWon && state.hallRank === idx + 1 ? "bg-white/20" : "bg-white/5"}`}
                >
                  <span className="font-bold text-[#FFD166]">#{idx + 1}</span>
                  <span className="font-bold">{h.days}d</span>
                  <span className="text-[#CFD8F7] truncate max-w-[45%]">{h.site}</span>
                  <span className="text-[#AAB6DC]">{h.date}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lessons Panel ("Today's Science Brief") */}
          <div className="luna-panel rounded-[20px] p-5 flex flex-col gap-3 flex-1">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#8FD3FF]" />
              <span className="font-bold text-sm text-white uppercase tracking-wider">
                {CONFIG.TEXTS.lessonsTitle}
              </span>
            </div>

            <div className="flex flex-col gap-3 mt-1 text-xs leading-relaxed text-[#DFE6FF]">
              {state.seenFacts.length === 0 && <p>No science facts were unlocked this run.</p>}
              {state.seenFacts
                .map((id) => CONFIG.FACTS.find((f) => f.id === id))
                .filter((f): f is FactDef => Boolean(f))
                .slice(-4)
                .map((f) => (
                  <div key={f.id} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#8FD3FF] mt-1.5 shrink-0" />
                    <p>
                      <strong className="text-white">{factHeading(f.title)}</strong> {f.body}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
