// A simulated typical first session on the real formulas (shared/config.js) and the real craters (shared/world.js): from the spawn
// up the craters, one after another (the bridge, straight off the rim, round the funnel's wall, out at its far side; now and then down its
// hole and back from Base Camp); a crater it can't get across yet it laps for Levels (or parks on its best dyno, when that
// levels it faster); buys the next car and the tuning that helps as its Wins allow; follows the quests (a race, a rebirth, an Egg
// when one asks); rebirths when it's stuck a long way under the next crater. It isn't a person, but it tells when things come.
// It plays one session out loud (seed 1), then the same over many seeds and prints the pacing table (medians, and the 10%..90% spread).
// node tests/economy.mjs [minutes]   (env: SKILL 0..1 how well it drives, SEEDS how many runs)
import {
    CFG, WORLDS, WALLS_N, POSTS, CARS, JAWBREAKERS, UPGRADES, upgradeCost, stepGain, xpGain, xpNeed, padPay, maxWalk, rebirthLv, postOpen, postXp, carOwned,
    matchPrize, matchLv, matchInfo, worldOpen, fmt, clock, recLevel, QUESTS, GIFTS, rewardSpeed, SPIN, spinPrize, DAILY, rngFrom, stageV,
} from '../shared/config.js';
import { islandOf, needV, W } from '../shared/world.js';

const MINS = Number(process.argv[2] || 30), SKILL = Number(process.env.SKILL ?? 0.5), SEEDS = Number(process.env.SEEDS || 25);
const STEPS = CFG.strideHz, DYNO = (CFG.treadRate + CFG.treadSprint) / 2;
// what share of a crater's Recommended speed gets a car out at its far side, NITRO as it comes (measured: SWEEP=1 node tests/funnel.mjs)
const OUT_AT = [0.5, 0.5, 0.5, 0.65, 0.6, 0.75, 0.75, 0.8, 0.85, 0.9, 0.95, 0.95];

function session(seed, loud) {
    const R = rngFrom(seed * 7919 + 13), say = (t, s) => { if (loud) console.log(clock(t).padStart(6) + '  ' + s); };
    const p = { lv: 1, xp: 0, speed: 0, wins: 0, totalWins: 0, gems: 0, rebirths: 0, car: 0, cars: {}, ups: {}, posts: {}, team: [], trail: 0, aura: 0, world: 0, bests: {}, qi: 0, steps: 0, tread: 0, hatched: 0, matches: 0, podium: 0, matchWins: 0, upgrades: 0, spinsUsed: 0, spins: 0, trails: {} };
    const M = {}, mark = (k, t) => { if (M[k] === undefined) { M[k] = t; say(t, k); } };
    // how well it holds a line: what share of the top speed its tyres really get to use at the rim, NITRO on
    const eff = 0.93 + 0.05 * SKILL + (R() - 0.5) * 0.02;
    let t = 0, cur = 0, done = {}, where = 'spawn', stuckSince = 0, spinAt = CFG.spinMins * 60, gift = 0, dailyDone = false;
    const addWins = (n) => { p.wins += n; p.totalWins += n; };
    const xpAdd = (n) => { p.xp += n; while (p.xp >= xpNeed(p.lv)) { p.xp -= xpNeed(p.lv); p.lv++; for (const L of [5, 10, 15, 20, 25, 30]) if (p.lv === L) mark('Level ' + L, t); } };
    const reward = (r) => { if (r.speed) { const s = rewardSpeed(r, p.lv); p.speed += s; xpAdd(s); } if (r.wins) addWins(r.wins); if (r.gems) p.gems += r.gems; if (r.spins) p.spins += r.spins; };
    // t seconds of steps: driving (4 a second), or parked on dyno i
    const drive = (secs, post) => {
        const n = secs * (post >= 0 ? DYNO : STEPS);
        p.steps += n; if (post >= 0) p.tread += n;
        p.speed += n * stepGain(p, false, p.world, 0) * (post >= 0 ? POSTS[post].mult : 1);
        xpAdd(n * xpGain(p) * (post >= 0 ? postXp(post) : 1));
        t += secs;
    };
    const bestPost = () => { let b = 0; for (let i = 0; i < POSTS.length; i++) if (postOpen(p, i) && POSTS[i].mult >= POSTS[b].mult) b = i; return b; };
    // (a better driver times the NITRO better: a few hundredths either way)
    const canEscape = (k) => maxWalk(p) >= stageV(k) * (OUT_AT[k] + (0.955 - eff) * 1.6);
    const questVal = (kind) => (kind === 'best' ? (p.bests[0] || 0) : kind === 'hatch' ? p.hatched : kind === 'cars' ? Object.keys(p.cars).length : kind === 'spins' ? p.spinsUsed : kind === 'trail' ? p.trail : Math.floor(p[kind] || 0));
    const quests = () => { while (p.qi < QUESTS.length && questVal(QUESTS[p.qi].kind) >= QUESTS[p.qi].n) { reward(QUESTS[p.qi]); p.qi++; } };
    const shop = () => {
        // the next car first; then the tuning that makes Levels come faster or opens craters sooner; an Egg, a trail when a quest asks
        for (let again = true; again;) {
            again = false;
            const ci = CARS.findIndex((c, i) => i > 0 && c.wins && !carOwned(p, i)), C = CARS[ci];
            if (C && p.wins >= C.wins) { p.wins -= C.wins; p.cars[C.id] = 1; p.car = ci; mark('The ' + C.name + ' (x' + C.mult + ')', t); again = true; continue; }
            const Q = QUESTS[p.qi];
            for (const id of ['scholar', 'reach', 'soles', 'feet', 'luck']) {
                const u = UPGRADES.find((x) => x.id === id), n = p.ups[id] || 0, cost = upgradeCost(u, n);
                if (n < u.max && p.wins >= cost * (C ? 2.5 : 1.2)) { p.wins -= cost; p.ups[id] = n + 1; p.upgrades++; again = true; break; }
            }
            if (Q && Q.kind === 'upgrades' && !p.upgrades && p.wins >= 6) { p.wins -= 6; p.ups.soles = 1; p.upgrades++; again = true; }
            if (Q && Q.kind === 'hatch' && p.hatched < Q.n && p.wins >= JAWBREAKERS[0].wins) { p.wins -= JAWBREAKERS[0].wins; p.hatched++; again = true; }
            if (Q && Q.kind === 'trail' && !p.trail && p.wins >= 15) { p.wins -= 15; p.trail = 1; again = true; }
        }
    };
    const race = () => {
        const lv = matchLv(p), D = matchInfo(lv), place = Math.min(5, Math.floor(R() * R() * (6.5 - 3 * SKILL)));
        t += CFG.matchQueue + CFG.matchReady + D.tEsc + 6;
        const prize = matchPrize(place, 1, lv, p);
        addWins(prize.wins); p.gems += prize.gems; p.speed += prize.speed; xpAdd(prize.speed);
        p.matches++; if (place <= 2) p.podium++; if (place === 0) p.matchWins++;
        mark('First race', t);
    };
    const end = MINS * 60;
    while (t < end) {
        quests(); shop();
        // the clock's own: a spin every seven minutes, the playtime gifts, the daily reward after the first crater
        if (t >= spinAt) { spinAt += CFG.spinMins * 60; let r = R() * SPIN.reduce((a, x) => a + x.w, 0), i = 0; for (; i < SPIN.length - 1; i++) { r -= SPIN[i].w; if (r < 0) break; } const z = spinPrize(SPIN[i], p); p.speed += z.speed; xpAdd(z.speed); addWins(z.wins); p.gems += z.gems; p.spinsUsed++; }
        while (gift < GIFTS.length && t >= GIFTS[gift].min * 60) reward(GIFTS[gift++]);
        if (!dailyDone && (p.bests[0] || 0) >= 1) { dailyDone = true; reward(DAILY[0]); }
        const Q = QUESTS[p.qi];
        if (Q && (Q.kind === 'matches' || Q.kind === 'podium' || Q.kind === 'matchWins') && R() < 0.5) { race(); where = 'spawn'; continue; }
        if (p.world + 1 < WORLDS.length && worldOpen(p, p.world + 1) && cur >= WALLS_N) { p.world++; cur = 0; done = {}; where = 'spawn'; t += 5; mark(WORLDS[p.world].name + ' opens', t); continue; }
        // a rebirth: when a quest asks, or stuck four Levels or more under the next crater for a while
        const need = rebirthLv(p.rebirths);
        if (p.lv >= need && ((Q && Q.kind === 'rebirths') || cur >= WALLS_N || (recLevel(p.world, Math.min(cur, WALLS_N - 1)) - p.lv >= 4 && t - stuckSince > 50))) {
            p.rebirths++; p.lv = 1; p.xp = 0; p.speed = 0; cur = 0; done = {}; where = 'spawn'; t += 4; stuckSince = t;
            mark('Rebirth ' + p.rebirths, t);
            continue;
        }
        if (cur >= WALLS_N) { drive(5, bestPost()); continue; }
        const I = islandOf(cur);
        if (canEscape(cur)) {
            // to it (a bridge, a teleport back from the dyno), straight off the rim, round its wall (the first three in one carve, the
            // rest a lap and a half), out and to its gate
            const v = maxWalk(p), bridge = W.gap / Math.min(v, 40), ramp = 1, wall = (cur < 3 ? 2.5 : 3 + 1.5 * 2 * Math.PI * I.R * 0.85 / v) * (1.05 - 0.15 * SKILL + R() * 0.2);
            // (down the hole now and then, the less skilled the more often: the fall, Base Camp, Teleport back)
            if (cur > 2 && R() < (1 - SKILL) * 0.1) { drive(bridge + ramp + wall * 0.5 + 12, -1); mark('First time down a hole', t); }
            drive((where === 'dyno' ? 5 : where === 'spawn' && cur === 0 ? 5 : 0) + bridge + ramp + wall + 2, -1);
            const first = !done[cur];
            done[cur] = 1;
            addWins(padPay(p, p.world, cur, first, false));
            if (cur + 1 > (p.bests[p.world] || 0)) p.bests[p.world] = cur + 1;
            if (p.world === 0) for (const n of [1, 3, 5, 8, 10, 12]) if (cur + 1 === n) mark('Crater ' + n + ' escaped', t);
            drive(I.arcN * (I.R + 7) * 0.5 / Math.min(v, 40), -1);
            cur++; where = 'course'; stuckSince = t;
            for (let i = 1; i < POSTS.length; i++) if (!POSTS[i].gems && p.totalWins >= POSTS[i].need) mark('The ' + POSTS[i].name + ' (+' + POSTS[i].mult + ')', t);
            continue;
        }
        // not yet: Levels. On the dyno if that's the faster way (it has to be worth the trip), else laps of this crater
        const bp = bestPost();
        if (DYNO * postXp(bp) > STEPS * 1.15) { if (where !== 'dyno') { t += 6; where = 'dyno'; } drive(4, bp); }
        else drive(4, -1);
    }
    return { M, p, cur };
}

console.log('--- one session out loud (seed 1, ' + MINS + ' minutes, skill ' + SKILL + ')');
const one = session(1, true);
console.log('  ends at Level ' + one.p.lv + ', ' + one.p.rebirths + ' rebirths, ' + WORLDS[one.p.world].name + ' crater ' + (one.cur + 1) + ', ' + fmt(one.p.totalWins) + ' Wins earned, ' + one.p.gems + ' Gems, quest ' + one.p.qi + ' / ' + QUESTS.length + ', Speed ' + fmt(one.p.speed));
const all = [];
for (let s = 1; s <= SEEDS; s++) all.push(session(s, false));
const keys = [];
for (const r of all) for (const k of Object.keys(r.M)) if (!keys.includes(k)) keys.push(k);
const rows = keys.map((k) => { const v = all.map((r) => r.M[k]).filter((x) => x !== undefined).sort((a, b) => a - b); return { k, n: v.length, med: v[Math.floor(v.length / 2)], lo: v[Math.floor(v.length * 0.1)], hi: v[Math.min(v.length - 1, Math.floor(v.length * 0.9))] }; }).filter((r) => r.n >= SEEDS * 0.5).sort((a, b) => a.med - b.med);
console.log('\n--- ' + SEEDS + ' sessions of ' + MINS + ' minutes: when things come (median; 10% to 90% where it\'s wide)\n| When | What |\n|---|---|');
for (const r of rows) console.log('| ' + clock(r.med) + (r.hi - r.lo > Math.max(30, r.med * 0.2) ? ' (' + clock(r.lo) + ' to ' + clock(r.hi) + ')' : '') + ' | ' + r.k + (r.n < SEEDS ? ' (' + r.n + ' of ' + SEEDS + ')' : '') + ' |');
const med = (f) => { const v = all.map(f).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
console.log('\na typical session ends at Level ' + med((r) => r.p.lv) + ' with ' + med((r) => r.p.rebirths) + ' rebirths, in ' + WORLDS[med((r) => r.p.world)].name + ', quest ' + med((r) => r.p.qi) + ' of ' + QUESTS.length);
