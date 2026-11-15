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

// Colyseus monitor (dev / admin only)
app.use("/colyseus", monitor());

// ── Colyseus Server ──────────────────────────────────────────────────────────

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Register the room
gameServer.define("frontier", FrontierRoom);

// ── Listen ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 2567;

gameServer.listen(PORT).then(() => {
  console.log(`[Frontier] Colyseus server listening on port ${PORT}`);
  console.log(`[Frontier] Monitor: http://localhost:${PORT}/colyseus`);
});
