import React, { useEffect, useRef, useState } from "react";
import { PlayCanvasLunarWorld, type Quality } from "./game/playcanvasWorld";
import { gameSim, type GameState } from "./game/simulation";
import { siteKeyForMode } from "./game/sites";
import { isStoryChapter, STORY_CHAPTERS } from "./game/storyline";
import { HUD } from "./components/HUD";
import { ChapterSelectUI } from "./components/ChapterSelectUI";
import { SiteSelectUI } from "./components/SiteSelectUI";
import { TitleUI, BriefingUI, ResultUI, PauseMenuUI } from "./components/Modals";
import { useMultiplayer } from "./game/multiplayer/useMultiplayer";
import { MultiplayerIntegration } from "./game/multiplayer/integration";
import {
  MultiplayerLobbyUI,
  MultiplayerHUDOverlay,
  type LobbyPlayer,
} from "./game/multiplayer/MultiplayerUI";
import { tallyChapterVotes, type ChapterId } from "./game/chapters";

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<GameState>(gameSim.state);
  const worldRef = useRef<PlayCanvasLunarWorld | null>(null);
  const integrationRef = useRef<MultiplayerIntegration | null>(null);
  const [quality, setQuality] = useState<Quality>("medium");
  const [loaded, setLoaded] = useState({ done: 0, total: 1 });

  // Multiplayer networking hook
  const mp = useMultiplayer({
    playerName: "Astronaut",
  });

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
    let integration: MultiplayerIntegration | null = null;

    if (canvasRef.current) {
      world = new PlayCanvasLunarWorld(canvasRef.current, siteKey);
      worldRef.current = world;
      setQuality(world.quality);

      integration = new MultiplayerIntegration(mp.client);
      integration.init(world, gameSim);
      integrationRef.current = integration;
      mp.setRemotePlayerManager(world.remotePlayerManager);
    }
    setLoaded({ done: 0, total: 1 });
    const poll = setInterval(() => {
      if (!world) return;
      setLoaded({ done: world.modelsLoaded, total: world.modelsTotal || 1 });
      if (world.modelsLoaded >= world.modelsTotal) clearInterval(poll);
    }, 300);

    return () => {
      clearInterval(poll);
      mp.setRemotePlayerManager(null);
      if (integration) {
        integration.destroy();
        if (integrationRef.current === integration) integrationRef.current = null;
      }
      if (world) {
        world.destroy();
        if (worldRef.current === world) worldRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (worldRef.current && mp.client && integrationRef.current) {
      integrationRef.current.setClient(mp.client);
      mp.setRemotePlayerManager(worldRef.current.remotePlayerManager);
    }
  }, [mp.client]);

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

      {/* 2a. Multiplayer HUD Overlay */}
      {gameState.phase === "playing" && mp.isConnected && (
        <MultiplayerHUDOverlay
          players={mp.players as LobbyPlayer[]}
          localSessionId={mp.sessionId}
          isConnected={mp.isConnected}
          isReconnecting={mp.isReconnecting}
          recentPing={mp.recentPing}
          onSendChat={mp.sendChat}
          onSendPing={mp.sendPing}
        />
      )}

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
      {gameState.phase === "chapters" &&
        (gameState.playMode === "crew" && mp.isConnected ? (
          <MultiplayerLobbyUI
            roomCode={mp.roomCode}
            isConnected={mp.isConnected}
            isConnecting={mp.isConnecting}
            isHost={mp.isHost}
            players={mp.players as LobbyPlayer[]}
            localSessionId={mp.sessionId}
            error={mp.error}
            onCreateRoom={(chapterId) => mp.createRoom(chapterId)}
            onJoinRoom={(code) => mp.joinRoom(code)}
            onToggleReady={() => mp.sendReady()}
            onVoteChapter={(chapterId) => {
              mp.sendVote(chapterId);
              const seat = mp.players.find((p) => p.sessionId === mp.sessionId)?.seat ?? 0;
              gameSim.castChapterVote(seat, chapterId);
            }}
            onStartGame={() => {
              const winning =
                tallyChapterVotes(
                  (mp.players as LobbyPlayer[])
                    .map((p) => p.vote)
                    .filter((v): v is ChapterId => !!v)
                ).winner ?? "chapter1";
              gameSim.startVotedChapter(winning);
            }}
            onLeaveRoom={() => mp.disconnect()}
          />
        ) : (
          <ChapterSelectUI state={gameState} />
        ))}

      {/* 4. Landing Site Selection (Matches SiteSelectUI.luau) */}
      {gameState.phase === "selecting" &&
        (gameState.playMode === "crew" && mp.isConnected ? (
          <MultiplayerLobbyUI
            roomCode={mp.roomCode}
            isConnected={mp.isConnected}
            isConnecting={mp.isConnecting}
            isHost={mp.isHost}
            players={mp.players as LobbyPlayer[]}
            localSessionId={mp.sessionId}
            error={mp.error}
            onCreateRoom={(chapterId) => mp.createRoom(chapterId)}
            onJoinRoom={(code) => mp.joinRoom(code)}
            onToggleReady={() => mp.sendReady()}
            onVoteChapter={(chapterId) => {
              mp.sendVote(chapterId);
              const seat = mp.players.find((p) => p.sessionId === mp.sessionId)?.seat ?? 0;
              gameSim.castChapterVote(seat, chapterId);
            }}
            onStartGame={() => {
              gameSim.selectSite(gameSim.state.selectedSite);
            }}
            onLeaveRoom={() => mp.disconnect()}
          />
        ) : (
          <SiteSelectUI />
        ))}

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
