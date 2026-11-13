# Crater Escape

A multiplayer "+1 Speed" driving game for the browser, built with **Three.js** and **Colyseus** for Bloxity (listed as **🌋 +1 Speed Crater Escape**, slug `crater-escape`). You drive a buggy. **Every step it takes is +1 Speed and +1 XP, times all your boosts.** XP fills your Level, and your **Level is your top speed**. A chain of sky islands leads away from Base Camp, each with a crater sunk into it: a funnel with a hole in its middle. There is no way round its rim: you ride its wall round to the far side (the faster you go, the higher your tyres hold) and get thrown out over the rim there: **ESCAPED!** That pays Wins, and Wins buy faster cars, tuning, dynos, trails and pet Eggs. Slide into the hole and you are back at Base Camp.

Only the genre, the core loop, the pacing and the feel come from the reference (a "+1 speed, escape the pit" game: speed from every step, a pit whose wall you can only climb when you're fast enough, Wins at the top, treadmill-style training, pets, rebirths). **Everything a player sees is our own**: the name, the buggies, the sky islands and their craters, the hazards, the worlds, the pets, every word and the whole HUD. No asset, name or line of text is taken from it.

**There are no in-app purchases.** Everything costs Wins (from escapes and races) or Gems (from quests, daily tasks, races, gifts, the wheel, the daily reward and codes). No Bux are spent anywhere.

It shares its engine with the other Legion games: the server, Bloxity login and avatars, the snapshot smoothing, the camera and lighting rig, the quality system, profiles, saves, play stats, the test scripts and the deploy workflow. It was started from the newest Legion game (+1 Speed Desert Keyboard Escape) and given its own content: a car on an analytic height field instead of a runner, craters instead of an obstacle road, a volcano race instead of lanes.

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client. **`main.js`**: boot and warm-up, your car on the shared physics, steps with prediction, dynos, the drop off the rim, the funnel's wall, the hole, the launch chevrons and the escape, the hazards, SKIP, the guide chevrons, the autopilot (QA), the camera, keyboard / mouse / touch / controller, other players, the race, the frame loop. **`engine.js`**: renderer, lights, sky, sea, quality tiers, the FPS watch. **`world.js`**: Base Camp, the islands (their funnels and holes, crescents, kerbs and fences, the road across them), bridges, gates and signs as merged, batched geometry. **`cars.js`**: the twelve buggies and their instanced wheels. **`chars.js`**: a car with its seated driver, name tag, trail and underglow. **`stagefx.js`** / **`arenaview.js`**: the hazards of a crater and the race's volcano. **`ui.js`**, **`icons.js`**: the HUD and panels. **`audio.js`**, **`asmr.js`**: music and sounds, all synthesised. **`smooth.js`**, **`clock.js`**: other players on the server's clock. |
| `server/` | Colyseus 0.18 server. **`RunRoom.js`** (the `run` room): steps and their token buckets, the move guard, gates, escapes and their Wins, SKIP, cars, tuning, dynos, eggs, rebirths, worlds, the wheel, tasks, quests, rewards, codes, Base Camp's bots. **`Match.js`**: the RACE queue, the race, its bots and its prizes. **`profiles.js`**, **`saves.js`**, **`stats.js`**, **`bloxity.js`**: profiles, signed saves, play stats, Bloxity login. |
| `shared/` | **`config.js`**: the step, XP and Levels, top speed, cars, tuning, trails, underglows, dynos, pets and eggs, the worlds and every crater's Recommended Level and pay, what a race is like at a Level and what it pays, tasks, quests, rewards, codes. **`world.js`**: the islands and craters worked out from those Levels, the ground's height and slope anywhere, the hazards' timetables. **`physics.js`**: the car (used by the client for your own car and by the tests). **`arena.js`**: the race's volcano, its lava and its boulders. |
| `tests/` | The test scripts (see Testing) and the setup-page generator |
| `covers/` | The two store covers (1920x1080, 800x800), rendered from the game by `node tests/covers.mjs` (git-ignored, like the other Legion games' covers) |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat`, or:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:3087
```

For development, run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5649. The client talks to the server on port 3087 (`VITE_SERVER_URL` overrides that). The ports don't clash with the other Legion games.

- Dev builds, or a build with `VITE_QA=1`, expose `window.__qa`: the autopilot, perf readings, teleports.
- Restart the server after changing `shared/`.
- For testing only, `QA=1` lets the client give itself Speed, Wins, Gems, Levels, rebirths and cars (`__qa.give`) and pick a race's map and Level. It is refused on Legion.

## Gameplay

There is no start menu: the page loads, joins a server and you are sitting in your buggy at Base Camp.

- **Steps.** Drive, and every stride of the wheels is a step: **+1 Speed and +1 XP times all your boosts**, a "+1" popping up beside the car. Your car, rebirths, pets, your trail and underglow, Turbo Intake, the world you're in, the dyno you're on, x2 Speed and the squad boost multiply the Speed; "ALL YOUR BOOSTS: x1 SPEED" over the Level bar shows them together and the STATS panel lists each one. A stride gets longer the faster you go, so you take about four steps a second at any speed.
- **Level is your top speed.** 20 XP for Level 2, then 15% more each Level (70 at Level 10), steeper past Level 10 and again past Level 20 (421 at Level 20, 4,110 at Level 30). Every Level adds 2.4 to your top speed: 24 studs a second at Level 1, 46 at Level 10, 70 at Level 20, 94 at Level 30, up to 112.
- **Craters.** Twelve in each world, each a funnel sunk into its own sky island, joined by ramp bridges. A crater's wall is a parabola: gentle at its foot, steeper all the way up, and at the rim too steep to stand on. What holds you up there is speed: lapping the wall presses the tyres into it, and the faster you lap the higher they hold. **Each crater is sized from its Recommended Level** (1, 2, 3, 5, 7, 9, 12, 15, 18, 22, 26, 30): at that Level's top speed your tyres hold right up to the rim. The first is 36 studs to the rim and 16 deep; the last is 201 to the rim and 199 deep.
  - **The hole.** In the middle of every crater is a hole, and the foot of the wall tips over into it. Slide in and you are back at Base Camp (Teleport takes you back to any crater you have reached).
  - **Straight in, and no way round.** The road runs straight at each crater's middle. The bridge ends on a small landing at the rim with rails along its sides, and beyond it there is only the funnel: no deck round the rim, just a kerb and a fence. Hold the throttle and drive straight on: at the lip the car drops in, as a skater drops into a bowl, and is carried into a carve along the wall (to the right or left, whichever way you steer as you go over; hands off, the crater's own way). It dives past the hole and comes up the wall towards the exit platform on the far side, where the road goes on. Hands off, the car laps by itself as high as its speed holds. A bar at the top of the screen shows how far up you are, and a line of light on the wall shows how far your speed can take you. Inside a funnel the camera keeps within the rim and swings round to watch you from inside the bowl.
  - **ESCAPED!** Along the top of the wall on the far side, under the second crescent, runs a band of golden **launch chevrons**. Get up onto them (fast enough to hold the wall there, or with NITRO lit as you come) and you are thrown out over the rim onto the crescent. The crater pays its Wins (1 to 47 in the first world, 120 to 5,640 in the second), **triple the first time each rebirth**, and its gate to the next bridge opens. The brakes come on by themselves for a moment as you land. You can go round again for Wins every 30 seconds.
  - **Harder up the chain.** The first craters let you through in one carve (about 5 seconds). Further on the drop aims you nearer the hole, the golden band starts higher (from 0.55 of the wall at Crater 1 to 0.88 at Crater 12) and is shorter, and you need most of your Recommended Level to reach it. The hazards come in one at a time and then pile up: Crater 2 **boost chevrons** (a burst of speed), 3 **boulders** rolling down the wall in lanes and into the hole (a hit costs you a third of your speed), 4 a **slick band** with less grip, 5 a **sweeper** whose arms turn round over the hole and sweep the foot of the wall, 6 **geysers** low on the wall (ride one up it), and from Crater 9 all of them at once, with more and quicker boulders, wider bands and more sweeper arms.
  - **Not fast enough yet?** You settle lower on the wall and can lap it there for Levels (every stride is a step), train on a dyno, or **SKIP** the crater for 8 Gems (it asks first). In simulation (`SWEEP=1 node tests/funnel.mjs`) a car driven straight in with a well-timed NITRO gets out of the first craters from about half their Recommended speed, of the last ones from about 0.95.
- **NITRO** (Space, Shift, the button, A / RT): 1.4 seconds at x1.28 top speed, back after 4.5 seconds. Lit as you come up to the far side, it is what gets you onto the launch chevrons of a crater you can almost cross.
- **How it drives.** The car is a point on the ground with a heading: the engine pushes along it, the tyres stop it sliding sideways, and all they can give is their grip times how hard the car is pressed into the ground (so a fast lap round a wall holds, a slow one slides down). Its body leans with the cornering force it is really under, sits down on its springs when a wall's curve presses it in, lifts its nose when it pulls away and dips it under braking, and bounces after a landing; the front wheels turn with the steering, the back ones throw dust when they slide, and the camera banks a little with the wall you are on.
- **Dynos.** Nine at Base Camp. Drive onto one and your wheels spin by themselves (3 steps a second, 5.5 while you hold NITRO), every step counting the "+N / STEP" on the dyno's sign (times your boosts; a smaller multiplier in XP, so a dyno is the steady way up and not a shortcut past the Levels). They open with the **Wins you've earned in all**: Rookie Rollers +1, Street +2 (10 Wins), Sport +3 (60), Rally +5 (300), Turbo +8 (1,500), Pro +12 (25,000), Hyper +20 (1,000,000); Quantum +35 (120 Gems) and Supernova +60 (400 Gems). The **Train** tile takes you to your best open one.
- **Cars.** Twelve, each its own shape, and each multiplying every step: Scrap Kart x1, Pebble Buggy x2 (12 Wins), Dune Hopper x4, Rally Rascal x8, Boulder Brute x15, Volt Viper x30, Magma Mauler x60, Frost Fang x120, Comet Crawler x250, Nova Glider x600 (18M Wins); Crystal Shard x45 (150 Gems) and Rim Titan x400 (600 Gems).
- **Tuning.** Seven upgrades for Wins: Turbo Intake (Speed a step), Engine Tune (top speed), Data Logger (XP a step), Nitro Tank (NITRO lasts longer), Gear Ratio (a Level's worth of top speed each), Lucky Dice (Wins from every crater), Pit Crew (one more pet on your team).
- **Pets, trails, underglows.** Eight Eggs (Pebble 5 Wins to Supernova 3.5M) hatch forty pets that ride along and multiply your Speed; eight trails for Wins and five underglows for Gems do too.
- **Rebirth** at Level 10 (then 15, 20, 25, 30): back to Level 1 with a permanent +50% Speed and XP each time, and every crater pays triple again.
- **Worlds.** Escape all twelve craters to open the next: **Greenhorn Craters**, **Ember Calderas** (2 rebirths), **Frostbite Basins** (5), **Lunar Maria** (9), each under its own sky and paying far more.
- **RACE: Eruption.** Press RACE and everyone who presses at about the same time goes into the same race (the queue shows "N / 6 found"; a late press takes a bot's place on the line until the gun). Six buggies start on the floor of one volcano. Everyone's engine is the same and grows stronger every second, so the whole field climbs the wall together: the race is the line you hold, the chevrons you take and the boulders you dodge. The lava wakes a few seconds after the gun and rises faster and faster: whoever it reaches is out. First over the rim wins. Four maps by Level (more chevrons, boulders from Level 6, a slick band from Level 12). Prizes are Wins, Gems and Speed by place. Bots only fill empty places and take over for anyone who leaves.
- **Squad boost.** Every other real player in your server adds +10% Speed a step for everyone, up to +50%.
- **Things to come back for:** 38 quests in a chain (with a guide arrow to the next one), daily tasks, a seven-day daily reward, seven free playtime gifts (2 to 45 minutes), a lucky wheel every 7 minutes, codes (`CRATER`, `RIMSHOT`, `NITRO`, `BLOXITY`, `LEGION`, `ERUPTION`, `ESCAPE`), leaderboards at Base Camp.

**A typical first session** (`node tests/economy.mjs 40`: 25 simulated sessions on the real formulas and craters; medians):

| When | What |
|---|---|
| 0:12 | Crater 1 escaped |
| 0:27 | Crater 3 escaped; the Street Dyno opens |
| 0:48 | The Pebble Buggy (x2) |
| 1:07 | Crater 5 escaped; Level 10 |
| 2:14 | Crater 8 escaped; the Dune Hopper (x4); Level 15 |
| 3:50 | First race |
| 3:54 | Rebirth 1 |
| 7:13 | Crater 10 escaped |
| 8:12 | Rebirth 2 |
| 9:30 (1:32 to 18:48) | First time down a hole |
| 12:03 | Rebirth 3; the Rally Rascal (x8) |
| 16:58 | Rebirth 4 |
| 21:30 | Crater 12 escaped |
| 21:36 | **Ember Calderas opens** |
| 23:28 | The Volt Viper (x30); the Pro Dyno |
| 25:39 | Level 30; Rebirth 5 |
| 28:55 | **Frostbite Basins opens** |
| 30:55 | The Comet Crawler (x250) |
| 36:07 | The Nova Glider (x600) |

The first eight craters go by in a little over two minutes; the last four of the world take until minute 21 (they want nearly their Recommended Level, and a lap or two among the boulders). A typical 40-minute session is in Frostbite Basins with 6 or 7 rebirths; Lunar Maria (9 rebirths) and the two Gem cars are still ahead. The simulation is not a person: it tells when things come, not how they feel. What gets a car out of each crater in it is measured (`SWEEP=1 node tests/funnel.mjs`): half the Recommended speed at the first craters, 0.95 at the last.

## Controls

| | Keyboard | Touch | Controller |
|---|---|---|---|
| Drive | W / S or the arrows; A / D steer | The stick (left thumb) | Left stick |
| NITRO | Space, Shift, F or Enter | The NITRO button | A, X, RT or LT |
| Look round | Drag with the mouse; wheel zooms | Drag the world; pinch zooms | Right stick; R3 zooms |
| Use a stall | E | Its button | Y |
| Back to Base Camp | R | Teleport | L3 |
| RACE | P | RACE | LB |
| Menus | V Cars, U Tuning, J Pets, T Teleport, G Shop, Q Quests, C Wheel, M sound | Their tiles | D-pad moves a ring over the HUD, A presses, B backs out, LB / RB change tabs, START settings |

Held upright, a phone gets the portrait HUD (sized from the screen's width), a wider camera and the stick and NITRO clear of every button. The top left corner is left free for the Bloxity overlay on every screen.

## Sound

Everything is synthesised in the page (no audio files). The engine and the tyres' squeal are two loops whose pitch and level follow the car. The two songs ("Rim Runner" at Base Camp and in the craters, "Lava Rising" in a race) are rendered once into loops with an OfflineAudioContext in idle moments, then just played. The effects bank is built in a Web Worker while the world loads.

## Graphics and performance

- **The Legion lighting rig**: hemisphere 1.1, ambient 0.45, sun 1.5, PCF shadows, no tone mapping. **Only matte (Lambert) and unlit materials**: no reflections, no environment map, no PMREM, no bloom or post-processing. Each world has a mood that only tints that rig and sets the sky.
- **The world is analytic.** The ground's height, slope and curvature anywhere come from one function (`surf` in `shared/world.js`), so the car's physics, the server's guard, the bots, the camera's ground check and the geometry all agree, and there is no collision mesh to walk.
- **Draw calls.** Static geometry is vertex-coloured and merged per island into one **BatchedMesh** per material; each island is culled on its own (by the camera, by the sun's shadow view, beyond the fog), and the draw list changes only when an island comes into view or leaves it. Wheels, boulders, sweeper bars, geysers and chevrons are instanced. All the lettering in the world is one atlas. Every car body shares one material.
- **Distance LOD.** Each island is two kits: its shell (rock, funnel and hole, crescents, kerb, bridge, gate), and its small things (fences, lamp posts, trees, cones, sign posts), which are drawn only within 300 studs (200 on Low) and never in the shadow pass. Boulders, sweepers and geysers are only shown for the craters near the camera. Other players' cars are simplified beyond 110 studs and not drawn beyond 340 (220 on Low). On Low a bowl has fewer segments and half the props.
- **Shadows**: the sun's shadow map covers 180 studs round the car (2048 texels on High, 1024 on Medium, none on Low). The funnels' walls and a volcano's bowl take shadows but throw none: a box that size can't hold a 400-stud crater, and a rim's shadow would come and go with the car. The normal offset is a texel and a half, so walls lit at a slant don't shade themselves in stripes.
- **Typical views** (`tests/tris.mjs`, 1280x720, the shadow pass included on Medium and High):

  | Quality | Base Camp, at the spawn | Crater 1, from its landing | Crater 6 | Crater 12 (the biggest) | Low on its wall, by the hole |
  |---|---|---|---|---|---|
  | Low | 30 draws, 35K triangles | 18 draws, 36K | 17 draws, 30K | 17 draws, 15K | 17 draws, 15K |
  | Medium | 36 draws, 81K triangles | 18 draws, 64K | 17 draws, 58K | 17 draws, 32K | 17 draws, 30K |
  | High | 36 draws, 81K triangles | 24 draws, 84K | 23 draws, 78K | 23 draws, 44K | 23 draws, 39K |

  The busiest view is the first crater from its near crescent: the first few islands are small and close together, so several are inside the camera's view and the fog at once (each island is culled on its own). The biggest crater is the cheapest.

- **Weak devices start on Low**: phones, and PCs with 4 cores or fewer, 4 GB or less, older Intel HD/UHD 6xx, small Radeons or software renderers (the GPU's name is read once). Low means no shadow code at all, no multisampling on PCs (decided before the WebGL context exists), fewer props, the simpler sky and sea, fewer word pops and no speed lines. Below about 54 FPS the resolution steps down first; only below 45 does the quality drop.
- **The frame loop** reads no layout or style. HUD text is written only when its value changes; bars move with transforms. Every "+1" goes on one instanced glyph sheet. No emoji is drawn for the first time in play (each is painted once behind the loading screen).
- **Loading**: every shader (batched, instanced and shadow variants, every car shape, the race's volcano and lava, effects, the avatar) is compiled and drawn once behind the loading screen, and every HUD screen and panel is painted once. `tests/warm.mjs` then does everything a player can do and lists any shader compiled in play.
- **Far from the server** (300 to 400 ms round trip): your own car moves on your device at once; other players are drawn on the server's clock (snapshots stamped with server time, a buffer, the clock corrected for the round trip); the server decides steps, Levels, gates, escapes, prizes and the race, and refuses impossible moves.

- **What the profile found.** The first CPU profile showed Three.js looking shader programs up every frame (`getProgram`, `getParameters`, about 4% of the frame's CPU). `tests/matprobe.mjs` traced it to the geysers' and portals' see-through two-sided materials, which Three.js draws back face then front face with a program lookup each; they are drawn in one pass now. Compiled programs are also kept across races and worlds (their materials used to be disposed and recompiled behind the fade), and the avatar's shaders are warmed with stand-ins, so a slow avatar server no longer means a compile in play (`tests/warmslow.mjs`).
- **The CPU profile** (`tests/perf.mjs profile`: unminified dev build, weak laptop, Low, CPU 4x, lapping a funnel's wall): self time 25.2% `(program)` (the browser's and the graphics driver's own work), 17.8% idle, 3.6% Three.js `setProgram`; no function of the game's own over 1.2%. Layout and style reads in the frame loop: 0.00%. Audio-node calls: 0.20%. A frame's work: about 1.2 ms update, 0.1 ms camera and sky, 2.9 ms render.
- **Measured** on this PC on 13 November 2026: Intel UHD Graphics on ANGLE D3D11 (forced with `LOW_GPU=1`), Chrome, headless, a 144 Hz display, the automatic resolution step-down switched off. Frames drawn per second, with the 95th percentile frame interval in brackets. *Paced* means the game was drawing every other refresh of the fast screen (by design on a 120 Hz+ screen when frames are uneven).

  | Device | Lapping a funnel (Crater 8, four Levels short) | Revving on a dyno | On a rim's crescent | Lapping the biggest funnel | At the spawn | In a race | Load + join (dev build) |
  |---|---|---|---|---|---|---|---|
  | Desktop, 1920x1080, High | 112 (14 ms) | 123 (14 ms) | 142 (7.1 ms) | 106 (20.7 ms) | 72 paced (7.1 ms) | 72 paced (7.1 ms) | 5.5 s |
  | Desktop, 1600x900, Medium | 138 (7.2 ms) | 137 (7.2 ms) | 144 (7.1 ms) | 128 (13.9 ms) | 144 (7.1 ms) | 144 (7.1 ms) | 8.9 s |
  | **Weak laptop**: CPU throttled 4x, 1366x768, Low | 124 (13.9 ms) | 136 (7.6 ms) | 144 (7.1 ms) | 143 (7.1 ms) | 143 (7.1 ms) | 142 (7.1 ms) | 7.5 s |
  | **Phone**: 844x390 @2x, touch, Low, CPU 4x | 69 paced (7.4 ms) | 70 paced (7.1 ms) | 71 paced (7.1 ms) | 72 paced (7.1 ms) | 71 paced (7.1 ms) | 72 paced (7.1 ms) | 7.0 s |
  | **Phone**: 390x844 @2x, touch, Low, CPU 4x | 66 paced (13.8 ms) | 70 paced (7.1 ms) | 72 paced (7.1 ms) | 68 paced (7.3 ms) | 72 paced (7.1 ms) | 72 paced (7.1 ms) | 7.1 s |

  Frames over 50 ms in these windows: none on the desktops and the weak laptop; one on each simulated phone (a 69 ms frame while lapping on the landscape one, a 56 ms frame in the biggest crater on the portrait one). **Caveats:** numbers move between runs and with what else the PC is doing: the High row was measured twice on 14 November, first at 66 to 74 FPS paced, then as here; on 13 November two earlier runs read far lower on some rows while something else was using the graphics chip, and read normally when repeated. In these views the autopilot keeps lapping inside the funnel. The phones here are simulated (a desktop chip and a 4x-throttled CPU): the game has not been measured on a real phone or on the Legion servers.

## Testing

Test tools install on their own: `npm --prefix tests install`. Browser runs need Chrome (`CHROME=<path>` chooses which). They use their own server port (3097; `TEST_PORT` and `VITE_PORT` move them), so a game running on 3087 can stay up. Run browser suites one at a time.

- **`tests/server.test.mjs`, a headless server test** of the whole loop and its guards: a new player's start, ping and the clock, the bots (up the bridges, straight in and round the funnels, never faster than their Level, never under the ground); steps (+1 Speed and XP, no more steps than strides, a batch's limit); dynos (only open ones, only standing on them); the move guard (faster than your Level drives, too far, under the ground, off the edge of the world, and round a rim where there is no deck); the far crescent reached by a jump pays nothing and its gate stays shut; escapes (straight along the road off the rim, round the wall and out onto the far crescent; not for a Level too low for that crater; x3 the first time; the 30 s rest); SKIP; cars, tuning, eggs, trails, rebirths, worlds; the wheel, tasks, quests, the daily reward, gifts, codes; Eruption (one queue for presses close together, a late press taking a bot's place, nobody off before the gun, finishing only over the rim, the lava, places, prizes, a leaver's place taken by a bot); nonsense messages; saves.
- **`tests/economy.mjs`, a simulated first session**, for the pacing table above.
- **`tests/autopilot.mjs`, browser runs with the autopilot:** the HUD's words and the free Bloxity corner; the whole loop from a new player's start (steps, up the bridge, straight off the rim, round Crater 1's wall and out at its far side for Wins, its gate, Craters 2 and 3; down a hole and back at Base Camp; the Train tile onto a dyno); full races on all four maps; two craters in each other world; the last crater at Level 30 and the summit's portal; no move sent back, no console errors.
- **`tests/prod.mjs`, the production build with real input only** (no QA hooks), driven as a first-time player would: W held up the bridge and straight off the rim, Space now and then: round Crater 1's wall and out at its far side, with no steering at all; SKIP and the Gem buttons asking first, typed codes, a car bought, tuning, every menu button and its panel, the wheel, the Train tile and a dyno, the queue and a whole race; `loadingEnd()` called once, after joining a server, with a stand-in for the SDK; then the same on a portrait phone and a landscape phone with touch only (the stick held up, NITRO with a thumb still on the stick, panels fitting the screen).
- **`tests/latency.mjs`, a 350 ms round trip** through a relay, two real browser players: Speed never jumping back and no step lost, an escape on your screen paid on the server, a bot in view smooth on the server's clock, two RACE presses in one race, each seeing the other.
- **`tests/reconnect.mjs`**, a dropped connection at Base Camp and in a race, short and long. **`tests/gamepad.mjs`**, a session with a controller alone. **`tests/screens.mjs`**, screenshots of every screen at 390x844, 360x800, 375x667, 412x915, 844x390, 667x375, 932x430, 768x1024, 800x600, 1024x600, 1280x720, 1366x768 and 1920x1080, with the HUD's boxes and touch controls measured for overlaps, anything cut off and the Bloxity corner. **`tests/perf.mjs`** (frame rates; `profile` for a CPU profile of the dev build), **`tests/warm.mjs`** (any shader compiled after loading), **`tests/warmslow.mjs`** (the same with the avatar server 14 s late), **`tests/matprobe.mjs`** (any material that costs a program lookup every frame), **`tests/tris.mjs`** (where the triangles go), **`tests/probe.mjs`** (the autopilot in one crater, printed).
- **`tests/funnel.mjs`, can every crater be crossed?** Headless, on the shared physics, at every crater: a car driven straight up the bridge, across the landing and off the lip, the gas held and nobody steering (and once each with the wheel held left and right as it goes over: it must carve that way), at 0.3 to 1.06 times the crater's Recommended speed (NITRO as it comes up to the far side). At 1.0 and 1.06 it must get out, rolling off the bridge and from a standstill at the checkpoint; at 0.7 to 0.9 it must not go down the hole. `SWEEP=1` prints the least speed that gets out of each crater. **`tests/racesim.mjs`, is a race fair?** A car that only holds the gas must be out over the rim before the clock at every Level, and must still beat the lava after one boulder's knock at any moment of the race.
- **`tests/zfight.mjs`, flicker:** twelve views (Base Camp, a bridge, a landing, over a funnel, on its wall, the exit, the big craters, the summit) are each drawn six times with only the depth range nudged by a hair, and every pixel that changes is marked in red: two surfaces in the same place. **`tests/shadowlook.mjs`**: shots inside the big craters and a race's volcano at High, to see any shadow patch that moves with the car.

- **The last full run** (14 November 2026, on the final build: the funnels centred on the road, the drop-in at the lip, the visual fixes):

  - `server.test.mjs`: 91 passed, 0 failed. `funnel.mjs` (every crater straight in, from a standstill, and steered left and right) and `racesim.mjs`: all good.
  - `autopilot.mjs`: all good (41 checks): Crater 1 ten seconds after spawning, Craters 2 and 3 by 26 s, a fall down a hole, full races on all four maps, two craters in each other world, the last crater and the summit; no move sent back, no console errors. Separately, in the real game the autopilot crossed Crater 12 at exactly its Recommended Level 30 in 20 s.
  - `prod.mjs`: all good with real input only and no steering: W held (and Space now and then) from the spawn, out of Crater 1 nine seconds later on the keyboard and on both phones; `loadingEnd()` called once, after joining. (Its first run failed one check on the portrait phone, a panel's X tapped at the moment the game opened a pop-up by itself; the check now allows for that, and passed.)
  - `screens.mjs`: every screen clean at all 13 sizes. `warm.mjs`: nothing compiled in play on Low, Medium or High.
  - `zfight.mjs`: 0.01 to 0.1% of the pixels change in every view (scattered sparkles and edges; before the fixes, 4.9% at the spawn).
  - `gamepad.mjs`, `reconnect.mjs` and `latency.mjs` (355 ms round trip): all good.
- **Found after the playtests and fixed ("the textures come out in broken pieces"):** a strip of Base Camp's road lay on top of the turf just behind the spawn (4.9% of the screen flickered there; 0.05% after), and the bridges began 0.4 studs inside the road before them, as did the summit's approach; the sun's shadow box (180 studs) is smaller than the big craters (up to 400), so the rim's shadow came and went in a square patch round the car (the funnels' walls now take shadows but throw none); the shadow's normal offset was under half a shadow texel (acne stripes on walls lit at a slant; now a texel and a half); faces in alternating tones (a pinwheel on the summit, stripes on the islands' rock, the decks, the kerbs and a slick band) read as broken pieces (now even, the rock in gentle random tones); and the sea, 150 studs down, cut through the deepest crater's hole and its island's rock (now 380 down).
- **Found by the tests and fixed:** players sent back to Base Camp inside the two deepest craters (a fall check at a fixed height); a half-typed code wiped when the Shop panel redrew; one boulder hit in a race meaning certain death once the lava was up (the lava now starts slower and a knock costs a quarter of your speed; in simulation one mistake is survivable at every Level); the per-frame shader lookups and the recompiles above; and, after the craters became funnels, an escape not credited to a car much faster than a small crater needs (it rides pressed against the rim's kerb, which did not count as inside the funnel).
- **Not tested yet:** a real phone, a real controller in a person's hands, the Legion servers, the real Bloxity SDK (a stand-in here), and a person playing it. The pacing comes from the simulation and the autopilot. The songs and sounds were checked by measurement (they render, levels and no NaNs), not by ear.
- **Known limits:** boulders, the sweeper, geysers, boost chevrons, the launch chevrons and the fall into a hole are judged on the player's screen, not the server (in a race the server judges the lava and the finish, and drives the bots); refusing moves over them would pull honest players back at a 350 ms round trip. Steps, top speed, the ground's height, where there is deck and where there is none, gates, escapes, SKIP and the race's lava and places are all the server's. The server pays an escape to anyone whose speed with NITRO and a chevron could hold that crater's rim and who was seen inside the funnel before the far crescent: a wide allowance, so a player some Levels under a crater's Recommended Level can cross it with good driving, by design.

## Hosting

**Not hosted yet, and the folder is not a git repository** (by instruction: nothing is initialised, pushed or hosted until asked). When it is: the repository is `LEGiON-Platforms/crater-escape` with the `LEGION_DEPLOY_TOKEN` secret, pushed as `asivixlp44-cmyk`; every push to `main` runs `.github/workflows/deploy.yml`, which builds the server image (`ghcr.io/<owner>/crater-escape-server`), rolls it out on Legion and uploads the client to https://crater-escape.play.bloxity.io. The app `crater-escape` must exist on hosting.bloxity.io first. `node tests/live-smoke.mjs` then opens the hosted game and reports.

`bloxity-setup.html` has every field of Bloxity's Create New Game form with copy buttons and the two covers (`node tests/setup-page.mjs` writes it). Play stats: `GET /api/stats?key=<stats key>&days=7` on the game's host once hosted (the key is in `server/STATS_KEY.local.txt`, git-ignored; only its SHA-256 is in the code).
