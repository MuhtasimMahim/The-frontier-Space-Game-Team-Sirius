import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";

import { FrontierRoom } from "./rooms/FrontierRoom";

// ── Express ──────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Colyseus monitor — only when explicitly enabled (never open on public Heroku by default)
if (process.env.ENABLE_MONITOR === "1" || process.env.NODE_ENV !== "production") {
  app.use("/colyseus", monitor());
}

// ── Colyseus Server ──────────────────────────────────────────────────────────

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Room-code invite matching: client create/join must pass { roomCode }
gameServer.define("frontier", FrontierRoom).filterBy(["roomCode"]);

// ── Listen ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 2567;

gameServer.listen(PORT).then(() => {
  console.log(`[Frontier] Colyseus server listening on port ${PORT}`);
  if (process.env.ENABLE_MONITOR === "1" || process.env.NODE_ENV !== "production") {
    console.log(`[Frontier] Monitor: http://localhost:${PORT}/colyseus`);
  }
});
