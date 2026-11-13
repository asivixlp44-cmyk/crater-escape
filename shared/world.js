// A world: Base Camp at the south end and a chain of sky islands going off to the north (-z), each a little higher than the last,
// joined by bridges that ramp up. Every island is a rock with a crater in it: a funnel. Its wall gets steeper all the way up to
// the rim, and in its middle is a hole: whatever slides into it is back at Base Camp. The road (the line the bridges run along,
// x 0) runs straight at each crater's middle: the bridge ends on a small landing at the south of the rim, and the only way on is
// through the funnel. There is nothing round its sides: only the rim's kerb and fence. A car driven straight off the landing
// drops in over the lip and is carried into a carve along the wall (shared/physics.js: the drop; the wheel picks the side), dives
// past the hole and comes up the wall towards the exit platform on the far side, where the road goes on. Fast enough to stay up
// on the wall, it gets out there; too slow, it sinks, and laps the funnel for Levels; much too slow, the hole has it. Further up
// the chain the drop aims nearer the hole, and the way out is higher up the wall and shorter.
// Both sides build from these numbers: the client draws it and drives you on it, the server checks where you say you are.
import { WALLS_N, POSTS, JAWBREAKERS, stageV, rngFrom, CFG } from './config.js';

export const W = {
    spawn: { x: 0, z: 100 },
    plaza: { x0: -124, x1: 124, z0: 44, z1: 152 },
    hw: 8,                        // half the width of a bridge
    land: 7,                      // the flat at each end of a bridge's ramp
    deck: 14,                     // how far a crater's decks reach out from its rim (the landing, the exit platform)
    apron: 3,                     // how much wider than the bridge the landing is, each side
    arcN: [0.62, 0.5],            // how far round the rim the exit platform (a crescent) reaches each way from its middle: first crater, last
    taperN: 0.16,                 // its tips narrow to nothing
    exitCap: [0.55, 0.88],        // the way out's launch chevrons start this far up the wall: at the first crater, at the last
    dip: [0.3, 0.72],             // how far in towards the hole the drop aims a car (radians off along the wall): at the first crater, at the last
    dropT: 0.45,                  // how long the drop carries a car (seconds)
    hole: 46,                     // how far down a crater's hole goes (you're back at Base Camp long before its bottom)
    kerb: 0.6,                    // the rim's kerb, where there's no platform: how far inside the rim it holds you
    gap: 44,                      // a bridge's length
    summit: 30,                   // the last platform's radius (the way to the next world)
};

// ----- the craters: each sized so that at its Recommended Level's top speed (and a little: NITRO's burst) your tyres hold right
// up to its rim. S: the wall's slope at the rim (rise over run); R: the rim's radius; r0: the flat floor's; H: how deep. The wall
// is a parabola from the floor's edge: its slope grows evenly from 0 to S -----
const NEED_K = 1;
const BOWLS = [], ISL = [];
{
    for (let k = 0; k < WALLS_N; k++) {
        const S = 1.5 + 1.9 * Math.pow(k / (WALLS_N - 1), 1.25), V = stageV(k) * NEED_K;
        const R = Math.round(V * V / (CFG.grav * (S - CFG.mu) / (1 + S * CFG.mu))), r0 = Math.round(R * 0.42), H = Math.round(S * (R - r0) / 2 * 10) / 10;
        BOWLS.push({ k, S: 2 * H / (R - r0), R, r0, H });
    }
    let z = W.plaza.z0, E = 0;
    for (let k = 0; k < WALLS_N; k++) {
        const B = BOWLS[k], Ro = B.R + W.deck, dE = Math.round(6 + k * 0.5), zB = z, zS = z - W.gap, cz = zS - Ro, zN = cz - Ro;
        // the hole (rh: its radius; the foot of the wall tips over into it, td deep: the throat)
        const rh = Math.round(B.r0 * 0.8 * 10) / 10, td = Math.round((B.r0 - rh) * 1.3 * 10) / 10;
        // its middle on the road; zr: how far north and south of it the road crosses the rim; a0, aX: where round the rim that is (0
        // south, by east), coming in and going out; side: which way round the drop carries a car nobody's steering, straight down the
        // middle (1: by the east; turn about); dip: how far in towards the hole the drop aims
        const d = k / (WALLS_N - 1), mix = (p) => p[0] + (p[1] - p[0]) * d;
        ISL.push({ ...B, cx: 0, cz, Ro, rh, td, zr: B.R, a0: 0, aX: Math.PI, side: k % 2 ? -1 : 1, dip: mix(W.dip), arcN: mix(W.arcN), eu: mix(W.exitCap), base: E, E: E + dE, dE, zB, zS, zN });
        z = zN; E += dE;
    }
}
export const bowlOf = (k) => BOWLS[Math.max(0, Math.min(WALLS_N - 1, k | 0))];
export const islandOf = (k) => ISL[Math.max(0, Math.min(WALLS_N - 1, k | 0))];
// the last platform, a bridge past the last island: the portal to the next world
const LAST = ISL[WALLS_N - 1];
export const summit = { x: 0, z: LAST.zN - W.gap - W.summit, r: W.summit, y: LAST.E };
export const endPortal = { x: 0, z: summit.z - 10, r: 9 };
export const northEnd = summit.z - W.summit;
// which stage a point is in (-1: Base Camp; a stage is its bridge and its island; WALLS_N: past the last)
export function stageAt(z) { if (z > W.plaza.z0) return -1; for (let k = 0; k < WALLS_N; k++) if (z > ISL[k].zN) return k; return WALLS_N; }
// a bowl's wall: how far up it radius r is (0 the floor's edge .. 1 the rim), its height over the floor there
export const wallU = (B, r) => (r <= B.r0 ? 0 : Math.min(1, (r - B.r0) / (B.R - B.r0)));
export const wallH = (B, r) => { const u = wallU(B, r); return B.H * u * u; };
// the speed your tyres need to hold a lap at wall fraction u, with grip mu
export function needV(B, u, mu) {
    const m = mu ?? CFG.mu, s = B.S * u;
    if (s <= m) return 0;
    return Math.sqrt(CFG.grav * (B.r0 + (B.R - B.r0) * u) * (s - m) / (1 + s * m));
}
// how far up the wall a top speed v holds (0..1; 1: over the rim)
export function reachU(B, v) {
    if (v >= needV(B, 1)) return 1;
    let a = 0, b = 1;
    for (let i = 0; i < 18; i++) { const m = (a + b) / 2; if (needV(B, m) <= v) a = m; else b = m; }
    return a;
}
// where a teleport, a SKIP or a dropped connection puts you in stage k: at the top of its bridge, facing its crater
export const checkpoint = (k) => { const I = islandOf(k); return { x: 0, y: I.E, z: I.zS + 3 }; };
// the angle from a to b, the short way round (-PI..PI)
export const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2; return d; };
// how far island I's exit platform reaches out from the rim, round from its bowl's middle towards (dx, dz): the full width round
// the far side's middle, narrowing to nothing at the crescent's tips, nothing elsewhere (the landing on the near side is a
// rectangle: onLanding)
export function deckW(I, dx, dz) {
    const n = Math.abs(angDiff(Math.atan2(dx, dz), I.aX));
    return n <= I.arcN ? W.deck * Math.min(1, (I.arcN - n) / (I.arcN * W.taperN)) : 0;
}
// the landing where the bridge comes in: as wide as the bridge and a little, from the rim out to the bridge's end
export const landHalf = W.hw + W.apron;
export function onLanding(I, x, z) { return z > I.cz && z <= I.zS + 0.01 && Math.abs(x - I.cx) <= landHalf && Math.hypot(x - I.cx, z - I.cz) >= I.R; }
// how a car drops in over the lip (shared/physics.js): which way round when nobody's steering, how far in it's aimed, how long
export const dropOf = (k) => { const I = ISL[k]; return I ? { side: I.side, dip: I.dip, t: W.dropT } : null; };
// inside stage k's funnel, on its wall (the server remembers it: the far crescent is only reached through there)
export const inBowl = (k, x, z) => { const I = ISL[k]; return !!I && Math.hypot(x - I.cx, z - I.cz) < I.R - 0.5; };
// on stage k's far crescent (the north one: the way out)
export function onExit(k, x, z, slack) {
    const I = ISL[k];
    if (!I) return false;
    const dx = x - I.cx, dz = z - I.cz, r = Math.hypot(dx, dz), sl = slack || 0;
    if (dz >= 0 || r < I.R + 1 - sl) return false;
    // (the crescent, or the road going on from it)
    return Math.abs(x) < W.hw + 1 || (r < I.Ro + 3 && Math.abs(angDiff(Math.atan2(dx, dz), I.aX)) <= I.arcN && deckW(I, dx, dz) > 2 - sl);
}
// The way out: a band of launch chevrons along the very top of the wall, under the far crescent. A car that gets up onto it (fast
// enough to hold the wall's top there, or with NITRO lit as it comes) is thrown up over the lip onto the crescent. exitU: how far
// up the wall the band starts (at least a car's width of it, on the small craters)
export const exitU = (I) => Math.min(I.eu, 1 - 2.4 / (I.R - I.r0));
// the band's reach round the rim each way from the far side's middle (a car may come round either way; not at the crescent's tips:
// only where it's wide enough to land on)
export const exitArc = (I) => I.arcN * (1 - W.taperN) - 3 / I.R;
export function onExitBand(k, x, z, u) {
    const I = ISL[k];
    if (!I || u < exitU(I)) return false;
    return Math.abs(angDiff(I.aX, Math.atan2(x - I.cx, z - I.cz))) < exitArc(I);
}
// thrown up and out from the band (car: shared/physics.js): over the lip, to come down a few studs onto the crescent, still going
// round it
export function launchOut(k, c) {
    const I = ISL[k], dx = c.x - I.cx, dz = c.z - I.cz, r = Math.hypot(dx, dz) || 1, ex = dx / r, ez = dz / r;
    const up = Math.max(1.2, I.E + 1.6 - c.y), vy = Math.sqrt(2 * CFG.grav * up), vr = (I.R + 5 - r) / (vy / CFG.grav * 1.2);
    const vt = (c.vx * ez - c.vz * ex) * 0.8;
    c.vx = ex * vr + ez * vt; c.vz = ez * vr - ex * vt; c.vy = vy;
    c.air = true; c.airT = 0;
}
// down stage k's hole (far enough that there's no way back)
export function inHole(k, x, y, z) { const I = ISL[k]; return !!I && y < I.E - I.H - I.td - 5 && Math.hypot(x - I.cx, z - I.cz) < I.r0; }
// stage k's north gate: where it stands
export const gateSpot = (k) => { const I = islandOf(k); return { x: 0, z: I.zN + 2, y: I.E }; };

// ----- the ground under (x, z): its height, its slope, how it curves, what it is. out: { y, gx, gz (slope), cr, ct (curvature
// across and round a bowl), ex, ez (out from the bowl's middle), grip, k (stage), u (how far up a wall, else -1), zone }.
// zone: 0 Base Camp, 1 a crater's throat (the foot of its wall, tipping over into the hole), 2 its wall, 3 one of its two crescents
// (or the road across them),
// 5 a bridge, 6 the summit, 7 nothing (the sky), 8 a crater's hole -----
export function surf(w, x, z, o) {
    o.gx = 0; o.gz = 0; o.cr = 0; o.ct = 0; o.ex = 0; o.ez = 1; o.grip = 1; o.u = -1;
    const k = stageAt(z);
    o.k = k;
    if (k < 0) { o.y = 0; o.zone = 0; return o; }
    if (k >= WALLS_N) { o.y = summit.y; o.zone = z > summit.z + summit.r ? 5 : 6; return o; }
    const I = ISL[k];
    if (z > I.zS) {
        const a = I.zB - W.land, b = I.zS + W.land;
        o.zone = 5;
        if (z >= a) o.y = I.base; else if (z <= b) o.y = I.E; else { o.gz = -(I.E - I.base) / (a - b); o.y = I.base + (I.E - I.base) * (a - z) / (a - b); }
        return o;
    }
    const dx = x - I.cx, dz = z - I.cz, r = Math.hypot(dx, dz);
    if (r >= I.R) { o.y = I.E; o.zone = Math.abs(x) <= W.hw + 1 || (dz > 0 ? Math.abs(dx) <= landHalf + 1 : r <= I.R + deckW(I, dx, dz) + 1) ? 3 : 7; return o; }
    if (r <= I.rh) { o.y = I.E - I.H - I.td - W.hole; o.zone = 8; return o; }
    if (r <= I.r0) {
        // the throat: steeper than tyres hold, and no lap to press them into it
        const st = I.td / (I.r0 - I.rh);
        o.y = I.E - I.H - I.td * (I.r0 - r) / (I.r0 - I.rh); o.zone = 1;
        o.ex = dx / r; o.ez = dz / r; o.gx = st * o.ex; o.gz = st * o.ez;
        return o;
    }
    const span = I.R - I.r0, u = (r - I.r0) / span, f1 = 2 * I.H * u / span;
    o.y = I.E - I.H + I.H * u * u; o.zone = 2; o.u = u;
    o.ex = dx / r; o.ez = dz / r; o.gx = f1 * o.ex; o.gz = f1 * o.ez;
    o.cr = 2 * I.H / (span * span); o.ct = f1 / r;
    const P = stagePlan(w, k);
    for (const b of P.slicks) if (u > b.u0 && u < b.u1) { o.grip = b.grip; break; }
    return o;
}
const SF = {};
export const heightAt = (w, x, z) => surf(w, x, z, SF).y;
// the edges: the plaza's walls, a bridge's rails, the landing's rails, a rim's kerb (there's no going over a rim but onto the
// landing or the exit platform), the exit platform's outer fence (open where the road goes on; it follows the crescent in to the
// rim at its tips), the summit's. lock: the stages whose north gate is open for this driver (anything with has(k); none given:
// every gate's open)
export function clampWorld(c, lock) {
    const P = W.plaza, k = stageAt(c.z);
    let hit = false;
    if (k < 0) {
        const m = 2.4;
        if (c.x < P.x0 + m) { c.x = P.x0 + m; if (c.vx < 0) c.vx = 0; hit = true; } else if (c.x > P.x1 - m) { c.x = P.x1 - m; if (c.vx > 0) c.vx = 0; hit = true; }
        if (c.z > P.z1 - m) { c.z = P.z1 - m; if (c.vz > 0) c.vz = 0; hit = true; }
        // the north edge, either side of the first bridge's mouth
        if (c.z < P.z0 + m && Math.abs(c.x) > W.hw - 1.6) { c.z = P.z0 + m; if (c.vz < 0) c.vz = 0; hit = true; }
        return hit;
    }
    if (k >= WALLS_N) {
        if (c.z > summit.z + summit.r - 2) { if (Math.abs(c.x) > W.hw - 1.6) { c.x = Math.sign(c.x) * (W.hw - 1.6); c.vx = 0; hit = true; } return hit; }
        const dx = c.x - summit.x, dz = c.z - summit.z, r = Math.hypot(dx, dz), m = summit.r - 2;
        if (r > m && !(dz > 0 && Math.abs(dx) < W.hw - 1.4)) { c.x = summit.x + dx / r * m; c.z = summit.z + dz / r * m; const vr = (c.vx * dx + c.vz * dz) / r; if (vr > 0) { c.vx -= vr * dx / r; c.vz -= vr * dz / r; } hit = true; }
        return hit;
    }
    const I = ISL[k];
    if (c.z > I.zS) { if (Math.abs(c.x) > W.hw - 1.6) { c.x = Math.sign(c.x) * (W.hw - 1.6); c.vx = 0; hit = true; } return hit; }
    const dx = c.x - I.cx, dz = c.z - I.cz, r = Math.hypot(dx, dz);
    if (r < I.R - W.kerb) return hit;
    // the landing: its side rails (and just inside its lip, nothing: that's the way in)
    if (dz > 0 && Math.abs(dx) < landHalf) {
        const m2 = landHalf - 2.2;
        if (Math.abs(dx) > m2 && r > I.R + 0.4) { c.x = I.cx + Math.sign(dx) * m2; if (c.vx * dx > 0) c.vx = 0; hit = true; }
        return hit;
    }
    // how far out you can be here: to the exit platform's fence, or (where there's none, and at its tips) the rim's kerb
    const dw = dz > 0 ? 0 : deckW(I, dx, dz), m = I.R + Math.max(dw - 2, -W.kerb);
    if (r > m) {
        // the road, out past the crescent to its bridge: between its rails; going on north, as far as its gate till that's open
        if (Math.abs(c.x) < W.hw - 1.4) {
            if (dz < 0 && lock && !lock.has(k) && c.z < I.zN + 5) { c.z = I.zN + 5; if (c.vz < 0) c.vz = 0; hit = true; }
            return hit;
        }
        if (Math.abs(c.x) < W.hw + 1.5 && r > m + 1.5) { c.x = Math.sign(c.x) * (W.hw - 1.6); c.vx = 0; return true; }
        c.x = I.cx + dx / r * m; c.z = I.cz + dz / r * m;
        const vr = (c.vx * dx + c.vz * dz) / r;
        if (vr > 0) { c.vx -= vr * dx / r; c.vz -= vr * dz / r; }
        hit = true;
    }
    return hit;
}

// is (x, z) somewhere a car can be at all (the server's guard; slack: studs of give)
export function inWorld(x, z, slack) {
    const s = slack || 0, P = W.plaza, k = stageAt(z);
    if (k < 0) return x > P.x0 - s && x < P.x1 + s && z < P.z1 + s;
    if (k >= WALLS_N) return z > summit.z + summit.r ? Math.abs(x) < W.hw + s : Math.hypot(x - summit.x, z - summit.z) < summit.r + s;
    const I = ISL[k];
    if (z > I.zS) return Math.abs(x) < W.hw + s;
    const r = Math.hypot(x - I.cx, z - I.cz);
    return r < I.R + s || Math.abs(x) < W.hw + s || (z > I.cz ? Math.abs(x - I.cx) < landHalf + s : r < I.R + deckW(I, x - I.cx, z - I.cz) + s);
}

// ----- what's in each crater: the same for everyone, from the stage's seed -----
// pads: boost chevrons on the wall (a: where round the bowl, u: how far up); rocks: boulders rolling down the wall, each in its own
// lane (a), over and over on the server's clock; slicks: a band of the wall with less grip (oil, glass, ice): your tyres need more
// speed there; sweeper: an arm turning round over the hole, sweeping the foot of the wall; geysers: vents low on the wall that throw
// you up it
// flags: 1 pads, 2 rocks, 4 slick, 8 sweeper, 16 geysers, 32 a second slick band
const KIND = [0, 1, 3, 7, 11, 23, 31, 31, 63, 63, 63, 63];
export const STAGE_TIPS = {
    1: ['Boost Chevrons', 'drive over the chevrons on the wall for a burst of speed'],
    2: ['Boulders', 'they roll down the wall in their lanes: cross behind one'],
    4: ['Slick Band', 'the shiny band has less grip: cross it fast, or NITRO through'],
    8: ['Sweeper', 'an arm sweeps the foot of the wall: ride above it'],
    16: ['Geysers', 'a vent about to blow glows: ride it up the wall'],
};
export const ROCK = { r: 4.2, hit: 5.6 };
export const SWEEP = { h: 2.6, t: 2.2 };
export const GEYSER = { r: 5.5, warn: 1.1, blow: 0.5, kick: 44 };
export const PAD = { hw: 5, hd: 6 };
const planCache = new Map();
export function stagePlan(w, k) {
    const key = w * 100 + k;
    if (planCache.has(key)) return planCache.get(key);
    const r = rngFrom(7001 + w * 977 + k * 131), flags = KIND[k] | 0, I = ISL[k], d = Math.min(1, k / (WALLS_N - 1) + 0.08 * w);
    const plan = { w, k, flags, pads: [], rocks: [], slicks: [], sweeper: null, geysers: [] };
    // (a: 0 is south; nothing stands right where the drop lands you, either way round)
    const ang = (i, n) => 0.45 + (i + 0.15 + r() * 0.7) * ((Math.PI * 2 - 0.9) / n);
    if (flags & 1) { const n = 3 + Math.round(d * 4); for (let i = 0; i < n; i++) plan.pads.push({ a: ang(i, n), u: 0.28 + r() * 0.42 }); }
    if (flags & 2) {
        const n = 2 + Math.round(d * 5) + w;
        for (let i = 0; i < n; i++) plan.rocks.push({ a: ang(i, n), period: Math.max(2.6, 4.6 - 1.3 * d - 0.2 * w + r() * 1.3), phase: r() * 6, roll: 1.5 + I.R / 90 });
    }
    // (a band's grip is worked out from how hard it should be to hold a lap in it: so much of what the rim itself wants)
    const slick = (u0, u1, hard) => {
        const want = needV(I, 1) * hard;
        let a = 0.3, b = 1;
        for (let i = 0; i < 16; i++) { const m = (a + b) / 2; if (needV(I, u1, m) > want) a = m; else b = m; }
        plan.slicks.push({ u0, u1, grip: Math.min(0.9, b) });
    };
    if (flags & 4) slick(0.44, 0.56 + 0.06 * d + 0.02 * w, Math.min(0.92, 0.78 + 0.08 * d + 0.03 * w));
    if (flags & 32) slick(0.72, 0.8 + 0.02 * d + 0.015 * w, Math.min(0.96, 0.9 + 0.03 * d + 0.015 * w));
    // (the arm reaches from the middle of the hole out over the wall's foot, up to wall fraction su; its tip moves no faster than a
    // car at half this crater's speed)
    if (flags & 8) { const su = 0.26, len = I.r0 + (I.R - I.r0) * su; plan.sweeper = { len, su, w: Math.min(0.55 + d * 0.35 + 0.08 * w, needV(I, 1) * 0.5 / len) * (r() < 0.5 ? 1 : -1), phase: r() * 6.283, bars: d > 0.85 || w > 2 ? 3 : d > 0.45 || w > 0 ? 2 : 1 }; }
    if (flags & 16) { const n = 4 + Math.round(d * 3); for (let i = 0; i < n; i++) { const a = ang(i, n), u = 0.14 + r() * 0.24, p = wallPoint(k, a, u); plan.geysers.push({ a, u, x: p.x, y: p.y, z: p.z, period: 4.2 + r() * 1.6, phase: r() * 6 }); } }
    planCache.set(key, plan);
    return plan;
}
// a boulder at server time t (seconds): how far down its lane it is (u: 1 the rim .. 0 the hole's edge), or -1 while it's gone
export function rockU(o, t) { const p = ((t + o.phase) % o.period + o.period) % o.period; return p < o.roll ? 1 - p / o.roll : -1; }
// a sweeper's arm: a straight bar from a hub in the middle of the hole, tilted up to lie along the wall's foot. y: the hub's
// height; tilt: how far up it tilts (radians); long: its length
export const sweepArm = (I, o) => { const sl = I.S * o.su / 2; return { y: I.E - I.H - I.r0 * sl + 0.5, tilt: Math.atan(sl), long: o.len * Math.hypot(1, sl) }; };
// the sweeper's angle at server time t
export const sweepAngle = (o, t) => o.phase + o.w * t;
// a geyser at server time t: 0 asleep, 0..1 warming up (it glows), 2 blowing
export function geyserAt(o, t) { const p = ((t + o.phase) % o.period + o.period) % o.period, a = o.period - GEYSER.warn - GEYSER.blow; return p < a ? 0 : p < a + GEYSER.warn ? Math.max(0.001, (p - a) / GEYSER.warn) : 2; }
// a point on stage k's wall: angle a (0 south, where you come in), wall fraction u
export function wallPoint(k, a, u) { const I = ISL[k], r = I.r0 + (I.R - I.r0) * u; return { x: I.cx + Math.sin(a) * r, z: I.cz + Math.cos(a) * r, y: I.E - I.H + I.H * u * u, r }; }

// ----- what stands at Base Camp: a big open square. From the spawn you look north to the first bridge; the dyno rollers in one long
// row across the north-west (their signs facing you), the Car Dealer and the Tuning garage in the north-east, the Eggs in an arc
// down the east side, the Worlds portal and the Eruption gate in the south-west, a leaderboard on the west, east and south edges -----
export const tongueBar = { x: 56, z: 60, r: 15 };       // the Car Dealer
export const upgradeShed = { x: 96, z: 60, r: 15 };     // the Tuning garage
export const worldsPortal = { x: -76, z: 134, r: 9 };
export const playGate = { x: -34, z: 134, r: 10 };
// (a board on a side, x not 0, stands along z facing the square; the one at x 0 faces north)
export const boards = [{ x: -120, z: 104 }, { x: 120, z: 104 }, { x: 0, z: 148 }];
const POST_SPOTS = [];
for (let i = 0; i < POSTS.length; i++) POST_SPOTS.push([-26 - i * 11.4, 66]);
export const postSpot = (i) => ({ x: POST_SPOTS[i][0], z: POST_SPOTS[i][1] });
export const BELT = { w: 7.6, l: 11 };
// the dyno you're parked on, or -1
export function postAt(x, z, r) { for (let i = 0; i < POSTS.length; i++) { const s = POST_SPOTS[i]; if (Math.abs(s[0] - x) < (r ?? BELT.w / 2 + 0.4) && Math.abs(s[1] - z) < BELT.l / 2 + 0.6) return i; } return -1; }
// are you near this dyno? (not "which is nearest": near enough to two, you're still near the one you're on)
export const nearPost = (i, x, z, r) => { const s = POST_SPOTS[i]; return !!s && (s[0] - x) ** 2 + (s[1] - z) ** 2 < r * r; };
// the Eggs: an arc round (84, 112), opening towards the spawn
const JB_SPOTS = [];
for (let i = 0; i < JAWBREAKERS.length; i++) { const a = (-70 + i * 20) * Math.PI / 180; JB_SPOTS.push([+(84 - 38 * Math.cos(a)).toFixed(2), +(112 + 38 * Math.sin(a)).toFixed(2)]); }
export const jbSpot = (i) => ({ x: JB_SPOTS[i][0], z: JB_SPOTS[i][1] });
export const JB_R = 8;
export const giftSpot = { x: -18, z: 94 };

// ----- Base Camp's boxes (what a car bumps into): { min: [x, z], max: [x, z] } -----
let hubBoxes = null;
export function hubSolids() {
    if (hubBoxes) return hubBoxes;
    const L = [], box = (x, z, sx, sz) => L.push({ min: [x - sx / 2, z - sz / 2], max: [x + sx / 2, z + sz / 2] });
    for (const q of [upgradeShed, tongueBar]) box(q.x, q.z - 6, 26, 12);
    for (const s of [-1, 1]) { box(worldsPortal.x + s * 9, worldsPortal.z, 3, 3); box(playGate.x + s * 10, playGate.z, 3, 3); }
    for (const b of boards) { if (b.x) box(b.x, b.z, 2, 24); else box(b.x, b.z, 24, 2); }
    // a dyno's console at its north end
    for (const s of POST_SPOTS) box(s[0], s[1] - BELT.l / 2 - 1.6, BELT.w + 1, 1.6);
    for (const s of JB_SPOTS) box(s[0], s[1], 4, 4);
    box(giftSpot.x, giftSpot.z, 5, 4);
    hubBoxes = L;
    return L;
}
// a world's physics for a car (shared/physics.js stepCar): the ground, the edges, the boxes, the drop over a crater's lip. lock: see
// clampWorld
const worlds = new Map();
export function worldFor(w, lock) {
    if (lock) return { w, surf: (x, z, o) => surf(w, x, z, o), clamp: (c) => clampWorld(c, lock), boxes: hubSolids(), drop: dropOf };
    let T = worlds.get(w);
    if (!T) { T = { w, surf: (x, z, o) => surf(w, x, z, o), clamp: (c) => clampWorld(c, null), boxes: hubSolids(), drop: dropOf }; worlds.set(w, T); }
    return T;
}
