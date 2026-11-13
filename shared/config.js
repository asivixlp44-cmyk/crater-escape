// Crater Escape: the game's data and formulas, shared by the client and the server.
// The loop: you drive a buggy. Every stride you drive is +1 Speed and +1 XP, times all your boosts. XP fills your Level, and your
// Level is your buggy's top speed. The course is a chain of sky islands, each with a crater (a funnel with a hole in its middle): you drive laps round its
// bowl, and the faster you go the higher up its wall your tyres hold. Fast enough (its Recommended Level) and you ride right over
// the rim: ESCAPED, Wins. The next crater is bigger and steeper. Wins buy cars, tuning, exhaust trails and Eggs for pets, and the
// Wins you've earned all told open the faster dyno rollers at Base Camp (+N a step). Rebirth at Level 10 (then 15, 20, 25) for a
// permanent multiplier; escaping the last crater of a world opens the next.
// And RACE: Eruption, six buggies in one volcano, the lava rising: first over the rim wins.
// Everything is bought with Wins or Gems, all earned in the game. There are no in-app purchases.
export const lookup = (o) => Object.assign(Object.create(null), o);

export const CFG = {
    maxPlayers: 16,
    // driving: top speed at Level 1 (studs a second), what a Level adds, the fastest a Level ever makes you (tuning goes past it)
    walk: 24, vPer: 2.4, vMax: 112,
    // gravity (studs/s2), how well tyres grip (1: they hold a 45 degree slope standing still), the engine's push and the brakes
    grav: 80, mu: 1, accel: 40, brake: 70, coast: 9,
    // steps the server counts: this many a second, a couple of seconds' worth saved for a hiccup in the network
    stepRate: 14, stepBurst: 26,
    // on the ground a step is a stride (longer the faster you go, so a step takes at least 1/4 s: about 4 steps a second, the
    // pace the Level curve is made for)
    stride: 5.2, strideHz: 4,
    // a dyno: steps a second by itself, and flat out (holding NITRO)
    treadRate: 3, treadSprint: 5.5,
    // a crater pays again after this long
    padCool: 30,
    // NITRO: how much faster, how long, how long before the next
    dashK: 1.28, dashSecs: 1.4, dashCool: 4.5,
    // the server keeps this many bots about when it's quiet (one leaves per player who joins)
    bots: 3,
    boostP2Gems: 25, boostP2Mins: 15, boostW2Gems: 40, boostW2Mins: 10,
    spinMins: 7, spinMax: 3,
    // Eruption: places, how long the queue stays open, how long the start line waits
    matchSpots: 6, matchQueue: 9, matchFull: 3, matchReady: 6,
    // SKIP: the crater you're in, for Gems (you land at the next island's gate; the skipped crater pays nothing)
    skipGems: 8,
    // the squad boost: every other real player in your server adds this much Speed a step, up to sqMax
    sqEach: 0.1, sqMax: 0.5,
};

export const RARITIES = lookup({
    common: { name: 'Common', color: '#c8d0dc' }, uncommon: { name: 'Uncommon', color: '#7dff6b' }, rare: { name: 'Rare', color: '#3ab4ff' }, epic: { name: 'Epic', color: '#b45aff' },
    legendary: { name: 'Legendary', color: '#ffc42a' }, mythic: { name: 'Mythic', color: '#ff4a8a' },
});

// ----- a step: +1 Speed and +1 XP, times all your boosts -----
export const STEP = 1;
export const EVENT = 1;
export const upLevel = (p, id) => (p && p.ups && p.ups[id]) || 0;
export const rebirthMult = (r) => 1 + 0.5 * (r || 0);
// ----- Level: XP fills it (no cap; XP carries over). Your Level is your top speed -----
// the XP a Level wants: 20 at Level 1, then 15% more each Level (23, 26, 30 ... 70 at Level 10); past Level 10 another 4% a Level
// on top (421 at Level 20), past Level 20 another 5% again (the climb to the end of a world takes a dyno, a better car and a
// rebirth or two)
export const xpNeed = (lv) => { const L = Math.max(1, Math.min(400, lv | 0)) - 1; return Math.max(1, Math.round(20 * Math.pow(1.15, L) * Math.pow(1.04, Math.max(0, L - 9)) * Math.pow(1.05, Math.max(0, L - 19)))); };
// what every Level adds to the XP of a step (a hundredth each)
export const levelK = (lv) => 1 + 0.01 * (Math.max(1, lv | 0) - 1);

// ----- the cars: bought with Wins (two with Gems), kept for good. mult: Speed a step; xp: XP a step; the rest is how it looks
// (client/src/cars.js builds every one from these numbers). kind: 0 kart, 1 buggy, 2 rally, 3 truck, 4 racer, 5 hover -----
const CAR = (id, name, rarity, wins, gems, mult, xp, kind, c1, c2, c3, o) => ({ id, name, rarity, wins, gems, mult, xp, kind, c1, c2, c3, ...(o || {}) });
export const CARS = [
    CAR('scrap', 'Scrap Kart', 'common', 0, 0, 1, 1, 0, 0xff8a2a, 0x2a3a5a, 0xd8dce4),
    CAR('pebble', 'Pebble Buggy', 'common', 12, 0, 2, 1.05, 1, 0x46c84a, 0xfff07a, 0x30343c),
    CAR('dune', 'Dune Hopper', 'uncommon', 70, 0, 4, 1.1, 1, 0xffc82a, 0x1e4ab8, 0x2a2e36, { wing: 1 }),
    CAR('rally', 'Rally Rascal', 'uncommon', 380, 0, 8, 1.15, 2, 0x2a9aff, 0xffffff, 0x20242c, { wing: 1 }),
    CAR('brute', 'Boulder Brute', 'rare', 2000, 0, 15, 1.2, 3, 0xe8483a, 0xffd23a, 0x30343c, { scoop: 1 }),
    CAR('viper', 'Volt Viper', 'rare', 11000, 0, 30, 1.26, 4, 0xb45aff, 0x7af4ff, 0x1c1e28, { wing: 2 }),
    CAR('magma', 'Magma Mauler', 'epic', 65000, 0, 60, 1.32, 3, 0x3a2a2a, 0xff6a1a, 0x18181c, { scoop: 1, glow: 0xff7a1a }),
    CAR('frost', 'Frost Fang', 'epic', 400000, 0, 120, 1.4, 4, 0xdff4ff, 0x3ab4ff, 0x2a3a5a, { wing: 2, glow: 0x7ae8ff }),
    CAR('comet', 'Comet Crawler', 'legendary', 2500000, 0, 250, 1.5, 2, 0x1e2a6a, 0xffd23a, 0x10142a, { wing: 2, glow: 0xffe24a }),
    CAR('nova', 'Nova Glider', 'legendary', 18000000, 0, 600, 1.6, 5, 0xfff4ff, 0xff5ac0, 0x3a2a5a, { glow: 0xff7ae0 }),
    CAR('shard', 'Crystal Shard', 'epic', 0, 150, 45, 1.3, 4, 0x3affc8, 0xffffff, 0x1a3a3a, { wing: 1, glow: 0x7afff0 }),
    CAR('titan', 'Rim Titan', 'mythic', 0, 600, 400, 1.55, 3, 0xffc23a, 0x1a1a22, 0x2a2a32, { scoop: 1, wing: 2, glow: 0xffe24a, rainbow: 1 }),
];
export const carById = lookup(Object.fromEntries(CARS.map((c) => [c.id, c])));
export const carOf = (i) => CARS[i | 0] || CARS[0];
export const carOwned = (p, i) => i === 0 || !!(p.cars && p.cars[carOf(i).id]);

// XP a step (before a dyno's multiplier): rebirths, your car, Data Logger (+10% each), your Level
export const xpGain = (p) => STEP * EVENT * rebirthMult(p.rebirths) * carOf(p.car).xp * (1 + 0.1 * upLevel(p, 'scholar')) * levelK(p.lv);
// your top speed (studs/s): +2.4 a Level (Gear Ratio adds Levels' worth, up to the cap), Engine Tune +2% each on top
export const maxWalk = (p) => Math.min(CFG.vMax, CFG.walk + CFG.vPer * (Math.max(1, (p && p.lv) | 0) - 1 + upLevel(p, 'reach'))) * (1 + 0.02 * upLevel(p, 'feet'));
// (no Level cap: a big number for anything that still asks)
export const lvCap = () => 999;
// rebirth: Level 10 the first time, 5 more each time after, never more than Level 30; how far you are (0..100). It costs nothing
export const rebirthLv = (r) => Math.min(30, 10 + 5 * (r || 0));
export const rebirthPct = (p) => Math.min(100, Math.floor(((p.lv | 0) || 1) / rebirthLv(p.rebirths) * 100));
export const rebirthCost = () => 0;
// Tuning, for Wins (kept when you rebirth). feet: +2% top speed each (goes past the cap); reach: a Level's worth of top speed each
// (+2.4, up to the cap: the early craters' friend); scholar: +10% XP a step; spring: NITRO lasts longer
export const UPGRADES = [
    { id: 'soles', name: 'Turbo Intake', icon: '🌀', text: 'More Speed from every step', base: 6, grow: 2.3, max: 18, stat: (n) => '+' + n * 15 + '% Speed a step' },
    { id: 'feet', name: 'Engine Tune', icon: '🔧', text: 'A higher top speed', base: 40, grow: 3.4, max: 10, stat: (n) => '+' + n * 2 + '% top speed' },
    { id: 'scholar', name: 'Data Logger', icon: '📈', text: 'More XP from every step', base: 12, grow: 2.5, max: 10, stat: (n) => '+' + n * 10 + '% XP a step' },
    { id: 'spring', name: 'Nitro Tank', icon: '🚀', text: 'NITRO burns for longer', base: 18, grow: 2.6, max: 6, stat: (n) => '+' + n * 10 + '% NITRO time' },
    { id: 'reach', name: 'Gear Ratio', icon: '⚙️', text: 'A Level\'s worth of top speed each', base: 50, grow: 3.5, max: 6, stat: (n) => '+' + (Math.round(n * CFG.vPer * 10) / 10) + ' top speed' },
    { id: 'luck', name: 'Lucky Dice', icon: '🎲', text: 'More Wins from every crater', base: 25, grow: 2.6, max: 12, stat: (n) => '+' + n * 10 + '% Wins' },
    { id: 'den', name: 'Pit Crew', icon: '🐾', text: 'Room for one more pet on your team', base: 120, grow: 8, max: 3, stat: (n) => (3 + n) + ' on your team' },
];
export const upgradeById = lookup(Object.fromEntries(UPGRADES.map((u) => [u.id, u])));
export const upgradeCost = (u, n) => Math.round(u.base * Math.pow(u.grow, n));
export const nitroSecs = (p) => CFG.dashSecs * (1 + 0.1 * upLevel(p, 'spring'));
export const teamMax = (p) => 3 + upLevel(p, 'den');

// ----- exhaust trails and underglow: what your car wears, and what it's worth. Trails for Wins, underglow for Gems. Both more Speed -----
export const TRAILS = [
    { id: 'none', name: 'No Trail', rarity: 'common', wins: 0, gems: 0, c1: 0xffffff, mult: 1 },
    { id: 'dust', name: 'Dust Cloud', rarity: 'common', wins: 15, gems: 0, c1: 0xe8d8b8, mult: 1.1 },
    { id: 'ion', name: 'Spark Stream', rarity: 'uncommon', wins: 90, gems: 0, c1: 0x7dff6b, mult: 1.25 },
    { id: 'comet', name: 'Heat Wave', rarity: 'uncommon', wins: 450, gems: 0, c1: 0xffa84a, mult: 1.5 },
    { id: 'solar', name: 'Gold Rush', rarity: 'rare', wins: 2500, gems: 0, c1: 0xffd23a, mult: 2 },
    { id: 'plasma', name: 'Aqua Jet', rarity: 'epic', wins: 15000, gems: 0, c1: 0x3affc8, mult: 3 },
    { id: 'nebula', name: 'Nebula Smoke', rarity: 'epic', wins: 1e5, gems: 0, c1: 0xb48aff, mult: 5 },
    { id: 'nova', name: 'Solar Flare', rarity: 'legendary', wins: 8e5, gems: 0, c1: 0xff5a2a, mult: 9 },
    { id: 'rainbow', name: 'Prism Burst', rarity: 'mythic', wins: 1e7, gems: 0, c1: 0xffffff, rainbow: 1, mult: 16 },
];
export const trailById = lookup(Object.fromEntries(TRAILS.map((s) => [s.id, s])));
export const AURAS = [
    { id: 'none', name: 'No Underglow', rarity: 'common', wins: 0, gems: 0, c1: 0xffffff, mult: 1 },
    { id: 'ice', name: 'Mint Glow', rarity: 'uncommon', wins: 0, gems: 20, c1: 0x7dffb0, mult: 1.25 },
    { id: 'corona', name: 'Ember Glow', rarity: 'rare', wins: 0, gems: 60, c1: 0xffa83a, mult: 1.6 },
    { id: 'aurora', name: 'Aurora Glow', rarity: 'epic', wins: 0, gems: 150, c1: 0x3ae8d0, mult: 2.2 },
    { id: 'pulsar', name: 'Pulsar Glow', rarity: 'legendary', wins: 0, gems: 350, c1: 0xc47aff, mult: 3.2 },
    { id: 'rainbow', name: 'Hyperdrive Glow', rarity: 'mythic', wins: 0, gems: 800, c1: 0xffffff, rainbow: 1, mult: 5 },
];
export const auraById = lookup(Object.fromEntries(AURAS.map((s) => [s.id, s])));

// ----- the dyno rollers at Base Camp. Park on one and your wheels spin by themselves: every step counts +N (its sign: "+2 / STEP"
// is twice a plain step, times all your boosts): mult for Speed, xp for XP (less: a dyno is the steady way up, not a shortcut past
// the Levels). need: the Wins you've earned all told (never spent down) that open it; gems: its price instead -----
export const POSTS = [
    { id: 'moon', name: 'Rookie Rollers', mult: 1, xp: 1, need: 0, gems: 0, c: 0x8a94a8, c2: 0x7dff6b },
    { id: 'mars', name: 'Street Dyno', mult: 2, xp: 1.15, need: 10, gems: 0, c: 0x3a9aff, c2: 0xffd23a },
    { id: 'venus', name: 'Sport Dyno', mult: 3, xp: 1.3, need: 60, gems: 0, c: 0x46c84a, c2: 0xfff2a0 },
    { id: 'jupiter', name: 'Rally Dyno', mult: 5, xp: 1.5, need: 300, gems: 0, c: 0xff8a2a, c2: 0xfff4c0 },
    { id: 'saturn', name: 'Turbo Dyno', mult: 8, xp: 1.7, need: 1500, gems: 0, c: 0xe8483a, c2: 0xffe24a },
    { id: 'neptune', name: 'Pro Dyno', mult: 12, xp: 2, need: 25000, gems: 0, c: 0xb45aff, c2: 0x7af4ff },
    { id: 'pulsar', name: 'Hyper Dyno', mult: 20, xp: 2.3, need: 1000000, gems: 0, c: 0x1e3a9a, c2: 0xffc23a },
    { id: 'nebula', name: 'Quantum Dyno', mult: 35, xp: 2.7, need: 0, gems: 120, c: 0x0e8a7a, c2: 0x7afff0 },
    { id: 'quasar', name: 'Supernova Dyno', mult: 60, xp: 3.1, need: 0, gems: 400, c: 0xff5ac0, c2: 0xfff4a0 },
];
// what a dyno's sign says: "+2 / STEP"
export const postLabel = (c) => '+' + c.mult + ' / STEP';
export const postXp = (i) => (POSTS[i] && POSTS[i].xp) || 1;
export const postOpen = (p, i) => { const c = POSTS[i]; return !!c && (c.gems ? !!(p.posts && p.posts[c.id]) : (p.totalWins || 0) >= c.need); };
// the next dyno your Wins will open (or null)
export const nextPost = (p) => POSTS.find((c) => !c.gems && (p.totalWins || 0) < c.need) || null;

// ----- pets: little critters that ride along behind your car. Out of Eggs (eight of them), five in each -----
// ear: 0 none, 1 pointed, 2 floppy, 3 long; horn 0 none, 1 one, 2 antlers; tail 0..2; spike 0/1; ant: 1 a pair of antennae with
// glowing tips (client/src/pals.js builds them all from one model)
// (the eggs are called JAWBREAKERS in the code: the list every system already knows). c1: the shell, c2: the bands, c3: the glow
const PT = ['common', 'uncommon', 'rare', 'epic', 'legendary'], PM = [0.1, 0.18, 0.3, 0.55, 1], ODDS = [50, 30, 14, 5, 1];
const JB = (id, name, wins, c1, c2, c3, list) => ({ id, name, wins, c1, c2, c3, list });
const pal = (name, c1, c2, ear, horn, tail, spike, ant) => ({ name, c1, c2, ear, horn, tail, spike: spike || 0, ant: ant || 0 });
export const JAWBREAKERS = [
    JB('rookie', 'Pebble Egg', 5, 0xc8ccd8, 0x8a90a0, 0xf4f6ff, [pal('Pit Pup', 0xd8a868, 0xfff4e0, 2, 0, 1), pal('Gravel Bunny', 0xc8ccd8, 0xffb8c8, 3, 0, 0), pal('Rust Kitten', 0xe8843a, 0xfff0d8, 1, 0, 2), pal('Bolt Hamster', 0xf4dca8, 0x8a5a2a, 1, 0, 0), pal('Moss Gecko', 0x6ad84a, 0xfff07a, 0, 0, 2, 1)]),
    JB('lunar', 'Meadow Egg', 40, 0x5ac84a, 0xfff07a, 0xe8ffb0, [pal('Clover Lamb', 0xf4f4e8, 0x8ad84a, 2, 0, 0), pal('Daisy Fox', 0xffb84a, 0xffffff, 1, 0, 2), pal('Burrow Mole', 0x8a6a5a, 0xffc8c8, 0, 0, 1), pal('Thistle Hog', 0xb8946a, 0x7a4a8a, 1, 0, 1, 1), pal('Honey Badger', 0x3a3a44, 0xffd23a, 1, 0, 1)]),
    JB('comet', 'Geyser Egg', 260, 0x2ab8c8, 0xffffff, 0xc8fff8, [pal('Steam Otter', 0x8a6a4a, 0xc8f4ff, 0, 0, 1), pal('Puddle Frog', 0x3ad8a8, 0xfff07a, 0, 0, 0), pal('Mist Monkey', 0x9ab8c8, 0xf4f4ff, 2, 0, 2), pal('Spring Deer', 0xe8c08a, 0x7af4ff, 1, 2, 1), pal('Geyser Unicorn', 0xf4ffff, 0x3ad8d8, 1, 1, 2)]),
    JB('solar', 'Ember Egg', 1700, 0xd8483a, 0xffc23a, 0xfff0d0, [pal('Cinder Pup', 0x4a3a3a, 0xff7a2a, 1, 0, 2), pal('Ash Cat', 0x8a8a90, 0xffb43a, 1, 0, 0), pal('Slag Turtle', 0x5a4a4a, 0xff5a1a, 0, 0, 1, 1), pal('Magma Goat', 0xe8643a, 0x3a2a2a, 2, 2, 0), pal('Caldera Lion', 0xff8a2a, 0x8a2a14, 1, 0, 2)]),
    JB('plasma', 'Crystal Egg', 11000, 0x3affc8, 0xffffff, 0x7afff0, [pal('Quartz Beetle', 0xd8f4ff, 0xff7ae0, 0, 0, 0, 0, 1), pal('Geode Crab', 0x7a4ab8, 0x3affc8, 0, 0, 2, 1, 1), pal('Prism Lizard', 0x3ad8a8, 0xff5ac0, 0, 0, 2, 1), pal('Opal Moth', 0xf4e8ff, 0x7ad8ff, 0, 1, 0, 0, 1), pal('Diamond Drake', 0xa8f4ff, 0xffffff, 1, 1, 2, 1, 1)]),
    JB('nebula', 'Glacier Egg', 75000, 0xbfe8ff, 0x3a8aff, 0xffffff, [pal('Snow Lynx', 0xf4f8ff, 0x3a6ab8, 1, 0, 2), pal('Frost Hare', 0xe8f4ff, 0xffb8d8, 3, 0, 0), pal('Icicle Owl', 0xc8e0ff, 0xfff4c8, 1, 0, 0), pal('Sleet Wolf', 0x9ab0c8, 0xffffff, 1, 0, 2), pal('Glacier Ram', 0xdff4ff, 0x3ab4ff, 2, 2, 0, 1)]),
    JB('quantum', 'Comet Egg', 500000, 0x4a3ad8, 0xffd23a, 0xe8e0ff, [pal('Orbit Fox', 0x7a6aff, 0xffd23a, 1, 0, 2), pal('Meteor Mouse', 0x8a8aa0, 0xff7a2a, 3, 0, 1), pal('Star Stag', 0x2a2a6a, 0x7af4ff, 1, 2, 1), pal('Moon Moth', 0xe8e8ff, 0xb48aff, 0, 1, 0, 0, 1), pal('Comet Wyvern', 0x3ad8ff, 0xffe24a, 3, 2, 2, 1)]),
    JB('galactic', 'Supernova Egg', 3500000, 0xff5ac0, 0xfff4a0, 0xffffff, [pal('Nova Kitten', 0xfff0f8, 0xff5ac0, 1, 0, 2), pal('Pulsar Hound', 0x7a4aff, 0x7afff0, 3, 0, 2), pal('Flare Griffin', 0xffc23a, 0xff5a1a, 1, 0, 1, 1), pal('Quasar Phoenix', 0xff7a1a, 0xffe24a, 1, 1, 2, 1), pal('Crater Dragon', 0x3a2a5a, 0xff5ac0, 3, 2, 2, 1, 1)]),
];
export const PALS = [];
JAWBREAKERS.forEach((J, j) => J.list.forEach((a, i) => {
    const k = Math.pow(2.3, j);
    PALS.push({ ...a, id: J.id + i, jb: j, tier: i, rarity: PT[i], odds: ODDS[i], mult: Math.round((1 + PM[i] * k) * 100) / 100 });
}));
export const palById = lookup(Object.fromEntries(PALS.map((a) => [a.id, a])));
export const palsOf = (j) => PALS.filter((a) => a.jb === j);
// your team's worth: what each pet adds, together
export function teamMult(team) {
    let m = 1;
    for (const id of team || []) { const a = palById[id]; if (a) m += a.mult - 1; }
    return Math.round(m * 100) / 100;
}
// a finished Egg's collection pays this many Gems
export const jbGems = (j) => 5 + j * 5;

// ----- the Speed a step gives (before a dyno's +N): +1, times rebirths, your car, pets, trail, underglow, Turbo Intake, the world,
// x2, and the squad boost (sq: 0..sqMax, from the other players in your server; the server says how much) -----
export function stepGain(p, x2, w, sq) {
    const world = WORLDS[w === undefined ? (p.world || 0) : w] || WORLDS[0];
    return STEP * EVENT * rebirthMult(p.rebirths) * carOf(p.car).mult * teamMult(p.team) * (TRAILS[p.trail | 0] || TRAILS[0]).mult * (AURAS[p.aura | 0] || AURAS[0]).mult * (1 + 0.15 * upLevel(p, 'soles')) * world.pow * (x2 ? 2 : 1) * (1 + Math.max(0, Math.min(CFG.sqMax, sq || 0)));
}
// "All Your Boosts: x5 Speed": everything that multiplies a step's Speed together
export const allBoosts = (p, x2, w, sq) => stepGain(p, x2, w, sq) / STEP;
// the squad boost for this many other real players in the server
export const squadOf = (others) => Math.min(CFG.sqMax, Math.max(0, others | 0) * CFG.sqEach);
// ----- Speed packs for Gems (the +SPEED buttons): sp is in reward units (100: a whole Level's XP at your Level; it comes with as
// much XP), so a pack is always worth the same few Levels -----
export const SPEED_PACKS = [{ id: 's1', gems: 5, sp: 250 }, { id: 's2', gems: 15, sp: 900 }, { id: 's3', gems: 40, sp: 3000 }];
export const padPay = (p, w, k, first, w2) => Math.max(1, Math.round(padWins(w, k) * (first ? FIRST_PAD : 1) * (1 + 0.1 * upLevel(p, 'luck')) * (w2 ? 2 : 1)));

// ----- the worlds: 12 craters each, every one laid out for a higher Level and paying more than the last. Escaping the last opens
// the next -----
export const WALLS_N = 12;
// rock/rock2: the islands' stone, light and dark; deck/deck2: the rim decks' top (grass, ash, snow, dust) and its second tone;
// strata: the craters' wall bands from the floor up; floorC: a crater's floor; trim: fences, signs, bridge rails; accent: paint,
// flags, chevrons; hazard/hazard2: the lava (or its like) in the races and the pools; sea/sea2: far below; glow: lights and portals
export const WORLDS = [
    {
        id: 'meadow', name: 'Greenhorn Craters', rank: 'I', icon: '🌋', pow: 1, wins: 1, mood: 'meadow',
        rock: 0xb8a88a, rock2: 0x8a745a, deck: 0x6fce4a, deck2: 0x58b83c, floorC: 0xe8d8a8, trim: 0xfff4d8, accent: 0xff7a2a, hazard: 0xff5a14, hazard2: 0xffd23a, sea: 0x2a9ad8, sea2: 0x2ac8a0, glow: 0xffd23a,
        strata: [0xf2dca0, 0xe8b86a, 0xd8904a, 0xc46a3a, 0x9a4a36, 0x6a3a3a],
        stages: ['First Dip', 'Pebble Pit', 'Clover Bowl', 'Boulder Basin', 'Slick Sink', 'Sweeper Hollow', 'Geyser Gulch', 'Rolling Rim', 'Twin Rings', 'Mudslide Maw', 'Thunder Bowl', 'The Great Green'],
    },
    {
        id: 'ember', name: 'Ember Calderas', rank: 'II', icon: '🔥', pow: 40, wins: 120, mood: 'ember',
        rock: 0x5a4a4a, rock2: 0x34282a, deck: 0x6a5a56, deck2: 0x54464a, floorC: 0x3a2e30, trim: 0xffc23a, accent: 0xff5a1a, hazard: 0xff4a0a, hazard2: 0xffd23a, sea: 0xd8541e, sea2: 0xffa23a, glow: 0xff8a2a,
        strata: [0x4a3c3e, 0x6a4a44, 0x8a4a3a, 0xb8543a, 0xe86a2a, 0xffa23a],
        stages: ['Cinder Cup', 'Ash Bowl', 'Slag Slide', 'Rockfall Ring', 'Obsidian Glass', 'Furnace Fan', 'Vent Valley', 'Magma Rollers', 'Char Rings', 'Glasswall', 'Firestorm Pit', 'The Red Caldera'],
    },
    {
        id: 'frost', name: 'Frostbite Basins', rank: 'III', icon: '❄️', pow: 1600, wins: 14000, mood: 'frost',
        rock: 0xa8c0d8, rock2: 0x6a88a8, deck: 0xf4faff, deck2: 0xd8ecff, floorC: 0xcfe8ff, trim: 0x3a8aff, accent: 0x3ab4ff, hazard: 0x1a8ab8, hazard2: 0x7ae8ff, sea: 0x1e5ad8, sea2: 0x7ae8ff, glow: 0x7ae8ff,
        strata: [0xe8f6ff, 0xc4e4ff, 0x9acfff, 0x6ab0f0, 0x4a8ad8, 0x3a66b8],
        stages: ['Snow Saucer', 'Frost Dish', 'Icicle Bowl', 'Avalanche Alley', 'Black Ice', 'Blizzard Blade', 'Steam Spring', 'Snowball Run', 'Frozen Rings', 'Glacier Glass', 'Whiteout Well', 'The Deep Freeze'],
    },
    {
        id: 'lunar', name: 'Lunar Maria', rank: 'IV', icon: '🌙', pow: 64000, wins: 1.7e6, mood: 'lunar',
        rock: 0x8a8a9a, rock2: 0x4a4a5e, deck: 0xb8b8c8, deck2: 0x9a9aae, floorC: 0x6a6a80, trim: 0x7af4ff, accent: 0xff5ac0, hazard: 0x7a2aff, hazard2: 0xff7ae0, sea: 0x5a3ab8, sea2: 0xff7ac8, glow: 0x7af4ff,
        strata: [0x6e6e84, 0x5c5c78, 0x4c4a74, 0x5a3a8a, 0x7a3ab0, 0xb45aff],
        stages: ['Moon Dimple', 'Dust Dish', 'Tranquil Bowl', 'Meteor Shower', 'Glass Sea', 'Orbit Arm', 'Gas Vent', 'Asteroid Roll', 'Saturn Rings', 'Mirror Maria', 'Zero Hour', 'The Dark Side'],
    },
];
// the Level a crater is sized for (its "Recommended Level" sign): at that Level's top speed your tyres hold right up to its rim.
// Every world the same curve (later ones also want the world open)
const REC = [1, 2, 3, 5, 7, 9, 12, 15, 18, 22, 26, 30];
export const recLevel = (w, k) => REC[Math.max(0, Math.min(WALLS_N - 1, k | 0))];
// what escaping a crater pays (x the world's Wins)
const STAGE_WINS = [1, 1, 2, 3, 5, 7, 10, 14, 19, 26, 35, 47];
export const stageName = (w, k) => WORLDS[w].stages[k];
export const padWins = (w, k) => STAGE_WINS[k] * WORLDS[w].wins;
// the first escape from a crater each rebirth pays this much more
export const FIRST_PAD = 3;
// a world opens when the last crater of the one before is escaped and you've been reborn enough times (worldReb)
const WORLD_REB = [0, 2, 5, 9];
export const worldReb = (w) => WORLD_REB[w] || 0;
export const worldOpen = (p, w) => w === 0 || (((p.bests && p.bests[w - 1]) || 0) >= WALLS_N && (p.rebirths || 0) >= worldReb(w));
// how fast you drive, studs a second: your top speed
export const runSpeed = (p) => maxWalk(p || {});
// a step on the ground: a stride, longer the faster you go
export const strideOf = (v) => Math.max(CFG.stride, v / CFG.strideHz);
// the top speed at a crater's Recommended Level (the crater is sized for this)
export const stageV = (k) => Math.min(CFG.vMax, CFG.walk + CFG.vPer * (recLevel(0, k) - 1));

// ----- a title over your car: how far you've come (craters escaped, all told) -----
const TITLES = [[0, 'Learner'], [3, 'Pit Rookie'], [8, 'Rim Rider'], [15, 'Wall Crawler'], [25, 'Crater Hopper'], [40, 'Caldera Ace'], [60, 'Rim Master'], [100, 'Crater Legend'], [160, 'King of the Rim']];
export const titleOf = (cleared) => { let t = TITLES[0][1]; for (const [n, name] of TITLES) if ((cleared || 0) >= n) t = name; return t; };

// ----- Eruption: what a race is like at a Level. A bigger volcano and faster lava as you level up, and better paid -----
// your Level for this: your Level plus what you've left behind in rebirths
export const matchLv = (p) => (p.lv || 1) + 3 * (p.rebirths || 0);
export function matchInfo(lv) {
    const L = Math.max(1, lv | 0), tier = Math.min(9, Math.floor(L / 6));
    // everyone's engine: v0 at the gun, vr more every second (so the whole field climbs together and the race is about the line you
    // hold, the boosts you take and what you dodge). vEsc: the speed the rim wants; the volcano is sized for it
    const v0 = 26, vr = 1.5 + tier * 0.03, tEsc = 18 + tier * 1.2, vEsc = v0 + vr * tEsc;
    // the lava: when it starts to rise (seconds after the gun); it reaches the rim tLava seconds after that. It starts slowly and
    // ends fast (a quarter of its rise is steady, the rest speeds up): mid-race there's room under you for one mistake (a boulder's
    // knock, a slip on the slick band), and the last stretch to the rim is the close one
    const surgeAt = Math.max(3.5, 5.5 - tier * 0.2), tLava = tEsc + 11 - surgeAt;
    return {
        tier, v0, vr, vEsc, tEsc,
        // the clock runs out a little after the lava's over the rim
        secs: Math.round(tEsc + 13),
        // boost chevrons on the wall, boulders rolling down it (from Level 6), a slick band (from Level 12)
        pads: 5 + Math.min(7, tier), rocks: L < 6 ? 0 : Math.min(6, 2 + Math.floor(tier / 2)), slick: L >= 12 ? 1 : 0,
        // how fast it rises (of the volcano's depth a second), speeding up
        surgeAt, surgeV: 0.25 / tLava, surgeA: 1.5 / (tLava * tLava),
        // how good the bots are: how close to the best line they hold, how often they slip
        botPace: Math.min(0.99, 0.9 + L * 0.003), botTrip: Math.max(0.1, 0.4 - L * 0.006),
    };
}
// in a race your Speed counts only so much (a log scale): a new player with a good line can beat a veteran
export const matchPower = (p) => Math.round((1 + Math.min(0.06, Math.log10(1 + (p.speed || 0)) * 0.005)) * 100) / 100;
export const MATCH = { boostSecs: 2.2, boostK: 1.22, stunSecs: 0.3, r: 5 };
export const PLACES = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const PLACE_K = [4.5, 3.2, 2.4, 1.8, 1.4, 1.1], PLACE_GEMS = [8, 5, 3, 2, 1, 1];
// pct: how far up the volcano you got (0..1)
export function matchPrize(place, pct, lv, p) {
    const best = padWins(p.world || 0, Math.min(WALLS_N - 1, Math.max(0, ((p.bests && p.bests[p.world || 0]) || 1) - 1)));
    const k = PLACE_K[place] ?? 1.1, grow = 1 + Math.min(1.5, (lv | 0) * 0.015);
    return {
        wins: Math.max(1, Math.round((1 + best) * k * grow)),
        gems: (PLACE_GEMS[place] ?? 1) + (place === 0 ? Math.min(12, Math.floor((lv | 0) / 12)) : 0),
        // Speed and as much XP (a quarter of your Level's XP x the place's share x how far you got)
        speed: Math.max(1, Math.round(Math.max(1, xpNeed(p.lv || 1) * 0.25) * k * Math.min(2, 0.5 + 1.5 * Math.max(0, Math.min(1, pct || 0))))),
    };
}
// everyone's colour in a race: their flag, their lights, their name on the board
export const SPOT_COL = [0xff4a6a, 0x3ab4ff, 0xffd23a, 0x46ec50, 0xc45aff, 0xff8a2a];
export const SPOT_CSS = SPOT_COL.map((c) => '#' + c.toString(16).padStart(6, '0'));

// ----- the wheel: one spin's prizes (weights) -----
export const SPIN = [
    { w: 22, xp: 1, text: 'Speed', color: '#3ad8ff' }, { w: 18, wins: 1, text: 'Wins', color: '#ffd028' }, { w: 14, gems: 5, text: '5 Gems', color: '#b45aff' },
    { w: 12, xp: 3, text: 'Big Speed', color: '#7ae8ff' }, { w: 10, wins: 3, text: 'Big Wins', color: '#ff9a1a' }, { w: 10, x2: 10, text: 'x2 Speed', color: '#46ec50' },
    { w: 8, gems: 15, text: '15 Gems', color: '#7a4aff' }, { w: 6, wins: 10, text: 'Huge Wins', color: '#ff4a8a' },
];
// a spin's prize grows with what you've reached (its Speed comes with as much XP)
export function spinPrize(s, p) {
    const best = padWins(p.world || 0, Math.min(WALLS_N - 1, Math.max(0, ((p.bests && p.bests[p.world || 0]) || 1) - 1)));
    return { speed: s.xp ? Math.max(1, Math.round(s.xp * xpNeed(p.lv || 1) * 0.35)) : 0, wins: s.wins ? Math.round(s.wins * (1 + best)) : 0, gems: s.gems || 0, x2: s.x2 || 0 };
}

// ----- daily tasks -----
// (pads: craters escaped from Crater 5 on; tread: steps on a dyno)
export const TASKS = lookup({
    wins: { text: 'Collect Wins', icon: '🏆', n: 40, gems: 6, wins: 6 },
    steps: { text: 'Drive 800 steps', icon: '🛞', n: 800, gems: 5, wins: 4 },
    cleared: { text: 'Escape craters', icon: '🌋', n: 12, gems: 6, wins: 5 },
    levels: { text: 'Level Up', icon: '⭐', n: 15, gems: 6, wins: 5 },
    pads: { text: 'Escape craters from Crater 5 on', icon: '🏁', n: 5, gems: 6, wins: 6 },
    matches: { text: 'Race in Eruption', icon: '🥇', n: 3, gems: 8, wins: 6 },
    hatch: { text: 'Hatch Eggs', icon: '🥚', n: 5, gems: 5, wins: 4 },
    spins: { text: 'Spin the Wheel', icon: '🎡', n: 2, gems: 5, wins: 3 },
    tread: { text: 'Run 400 steps on a dyno', icon: '⚙️', n: 400, gems: 5, wins: 4 },
    rebirth: { text: 'Rebirth', icon: '🔁', n: 1, gems: 8, wins: 6 },
});
const TASK_POOL = ['steps', 'cleared', 'levels', 'pads', 'matches', 'hatch', 'spins', 'tread', 'rebirth'];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayLeft = (ms) => 86400 - Math.floor(ms / 1000) % 86400;
export function tasksFor(day) {
    let h = 2166136261;
    for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
    const r = rngFrom(h >>> 0), pool = TASK_POOL.slice(), out = ['wins'];
    while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
}

// ----- quests: always a next goal (shown at the top of the screen); they pay as soon as they're done -----
// kind: what's counted (best: craters escaped in the first world; pads: craters escaped, all told; tread: steps on a dyno;
// totalWins: Wins earned all told, what opens the dynos; cars: cars owned)
export const QUESTS = [
    { kind: 'speed', n: 30, text: 'Drive! Reach 30 Speed', gems: 2 },
    { kind: 'best', n: 1, text: 'Ride the wall of Crater 1 round to its far side', wins: 1 },
    { kind: 'lv', n: 4, text: 'Reach Level 4: Levels make your car faster!', gems: 2 },
    { kind: 'best', n: 2, text: 'Escape Crater 2', gems: 3 },
    { kind: 'upgrades', n: 1, text: 'Tune your car: buy an upgrade', gems: 3 },
    { kind: 'best', n: 3, text: 'Escape Crater 3', wins: 3 },
    { kind: 'totalWins', n: 10, text: 'Earn 10 Wins: the Street Dyno opens (+2 / step)!', gems: 3 },
    { kind: 'cars', n: 1, text: 'Buy a new car', wins: 2 },
    { kind: 'best', n: 4, text: 'Dodge the boulders: escape Crater 4', gems: 4 },
    { kind: 'hatch', n: 1, text: 'Hatch an Egg for a pet', wins: 2 },
    { kind: 'lv', n: 10, text: 'Reach Level 10', gems: 3 },
    { kind: 'speed', n: 2500, text: 'Reach 2,500 Speed', wins: 6 },
    { kind: 'best', n: 5, text: 'Escape Crater 5', gems: 4 },
    { kind: 'matches', n: 1, text: 'Press RACE: outrun the lava in Eruption', gems: 5 },
    { kind: 'totalWins', n: 60, text: 'Earn 60 Wins: the Sport Dyno opens (+3 / step)!', gems: 4 },
    { kind: 'rebirths', n: 1, text: 'Rebirth: x1.5 Speed and XP for good', gems: 10 },
    { kind: 'best', n: 6, text: 'Escape Crater 6', wins: 20 },
    { kind: 'trail', n: 1, text: 'Get an exhaust trail', wins: 8 },
    { kind: 'lv', n: 15, text: 'Reach Level 15', gems: 5 },
    { kind: 'best', n: 7, text: 'Escape Crater 7', gems: 8 },
    { kind: 'totalWins', n: 300, text: 'Earn 300 Wins: the Rally Dyno opens (+5 / step)!', gems: 6 },
    { kind: 'cars', n: 3, text: 'Own 3 new cars', wins: 40 },
    { kind: 'tread', n: 300, text: 'Run 300 steps on a dyno', wins: 10 },
    { kind: 'podium', n: 1, text: 'Finish a race in the top 3', gems: 8 },
    { kind: 'best', n: 9, text: 'Escape Crater 9', gems: 12 },
    { kind: 'spins', n: 5, text: 'Spin the wheel 5 times', gems: 6 },
    { kind: 'rebirths', n: 2, text: 'Rebirth twice', gems: 12 },
    { kind: 'lv', n: 20, text: 'Reach Level 20', wins: 120 },
    { kind: 'best', n: 12, text: 'Escape all 12 craters: a new world!', gems: 40 },
    { kind: 'totalWins', n: 1500, text: 'Earn 1,500 Wins: the Turbo Dyno opens (+8 / step)!', gems: 12 },
    { kind: 'rebirths', n: 3, text: 'Rebirth 3 times', gems: 15 },
    { kind: 'steps', n: 5000, text: 'Drive 5,000 steps', wins: 120 },
    { kind: 'matchWins', n: 1, text: 'Win a race', gems: 15 },
    { kind: 'lv', n: 25, text: 'Reach Level 25', gems: 20 },
    { kind: 'rebirths', n: 5, text: 'Rebirth 5 times', gems: 30 },
    { kind: 'matchWins', n: 5, text: 'Win 5 races', gems: 30 },
    { kind: 'hatch', n: 50, text: 'Hatch 50 Eggs', gems: 40 },
    { kind: 'steps', n: 50000, text: 'Drive 50,000 steps', gems: 60 },
];

// ----- rewards: the 7-day daily reward, playtime gifts, codes, the Gem shop -----
export const DAILY = [
    { speed: 40 }, { spins: 2 }, { wins: 15 }, { gems: 10 }, { speed: 400 }, { x2: 30 }, { wins: 150, gems: 30 },
];
export function dailyStatus(d, now) {
    const today = dayKey(now), yest = dayKey(now - 86400000);
    if (!d || !d.last) return { can: true, day: 0, streak: 0 };
    if (d.last === today) return { can: false, day: d.streak % 7, streak: d.streak };
    const streak = d.last === yest ? d.streak : 0;
    return { can: true, day: streak % 7, streak };
}
// FREE gifts for playing (minutes into this session)
export const GIFTS = [
    { min: 2, speed: 150 }, { min: 5, wins: 12 }, { min: 9, spins: 1 }, { min: 14, gems: 8 }, { min: 20, wins: 50 }, { min: 30, x2: 15 }, { min: 45, wins: 200, gems: 10 },
];
export const CODES = lookup({
    CRATER: { speed: 200 }, RIMSHOT: { gems: 5 }, NITRO: { wins: 10 }, BLOXITY: { spins: 2 }, LEGION: { gems: 5 }, ERUPTION: { wins: 8, speed: 100 }, ESCAPE: { speed: 300 },
});
export const PACKS = [
    { id: 'p1', gems: 10, wins: 20 }, { id: 'p2', gems: 30, wins: 90 }, { id: 'p3', gems: 80, wins: 320 },
];
// a reward's Speed grows with your Level (what the server pays, and what the screen promises): speed 100 is a whole Level's XP.
// It comes with as much XP
export const rewardSpeed = (r, lv) => (r.speed ? Math.max(1, Math.round(r.speed * 0.01 * xpNeed(lv || 1))) : 0);
// HTML: a Win (a trophy) and Speed (a bolt) are drawn (classes "wc", "pc"), Gems are 💎
export function rewardText(r, plain) {
    return [r.speed ? fmt(r.speed) + (plain ? ' Speed' : ' <i class="pc"></i>') : '', r.wins ? fmtComma(r.wins) + (plain ? ' Wins' : ' <i class="wc"></i>') : '', r.gems ? r.gems + ' 💎' : '', r.spins ? r.spins + (r.spins > 1 ? ' spins' : ' spin') : '', r.x2 ? 'x2 Speed ' + r.x2 + ' min' : ''].filter(Boolean).join(' + ');
}

export const BOT_NAMES = [
    'RimRex', 'TurboTess', 'NitroNia', 'DriftDax', 'CraterKai', 'GearGus', 'LavaLou', 'BoostBea', 'SkidSam', 'PistonPip',
    'AxleAda', 'RevRiko', 'ClutchCal', 'ZoomZed', 'WheelieWes', 'TorqueTia', 'BumperBo', 'SparkSky', 'DynoDee', 'VroomVik',
];

// ----- helpers -----
export function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    let i = 0, x = v;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 100) / 100) + u[i];
}
// a small number with a decimal when it has one (a step's "+1.5"), a big one as fmt
export const fmtStep = (v) => (v >= 1000 ? fmt(v) : String(Math.round(v * 10) / 10));
export const fmtComma = (v) => { const s = String(Math.floor(v || 0)); return s.length < 4 || /e/.test(s) ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
