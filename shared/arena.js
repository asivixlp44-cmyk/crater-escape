// Eruption: one race's volcano, worked out from its seed on the server and on every player's screen. Six buggies start on the
// crater's floor. Everyone's engine is the same and gets stronger every second, so the whole field climbs the wall together: the
// race is the line you hold, the boost chevrons you take and the boulders you dodge. The lava wakes a few seconds after the gun
// and rises faster and faster: whoever it reaches is out. First over the rim wins.
import { rngFrom, matchInfo, WORLDS, CFG } from './config.js';

export const ARENA = { deck: 16, rimSlope: 2.8 };
const needOf = (B, u, mu) => { const s = B.S * u; return s <= mu ? 0 : Math.sqrt(CFG.grav * (B.r0 + (B.R - B.r0) * u) * (s - mu) / (1 + s * mu)); };
// the speed the tyres need to hold a lap at wall fraction u of the volcano
export const arenaNeed = (plan, u, mu) => needOf(plan.B, u, mu ?? CFG.mu);
// how far up the wall a speed v holds (0..1; 1: over the rim)
export function arenaReach(plan, v) {
    if (v >= needOf(plan.B, 1, CFG.mu)) return 1;
    let a = 0, b = 1;
    for (let i = 0; i < 18; i++) { const m = (a + b) / 2; if (needOf(plan.B, m, CFG.mu) <= v) a = m; else b = m; }
    return a;
}
// everyone's top speed, secs after the gun (power: a racer's own little edge)
export const topAt = (D, secs, power) => (D.v0 + D.vr * Math.max(0, secs)) * (power || 1);
// the lava: how high it stands, secs after the gun (0 the floor .. 1 the rim, and on over it)
export function surgeAt(D, secs) {
    const t = Math.max(0, secs - D.surgeAt);
    return Math.min(1.08, D.surgeV * t + 0.5 * D.surgeA * t * t);
}
// its height in the world (the rim's deck is y 0, the floor -H)
export const surgeY = (plan, secs) => -plan.B.H + surgeAt(plan.D, secs) * plan.B.H;
// a boulder at server time t (seconds): how far down its lane it is (1 the rim .. 0 the floor's edge), or -1 while it's gone
export function arenaRockU(o, t) { const p = ((t + o.phase) % o.period + o.period) % o.period; return p < o.roll ? 1 - p / o.roll : -1; }

export function arenaPlan(seed, lv) {
    const r = rngFrom(seed), D = matchInfo(lv), S = ARENA.rimSlope;
    const R = Math.round(D.vEsc * D.vEsc / (CFG.grav * (S - CFG.mu) / (1 + S * CFG.mu))), r0 = Math.round(R * 0.4), H = Math.round(S * (R - r0) / 2);
    const B = { S: 2 * H / (R - r0), R, r0, H, Ro: R + ARENA.deck };
    const plan = { seed, lv, D, B, n: D.tier + 1, secs: D.secs, pads: [], rocks: [], slicks: [] };
    for (let i = 0; i < D.pads; i++) plan.pads.push({ a: (i + 0.2 + r() * 0.6) * (Math.PI * 2 / D.pads), u: 0.34 + (i % 3) * 0.17 + r() * 0.1 });
    for (let i = 0; i < D.rocks; i++) plan.rocks.push({ a: (i + 0.2 + r() * 0.6) * (Math.PI * 2 / D.rocks), period: 3.6 + r() * 1.4, phase: r() * 6, roll: 1.6 + R / 90 });
    if (D.slick) {
        // a slick band as hard to hold as six tenths of the rim (the lava is at its foot a few seconds after the engines can cross it)
        const u0 = 0.56, u1 = 0.66, want = needOf(B, 1, CFG.mu) * 0.6;
        let a = 0.3, b = 1;
        for (let i = 0; i < 16; i++) { const m = (a + b) / 2; if (needOf(B, u1, m) > want) a = m; else b = m; }
        plan.slicks.push({ u0, u1, grip: Math.min(0.9, b) });
    }
    return plan;
}
// where a racer starts: on the floor, round its middle, facing along the lap
export function startSpot(spot, plan) {
    const a = spot * Math.PI * 2 / CFG.matchSpots, q = plan.B.r0 * 0.62;
    return { x: Math.sin(a) * q, y: -plan.B.H, z: Math.cos(a) * q, ry: a + Math.PI / 2 };
}
// a point on the wall: angle a, wall fraction u
export function arenaPoint(plan, a, u) { const B = plan.B, q = B.r0 + (B.R - B.r0) * u; return { x: Math.sin(a) * q, z: Math.cos(a) * q, y: -B.H + B.H * u * u, r: q }; }
// how far up the volcano a height is (0..1)
export const arenaPct = (plan, y) => Math.max(0, Math.min(1, (y + plan.B.H) / plan.B.H));
// the volcano's physics for a car (shared/physics.js stepCar): its bowl, the deck round its rim, the fence
export function arenaWorld(plan) {
    const B = plan.B, span = B.R - B.r0;
    return {
        boxes: null,
        surf(x, z, o) {
            o.gx = 0; o.gz = 0; o.cr = 0; o.ct = 0; o.ex = 0; o.ez = 1; o.grip = 1; o.u = -1; o.k = 0;
            const q = Math.hypot(x, z);
            if (q >= B.R) { o.y = 0; o.zone = 3; return o; }
            if (q <= B.r0) { o.y = -B.H; o.zone = 1; return o; }
            const u = (q - B.r0) / span, f1 = 2 * B.H * u / span;
            o.y = -B.H + B.H * u * u; o.zone = 2; o.u = u;
            o.ex = x / q; o.ez = z / q; o.gx = f1 * o.ex; o.gz = f1 * o.ez; o.cr = 2 * B.H / (span * span); o.ct = f1 / q;
            for (const b of plan.slicks) if (u > b.u0 && u < b.u1) { o.grip = b.grip; break; }
            return o;
        },
        clamp(c) {
            const q = Math.hypot(c.x, c.z), m = B.Ro - 2;
            if (q <= m) return false;
            c.x *= m / q; c.z *= m / q;
            const vr = (c.vx * c.x + c.vz * c.z) / m;
            if (vr > 0) { c.vx -= vr * c.x / m; c.vz -= vr * c.z / m; }
            return true;
        },
    };
}
export { WORLDS };
