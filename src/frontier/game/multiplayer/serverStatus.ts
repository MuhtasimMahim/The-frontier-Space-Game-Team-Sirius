/** Friendly copy when the Colyseus crew server cannot be reached. */
export const SERVER_OFFLINE_MESSAGE =
  "Crew server is offline right now. Solo Expedition still works — please try that instead.";

/**
 * Normalize ws/wss/http/https or typoed protocols (e.g. was://) into a valid ws/wss URL.
 */
export function normalizeMultiplayerUrl(url?: string): string {
  let cleaned = (url || "").trim();
  if (!cleaned) return "wss://the-frontier-colyseus-996f14385e12.herokuapp.com";

  // Fix accidental was:// typo
  cleaned = cleaned.replace(/^was:\/\//i, "wss://");

  // Map http(s) to ws(s)
  cleaned = cleaned.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");

  if (!/^wss?:\/\//i.test(cleaned)) {
    cleaned = `wss://${cleaned}`;
  }

  // Strip trailing slashes
  cleaned = cleaned.replace(/\/+$/, "");

  // Prevent mixed-content websocket blocking on HTTPS origins
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    cleaned.startsWith("ws://") &&
    !cleaned.includes("localhost") &&
    !cleaned.includes("127.0.0.1")
  ) {
    cleaned = cleaned.replace(/^ws:\/\//i, "wss://");
  }

  return cleaned;
}

/** Turn ws:// / wss:// into http:// / https:// for the /health probe. */
export function multiplayerHttpBase(wsUrl: string): string {
  const normalized = normalizeMultiplayerUrl(wsUrl);
  return normalized.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
}

/** True when an error looks like the backend is down, sleeping, or unreachable. */
export function looksLikeServerOffline(err: unknown): boolean {
  const raw =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === "string"
        ? err
        : String(err ?? "");
  const msg = raw.toLowerCase();
  return (
    /failed to fetch|networkerror|network error|err_connection|econnrefused|enotfound|etimedout|timeout|timed out|abort|unreachable|offline|websocket|connection refused|load failed|could not connect|server.*down|503|502|504/.test(
      msg,
    ) || msg.trim() === ""
  );
}

/** Probe GET /health so we can warn before create/join. */
export async function probeMultiplayerServer(
  wsUrl: string,
  timeoutMs = 6000,
): Promise<boolean> {
  if (typeof fetch === "undefined") return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${multiplayerHttpBase(wsUrl)}/health`, {
      method: "GET",
      signal: ctrl.signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
