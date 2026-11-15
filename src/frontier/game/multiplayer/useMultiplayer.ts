/**
 * React hook for multiplayer lifecycle, room management, and state sync.
 *
 * Wraps FrontierClient, manages connection states, bridges incoming events to
 * RemotePlayerManager (for 3D rendering), and dispatches actions to the Colyseus server.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FrontierClient } from "./client";
import type { RemotePlayerManager } from "./remotePlayers";
import {
  ChatPreset,
  GameAction,
  PingData,
  RemotePlayer,
  RoomCreateOptions,
} from "./types";

export interface UseMultiplayerOptions {
  serverUrl?: string;
  playerName?: string;
  remotePlayerManager?: RemotePlayerManager | null;
  onAction?: (action: GameAction & { sender: string }) => void;
  onGameStart?: () => void;
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
  recentPing: PingData | null;
  recentChat: MultiplayerChatEvent | null;
}

export interface UseMultiplayerReturn extends MultiplayerState {
  connect: (url?: string) => Promise<void>;
  createRoom: (chapterId?: string, roomCode?: string) => Promise<string | null>;
  joinRoom: (code: string) => Promise<boolean>;
  sendChat: (preset: ChatPreset) => void;
  sendPing: (x: number, z: number) => void;
  sendReady: () => void;
  sendVote: (chapterId: string) => void;
  sendAction: (action: GameAction) => void;
  sendMove: (x: number, z: number, rotation: number) => void;
  disconnect: () => void;
  setRemotePlayerManager: (mgr: RemotePlayerManager | null) => void;
  client: FrontierClient | null;
}

const DEFAULT_SERVER_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.["VITE_MULTIPLAYER_URL"]) ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "ws://localhost:2567"
    : "wss://the-frontier-colyseus.herokuapp.com");

export function useMultiplayer(
  options: UseMultiplayerOptions = {}
): UseMultiplayerReturn {
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
  const [recentPing, setRecentPing] = useState<PingData | null>(null);
  const [recentChat, setRecentChat] = useState<MultiplayerChatEvent | null>(null);

  const clientRef = useRef<FrontierClient | null>(null);
  const remoteManagerRef = useRef<RemotePlayerManager | null>(initialRemoteManager);
  const pingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update remotePlayerManager reference
  useEffect(() => {
    remoteManagerRef.current = initialRemoteManager;
  }, [initialRemoteManager]);

  const setRemotePlayerManager = useCallback(
    (mgr: RemotePlayerManager | null) => {
      remoteManagerRef.current = mgr;
      // If we already have players in state, add them to the new manager
      if (mgr) {
        players.forEach((p) => {
          if (p.sessionId !== clientRef.current?.sessionId) {
            mgr.addPlayer(p.sessionId, p.name, p.color, p.seat);
          }
        });
      }
    },
    [players]
  );

  // Initialize FrontierClient instance with callbacks
  useEffect(() => {
    const client = new FrontierClient({
      onPlayerJoin: (player: RemotePlayer) => {
        setPlayers((prev) => {
          const exists = prev.some((p) => p.sessionId === player.sessionId);
          if (exists) {
            return prev.map((p) => (p.sessionId === player.sessionId ? player : p));
          }
          return [...prev, player];
        });

        // 3D figure for remote player (skip self)
        if (
          remoteManagerRef.current &&
          player.sessionId !== clientRef.current?.sessionId
        ) {
          remoteManagerRef.current.addPlayer(
            player.sessionId,
            player.name,
            player.color,
            player.seat
          );
        }
      },

      onPlayerLeave: (leavingSessionId: string) => {
        setPlayers((prev) => prev.filter((p) => p.sessionId !== leavingSessionId));
        if (remoteManagerRef.current) {
          remoteManagerRef.current.removePlayer(leavingSessionId);
        }
      },

      onPlayerMove: (player: RemotePlayer) => {
        setPlayers((prev) =>
          prev.map((p) => (p.sessionId === player.sessionId ? player : p))
        );

        if (
          remoteManagerRef.current &&
          player.sessionId !== clientRef.current?.sessionId
        ) {
          remoteManagerRef.current.updatePlayer(
            player.sessionId,
            player.x,
            player.z,
            player.rotation,
            player.inRover
          );
        }
      },

      onChat: (chat) => {
        setRecentChat({ ...chat, timestamp: Date.now() });

        if (remoteManagerRef.current) {
          remoteManagerRef.current.showChat(chat.sender, chat.message);
        }
      },

      onPing: (ping: PingData) => {
        setRecentPing(ping);

        if (pingTimeoutRef.current) clearTimeout(pingTimeoutRef.current);
        pingTimeoutRef.current = setTimeout(() => {
          setRecentPing(null);
        }, 5000);

        if (remoteManagerRef.current) {
          remoteManagerRef.current.showPing(ping.x, ping.z, ping.color);
        }
      },

      onAction: (act) => {
        onAction?.(act);
      },

      onGameStart: () => {
        onGameStart?.();
      },

      onReconnect: () => {
        setIsConnected(true);
        setIsReconnecting(false);
      },

      onError: (err: Error) => {
        setError(err.message);
        setIsConnecting(false);
      },
    });

    clientRef.current = client;

    return () => {
      if (pingTimeoutRef.current) clearTimeout(pingTimeoutRef.current);
      client.disconnect();
      clientRef.current = null;
    };
  }, [onAction, onGameStart]);

  // Connect client to server URL
  const connect = useCallback(
    async (url?: string) => {
      if (!clientRef.current) return;
      setIsConnecting(true);
      setError(null);
      try {
        await clientRef.current.connect(url || serverUrl);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to connect";
        setError(msg);
      } finally {
        setIsConnecting(false);
      }
    },
    [serverUrl]
  );

  // Create a new multiplayer room
  const createRoom = useCallback(
    async (chapterId = "chapter1", customRoomCode?: string) => {
      if (!clientRef.current) return null;
      setIsConnecting(true);
      setError(null);
      try {
        await clientRef.current.connect(serverUrl);
        const code =
          customRoomCode ??
          Math.random().toString(36).substring(2, 6).toUpperCase();

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
        setIsConnecting(false);
        return effectiveCode;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Room creation failed";
        setError(msg);
        setIsConnecting(false);
        return null;
      }
    },
    [playerName, serverUrl]
  );

  // Join an existing room with code
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
        setIsConnecting(false);
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to join room";
        setError(msg);
        setIsConnecting(false);
        return false;
      }
    },
    [playerName, serverUrl]
  );

  // Send quick-chat preset
  const sendChat = useCallback((preset: ChatPreset) => {
    clientRef.current?.sendChat(preset);
  }, []);

  // Send ping marker
  const sendPing = useCallback((x: number, z: number) => {
    clientRef.current?.sendPing(x, z);
  }, []);

  // Send ready toggle
  const sendReady = useCallback(() => {
    clientRef.current?.sendReady();
  }, []);

  // Send chapter vote
  const sendVote = useCallback((chapterId: string) => {
    clientRef.current?.sendVote(chapterId);
  }, []);

  // Send game action
  const sendAction = useCallback((action: GameAction) => {
    clientRef.current?.sendAction(action);
  }, []);

  // Send movement update
  const sendMove = useCallback((x: number, z: number, rotation: number) => {
    clientRef.current?.sendMove(x, z, rotation);
  }, []);

  // Disconnect from room and reset
  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    setIsConnected(false);
    setIsConnecting(false);
    setIsReconnecting(false);
    setRoomCode(null);
    setSessionId(null);
    setPlayers([]);
    setError(null);
    setRecentPing(null);
    setRecentChat(null);
    if (remoteManagerRef.current) {
      remoteManagerRef.current.destroy();
    }
  }, []);

  // Is local player host (seat 0 or first player in room)
  const isHost = Boolean(
    sessionId &&
      (players.find((p) => p.sessionId === sessionId)?.seat === 0 ||
        (players.length > 0 && players[0]?.sessionId === sessionId))
  );

  return {
    players,
    isConnected,
    isConnecting,
    isReconnecting,
    isHost,
    roomCode,
    sessionId,
    error,
    recentPing,
    recentChat,
    connect,
    createRoom,
    joinRoom,
    sendChat,
    sendPing,
    sendReady,
    sendVote,
    sendAction,
    sendMove,
    disconnect,
    setRemotePlayerManager,
    client: clientRef.current,
  };
}
