import { schema, t } from '@colyseus/schema';

// Public, synced to every client: the server's clock and everyone in the worlds and races (players and the bots). Private progress (Wins, Gems, quests...) goes only to its owner in "profile".
// Positions carry a server-time stamp (t): other clients smooth them on that timeline.
export const PlayerState = schema({
    name: t.string().default(''),
    pid: t.uint8().default(0),
    bot: t.boolean().default(false),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    ry: t.float32().default(0),
    t: t.float64().default(0),       // when they were there (server ms)
    anim: t.uint8().default(0),      // 0 parked, 1 driving, 2 in the air, 3 on a dyno
    post: t.uint8().default(255),    // the dyno they're on (255: none)
    spd: t.float32().default(0),     // how fast they're going (studs a second): their wheels keep pace
    car: t.uint8().default(0),       // which car (config CARS)
    team: t.string().default(''),    // their pets, by id
    title: t.string().default(''),
    lv: t.uint16().default(1),
    wins: t.float64().default(0),    // Wins collected
    world: t.uint8().default(0),
    match: t.uint16().default(0),    // the race they're in (0: none)
    trail: t.uint8().default(0),
    aura: t.uint8().default(0),
    av: t.string().default(''),      // packed Bloxity avatar (equipped ids + proportions)
}, 'PlayerState');

export const GameState = schema({
    now: t.float64().default(0),     // the server's clock, every patch
    players: t.map(PlayerState),
}, 'GameState');
