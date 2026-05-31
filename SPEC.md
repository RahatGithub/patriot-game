# Patriot — Game Specification

**Version:** 2.0
**Last updated:** 2026-05-31
**Status:** Locked (changes require explicit update to this file)

This document is the single source of truth for the project. All Claude Code prompts will reference it. If something contradicts this file, this file wins.

---

## 1. Project Overview

**Name:** Patriot
**Domain:** `patriot.tech-noverse.com`
**Type:** Real-time, top-down 2D, co-op multiplayer, browser-based action game
**Project root:** `D:\GAME-projects\patriot\`
**Players per room:** 2 minimum, 10 maximum
**Platforms:** Desktop browsers + mobile browsers (Chrome, Safari, Firefox, Edge)
**Mobile orientation:** Forced landscape

---

## 2. Tech Stack

### Client
- **Phaser 3** (2D game engine)
- **TypeScript**
- **Vite** (dev server + production bundler)
- Vanilla HTML/CSS for menus/lobby

### Server
- **Node.js** (LTS, v20+)
- **TypeScript**
- **Colyseus** (multiplayer framework)
- **Authoritative server**
- **Tick rate:** 20Hz (50ms per update)

### Shared
- A `/shared` folder for types, constants, damage matrix, weapon definitions — imported by both client and server.

### Hosting
- **Hetzner CPX22 VPS** (3 vCPU, 4GB RAM)
- **Nginx** reverse proxy (SSL via Let's Encrypt)
- **PM2** process manager
- **WebSocket Secure (WSS)** over port 443

### Repo
- **Git + GitHub**
- Monorepo: `/server`, `/client`, `/shared`

---

## 3. Project Folder Structure

```
patriot/
├── SPEC.md
├── README.md
├── package.json                 ← root workspace
├── tsconfig.base.json
├── .gitignore
├── client/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.ts
│   │   ├── scenes/
│   │   ├── ui/
│   │   ├── network/
│   │   └── utils/
│   └── assets/
│       ├── sprites/
│       │   ├── characters/
│       │   ├── vehicles/
│       │   ├── objects/
│       │   ├── weapons/
│       │   └── effects/
│       ├── audio/sfx/
│       └── ui/
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── rooms/
│   │   ├── ai/
│   │   ├── systems/
│   │   └── utils/
├── shared/
│   ├── package.json
│   ├── src/
│   │   ├── constants.ts
│   │   ├── damage.ts
│   │   ├── weapons.ts
│   │   ├── ranks.ts
│   │   └── types.ts
└── _assets_raw/                 ← temporary holding for raw sprite generations
```

---

## 4. Game Concept

Top-down 2D co-op survival mission. Up to 10 human players play as a military squad (the "Patriots") attacking a series of checkpoints held by AI mafia enemies. Squad must capture all checkpoints within a time limit. Players can revive downed teammates. Players level up by killing enemies, unlocking access to more powerful weapons.

**Visual reference:** Classic GTA 1/2, Hotline Miami.
**Tone:** Military realistic.

---

## 5. Core Gameplay Loop

1. Player creates or joins a private room via shareable code.
2. Player enters unique display name.
3. Lobby fills (2–10 players). Room creator starts match.
4. Match begins: countdown timer starts.
5. Squad fights through map, capturing checkpoints by entering capture zone + raising friendly flag.
6. Between checkpoints: stats screen.
7. Match ends when:
   - **WIN:** All checkpoints captured before timer ends.
   - **LOSE (wipe):** All human players permanently dead.
   - **LOSE (time):** Timer hits 00:00 with checkpoints remaining → "Time Up" stats screen.

---

## 6. Map & World

- **One fixed map** (multi-map deferred to post-v1.0).
- **Size:** Large (exploration-friendly).
- **Lighting:** Fixed.
- **Zones (separate areas connected by paths):**
  - Outdoor terrain (grass, dirt, roads)
  - Indoor rooms (mafia hideouts)
  - Basement / go-down
  - Pool / decorative water area
- **Environment objects:** walls, fences, chairs, tables, shelves, counters, swimming pools, water fountains, plants, trees.
- **Map difficulty:** Each checkpoint area is progressively more complex/hostile.

---

## 7. Players (Humans)

### Spawn
- Spawn at squad's starting zone (map edge opposite to first checkpoint).
- Start health: **100**.
- Start weapon: **Pistol** with limited ammo at start (~30 rounds), unlimited after pickup or refill.
- Start rank: **Soldier (1★)**.

### Movement
- **Run only** (single moderate speed, no walking or crawling).
- 360-degree movement.

### Controls — Desktop (keyboard + mouse)
- **WASD** — movement
- **Mouse** — aim direction
- **Left click** — fire
- **R** — reload (if applicable)
- **E** — interact (enter vehicle, pick up barrel, capture flag, revive)
- **G** — throw grenade (if owned)
- **F** — drop current weapon (revert to pistol)
- **Tab** — show scoreboard
- **Enter** — open text chat

### Controls — Mobile (touch)
- **Left virtual joystick** — movement
- **Right virtual joystick** — aim direction
- **Fire button** (right side, near aim stick)
- **Interact button**
- **Grenade button**
- **Drop weapon button**
- **Chat button**

### Device selection
- Player chooses input mode on first launch: "I'm on Desktop" / "I'm on Mobile".
- Choice stored in localStorage.
- Mobile mode forces landscape orientation.

### Health & Death
- HP bar above each player.
- **Cure pickup** restores HP to 100%.
- **On HP = 0:** player enters **downed state** (not dead yet).
- Teammates revive by holding **E** near downed player for a few seconds.
- If not revived within **30 seconds**, player **fully dies** and waits to respawn at next captured checkpoint.
- **On revival or respawn:** weapon resets to **Pistol**.

### Friendly Fire
- **OFF.** Human-fired bullets, explosives, and vehicles do not damage other humans.

### Ranks & Promotion
| Rank | Stars | Promotion threshold | Sprite filename |
|------|-------|---------------------|------------------|
| Soldier | 1★ | 0 kills (start) | `soldier_patriot.png` |
| Officer | 2★ | 10 kills | `officer_patriot.png` |
| Major | 3★ | 25 kills | `major_patriot.png` |
| General | 4★ | 50 kills | `general_patriot.png` |
| Field Marshal | 5★ | 80 kills | `marshal_patriot.png` |

- Rank is **per-match** (resets each match).
- Display: name + stars shown above character at all times.
- **Each rank has its own sprite.** Player sprite swaps on promotion.

### Weapon access by rank
| Rank | Allowed weapons |
|------|-----------------|
| Soldier | Pistol |
| Officer | Pistol, MK18 |
| Major | Pistol, MK18, Grenade |
| General | Pistol, MK18, Grenade, Machine Gun |
| Field Marshal | Pistol, MK18, Grenade, Machine Gun, Bazooka |

- If a player tries to pick up a weapon their rank doesn't allow, **they cannot pick it up**. Icon remains floating.

---

## 8. AI Enemies (Mafia)

### Appearance
- All enemies wear **black suits, sunglasses, slicked-back black hair**.
- Same character base, differentiated by weapon held.

### Weapon variants & sprites
| Variant | Sprite filename |
|---------|-----------------|
| Mafia with Pistol | `mafia_pistol.png` |
| Mafia with MK18 | `mafia_mk18.png` |
| Mafia with Machine Gun | `mafia_mg.png` |

### Behaviors (state machine)
- **Patrol** (default): walking along predefined paths.
- **Alert**: triggered by hearing a shot nearby OR seeing a human in vision cone. Stops, looks around.
- **Chase**: runs toward last known human position, fires when in range.
- **Return to patrol**: if no humans seen/heard for ~10s, returns to patrol path.

### Vision cones
- Translucent cone showing sight range and angle.
- **Color codes alert state:**
  - **Yellow** — patrolling
  - **Orange** — alerted
  - **Red** — actively chasing/firing
- Always visible to all players.
- Vision range: ~250px in front, ~90° arc (tunable).
- Sound detection range: ~400px radius (any gunshot triggers alert).

### Spawning
- Spawn at **map edges** in waves tied to checkpoint progression.
- Wave size and difficulty **scale up** per checkpoint.

### Vehicle usage
- **AI enemies do NOT use vehicles.** Only humans drive.

### Friendly fire (AI)
- Enemies do not damage each other.

---

## 9. Weapons

### Weapon roster
| Weapon | Type | Ammo | Rank required |
|--------|------|------|---------------|
| Pistol (Beretta) | Sidearm | Limited at start (30), unlimited after | Soldier+ |
| MK18 | Rifle | Unlimited | Officer+ |
| Grenade | Thrown explosive | ~3 per pickup | Major+ |
| Machine Gun | Heavy rifle | Unlimited | General+ |
| Bazooka | Rocket launcher | ~3 rockets per pickup | Field Marshal |

### Weapon mechanics
- **Player holds ONE primary weapon at a time.**
- **Pistol is default fallback.** Dropping weapon (F) reverts to pistol.
- **Picking up a new weapon REPLACES** current (Y/N prompt for non-pistol pickups).
- **Grenades** are separate throwable inventory (G to throw). Up to ~3 carried alongside any primary.
- **On death/revival:** primary resets to **Pistol**. Grenades cleared.

### Pickup behavior
- Weapons appear **floating** from destroyed loot crates.
- Approaching shows: "Pick up [weapon]? (Y/N)".
- Y → replaces current. N → leaves floating.
- Rank restriction: locked weapons cannot be picked up.

---

## 10. Vehicles

### Jeep / Car
- **Capacity:** 1 (driver only).
- **HP:** 40.
- **Destroyed by:** 1 rocket (bazooka or tank).
- Minor damage from bullets and nearby barrels.

### Military Truck
- **Capacity:** 4 (1 driver + 3 passengers).
- **HP:** 80.
- **Destroyed by:** 1 tank rocket OR 2 bazooka rockets.
- Minor damage from bullets and nearby barrels.

### Tank
- **Capacity:** 1 (driver also fires cannon).
- **HP:** 120.
- **Destroyed by:** 3 hits from another tank OR 3 bazooka rockets.
- **Tank cannon damage:** 80 to players (AoE), 40 to other tanks, 80 to trucks/jeeps.

### Vehicle mechanics
- First player to interact (E) becomes driver.
- Other players E to enter as passengers (trucks only).
- E inside = exit.
- Driving controls match player movement.
- Tank cannon: separate fire input (mouse click on desktop, dedicated button on mobile).
- Health bar displays above each vehicle.

---

## 11. Interactive Objects

### Explosive Barrels (`barrel_explosive.png`)
- One bullet of any kind destroys → explosion.
- **Explosion radius:** ~150px. AoE damage: **60** to humans (environmental, ignores friendly fire), values vary for other targets (see damage matrix).
- **Carryable by humans only:** approach + E to pick up. Movement speed -30% while carrying. E again to drop.
- AI cannot carry barrels.
- No health bar shown (one-shot kill).
- Throwing barrels deferred to v1.1.

### Loot Crates (`crate_wooden.png`)
- Destructible (HP: 20).
- On destruction, reveal contents (weapon icon or cure icon) **floating in place**.
- Approach → prompt for pickup (weapons) OR auto-pickup (cure).
- **Cure:** restores HP to 100% (auto-pickup).
- **Weapons:** subject to rank restriction.
- Crate contents **pre-placed on map** for v1.0.

### Flag
- Each checkpoint has flag at its center.
- Initially shows enemy flag. On capture, raises friendly flag.

---

## 12. Damage Matrix

| Attacker → Target | Player | Jeep/Truck | Tank | Barrel | Loot Crate |
|--------|--------|---------|------|--------|------------|
| Pistol bullet | -5 | -2 | -1 | destroy | -10 |
| MK18 bullet | -10 | -3 | -2 | destroy | -20 (1-shot) |
| Machine Gun bullet | -12 | -4 | -2 | destroy | -20 |
| Grenade (AoE) | -50 | -20 | -15 | chain | destroy |
| Bazooka rocket | -40 | -40 | -40 | destroy | destroy |
| Tank cannon shot | -80 | -80 | -40 | destroy | destroy |
| Barrel explosion (AoE) | -60 | -15 | -10 | chain | destroy |

- All values in HP.
- Vehicle HP: **Jeep 40, Truck 80, Tank 120**.
- All values centralized in `/shared/src/damage.ts`.

---

## 13. Checkpoint System

- Map has **N checkpoints** (configurable: **3, 5, or 7**).
- Each is a defined area with enemy flag at center.
- **Capture mechanic:**
  1. ≥1 human player enters capture zone.
  2. No mafia remaining in zone.
  3. Hold position ~5 seconds.
  4. Enemy flag replaced with friendly flag → captured.
- **On capture:**
  - All fully-dead players respawn at newly captured checkpoint.
  - **Stats screen** ~5 seconds.
  - Next wave spawns toward next checkpoint.

---

## 14. Match Flow & Timer

- **Total match time:** `2 minutes × number of checkpoints`.
- Example: 5 checkpoints = 10 minutes total.
- Timer **continuous** — does not reset per checkpoint.
- Always visible in HUD (top of screen).
- **On 00:00:** "Time Up" screen with stats, then loss.
- **All checkpoints captured:** "Victory" screen with stats.
- **All humans permanently dead:** "Mission Failed" screen with stats.

---

## 15. Room System

### Creation
- "Create Room" → select checkpoint count (3/5/7) → enter display name.
- Server generates **6-character room code**.
- Creator shares code or link (`https://patriot.tech-noverse.com/?room=ABC123`).

### Joining
- Visit link OR enter code.
- Enter display name. **Name uniqueness** per room (prompt if taken).
- Enter lobby (or direct to match if mid-match).

### Lobby
- Shows all players + names.
- Creator has **"Start Match"** button (enabled when ≥2 players).
- Others: "Waiting for room creator..."

### Mid-match joining
- Allowed until match ends.
- Joiner spawns at **most recently captured checkpoint** (or start if none).
- Joiner starts as Soldier with Pistol.

### Room lifecycle
- Destroyed when match ends + all leave, or all disconnect.
- Idle rooms cleaned up after 30 min inactivity.

---

## 16. HUD / UI

### In-match HUD (always visible)
- **Top-left:** Mini-map (player positions, checkpoints, nearby enemies).
- **Top-center:** Countdown timer (MM:SS).
- **Top-right:** Enemy counter (`Remaining/Total`).
- **Bottom-left:** Health bar + current weapon icon + ammo + grenade count.
- **Bottom-right:** Rank stars + kill count toward next promotion.
- **Above each player/AI:** Name (humans) + stars (humans) + HP bar.
- **Above each destructible vehicle/object:** HP bar.

### Menus & Screens
- **Splash** — title, Create/Join Room.
- **Name + character display** — text input + sprite preview.
- **Lobby** — player list, room code, start button.
- **In-match** — HUD as described.
- **Stats screen** — between checkpoints + match end.
- **Death/downed UI** — revival/wait instructions.

### Chat
- **Text chat in-match** (toggle input, Enter to open).
- Voice chat **external** (Discord/WhatsApp).

---

## 17. Responsive Design Standards

**Applies to ALL UI elements across ALL prompts:**

- **Phaser canvas auto-scales** to viewport (`Phaser.Scale.FIT` or `RESIZE` mode).
- **Game logical resolution:** 1920×1080 (16:9), scales up/down.
- **UI uses percentage-based positioning**, not absolute pixels.
- **Touch targets minimum 44×44px** on mobile.
- **Font sizes scale relative to screen height**.
- **Mobile orientation:** forced landscape via CSS + JS orientation lock. Show "Please rotate your device" overlay if portrait.
- **Tested resolutions:** 1920×1080 desktop, 1366×768 laptop, 844×390 iPhone landscape, 640×360 low-end Android landscape.
- **All menus must work on both desktop and mobile landscape.**
- **HUD elements reposition** based on screen size — don't overlap or clip.

---

## 18. Visual Direction

- **Top-down 2D**, classic GTA 1/2 style.
- **Sprite-based** rendering (no SVG for game objects).
- **Military realistic** color palette.
- All objects from top view.

### Asset sources
- **Kenney.nl** packs (already downloaded): Topdown Shooter, Topdown Tanks, Game Icons.
- **Custom-generated sprites** via ChatGPT/DALL-E (saved in `client/assets/sprites/`).
- **Environment objects** — generated programmatically (Phaser Graphics API) or simple SVG-to-PNG.

---

## 19. Audio

### v1.0 includes (SFX):
- Footsteps, gunshots (per weapon), reload, explosions (barrel, grenade, rocket), vehicle engines (loop while driving), flag capture, level-up, death, hit feedback.

### Deferred to v1.1:
- Background music
- Voice chat **permanently external**

---

## 20. Networking

- **Authoritative server.**
- **Client-side prediction** for own movement; server reconciles.
- **Other entities interpolated** between server states.
- **Tick rate:** 20Hz (50ms).
- **Reliable channels** for events; **unreliable channels** for position updates (Colyseus handles).

---

## 21. Out-of-Scope (Deferred Beyond v1.0)

- Background music
- Voice chat (permanently external)
- Multiple maps
- Persistent player accounts
- Public matchmaking
- Spectator mode
- Replays
- Random crate contents per match
- Throwable barrels
- More enemy types (snipers, melee, etc.)
- Achievements / leaderboards
- AI vehicle usage

---

## 22. Development Milestones (35 prompts)

| # | Prompt | Status |
|---|--------|--------|
| 01 | Monorepo + scaffolding (client + server + shared, Vite + Phaser + Colyseus + TS, hello world) | not started |
| 02 | Server: room system (create, join-by-code, name uniqueness, max 10, lobby state) | not started |
| 03 | Client: splash screen + Create/Join Room UI + lobby UI with player list | not started |
| 04 | Client: device detection + landscape lock + desktop controls (WASD + mouse) | not started |
| 05 | Client: mobile virtual joysticks + touch buttons | not started |
| 06 | Client: Phaser game scene + map rendering (placeholder zones) | not started |
| 07 | Single-player movement (local only) | not started |
| 08 | Multiplayer networking (server-authoritative movement + client prediction + interpolation) | not started |
| 09 | Pistol weapon + bullet firing + physics | not started |
| 10 | Hit detection + HP system + HP bars + damage matrix wiring | not started |
| 11 | MK18 rifle | not started |
| 12 | AI: mafia spawning + patrol behavior | not started |
| 13 | AI: vision cones (rendering + sight detection) | not started |
| 14 | AI: alert state + sound detection | not started |
| 15 | AI: chase behavior + AI shooting | not started |
| 16 | Checkpoints: capture zones + flag mechanic | not started |
| 17 | Match flow: timer + win/lose/timeout | not started |
| 18 | Stats screen (between checkpoints + match end) | not started |
| 19 | Loot crates: destructible + floating pickup framework | not started |
| 20 | Cure pickup (HP restore) | not started |
| 21 | Weapon pickup interaction (Y/N prompt) | not started |
| 22 | Ranking system (kill tracking, promotions, stars, sprite swap) | not started |
| 23 | Rank-gated weapon pickup enforcement | not started |
| 24 | Revival system (downed state + teammate revive) | not started |
| 25 | Explosive barrels: shoot-to-explode + AoE system | not started |
| 26 | Explosive barrels: carry/drop mechanic | not started |
| 27 | Grenade weapon (uses AoE system) | not started |
| 28 | Machine Gun weapon | not started |
| 29 | Bazooka rocket launcher | not started |
| 30 | Vehicle foundation + Jeep | not started |
| 31 | Truck (multi-seat) | not started |
| 32 | Tank (driving + cannon + vehicle-vs-vehicle damage) | not started |
| 33 | HUD: mini-map + enemy counter + weapon UI + rank UI | not started |
| 34 | Text chat | not started |
| 35 | Audio (SFX) + visual polish + VPS deployment | not started |

---

## 23. Asset Filename Registry

### Characters (`client/assets/sprites/characters/`)
- `soldier_patriot.png` ✅ generated
- `officer_patriot.png` ⏳ to generate
- `major_patriot.png` ⏳ to generate
- `general_patriot.png` ⏳ to generate
- `marshal_patriot.png` ⏳ to generate
- `mafia_pistol.png` ⏳ to generate
- `mafia_mk18.png` ✅ generated
- `mafia_mg.png` ⏳ to generate

### Vehicles (`client/assets/sprites/vehicles/`)
- `jeep_military.png` ⏳ to generate
- `truck_military.png` ⏳ to generate
- `tank_military.png` ⏳ to generate

### Objects (`client/assets/sprites/objects/`)
- `barrel_explosive.png` ⏳ to generate
- `crate_wooden.png` ⏳ to generate
- `flag_friendly.png` ⏳ programmatic or generate
- `flag_enemy.png` ⏳ programmatic or generate

### Weapons / Pickups (`client/assets/sprites/weapons/`)
- `weapon_pistol.png` — Kenney
- `weapon_mk18.png` — Kenney
- `weapon_grenade.png` — Kenney
- `weapon_mg.png` — Kenney
- `weapon_bazooka.png` — Kenney
- `weapon_cure.png` — Kenney Game Icons

### Effects (`client/assets/sprites/effects/`)
- Bullets, explosions, muzzle flashes — Kenney Topdown Shooter

---

## 24. Glossary

- **Patriot:** human player faction (us).
- **Mafia:** AI enemy faction.
- **Checkpoint:** capturable area marked by a flag.
- **Downed:** player at 0 HP but still revivable.
- **Permadeath:** when downed timer expires; respawn only on next checkpoint capture.
- **Tick:** one server simulation step (50ms at 20Hz).
- **AoE:** Area of Effect (explosion damage).

---

*End of SPEC.md v2.0*
