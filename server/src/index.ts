import { createServer } from "http";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { SERVER_PORT } from "@patriot/shared";
import { PatriotRoom } from "./rooms/PatriotRoom.js";
import { getRoomIdByCode } from "./utils/roomRegistry.js";

const app = express();
app.use(express.json());

// CORS for client access
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (_req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// Room code lookup endpoint
app.get("/room/:code", (req, res) => {
  const code = req.params.code.toUpperCase();
  const roomId = getRoomIdByCode(code);
  if (roomId) {
    res.json({ roomId });
  } else {
    res.status(404).json({ error: "Room not found" });
  }
});

// Colyseus monitor (dev)
app.use("/colyseus", monitor());

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("patriot_room", PatriotRoom);

gameServer.listen(SERVER_PORT).then(() => {
  console.log(
    `[Server] Patriot server listening on http://localhost:${SERVER_PORT}`
  );
});
