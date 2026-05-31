/**
 * Spawn N headless bots that join a room and send random movement.
 * Usage: npx tsx scripts/spawn-bots.ts <ROOM_CODE> <N>
 */
import { Client } from "colyseus.js";

const SERVER = "ws://localhost:2567";
const HTTP = "http://localhost:2567";

const code = process.argv[2];
const count = parseInt(process.argv[3] || "3", 10);

if (!code) {
  console.error("Usage: npx tsx scripts/spawn-bots.ts <ROOM_CODE> <N>");
  process.exit(1);
}

async function spawnBot(i: number) {
  const name = `Bot${i}`;
  const res = await fetch(`${HTTP}/room/${code}`);
  if (!res.ok) {
    console.error(`Room ${code} not found`);
    process.exit(1);
  }
  const { roomId } = await res.json();
  const client = new Client(SERVER);
  const room = await client.joinById(roomId, { playerName: name });
  console.log(`[${name}] joined room ${code}`);

  let seq = 0;
  let angle = Math.random() * Math.PI * 2;

  setInterval(() => {
    // Random movement, occasionally change direction
    if (Math.random() < 0.02) angle = Math.random() * Math.PI * 2;
    room.send("input", {
      sequence: ++seq,
      moveX: Math.cos(angle),
      moveY: Math.sin(angle),
      aimAngle: angle,
      fire: false,
      timestamp: Date.now(),
    });
  }, 50);

  room.onLeave(() => {
    console.log(`[${name}] left`);
  });
}

(async () => {
  console.log(`Spawning ${count} bots for room ${code}...`);
  for (let i = 1; i <= count; i++) {
    await spawnBot(i);
  }
  console.log(`All ${count} bots active. Press Ctrl+C to stop.`);
})();
