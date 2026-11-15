/**
 * React hook for multiplayer lifecycle, room management, and state sync.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FrontierClient } from "./client";
import type { RemotePlayerManager } from "./remotePlayers";
import {
  looksLikeServerOffline,
  probeMultiplayerServer,
  SERVER_OFFLINE_MESSAGE,
} from "./serverStatus";
import { ChatPreset, GameAction, PingData, RemotePlayer, RoomCreateOptions } from "./types";

export interface UseMultiplayerOptions {
  serverUrl?: string;
  playerName?: string;
  remotePlayerManager?: RemotePlayerManager | null;
  onAction?: (action: GameAction & { sender: string }) => void;
  onGameStart?: (chapterId: string) => void;
}

export interface MultiplayerChatEvent {
  sender: string;
  name: string;
  message: string;
  color: string;
  timestamp: number;
}

export interface MultiplayerState {
  players: RemotePlayer[];
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isHost: boolean;
  roomCode: string | null;
  sessionId: string | null;
  error: string | null;
  /** null = not checked yet; true/false after probe or connect attempt */
  serverOnline: boolean | null;
  isCheckingServer: boolean;
  recentPing: PingData | null;
  recentChat: MultiplayerChatEvent | null;
  votes: Record<string, string>;
  currentVote: string | null;
}

export interface UseMultiplayerReturn extends MultiplayerState {
  connect: (url?: string) => Promise<void>;
  createRoom: (chapterId?: string, roomCode?: string) => Promise<string | null>;
  joinRoom: (code: string) => Promise<boolean>;
  checkServer: () => Promise<boolean>;
  sendChat: (preset: ChatPreset) => void;
  sendPing: (x: number, z: number) => void;
  sendReady: () => void;
  sendVote: (chapterId: string) => void;
  sendStart: (chapterId?: string) => void;
  sendAction: (action: GameAction) => void;
  sendMove: (x: number, z: number, rotation: number, inRover?: boolean) => void;
  disconnect: () => void;
  setRemotePlayerManager: (mgr: RemotePlayerManager | null) => void;
  client: FrontierClient | null;
}

const DEFAULT_SERVER_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.["VITE_MULTIPLAYER_URL"]) ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "ws://localhost:2567"
    : "wss://the-frontier-colyseus.herokuapp.com");

function playerFromSchema(sessionId: string, raw: Record<string, unknown>): RemotePlayer {
  const vote = raw["vote"] ? String(raw["vote"]) : "";
  const player: RemotePlayer = {
    sessionId,
    name: String(raw["name"] ?? "Astronaut"),
    x: Number(raw["x"] ?? 0),
    z: Number(raw["z"] ?? 0),
    rotation: Number(raw["rotation"] ?? 0),
    inRover: Boolean(raw["inRover"]),
    color: String(raw["color"] ?? "#7EE0B8"),
    seat: Number(raw["seat"] ?? 0),
    ready: Boolean(raw["ready"]),
    connected: raw["connected"] !== false,
  };
  if (vote) player.vote = vote;
  return player;
}

export function useMultiplayer(options: UseMultiplayerOptions = {}): UseMultiplayerReturn {
  const {
    serverUrl = DEFAULT_SERVER_URL,
    playerName = "Astronaut",
    remotePlayerManager: initialRemoteManager = null,
    onAction,
    onGameStart,
  } = options;

  const [players, setPlayers] = useState<RemotePlayer[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [recentPing, setRecentPing] = useState<PingData | null>(null);
  const [recentChat, setRecentChat] = useState<MultiplayerChatEvent | null>(null);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [currentVote, setCurrentVote] = useState<string | null>(null);

  const clientRef = useRef<FrontierClient | null>(null);
  const remoteManagerRef = useRef<RemotePlayerManager | null>(initialRemoteManager);
  const pingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onActionRef = useRef(onAction);
  const onGameStartRef = useRef(onGameStart);
  onActionRef.current = onAction;
  onGameStartRef.current = onGameStart;

  useEffect(() => {
    remoteManagerRef.current = initialRemoteManager;
  }, [initialRemoteManager]);

  const setRemotePlayerManager = useCallback((mgr: RemotePlayerManager | null) => {
    remoteManagerRef.current = mgr;
  }, []);

  const syncPlayersFromState = useCallback((state: unknown) => {
    const map = (state as { players?: { forEach: (cb: (v: unknown, k: string) => void) => void } })
      ?.players;
    if (!map || typeof map.forEach !== "function") return;

    const next: RemotePlayer[] = [];
    const nextVotes: Record<string, string> = {};
    map.forEach((raw, key) => {
      // Colyseus Schema fields are getters — copy into a plain bag before reading
      const src = raw as {
        sessionId?: string;
        name?: string;
        x?: number;
        z?: number;
        rotation?: number;
        inRover?: boolean;
        color?: string;
        seat?: number;
        ready?: boolean;
        connected?: boolean;
        vote?: string;
      };
      const bag: Record<string, unknown> = {
        name: src.name,
        x: src.x,
        z: src.z,
        rotation: src.rotation,
        inRover: src.inRover,
        color: src.color,
        seat: src.seat,
        ready: src.ready,
        connected: src.connected,
        vote: src.vote,
      };
      const p = playerFromSchema(key, bag);
      next.push(p);
      if (p.vote) nextVotes[p.sessionId] = p.vote;
    });
    next.sort((a, b) => a.seat - b.seat);
    setPlayers(next);
    setVotes(nextVotes);

    const sid = clientRef.current?.sessionId;
    if (sid) {
      const me = next.find((p) => p.sessionId === sid);
      setCurrentVote(me?.vote ?? null);
    }
  }, []);

  useEffect(() => {
    const client = new FrontierClient({
      onPlayerJoin: (player: RemotePlayer) => {
        setPlayers((prev) => {
          const exists = prev.some((p) => p.sessionId === player.sessionId);
          if (exists) {
            return prev.map((p) => (p.sessionId === player.sessionId ? { ...p, ...player } : p));
          }
          return [...prev, player].sort((a, b) => a.seat - b.seat);
        });

        if (remoteManagerRef.current && player.sessionId !== clientRef.current?.sessionId) {
          remoteManagerRef.current.addPlayer(
            player.sessionId,
            player.name,
            player.color,
            player.seat,
          );
        }
      },

      onPlayerLeave: (leavingSessionId: string) => {
        setPlayers((prev) => prev.filter((p) => p.sessionId !== leavingSessionId));
        setVotes((prev) => {
          const next = { ...prev };
          delete next[leavingSessionId];
          return next;
        });
        remoteManagerRef.current?.removePlayer(leavingSessionId);
      },

      onPlayerMove: (player: RemotePlayer) => {
        setPlayers((prev) =>
          prev.map((p) => (p.sessionId === player.sessionId ? { ...p, ...player } : p)),
        );
        if (remoteManagerRef.current && player.sessionId !== clientRef.current?.sessionId) {
          remoteManagerRef.current.updatePlayer(
            player.sessionId,
            player.x,
            player.z,
            player.rotation,
            player.inRover,
          );
        }
      },

      onStateChange: (state) => {
        syncPlayersFromState(state);
      },

      onChat: (chat) => {
        setRecentChat({ ...chat, timestamp: Date.now() });
        remoteManagerRef.current?.showChat(chat.sender, chat.message);
      },

      onPing: (ping: PingData) => {
        setRecentPing(ping);
        if (pingTimeoutRef.current) clearTimeout(pingTimeoutRef.current);
        pingTimeoutRef.current = setTimeout(() => setRecentPing(null), 5000);
        remoteManagerRef.current?.showPing(ping.x, ping.z, ping.color);
      },

      onAction: (act) => {
        onActionRef.current?.(act);
      },

      onVote: ({ sender, chapterId }) => {
        setVotes((prev) => ({ ...prev, [sender]: chapterId }));
        setPlayers((prev) =>
          prev.map((p) => (p.sessionId === sender ? { ...p, vote: chapterId } : p)),
        );
        if (sender === clientRef.current?.sessionId) setCurrentVote(chapterId);
      },

      onGameStart: (chapterId: string) => {
        onGameStartRef.current?.(chapterId);
      },

      onReconnect: () => {
        setIsConnected(true);
        setIsReconnecting(false);
      },

      onError: (err: Error) => {
        if (looksLikeServerOffline(err)) {
          setServerOnline(false);
          setError(SERVER_OFFLINE_MESSAGE);
        } else {
          setError(err.message);
        }
        setIsConnecting(false);
      },
    });

    clientRef.current = client;

    return () => {
      if (pingTimeoutRef.current) clearTimeout(pingTimeoutRef.current);
      client.disconnect();
      clientRef.current = null;
    };
  }, [syncPlayersFromState]);

  const markOffline = useCallback((err?: unknown) => {
    setServerOnline(false);
    setError(
      looksLikeServerOffline(err) || err == null
        ? SERVER_OFFLINE_MESSAGE
        : err instanceof Error
          ? err.message
          : String(err),
    );
  }, []);

  const checkServer = useCallback(async () => {
    setIsCheckingServer(true);
    setError(null);
    const ok = await probeMultiplayerServer(serverUrl);
    setServerOnline(ok);
    if (!ok) setError(SERVER_OFFLINE_MESSAGE);
    setIsCheckingServer(false);
    return ok;
  }, [serverUrl]);

  const connect = useCallback(
    async (url?: string) => {
      if (!clientRef.current) return;
      setIsConnecting(true);
      setError(null);
      try {
        await clientRef.current.connect(url || serverUrl);
        setServerOnline(true);
      } catch (err: unknown) {
        markOffline(err);
      } finally {
        setIsConnecting(false);
      }
    },
    [serverUrl, markOffline],
  );

  const createRoom = useCallback(
    async (chapterId = "chapter1", customRoomCode?: string) => {
      if (!clientRef.current) return null;
      setIsConnecting(true);
      setError(null);
      try {
        await clientRef.current.connect(serverUrl);
        const code = customRoomCode ?? Math.random().toString(36).substring(2, 6).toUpperCase();

        const options: RoomCreateOptions & { name: string } = {
          roomCode: code,
          maxPlayers: 4,
          chapterId,
          name: playerName,
        };

        const room = await clientRef.current.createRoom(options);
        const meta = (room as unknown as { metadata?: { roomCode?: string } }).metadata;
        const effectiveCode = meta?.roomCode ?? code;

        setRoomCode(effectiveCode);
        setSessionId(room.sessionId);
        setIsConnected(true);
        setServerOnline(true);
        setIsConnecting(false);
        setVotes({});
        setCurrentVote(null);
        syncPlayersFromState(room.state);
        return effectiveCode;
      } catch (err: unknown) {
        markOffline(err);
        setIsConnecting(false);
        return null;
      }
    },
    [playerName, serverUrl, syncPlayersFromState, markOffline],
  );

  const joinRoom = useCallback(
    async (code: string) => {
      if (!clientRef.current || !code.trim()) return false;
      const formatted = code.trim().toUpperCase();
      setIsConnecting(true);
      setError(null);
      try {
        await clientRef.current.connect(serverUrl);
        const room = await clientRef.current.joinRoom(formatted, {
          name: playerName,
        });

        setRoomCode(formatted);
        setSessionId(room.sessionId);
        setIsConnected(true);
        setServerOnline(true);
        setIsConnecting(false);
        setVotes({});
        setCurrentVote(null);
        syncPlayersFromState(room.state);
        return true;
      } catch (err: unknown) {
        markOffline(err);
        setIsConnecting(false);
        return false;
      }
    },
    [playerName, serverUrl, syncPlayersFromState, markOffline],
  );

  const sendChat = useCallback((preset: ChatPreset) => {
    clientRef.current?.sendChat(preset);
  }, []);

  const sendPing = useCallback((x: number, z: number) => {
    clientRef.current?.sendPing(x, z);
  }, []);

  const sendReady = useCallback(() => {
    clientRef.current?.sendReady();
    const sid = clientRef.current?.sessionId;
    if (!sid) return;
    // Optimistic: schema patches can lag; toggle local ready so Launch unlocks immediately
    setPlayers((prev) =>
      prev.map((p) => (p.sessionId === sid ? { ...p, ready: !p.ready } : p))
    );
  }, []);

  const sendVote = useCallback((chapterId: string) => {
    clientRef.current?.sendVote(chapterId);
    const sid = clientRef.current?.sessionId;
    if (sid) {
      setVotes((prev) => ({ ...prev, [sid]: chapterId }));
      setCurrentVote(chapterId);
      setPlayers((prev) => prev.map((p) => (p.sessionId === sid ? { ...p, vote: chapterId } : p)));
    }
  }, []);

  const sendStart = useCallback((chapterId?: string) => {
    clientRef.current?.sendStart(chapterId);
  }, []);

  const sendAction = useCallback((action: GameAction) => {
    clientRef.current?.sendAction(action);
  }, []);

  const sendMove = useCallback((x: number, z: number, rotation: number, inRover = false) => {
    clientRef.current?.sendMove(x, z, rotation, inRover);
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    setIsConnected(false);
    setIsConnecting(false);
    setIsReconnecting(false);
    setRoomCode(null);
    setSessionId(null);
    setPlayers([]);
    setError(null);
    setServerOnline(null);
    setIsCheckingServer(false);
    setRecentPing(null);
    setRecentChat(null);
    setVotes({});
    setCurrentVote(null);
    remoteManagerRef.current?.destroy();
  }, []);

  const isHost = Boolean(sessionId && players.find((p) => p.sessionId === sessionId)?.seat === 0);

  return {
    players,
    isConnected,
    isConnecting,
    isReconnecting,
    isHost,
    roomCode,
    sessionId,
    error,
    serverOnline,
    isCheckingServer,
    recentPing,
    recentChat,
    votes,
    currentVote,
    connect,
    createRoom,
    joinRoom,
    checkServer,
    sendChat,
    sendPing,
    sendReady,
    sendVote,
    sendStart,
    sendAction,
    sendMove,
    disconnect,
    setRemotePlayerManager,
    client: clientRef.current,
  };
}
