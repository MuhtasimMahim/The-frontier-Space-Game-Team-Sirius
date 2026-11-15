import React, { useEffect, useRef, useState } from "react";
import { PlayCanvasLunarWorld, type Quality } from "./game/playcanvasWorld";
import { gameSim, type GameState } from "./game/simulation";
import { siteKeyForMode } from "./game/sites";
import { isStoryChapter, STORY_CHAPTERS } from "./game/storyline";
import { HUD } from "./components/HUD";
import { ChapterSelectUI } from "./components/ChapterSelectUI";
import { SiteSelectUI } from "./components/SiteSelectUI";
import { TitleUI, BriefingUI, ResultUI, PauseMenuUI } from "./components/Modals";

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<GameState>(gameSim.state);
  const worldRef = useRef<PlayCanvasLunarWorld | null>(null);
  const [quality, setQuality] = useState<Quality>("medium");
  const [loaded, setLoaded] = useState({ done: 0, total: 1 });
  // Each site is its own scene; switching chapters rebuilds the world behind the briefing
  const siteKey = siteKeyForMode(gameState.missionMode);

  useEffect(() => {
    const unsubscribe = gameSim.subscribe((state) => {
      setGameState({ ...state });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let world: PlayCanvasLunarWorld | null = null;
    if (canvasRef.current) {
      world = new PlayCanvasLunarWorld(canvasRef.current, siteKey);
      worldRef.current = world;
      setQuality(world.quality);
    }
    setLoaded({ done: 0, total: 1 });
    const poll = setInterval(() => {
      if (!world) return;
      setLoaded({ done: world.modelsLoaded, total: world.modelsTotal || 1 });
      if (world.modelsLoaded >= world.modelsTotal) clearInterval(poll);
    }, 300);

    return () => {
      clearInterval(poll);
      if (world) {
        world.destroy();
        if (worldRef.current === world) worldRef.current = null;
      }
    };
  }, [siteKey]);

  const story = isStoryChapter(gameState.missionMode)
    ? STORY_CHAPTERS[gameState.missionMode]
    : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#080C1A]">
      {/* 1. PlayCanvas 3D canvas (fresh element per site so each scene gets a clean GPU context) */}
      <canvas
        key={siteKey}
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block touch-none"
      />

      {/* 2. In-Game HUD: Left Column, Top Center, Right Column, Oxygen, Radar */}
      {gameState.phase === "playing" && <HUD state={gameState} />}

      {/* 2b. Pause / Exit Menu (Esc while playing) */}
      {gameState.phase === "playing" && gameState.menuOpen && <PauseMenuUI state={gameState} />}

      {/* Graphics quality + model loading */}
      <div className="absolute bottom-3 right-3 z-[60] flex items-center gap-2 rounded-lg bg-[#121A30]/85 px-3 py-1.5 text-xs text-white font-gotham select-none">
        {loaded.done < loaded.total && (
          <span className="text-[#AAB6DC]">
            Loading 3D models {Math.round((loaded.done / loaded.total) * 100)}%
          </span>
        )}
        <span className="text-[#AAB6DC]">Graphics</span>
        {(["low", "medium", "high"] as Quality[]).map((q) => (
          <button
            key={q}
            onClick={(e) => {
              worldRef.current?.setQuality(q);
              setQuality(q);
              (e.currentTarget as HTMLButtonElement).blur();
            }}
            className={`rounded px-2 py-0.5 capitalize ${quality === q ? "bg-[#7EE0B8] text-[#0F2A3A] font-bold" : "bg-white/10 hover:bg-white/20"}`}
          >
            {q}
          </button>
        ))}
      </div>

      {/* 3. Title Screen (Matches TitleUI.luau) */}
      {gameState.phase === "title" && <TitleUI state={gameState} />}

      {/* 3b. Chapter Select / Crew Vote */}
      {gameState.phase === "chapters" && <ChapterSelectUI state={gameState} />}

      {/* 4. Landing Site Selection (Matches SiteSelectUI.luau) */}
      {gameState.phase === "selecting" && <SiteSelectUI />}

      {/* 4b. Mission Briefing (Chapter 1 or story chapters 2–4) */}
      {gameState.phase === "briefing" && <BriefingUI state={gameState} />}

      {/* 5. Landing / hopper flight overlay */}
      {gameState.phase === "landing" &&
        (story ? (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md text-white font-gotham select-none">
            <div
              className="text-xs font-extrabold tracking-widest uppercase mb-6"
              style={{ color: story.accent }}
            >
              Hopper Flight · Chapter {story.number}
            </div>
            <div className="flex items-center gap-5 text-2xl md:text-3xl font-black uppercase tracking-tight">
              <span className="text-white/70">{story.hopperFrom}</span>
              <div className="relative w-40 h-10">
                <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-white/25" />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-[0_0_16px_currentColor] animate-[hopper_5s_ease-in-out_forwards]"
                  style={{ backgroundColor: story.accent, color: story.accent }}
                />
              </div>
              <span style={{ color: story.accent }}>{story.campName}</span>
            </div>
            <p className="text-sm text-[#AAB6DC] mt-4 font-mono">
              {story.latitudeLabel.toUpperCase()}
            </p>
            <p className="text-xs text-[#AAB6DC]/80 mt-6 max-w-md text-center leading-relaxed">
              Rocket hoppers fly between south-pole camps, because there is no air for planes and
              the craters are too rough for long drives.
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md text-white font-gotham select-none">
            <div className="w-16 h-16 rounded-full border-4 border-t-[#7EE0B8] border-r-transparent border-b-[#7EE0B8] border-l-transparent animate-spin mb-6" />
            <h2 className="text-3xl font-extrabold tracking-tight uppercase">
              Descent Engine Firing...
            </h2>
            <p className="text-sm text-[#AAB6DC] mt-2 font-mono">
              TARGET: {gameState.selectedSite.name.toUpperCase()}
              {gameState.missionMode === "chapter1" ? " · CAMP SIRIUS" : ""}
            </p>
            <div className="w-72 h-1.5 bg-white/10 rounded-full overflow-hidden mt-6">
              <div className="h-full bg-[#7EE0B8] animate-[pulse_1s_infinite] w-full" />
            </div>
          </div>
        ))}

      {/* 6. Game Results Modal (Won / Lost) */}
      {(gameState.phase === "won" || gameState.phase === "lost") && <ResultUI state={gameState} />}
    </div>
  );
};

export default App;
