/**
 * Multiplayer UI Components: Lobby screen and In-Game HUD Overlay.
 *
 * Provides:
 * - MultiplayerLobbyUI: Room creation, 4-char room code display/copy, 2–4 player
 *   roster with seat roles and ready states, chapter voting, and host start trigger.
 * - MultiplayerHUDOverlay: In-game top-right crew status dots, 8-preset quick-chat
 *   wheel (press T or click), temporary ping toast notifications, and reconnection banner.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { UI_COLORS } from "../config";
import {
  CHAPTERS,
  tallyChapterVotes,
  type ChapterId,
  type VoteTally,
} from "../chapters";
import {
  ChatPreset,
  PLAYER_COLORS,
  type PingData,
  type RemotePlayer,
} from "./types";

export type LobbyPlayer = RemotePlayer & {
  ready?: boolean;
  connected?: boolean;
  vote?: ChapterId;
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface MultiplayerLobbyUIProps {
  roomCode: string | null;
  isConnected: boolean;
  isConnecting?: boolean;
  isHost: boolean;
  players: LobbyPlayer[];
  localSessionId?: string | null;
  currentVote?: ChapterId | null;
  votes?: Record<string, ChapterId>;
  error?: string | null;
  onCreateRoom: (chapterId?: ChapterId) => void;
  onJoinRoom: (code: string) => void;
  onToggleReady: () => void;
  onVoteChapter: (chapterId: ChapterId) => void;
  onStartGame: () => void;
  onLeaveRoom?: () => void;
}

export interface MultiplayerHUDOverlayProps {
  players: LobbyPlayer[];
  localSessionId?: string | null;
  isConnected: boolean;
  isReconnecting?: boolean;
  recentPing?: PingData | null;
  onSendChat?: (preset: ChatPreset) => void;
  onSendPing?: (x: number, z: number) => void;
}

// Seat crew labels
const SEAT_ROLES = [
  "Commander (Host)",
  "Science Specialist",
  "Flight Engineer",
  "Mission Specialist",
] as const;

// ── Quick-Chat Presets List ──────────────────────────────────────────────────

const CHAT_PRESETS: { key: number; preset: ChatPreset; label: string }[] = [
  { key: 1, preset: ChatPreset.FollowMe, label: "1. Follow me" },
  { key: 2, preset: ChatPreset.NeedHelp, label: "2. Need help" },
  { key: 3, preset: ChatPreset.WatchOut, label: "3. Watch out" },
  { key: 4, preset: ChatPreset.GoodJob, label: "4. Good job" },
  { key: 5, preset: ChatPreset.GoHere, label: "5. Go here" },
  { key: 6, preset: ChatPreset.ReadyUp, label: "6. Ready up" },
  { key: 7, preset: ChatPreset.WaitForMe, label: "7. Wait for me" },
  { key: 8, preset: ChatPreset.Thanks, label: "8. Thanks" },
];

// ── 1. MultiplayerLobbyUI ───────────────────────────────────────────────────

export const MultiplayerLobbyUI: React.FC<MultiplayerLobbyUIProps> = ({
  roomCode,
  isConnected,
  isConnecting = false,
  isHost,
  players,
  localSessionId,
  currentVote,
  votes = {},
  error,
  onCreateRoom,
  onJoinRoom,
  onToggleReady,
  onVoteChapter,
  onStartGame,
  onLeaveRoom,
}) => {
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedInitialChapter, setSelectedInitialChapter] =
    useState<ChapterId>("chapter1");

  // Calculate vote tally
  const allVotes = useMemo(() => {
    return Object.values(votes);
  }, [votes]);

  const tally: VoteTally = useMemo(() => {
    return tallyChapterVotes(allVotes);
  }, [allVotes]);

  const localPlayer = useMemo(() => {
    return players.find((p) => p.sessionId === localSessionId);
  }, [players, localSessionId]);

  const isLocalReady = Boolean(localPlayer?.ready);

  // Check if all joined players are ready
  const allReady = useMemo(() => {
    if (players.length === 0) return false;
    return players.every((p) => p.ready);
  }, [players]);

  const handleCopyCode = useCallback(() => {
    if (!roomCode) return;
    void navigator.clipboard?.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomCode]);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCodeInput.trim().length >= 4) {
      onJoinRoom(joinCodeInput.trim().toUpperCase());
    }
  };

  // ── Unconnected / Entry View: Create or Join ──
  if (!roomCode && !isConnected) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-[#080C1A]/95 backdrop-blur-md select-none font-gotham text-white overflow-y-auto">
        <div className="max-w-2xl w-full flex flex-col gap-6 p-6 md:p-8 rounded-[20px] bg-[#121A30]/90 border border-white/10 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-widest text-[#7EE0B8]">
                Artemis Cooperative Protocol
              </div>
              <h1 className="text-3xl md:text-4xl font-black mt-1">
                Multiplayer Crew Lobby
              </h1>
            </div>
            {onLeaveRoom && (
              <button
                onClick={onLeaveRoom}
                className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold transition cursor-pointer"
              >
                ← Back
              </button>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-[#EB5050]/20 border border-[#EB5050]/50 text-[#FF9D9D] text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Create Room Box */}
            <div className="flex flex-col justify-between gap-4 p-5 rounded-[16px] bg-[#080C1A]/60 border border-white/10">
              <div className="flex flex-col gap-2">
                <div className="text-sm font-extrabold text-[#8FD3FF] uppercase tracking-wider">
                  Host Mission
                </div>
                <p className="text-xs text-[#A5AFC8]">
                  Start a new invite-only room. You will receive a 4-character code
                  to share with your crew.
                </p>

                <label className="text-xs text-[#DFE6FF] mt-2 font-bold">
                  Initial Chapter:
                </label>
                <select
                  value={selectedInitialChapter}
                  onChange={(e) =>
                    setSelectedInitialChapter(e.target.value as ChapterId)
                  }
                  className="bg-[#121A30] border border-white/20 rounded-lg p-2 text-xs text-white cursor-pointer focus:outline-none focus:border-[#7EE0B8]"
                >
                  {CHAPTERS.filter((c) => c.status === "playable").map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.number ? `Ch ${c.number}: ` : ""}
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => onCreateRoom(selectedInitialChapter)}
                disabled={isConnecting}
                className="w-full py-3 px-4 rounded-xl font-black text-sm bg-[#7EE0B8] hover:bg-[#9BF0CE] text-[#0F2A3A] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isConnecting ? "Connecting..." : "CREATE ROOM"}
              </button>
            </div>

            {/* Join Room Box */}
            <form
              onSubmit={handleJoinSubmit}
              className="flex flex-col justify-between gap-4 p-5 rounded-[16px] bg-[#080C1A]/60 border border-white/10"
            >
              <div className="flex flex-col gap-2">
                <div className="text-sm font-extrabold text-[#FFD166] uppercase tracking-wider">
                  Join Crew
                </div>
                <p className="text-xs text-[#A5AFC8]">
                  Enter the 4-character room code from your expedition commander.
                </p>

                <label className="text-xs text-[#DFE6FF] mt-2 font-bold">
                  Room Code:
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. AB12"
                  className="bg-[#121A30] border border-white/20 rounded-lg p-2.5 text-center font-mono text-xl tracking-widest text-white uppercase focus:outline-none focus:border-[#FFD166]"
                />
              </div>

              <button
                type="submit"
                disabled={isConnecting || joinCodeInput.trim().length < 4}
                className="w-full py-3 px-4 rounded-xl font-black text-sm bg-[#FFD166] hover:bg-[#FFE08A] text-[#0F2A3A] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isConnecting ? "Joining..." : "JOIN MISSION"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Connected Room View ──
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-[#080C1A]/95 backdrop-blur-md select-none font-gotham text-white overflow-y-auto">
      <div className="max-w-4xl w-full flex flex-col gap-6 p-6 md:p-8 rounded-[20px] bg-[#121A30]/90 border border-white/10 shadow-2xl my-auto">
        {/* Top Header & Room Code Display */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#5AD278] animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-[#7EE0B8]">
                Connected · 4-Seat Polar Roster
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black mt-1">
              Mission Launch Control
            </h1>
          </div>

          {/* Large Copyable Room Code */}
          <div className="flex items-center gap-3 bg-[#080C1A]/80 border border-white/15 px-4 py-2 rounded-xl">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-[#A5AFC8]">
                Room Code
              </span>
              <span className="font-mono text-2xl md:text-3xl font-black tracking-widest text-[#7EE0B8]">
                {roomCode}
              </span>
            </div>
            <button
              onClick={handleCopyCode}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-[#DFE6FF] transition cursor-pointer"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-[#EB5050]/20 border border-[#EB5050]/50 text-[#FF9D9D] text-sm">
            {error}
          </div>
        )}

        {/* 4-Player Seats Grid */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold uppercase tracking-wider text-[#A5AFC8]">
            Crew Members ({players.length}/4)
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((seatIndex) => {
              const player = players.find((p) => p.seat === seatIndex);
              const color =
                player?.color ?? PLAYER_COLORS[seatIndex % PLAYER_COLORS.length];
              const isLocal = player?.sessionId === localSessionId;
              const playerVote = player ? votes[player.sessionId] : undefined;

              if (player) {
                return (
                  <div
                    key={seatIndex}
                    className={`p-3.5 rounded-[14px] flex flex-col justify-between gap-3 border ${
                      isLocal
                        ? "bg-[#202C4C]/90 border-[#7EE0B8]"
                        : "bg-[#080C1A]/60 border-white/10"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-[#A5AFC8]">
                          Seat {seatIndex + 1}
                        </span>
                        {isLocal && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-[#7EE0B8]/20 text-[#7EE0B8]">
                            YOU
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-bold text-sm truncate">
                          {player.name}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#A5AFC8] mt-0.5 truncate">
                        {SEAT_ROLES[seatIndex]}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                          player.ready
                            ? "bg-[#5AD278]/20 text-[#5AD278]"
                            : "bg-[#FFD166]/20 text-[#FFD166]"
                        }`}
                      >
                        {player.ready ? "✓ READY" : "WAITING"}
                      </span>
                      {playerVote && (
                        <span className="text-[11px] text-[#8FD3FF] font-mono-num">
                          Vote: {playerVote.replace("chapter", "Ch ")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              // Empty Slot
              return (
                <div
                  key={seatIndex}
                  className="p-3.5 rounded-[14px] bg-[#080C1A]/30 border border-dashed border-white/15 flex flex-col justify-center items-center text-center gap-1.5 min-h-[120px]"
                >
                  <span className="text-[10px] uppercase font-bold text-[#A5AFC8]/60">
                    Seat {seatIndex + 1}
                  </span>
                  <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  <span className="text-xs text-white/40 italic">
                    Open Slot
                  </span>
                  <span className="text-[10px] text-white/30">
                    {SEAT_ROLES[seatIndex]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chapter Voting Section */}
        <div className="flex flex-col gap-3 p-4 rounded-[16px] bg-[#080C1A]/50 border border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#FFD166]">
                Chapter Vote
              </div>
              <div className="text-[12px] text-[#A5AFC8]">
                Vote for your mission destination. Majority determines launch site.
              </div>
            </div>

            {tally.winner && (
              <div className="px-3 py-1 rounded-full bg-[#7EE0B8]/20 border border-[#7EE0B8]/40 text-[#7EE0B8] text-xs font-bold">
                Winner: {CHAPTERS.find((c) => c.id === tally.winner)?.title}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {CHAPTERS.filter((c) => c.status === "playable").map((c) => {
              const voteCount = tally.counts[c.id] ?? 0;
              const isMyVote = currentVote === c.id;

              return (
                <button
                  key={c.id}
                  onClick={() => onVoteChapter(c.id)}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                    isMyVote
                      ? "bg-[#7EE0B8]/15 border-[#7EE0B8] text-white shadow"
                      : "bg-[#121A30]/60 border-white/10 hover:border-white/30 text-[#DFE6FF]"
                  }`}
                >
                  <div>
                    <div className="text-[10px] font-bold uppercase text-[#7EE0B8]">
                      {c.number ? `Ch ${c.number}` : "Sandbox"}
                    </div>
                    <div className="font-bold text-xs truncate mt-0.5">
                      {c.title}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/10 text-[11px]">
                    <span className="text-[#A5AFC8]">Votes</span>
                    <span className="font-bold font-mono-num text-[#FFD166]">
                      {voteCount}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Actions: Ready Toggle & Launch Button */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          {onLeaveRoom && (
            <button
              onClick={onLeaveRoom}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold cursor-pointer transition"
            >
              ← Leave Room
            </button>
          )}

          <div className="flex items-center gap-3 ml-auto">
            {/* Ready Toggle Button */}
            <button
              onClick={onToggleReady}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition shadow-lg ${
                isLocalReady
                  ? "bg-[#5AD278] hover:bg-[#6FE08C] text-[#0F2A3A]"
                  : "bg-white/10 hover:bg-white/20 text-white border border-white/20"
              }`}
            >
              {isLocalReady ? "✓ YOU ARE READY" : "READY UP"}
            </button>

            {/* Start Game Button (Host Only) */}
            {isHost ? (
              <button
                onClick={onStartGame}
                disabled={!allReady}
                className={`px-6 py-2.5 rounded-xl font-black text-sm tracking-wide transition shadow-xl ${
                  allReady
                    ? "bg-[#7EE0B8] hover:bg-[#9BF0CE] text-[#0F2A3A] cursor-pointer"
                    : "bg-[#3C4256] text-[#A5AFC8] cursor-not-allowed opacity-60"
                }`}
              >
                {allReady
                  ? "LAUNCH EXPEDITION"
                  : `WAITING FOR CREW (${players.filter((p) => p.ready).length}/${
                      players.length
                    })`}
              </button>
            ) : (
              <div className="text-xs text-[#A5AFC8] italic px-3 py-2 bg-[#080C1A]/40 rounded-xl border border-white/5">
                Waiting for Commander to launch...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── 2. MultiplayerHUDOverlay ────────────────────────────────────────────────

export const MultiplayerHUDOverlay: React.FC<MultiplayerHUDOverlayProps> = ({
  players,
  localSessionId,
  isConnected,
  isReconnecting = false,
  recentPing,
  onSendChat,
}) => {
  const [chatOpen, setChatOpen] = useState(false);

  // Keyboard handler for 'T' key to open chat wheel & numbers 1-8 to select
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setChatOpen((prev) => !prev);
      } else if (e.key === "Escape" && chatOpen) {
        setChatOpen(false);
      } else if (chatOpen && /^[1-8]$/.test(e.key)) {
        const index = parseInt(e.key, 10) - 1;
        const presetObj = CHAT_PRESETS[index];
        if (presetObj && onSendChat) {
          e.preventDefault();
          onSendChat(presetObj.preset);
          setChatOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chatOpen, onSendChat]);

  return (
    <>
      {/* Reconnection Banner */}
      {(!isConnected || isReconnecting) && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-[#EB5050]/90 border border-[#EB5050] text-white text-xs font-bold shadow-2xl backdrop-blur-md animate-pulse">
          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span>Reconnecting to mission control...</span>
        </div>
      )}

      {/* Ping Notification Toast */}
      {recentPing && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-xl bg-[#121A30]/95 border text-white text-xs font-bold shadow-2xl backdrop-blur-md animate-bounce"
          style={{ borderColor: recentPing.color }}
        >
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: recentPing.color }}
          />
          <span>
            {recentPing.sender} pinged coordinates ({Math.round(recentPing.x)},{" "}
            {Math.round(recentPing.z)})
          </span>
        </div>
      )}

      {/* Top-Right Player List Widget */}
      <div className="fixed top-3 right-3 z-40 flex flex-col gap-1.5 p-2.5 rounded-xl bg-[#121A30]/85 border border-white/10 shadow-2xl backdrop-blur-md select-none font-gotham text-xs text-white min-w-[170px]">
        <div className="flex items-center justify-between text-[10px] uppercase font-bold text-[#A5AFC8] border-b border-white/10 pb-1">
          <span>Crew ({players.length}/4)</span>
          <button
            onClick={() => setChatOpen((prev) => !prev)}
            className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[#DFE6FF] text-[9px] cursor-pointer"
            title="Press T for Quick-Chat"
          >
            [T] Chat
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {players.map((p) => {
            const isLocal = p.sessionId === localSessionId;
            const isOnline = p.connected !== false;

            return (
              <div
                key={p.sessionId}
                className={`flex items-center justify-between gap-2 py-0.5 ${
                  isOnline ? "opacity-100" : "opacity-40"
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="truncate font-medium">
                    {p.name} {isLocal && "(You)"}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px] text-[#A5AFC8]">
                  {p.inRover && <span title="In Rover">🚜</span>}
                  {!isOnline && <span className="text-[#EB5050]">Off</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick-Chat Wheel / Menu (opens on T) */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none font-gotham">
          <div className="max-w-sm w-full p-5 rounded-[20px] bg-[#121A30] border border-white/15 shadow-2xl flex flex-col gap-3 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[#7EE0B8]">
                Quick-Chat Wheel
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="text-xs text-[#A5AFC8] hover:text-white cursor-pointer px-1.5 py-0.5"
              >
                ✕ [Esc]
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {CHAT_PRESETS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    onSendChat?.(item.preset);
                    setChatOpen(false);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-[#080C1A]/70 hover:bg-[#202C4C] border border-white/10 hover:border-[#7EE0B8] text-left text-xs font-bold transition cursor-pointer flex items-center justify-between"
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] text-[#A5AFC8] font-mono">
                    [{item.key}]
                  </span>
                </button>
              ))}
            </div>

            <div className="text-[11px] text-[#A5AFC8] text-center mt-1">
              Press [1–8] or click preset to transmit to crew.
            </div>
          </div>
        </div>
      )}
    </>
  );
};
