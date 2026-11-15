import React, { useCallback, useEffect, useRef, useState } from "react";
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
import type { GameAction } from "./game/multiplayer/types";

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<GameState>(gameSim.state);
  const worldRef = useRef<PlayCanvasLunarWorld | null>(null);
  const integrationRef = useRef<MultiplayerIntegration | null>(null);
  const [quality, setQuality] = useState<Quality>("medium");
  const [loaded, setLoaded] = useState({ done: 0, total: 1 });

  const handleRemoteAction = useCallback((action: GameAction & { sender: string }) => {
    gameSim.applyRemoteNetAction(action);
  }, []);

  const handleGameStart = useCallback((chapterId: string) => {
    const id = (chapterId || "chapter1") as ChapterId;
    if (gameSim.state.phase === "chapters" && gameSim.state.playMode === "online") {
      gameSim.startVotedChapter(id);
    }
  }, []);

  const mp = useMultiplayer({
    playerName: "Astronaut",
    onAction: handleRemoteAction,
    onGameStart: handleGameStart,
  });

  // Wire sim → Colyseus action broadcast while in an online room
  useEffect(() => {
    if (mp.isConnected && gameState.playMode === "online") {
      gameSim.setNetworkOut((action) => mp.sendAction(action as GameAction));
    } else {
      gameSim.setNetworkOut(null);
    }
    return () => gameSim.setNetworkOut(null);
  }, [mp.isConnected, gameState.playMode, mp.sendAction]);

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
      integration.init(world, gameSim, mp.client);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild world only when site changes
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

  const showOnlineLobby = gameState.phase === "chapters" && gameState.playMode === "online";

  const leaveOnlineLobby = () => {
    mp.disconnect();
    gameSim.returnToTitle();
  };

  const playSoloFromOffline = () => {
    mp.disconnect();
    gameSim.openChapterSelect("solo");
  };

  // Probe crew server as soon as the online lobby opens (Heroku may be asleep / down)
  useEffect(() => {
    if (showOnlineLobby && !mp.isConnected) {
      void mp.checkServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when entering the lobby
  }, [showOnlineLobby]);

  const lobbyVotes = mp.votes as Record<string, ChapterId>;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#080C1A]">
      <canvas
        key={siteKey}
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block touch-none"
      />

      {gameState.phase === "playing" && <HUD state={gameState} />}

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

      {gameState.phase === "playing" && gameState.menuOpen && (
        <PauseMenuUI
          state={gameState}
          quality={quality}
          onSetQuality={(q) => {
            worldRef.current?.setQuality(q);
            setQuality(q);
          }}
        />
      )}

      {loaded.done < loaded.total && (
        <div className="absolute bottom-3 right-3 z-[60] flex items-center gap-2 rounded-lg bg-[#121A30]/85 px-3 py-1.5 text-xs text-[#AAB6DC] font-gotham select-none pointer-events-none">
          Loading 3D models {Math.round((loaded.done / loaded.total) * 100)}%
        </div>
      )}

      {gameState.phase === "title" && <TitleUI state={gameState} />}

      {showOnlineLobby && (
        <MultiplayerLobbyUI
          roomCode={mp.roomCode}
          isConnected={mp.isConnected}
          isConnecting={mp.isConnecting}
          isHost={mp.isHost}
          players={mp.players as LobbyPlayer[]}
          localSessionId={mp.sessionId}
          currentVote={(mp.currentVote as ChapterId) ?? null}
          votes={lobbyVotes}
          error={mp.error}
          serverOnline={mp.serverOnline}
          isCheckingServer={mp.isCheckingServer}
          onCreateRoom={() => void mp.createRoom()}
          onJoinRoom={(code) => mp.joinRoom(code)}
          onToggleReady={() => mp.sendReady()}
          onVoteChapter={(chapterId) => mp.sendVote(chapterId)}
          onStartGame={() => {
            const winning =
              tallyChapterVotes(Object.values(lobbyVotes)).winner ??
              ((mp.currentVote as ChapterId) || "chapter1");
            mp.sendStart(winning);
          }}
          onLeaveRoom={leaveOnlineLobby}
          onPlaySolo={playSoloFromOffline}
          onRetryServer={() => void mp.checkServer()}
        />
      )}

      {gameState.phase === "chapters" && gameState.playMode !== "online" && (
        <ChapterSelectUI state={gameState} />
      )}

      {gameState.phase === "selecting" && <SiteSelectUI />}

      {gameState.phase === "briefing" && <BriefingUI state={gameState} />}

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

      {(gameState.phase === "won" || gameState.phase === "lost") && <ResultUI state={gameState} />}
    </div>
  );
};

export default App;
