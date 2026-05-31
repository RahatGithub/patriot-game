import { createServer } from "http";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { SERVER_PORT } from "@patriot/shared";
import { PatriotRoom } from "./rooms/PatriotRoom.js";

const app = express();
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
