// A world on screen: Base Camp (a floating square of turf with the dyno rollers, the Car Dealer, the Tuning garage, the Eggs, the
// portals, the leaderboards) and the chain of crater islands going off to the north, each a rock with a funnel in it: its wall in
// bands of rock strata, a hole in its middle; on its rim the landing where the bridge comes in (planks right up to the lip: the way in),
// the exit platform round the far side (a crescent of turf, the gate out in its middle), and between them a kerb with a fence on it.
// Everything that never moves is merged per island into a few batches (geo.js batchKits): each island is culled on its own, and all
// of them in view are one draw per material. What moves in the craters (boulders, sweepers, geysers, boost chevrons, your reach
// line) is stagefx.js.
import { T, V3, scene, prompts, texFrom, fitFont } from './engine.js';
import { Kit, rng, batchKits, glowVCMaterial } from './geo.js';
import { Signs, big, GOLD, LIME, WHITE, AQUA, PINK } from './signs.js';
import { CU } from './clock.js';
import { WORLDS, WALLS_N, POSTS, postLabel, JAWBREAKERS, recLevel, stageName, padWins, fmt, CARS } from '../../shared/config.js';
import { W, islandOf, summit, endPortal, tongueBar, upgradeShed, worldsPortal, playGate, boards, postSpot, BELT, jbSpot, JB_R, giftSpot, stagePlan, worldFor, deckW, landHalf, sweepArm } from '../../shared/world.js';
import { buildStageFx } from './stagefx.js';
import { carShape, wheelGeometry } from './cars.js';

export const shade = (c, k) => new T.Color(c).multiplyScalar(k).getHex();
export const mixC = (a, b, k) => new T.Color(a).lerp(new T.Color(b), k).getHex();
// each world's own look on top of its colours (shared/config.js WORLDS): what a slick band is made of, its trees, its lights
const LOOK = {
    meadow: { slick: 0x5a3e2a, road: 0xe8d8a8, tree: 0x3fae3a, tree2: 0x2f8a34, trunk: 0x8a5a36, wood: 0xb07a46, wood2: 0x8a5a30, lamp: 0xfff2b0, prop: 'tree' },
    ember: { slick: 0x16141c, road: 0x8a7468, tree: 0x4a3a3a, tree2: 0x2e2426, trunk: 0x2a2224, wood: 0x6a5048, wood2: 0x4a3832, lamp: 0xffb04a, prop: 'ember' },
    frost: { slick: 0xb8f0ff, road: 0xc8dcf0, tree: 0xf4fbff, tree2: 0x3f9a7a, trunk: 0x6a4a36, wood: 0x8aa4c0, wood2: 0x5a7a9a, lamp: 0xc8f4ff, prop: 'pine' },
    lunar: { slick: 0x2c2a56, road: 0x8a8aa0, tree: 0x7af4ff, tree2: 0xff5ac0, trunk: 0x5a5a70, wood: 0x6a6a84, wood2: 0x4a4a62, lamp: 0x7af4ff, prop: 'crystal' },
};
export const lookOf = (w) => { const Wd = WORLDS[w] || WORLDS[0]; return { ...Wd, ...(LOOK[Wd.id] || LOOK.meadow) }; };
// one material for everything that stands still (and the cars' bodies): vertex colours, glowing parts unlit
let propMat = null;
export function propMaterial() { return propMat || (propMat = glowVCMaterial(CU.uNow)); }

// ----- shapes -----
const tc = new T.Color();
// a point on a circle round (cx, cz): a 0 is south (+z), going round by east
const P3 = (cx, cz, a, r, y) => [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r];
// a quad with a normal at each corner (a smooth surface), wound to face those normals; colours ca (a, b) and cb (c, d)
function quadS(K, A, B, C, D, nA, nB, nC, nD, ca, cb, glow) {
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2];
    const flip = (uy * vz - uz * vy) * nA[0] + (uz * vx - ux * vz) * nA[1] + (ux * vy - uy * vx) * nA[2] < 0;
    const V = flip ? [[A, nA, 0], [D, nD, 1], [C, nC, 1], [A, nA, 0], [C, nC, 1], [B, nB, 0]] : [[A, nA, 0], [B, nB, 0], [C, nC, 1], [A, nA, 0], [C, nC, 1], [D, nD, 1]];
    tc.set(ca); const r0 = tc.r, g0 = tc.g, b0 = tc.b;
    tc.set(cb ?? ca);
    for (const [p, n, far] of V) {
        K.pos.push(p[0], p[1], p[2]); K.nor.push(n[0], n[1], n[2]);
        if (far) K.col.push(tc.r, tc.g, tc.b); else K.col.push(r0, g0, b0);
        K.uv.push(0, 0);
        if (K.glow) K.glow.push(glow || 0);
    }
}
// a band round a circle between two rings (radius, height), M sides (from side i0 to i1): smooth when given the rings' normals
// (n0, n1: [out from the middle, up]), else flat faces pointing `want` ('up', 'out' or 'in'); col(i): a side's colour, or null to leave it out
function band(K, cx, cz, r0, y0, r1, y1, M, col, o) {
    o = o || {};
    const i0 = o.i0 ?? 0, i1 = o.i1 ?? M, off = o.off || 0;
    for (let i = i0; i < i1; i++) {
        const c = col(i);
        if (c === null) continue;
        const a0 = (i + off) / M * Math.PI * 2, a1 = (i + 1 + off) / M * Math.PI * 2;
        const k0 = o.wob ? o.wob[i % M] : 1, k1 = o.wob ? o.wob[(i + 1) % M] : 1, j0 = o.wob2 ? o.wob2[i % M] : k0, j1 = o.wob2 ? o.wob2[(i + 1) % M] : k1;
        const A = P3(cx, cz, a0, r0 * k0, y0), B = P3(cx, cz, a1, r0 * k1, y0), C = P3(cx, cz, a1, r1 * j1, y1), D = P3(cx, cz, a0, r1 * j0, y1);
        if (o.n0) {
            const s0 = Math.sin(a0), c0 = Math.cos(a0), s1 = Math.sin(a1), c1 = Math.cos(a1);
            quadS(K, A, B, C, D, [o.n0[0] * s0, o.n0[1], o.n0[0] * c0], [o.n0[0] * s1, o.n0[1], o.n0[0] * c1], [o.n1[0] * s1, o.n1[1], o.n1[0] * c1], [o.n1[0] * s0, o.n1[1], o.n1[0] * c0], c, o.col2 ? o.col2(i) : c, o.glow);
        } else {
            const am = (a0 + a1) / 2, want = o.want === 'up' ? [0, 1, 0] : o.want === 'in' ? [-Math.sin(am), 0.3, -Math.cos(am)] : o.want === 'down' ? [Math.sin(am) * 0.4, -1, Math.cos(am) * 0.4] : [Math.sin(am), 0.15, Math.cos(am)];
            K.faceTo(A, B, C, D, want, c, { glow: o.glow, c2: o.col2 ? o.col2(i) : undefined });
        }
    }
}
// a band round a circle from angle a0 to a1 (0 south, by east), n faces, between radius ra at height ya and rb at yb (a radius may be a
// function of the angle), facing want ('up', 'down', 'in' or 'out'); col: a colour, or col(i, a) per face (null: leave it out)
function arcBand(K, cx, cz, ra, ya, rb, yb, a0, a1, n, col, want) {
    const rA = typeof ra === 'function' ? ra : () => ra, rB = typeof rb === 'function' ? rb : () => rb;
    for (let i = 0; i < n; i++) {
        const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n, am = (t0 + t1) / 2, c = typeof col === 'function' ? col(i, am) : col;
        if (c === null) continue;
        const w = want === 'up' ? [0, 1, 0] : want === 'down' ? [0, -1, 0] : want === 'in' ? [-Math.sin(am), 0.3, -Math.cos(am)] : [Math.sin(am), 0.15, Math.cos(am)];
        K.faceTo(P3(cx, cz, t0, rA(t0), ya), P3(cx, cz, t1, rA(t1), ya), P3(cx, cz, t1, rB(t1), yb), P3(cx, cz, t0, rB(t0), yb), w, c);
    }
}
// a many-sided solid of rings from the bottom up, each [radius, height, colour], flat-shaded, its top closed (an egg, a lamp's
// shade, a rock, a tree's crown)
export function lathe(K, x, z, rings, sides, o) {
    o = o || {};
    for (let r = 0; r < rings.length - 1; r++) band(K, x, z, rings[r][0], rings[r][1], rings[r + 1][0], rings[r + 1][1], sides, () => rings[r + 1][2] ?? rings[r][2], { want: 'out', glow: o.glow, wob: o.wob, off: o.off });
    const top = rings[rings.length - 1];
    if (top[0] > 0.01) band(K, x, z, top[0], top[1], 0.001, top[1], sides, () => top[2], { want: 'up', glow: o.glow, wob: o.wob, off: o.off });
}
// a tree, a rock, a crystal: what stands on a deck (each world its own)
function prop(K, kind, x, y, z, s, L, R) {
    if (kind === 'tree') {
        K.box(x, y + 1.6 * s, z, 0.9 * s, 3.2 * s, 0.9 * s, L.trunk);
        const g = R() < 0.5 ? L.tree : L.tree2;
        lathe(K, x, z, [[1.2 * s, y + 2.6 * s, g], [3.1 * s, y + 3.8 * s, g], [3.3 * s, y + 5.6 * s, mixC(g, 0xffffff, 0.08)], [2.2 * s, y + 7.4 * s, mixC(g, 0xffffff, 0.16)], [0.6 * s, y + 8.4 * s, mixC(g, 0xffffff, 0.2)]], 7, { off: R() });
    } else if (kind === 'pine') {
        K.box(x, y + 1.2 * s, z, 0.8 * s, 2.4 * s, 0.8 * s, L.trunk);
        for (let i = 0; i < 3; i++) lathe(K, x, z, [[(3.0 - i * 0.7) * s, y + (2 + i * 2.1) * s, L.tree2], [(1.2 - i * 0.3) * s, y + (4.2 + i * 2.1) * s, L.tree], [0.05, y + (5 + i * 2.1) * s, L.tree]], 6, { off: i * 0.3 });
    } else if (kind === 'ember') {
        // a charred trunk with bare branches, a glowing ember crystal at its foot
        K.box(x, y + 2.4 * s, z, 0.8 * s, 4.8 * s, 0.8 * s, L.trunk);
        K.box(x + 0.9 * s, y + 4.2 * s, z, 2.0 * s, 0.4 * s, 0.4 * s, L.trunk, { rz: 0.6 }); K.box(x - 0.8 * s, y + 3.4 * s, z, 1.8 * s, 0.4 * s, 0.4 * s, L.trunk, { rz: -0.7 });
        K.box(x + 1.6 * s, y + 0.9 * s, z + 0.8 * s, 1.0 * s, 1.8 * s, 1.0 * s, 0xff7a1a, { glow: 1, rx: 0.3, rz: 0.4 });
    } else if (kind === 'crystal') {
        const c = R() < 0.5 ? L.tree : L.tree2;
        K.box(x, y + 2.2 * s, z, 1.2 * s, 4.4 * s, 1.2 * s, c, { glow: 1, rz: 0.18, ry: R() * 3 });
        K.box(x + 1.1 * s, y + 1.2 * s, z + 0.4 * s, 0.8 * s, 2.4 * s, 0.8 * s, c, { glow: 1, rz: -0.45 });
        K.box(x - 0.9 * s, y + 0.9 * s, z - 0.5 * s, 0.7 * s, 1.8 * s, 0.7 * s, mixC(c, 0xffffff, 0.4), { glow: 1, rz: 0.5 });
    } else {
        // a rock
        const c = R() < 0.5 ? L.rock : L.rock2;
        K.box(x, y + 0.9 * s, z, 2.6 * s, 1.8 * s, 2.2 * s, c, { ry: R() * 3, rz: 0.2, soft: true });
        K.box(x + 1.2 * s, y + 0.5 * s, z + 0.6 * s, 1.4 * s, 1.0 * s, 1.3 * s, shade(c, 0.9), { ry: R() * 3, soft: true });
    }
}

// ----- an island: its crater, its deck, its rock, its bridge and its gate -----
// S: the big shapes (they throw shadows); D: the small things (drawn close up only); R: its random numbers
// hole: { rh, td, depth, c1, c2, glow }: a crater's (the foot of its wall tips over into it: the throat, in warning stripes; then a
// dark shaft, a glow far down it); none: a flat floor (a race's volcano)
export function bowlKit(S, cx, cz, B, yRim, strata, floorC, slickC, trim, plan, low, hole) {
    const M = Math.max(low ? 32 : 40, Math.min(low ? 72 : 112, Math.round(Math.PI * 2 * B.R / (low ? 11 : 7)))), span = B.R - B.r0, y0 = yRim - B.H;
    if (hole) {
        const yT = y0 - hole.td, yB = yT - hole.depth;
        band(S, cx, cz, B.r0 - 0.9, y0 - hole.td * 0.9 / (B.r0 - hole.rh), B.r0, y0, M, () => trim, { want: 'in' });
        band(S, cx, cz, hole.rh, yT, B.r0 - 0.9, y0 - hole.td * 0.9 / (B.r0 - hole.rh), M, (i) => ((i >> 1) & 1 ? hole.c1 : hole.c2), { want: 'in' });
        band(S, cx, cz, hole.rh * 0.97, yT - hole.depth * 0.35, hole.rh, yT, M, () => shade(hole.c2, 0.7), { want: 'in' });
        band(S, cx, cz, hole.rh * 0.94, yB, hole.rh * 0.97, yT - hole.depth * 0.35, M, () => shade(hole.c2, 0.4), { want: 'in' });
        band(S, cx, cz, 0.001, yB, hole.rh * 0.94, yB, low ? 12 : 20, () => hole.glow, { want: 'up', glow: 1 });
    } else {
        // the floor: a dish of two rings, a painted ring at its edge
        const fc2 = shade(floorC, 0.93);
        band(S, cx, cz, 0.001, y0, B.r0 * 0.5 - 0.6, y0, M, () => floorC, { want: 'up' });
        band(S, cx, cz, B.r0 * 0.5 - 0.6, y0, B.r0 * 0.5 + 0.6, y0, M, () => fc2, { want: 'up' });
        band(S, cx, cz, B.r0 * 0.5 + 0.6, y0, B.r0 - 1.2, y0, M, () => floorC, { want: 'up' });
        band(S, cx, cz, B.r0 - 1.2, y0, B.r0, y0, M, () => trim, { want: 'up' });
    }
    // the wall: rings from the floor's edge up to the rim, the strata in bands, a slick band its own colour
    const NU = low ? 11 : 17, us = [];
    for (let j = 0; j <= NU; j++) us.push(j / NU);
    for (const b of plan ? plan.slicks : []) us.push(b.u0, b.u1);
    us.sort((a, b) => a - b);
    const U = us.filter((u, i) => i === 0 || u - us[i - 1] > 0.012);
    const nrm = (u) => { const f1 = B.S * u, l = Math.hypot(f1, 1); return [-f1 / l, 1 / l]; };
    for (let j = 0; j < U.length - 1; j++) {
        const u0 = U[j], u1 = U[j + 1], um = (u0 + u1) / 2, sl = plan && plan.slicks.find((b) => um > b.u0 && um < b.u1);
        const bi = Math.min(strata.length - 1, Math.floor(um * strata.length)), base = sl ? slickC : shade(strata[bi], j % 2 ? 0.95 : 1.03);
        band(S, cx, cz, B.r0 + span * u0, y0 + B.H * u0 * u0, B.r0 + span * u1, y0 + B.H * u1 * u1, M, () => base, { n0: nrm(u0), n1: nrm(u1) });
    }
    return M;
}
// Bw: the funnel itself (a kit of its own: it throws no shadow, only takes them)
function islandKits(S, D, k, L, R, low, signs, Bw) {
    const I = islandOf(k), plan = stagePlan(L.w, k), cx = I.cx, cz = I.cz, E = I.E;
    const M = bowlKit(Bw || S, cx, cz, I, E, L.strata, L.floorC, L.slick, L.trim, plan, low, { rh: I.rh, td: I.td, depth: W.hole, c1: L.hazard2, c2: 0x1c1e28, glow: shade(L.hazard, 0.75) });
    const TAU = Math.PI * 2, landA = Math.asin(Math.min(1, landHalf / I.R)), aN = I.arcN, dwN = (a) => deckW(I, Math.sin(a), Math.cos(a));
    const nArc = (a0, a1, per) => Math.max(2, Math.round(Math.abs(a1 - a0) * I.R / per));
    // ----- the kerb, both sides between the landing and the exit platform: its inside face a yellow band, its top, its outside face
    // down onto the rock (there's no way round: only through) -----
    for (const [a0, a1] of [[landA, Math.PI - aN], [Math.PI + aN, TAU - landA]]) {
        const n = nArc(a0, a1, low ? 9 : 6);
        arcBand(S, cx, cz, I.R, E - 0.3, I.R, E + 1.0, a0, a1, n, L.hazard2, 'in');
        arcBand(S, cx, cz, I.R, E + 1.0, I.R + 1.8, E + 1.0, a0, a1, n, L.trim, 'up');
        arcBand(S, cx, cz, I.R + 1.8, E + 1.0, I.R + 2.2, E - 1.6, a0, a1, n, shade(L.rock, 0.95), 'out');
    }
    // ----- the exit platform: a painted edge along the rim, its turf, its outside face and its underside -----
    {
        const a0 = Math.PI - aN, a1 = Math.PI + aN, n = nArc(a0, a1, low ? 7 : 4.5), edge = (a) => I.R + Math.min(1.6, dwN(a)), out = (a) => I.R + Math.max(0.01, dwN(a));
        arcBand(S, cx, cz, I.R, E, edge, E, a0, a1, n, L.trim, 'up');
        arcBand(S, cx, cz, edge, E, out, E, a0, a1, n, L.deck, 'up');
        arcBand(S, cx, cz, out, E, (a) => out(a) + 0.6, E - 1.6, a0, a1, n, shade(L.deck2, 0.82), 'out');
        arcBand(S, cx, cz, I.R, E - 1.6, (a) => out(a) + 0.6, E - 1.6, a0, a1, n, shade(L.rock2, 0.7), 'down');
    }
    // ----- the landing: planks from the lip out to the bridge's end (a painted edge along the lip), its underside, kerbs and rails
    // along its sides, its front either side of the bridge; chevrons by the lip pointing in -----
    {
        const hw = landHalf, n = low ? 6 : 10, zAt = (x, rr) => cz + Math.sqrt(Math.max(0, rr * rr - (x - cx) * (x - cx)));
        for (let i = 0; i < n; i++) {
            const x0 = -hw + 2 * hw * i / n, x1 = -hw + 2 * hw * (i + 1) / n;
            S.faceTo([x0, E, zAt(x0, I.R)], [x1, E, zAt(x1, I.R)], [x1, E, zAt(x1, I.R + 1.6)], [x0, E, zAt(x0, I.R + 1.6)], [0, 1, 0], L.trim);
            S.faceTo([x0, E, zAt(x0, I.R + 1.6)], [x1, E, zAt(x1, I.R + 1.6)], [x1, E, I.zS], [x0, E, I.zS], [0, 1, 0], L.wood);
            S.faceTo([x0, E - 1.2, zAt(x0, I.R)], [x1, E - 1.2, zAt(x1, I.R)], [x1, E - 1.2, I.zS], [x0, E - 1.2, I.zS], [0, -1, 0], shade(L.wood2, 0.7));
        }
        for (const sd of [-1, 1]) {
            const x = sd * hw, zr = zAt(x, I.R), len = I.zS - zr, nq = Math.max(1, Math.round(len / 7));
            S.faceTo([x, E - 1.2, zr], [x, E - 1.2, I.zS], [x, E, I.zS], [x, E, zr], [sd, 0, 0], L.wood2);
            S.faceTo([sd * (hw - 0.8), E + 0.5, zr], [x, E + 0.5, zr], [x, E + 0.5, I.zS], [sd * (hw - 0.8), E + 0.5, I.zS], [0, 1, 0], L.trim);
            S.faceTo([x, E, zr], [x, E, I.zS], [x, E + 0.5, I.zS], [x, E + 0.5, zr], [sd, 0, 0], L.trim);
            S.faceTo([sd * (hw - 0.8), E, zr], [sd * (hw - 0.8), E, I.zS], [sd * (hw - 0.8), E + 0.5, I.zS], [sd * (hw - 0.8), E + 0.5, zr], [-sd, 0, 0], shade(L.trim, 0.85));
            S.faceTo([sd * W.hw, E - 1.2, I.zS], [x, E - 1.2, I.zS], [x, E + 0.5, I.zS], [sd * W.hw, E + 0.5, I.zS], [0, 0, 1], L.wood2);
            for (let j = 0; j <= nq; j++) D.box(sd * (hw - 0.4), E + 1.8, zr + len * j / nq, 0.5, 2.6, 0.5, L.wood);
            D.box(sd * (hw - 0.4), E + 2.8, (zr + I.zS) / 2, 0.34, 0.34, len, L.wood2);
            if (!low) D.box(sd * (hw - 0.4), E + 1.5, (zr + I.zS) / 2, 0.28, 0.3, len, L.wood2);
        }
        for (let j = 0; j < (low ? 2 : 3); j++) {
            const tipZ = cz + I.R + 3 + j * 4.2, way = Math.PI;
            for (const h of [-1, 1]) { const th = way + h * 0.62; D.box(-Math.sin(th) * 1.9, E + 0.09, tipZ - Math.cos(th) * 1.9, 0.9, 0.1, 3.8, 0xffffff, { ry: th }); }
        }
    }
    // ----- the rock: under the rim (and out under the landing and the exit platform, a little short of their edges), then down and in
    // to a point far below; each face a touch lighter or darker at random, darker down the rock -----
    const Mc = low ? 28 : 44, wob = [], wob2 = [], wob3 = [], top = [], tone = [];
    const deckAt = (a) => (Math.cos(a) > 0 && Math.abs(Math.sin(a)) * I.R <= landHalf ? W.deck : dwN(a));
    for (let i = 0; i <= Mc; i++) { const a = (i % Mc) / Mc * TAU, w = Math.max(deckAt(a), deckAt(a + 0.07), deckAt(a - 0.07)); top.push(I.R + 2.2 + Math.max(0, w * 0.85 - 2.2)); }
    for (let i = 0; i < Mc; i++) { wob.push(0.97 + R() * 0.08); wob2.push(0.9 + R() * 0.2); wob3.push(0.8 + R() * 0.4); tone.push(0.94 + R() * 0.1); }
    for (const w of [wob, wob2, wob3]) w.push(w[0]);
    const dT = I.H + W.hole * 0.6 + 26 + I.Ro * 0.25, Rk = I.R + 4, mul = (arr, kk, w) => arr.map((v, i) => v * kk * (w ? w[i] : 1)), flat = (kk, w) => top.map((_, i) => Rk * kk * (w ? w[i] : 1));
    band(S, cx, cz, 1, E - 1.6, 1, E - 9, Mc, (i) => shade(L.rock, tone[i]), { want: 'out', wob: top, wob2: mul(top, 0.98, wob) });
    band(S, cx, cz, 1, E - 9, 1, E - dT * 0.45, Mc, (i) => shade(mixC(L.rock, L.rock2, 0.35), tone[i]), { want: 'out', wob: mul(top, 0.98, wob), wob2: flat(0.93, wob2) });
    band(S, cx, cz, 1, E - dT * 0.45, 1, E - dT * 0.8, Mc, (i) => shade(L.rock2, tone[i]), { want: 'out', wob: flat(0.93, wob2), wob2: flat(0.62, wob3) });
    band(S, cx, cz, 1, E - dT * 0.8, 1, E - dT, Mc, () => shade(L.rock2, 0.78), { want: 'down', wob: flat(0.62, wob3), wob2: flat(0.12) });
    // the sweeper's pylon, up the middle of the hole to its hub; the geysers' vents, on the wall
    if (plan.sweeper) {
        const arm = sweepArm(I, plan.sweeper), yB = E - I.H - I.td - W.hole;
        lathe(S, cx, cz, [[2.6, yB, 0x30343c], [2.2, arm.y - 1.5, 0x4a505c], [3.2, arm.y - 0.4, 0x6a7280], [3.2, arm.y + 1.4, 0x4a505c], [1.2, arm.y + 2.6, 0xffd23a]], low ? 8 : 12);
    }
    for (const g of plan.geysers) {
        // (a ring lying on the wall: round the bowl one way, up the wall the other)
        const f1 = I.S * g.u, il = 1 / Math.hypot(1, f1), sa = Math.sin(g.a), ca = Math.cos(g.a), tx = ca, tz = -sa, ux = sa * il, uy = f1 * il, uz = ca * il, nx = -sa * f1 * il, ny = il, nz = -ca * f1 * il, n = low ? 8 : 12;
        const at = (th, rad, lift) => [g.x + (tx * Math.cos(th) + ux * Math.sin(th)) * rad + nx * lift, g.y + uy * Math.sin(th) * rad + ny * lift, g.z + (tz * Math.cos(th) + uz * Math.sin(th)) * rad + nz * lift];
        for (let i = 0; i < n; i++) {
            const t0 = i / n * TAU, t1 = (i + 1) / n * TAU;
            D.faceTo(at(t0, 3.0, 0.1), at(t1, 3.0, 0.1), at(t1, 5.4, 0.1), at(t0, 5.4, 0.1), [nx, ny, nz], i & 1 ? 0x3a3e4a : 0xffd23a);
            D.faceTo(at(t0, 0.01, 0.08), at(t1, 0.01, 0.08), at(t1, 3.0, 0.08), at(t0, 3.0, 0.08), [nx, ny, nz], 0x1a1c24);
        }
    }
    // ----- the fence: on the kerb, and along the exit platform's outer edge (open where the road goes on); none at the landing (it
    // has its rails) -----
    const nF = Math.max(16, Math.round(TAU * I.Ro / (low ? 15 : 9)));
    const post = (a) => {
        const sa = Math.sin(a), ca = Math.cos(a);
        if (ca > 0 && Math.abs(sa) * I.R < landHalf + 0.6) return null;
        const w = dwN(a);
        if (w >= 3) { const rr = I.R + w - 1.1; return Math.abs(cx + rr * sa) < W.hw + 1.7 ? null : { r: rr, y: E }; }
        return w > 0.05 ? null : { r: I.R + 0.9, y: E + 1.0 };
    };
    for (let i = 0; i < nF; i++) {
        const a = (i + 0.5) / nF * TAU, a2 = (i + 1.5) / nF * TAU, p0 = post(a), p1 = post(a2);
        if (!p0) continue;
        const p = P3(cx, cz, a, p0.r, E);
        D.box(p[0], p0.y + 1.5, p[2], 0.6, 3, 0.6, L.wood);
        D.box(p[0], p0.y + 3.1, p[2], 0.8, 0.3, 0.8, L.trim);
        if (!p1 || p1.y !== p0.y) continue;
        const q = P3(cx, cz, a2, p1.r, E), len = Math.hypot(q[0] - p[0], q[2] - p[2]), ry = Math.atan2(q[0] - p[0], q[2] - p[2]);
        D.box((p[0] + q[0]) / 2, p0.y + 2.4, (p[2] + q[2]) / 2, 0.3, 0.36, len, L.wood2, { ry });
        if (!low) D.box((p[0] + q[0]) / 2, p0.y + 1.2, (p[2] + q[2]) / 2, 0.26, 0.3, len, L.wood2, { ry });
    }
    // what grows on the exit platform (where it's its full width, clear of the road)
    const np = Math.round((low ? 3 : 6) + I.Ro / (low ? 40 : 22));
    for (let i = 0; i < np; i++) {
        const a = Math.PI - aN + (i + R() * 0.7) / np * 2 * aN, p = P3(cx, cz, a, I.Ro - 3.6 - R() * 2, E);
        if (Math.abs(p[0]) < W.hw + 4 || dwN(a) < W.deck - 0.5) continue;
        prop(D, R() < 0.7 ? L.prop : 'rock', p[0], E, p[2], 0.7 + R() * 0.5, L, R);
    }
    // the bridge up to it: a ramp of planks between two flats, kerbs and rails either side, beams under it
    {
        const hw = W.hw, a = I.zB - W.land, b = I.zS + W.land, yA = I.base, yB = E;
        const deckQ = (z0, z1, y0, y1) => {
            S.faceTo([-hw, y0, z0], [hw, y0, z0], [hw, y1, z1], [-hw, y1, z1], [0, 1, 0], L.wood);
            S.faceTo([-hw, y0 - 1.2, z0], [hw, y0 - 1.2, z0], [hw, y1 - 1.2, z1], [-hw, y1 - 1.2, z1], [0, -1, 0], shade(L.wood2, 0.7));
            for (const s of [-1, 1]) {
                S.faceTo([s * hw, y0 - 1.2, z0], [s * hw, y1 - 1.2, z1], [s * hw, y1, z1], [s * hw, y0, z0], [s, 0, 0], L.wood2);
                // the kerb
                S.faceTo([s * (hw - 0.8), y0 + 0.5, z0], [s * hw, y0 + 0.5, z0], [s * hw, y1 + 0.5, z1], [s * (hw - 0.8), y1 + 0.5, z1], [0, 1, 0], L.trim);
                S.faceTo([s * hw, y0, z0], [s * hw, y1, z1], [s * hw, y1 + 0.5, z1], [s * hw, y0 + 0.5, z0], [s, 0, 0], L.trim);
                S.faceTo([s * (hw - 0.8), y0, z0], [s * (hw - 0.8), y1, z1], [s * (hw - 0.8), y1 + 0.5, z1], [s * (hw - 0.8), y0 + 0.5, z0], [-s, 0, 0], shade(L.trim, 0.85));
            }
        };
        deckQ(I.zB, a, yA, yA); deckQ(a, b, yA, yB); deckQ(b, I.zS, yB, yB);
        // the road on from the exit platform to the next bridge: planks, kerbs, a rail each side. It meets the platform's curved edge
        // at a slant (each side of it as long as it needs to be)
        // (where a line along the road at x first comes onto the deck, from the bridge's side: the deck narrows towards a crescent's ends)
        const edgeZ = (x, sg) => { for (let d = I.Ro; d > 0; d -= 0.25) { const dz = sg * d, q = Math.hypot(x - cx, dz); if (q <= I.R + deckW(I, x - cx, dz) - 0.4) return cz + dz; } return cz; };
        for (const sg of [-1]) {
            const zO = I.zN, zl = edgeZ(-hw, sg), zr2 = edgeZ(hw, sg), y = E + 0.03;
            S.faceTo([-hw, y, zO], [hw, y, zO], [hw, y, zr2], [-hw, y, zl], [0, 1, 0], L.wood);
            S.faceTo([-hw, y - 1.2, zO], [hw, y - 1.2, zO], [hw, y - 1.2, zr2], [-hw, y - 1.2, zl], [0, -1, 0], shade(L.wood2, 0.7));
            for (const s2 of [-1, 1]) {
                const ze = s2 < 0 ? zl : zr2, len = Math.abs(ze - zO), nq = Math.max(1, Math.round(len / 9));
                S.faceTo([s2 * hw, y - 1.2, zO], [s2 * hw, y - 1.2, ze], [s2 * hw, y, ze], [s2 * hw, y, zO], [s2, 0, 0], L.wood2);
                S.faceTo([s2 * (hw - 0.8), y + 0.5, zO], [s2 * hw, y + 0.5, zO], [s2 * hw, y + 0.5, ze], [s2 * (hw - 0.8), y + 0.5, ze], [0, 1, 0], L.trim);
                S.faceTo([s2 * hw, y, zO], [s2 * hw, y, ze], [s2 * hw, y + 0.5, ze], [s2 * hw, y + 0.5, zO], [s2, 0, 0], L.trim);
                S.faceTo([s2 * (hw - 0.8), y, zO], [s2 * (hw - 0.8), y, ze], [s2 * (hw - 0.8), y + 0.5, ze], [s2 * (hw - 0.8), y + 0.5, zO], [-s2, 0, 0], shade(L.trim, 0.85));
                for (let i = 1; i <= nq; i++) D.box(s2 * (hw - 0.4), y + 1.8, zO + (ze - zO) * i / nq, 0.5, 2.6, 0.5, L.wood);
                if (len > 1.5) D.box(s2 * (hw - 0.4), y + 2.8, (zO + ze) / 2, 0.34, 0.34, len, L.wood2);
            }
            // (a stone leg under its middle)
            if (Math.abs((zl + zr2) / 2 - zO) > 6) S.box(0, y - 4, (zO + (zl + zr2) / 2) / 2, hw * 1.1, 5.6, 2.6, L.rock2);
        }
        // a painted centre line (the ramp's planks, close up)
        const nPl = low ? 0 : 9;
        for (let i = 0; i < nPl; i++) { const f = (i + 0.5) / nPl, z = a + (b - a) * f, y = yA + (yB - yA) * f; D.box(0, y + 0.06, z, 1.0, 0.1, 2.0, L.accent, { rx: Math.atan2(yB - yA, a - b) }); }
        for (const s of [-1, 1]) for (let i = 0; i <= 4; i++) {
            const f = i / 4, z = (I.zB - 1) + (I.zS + 1 - (I.zB - 1)) * f, y = z >= a ? yA : z <= b ? yB : yA + (yB - yA) * (a - z) / (a - b);
            D.box(s * (hw - 0.4), y + 1.8, z, 0.5, 2.6, 0.5, L.wood);
            if (i < 4) {
                const z2 = (I.zB - 1) + (I.zS + 1 - (I.zB - 1)) * (i + 1) / 4, y2 = z2 >= a ? yA : z2 <= b ? yB : yA + (yB - yA) * (a - z2) / (a - b), len = Math.hypot(z2 - z, y2 - y);
                D.box(s * (hw - 0.4), (y + y2) / 2 + 2.8, (z + z2) / 2, 0.34, 0.34, len, L.wood2, { rx: Math.atan2(y2 - y, z - z2) });
            }
        }
        S.box(0, (yA + yB) / 2 - 3.2, (a + b) / 2, hw * 1.2, 1.4, 3, L.rock2, { rx: Math.atan2(yB - yA, a - b) });
    }
    // the gate on the north side: two stone pillars and a lintel, lamps on it; the bridge's start beyond it
    {
        const z = I.zN + 2.2, px = W.hw + 1.8;
        for (const s of [-1, 1]) {
            S.box(s * px, E + 6.5, z, 2.6, 13, 2.6, L.rock2);
            S.box(s * px, E + 13.3, z, 3.2, 0.7, 3.2, L.trim);
            S.box(s * px, E + 4, z, 2.8, 0.7, 2.8, L.accent);
            D.box(s * px, E + 14.4, z, 1.2, 1.5, 1.2, L.lamp, { glow: 1 });
        }
        S.box(0, E + 12, z, px * 2 + 2.6, 2.4, 2.2, L.rock2);
        S.box(0, E + 10.7, z, px * 2 - 2.4, 0.4, 2.4, L.accent);
        const last = k === WALLS_N - 1;
        signs.add([big(last ? 'THE SUMMIT' : 'CRATER ' + (k + 2), GOLD, 100, '#2a1404'), { t: last ? 'the way to the next world' : stageName(L.w, k + 1), c: '#ffffff', s: '#2a1404', px: 46 }], 13, new V3(0, E + 17.5, z), false, 260);
    }
    // where the bridge lands: this crater's name, its Recommended Level, what it pays
    signs.add([big('CRATER ' + (k + 1), GOLD, 100, '#2a1404'), { t: stageName(L.w, k), c: '#ffffff', s: '#2a1404', px: 50 }, { t: 'Recommended Level ' + recLevel(L.w, k) + '  ·  +' + fmt(padWins(L.w, k)) + ' Wins', c: '#7dff6b', s: '#0a2a10', px: 40 }], 17, new V3(0, E + 15, I.zS - 1), false, 330);
    for (const s of [-1, 1]) { const px = s * (landHalf + 0.6); S.box(px, E + 4, I.zS - 1.6, 1.6, 8, 1.6, L.rock2); D.box(px, E + 8.7, I.zS - 1.6, 1.1, 1.4, 1.1, L.lamp, { glow: 1 }); S.box(px, E + 2.6, I.zS - 1.6, 1.8, 0.6, 1.8, L.accent); }
}

// ----- leaderboards: three boards on one texture, one draw -----
function drawBoard(A, i, title, rows, L) {
    const key = JSON.stringify(rows || []);
    if (key === A.keys[i]) return;
    A.keys[i] = key;
    const x = A.c.getContext('2d'), Wb = 768, H = 900, s = 512 / Wb;
    x.setTransform(s, 0, 0, 600 / H, i * 512, 0);
    const acc = '#' + new T.Color(L.accent).getHexString();
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2c3350'); g.addColorStop(1, '#161a2c');
    x.fillStyle = g; x.fillRect(0, 0, Wb, H);
    // a chequered strip along the top, a bright frame
    for (let k = 0; k < 24; k++) for (let j = 0; j < 2; j++) { x.fillStyle = (k + j) & 1 ? '#ffffff' : '#10121c'; x.fillRect(k * 32, 14 + j * 16, 32, 16); }
    x.lineWidth = 14; x.strokeStyle = acc; x.strokeRect(8, 8, Wb - 16, H - 16);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    fitFont(x, title, Wb - 110, 70, 400, '"Russo One", Fredoka, sans-serif', 0.2);
    x.lineWidth = 12; x.strokeStyle = '#0a0c18'; x.strokeText(title, Wb / 2, 100); x.fillStyle = '#ffe24a'; x.fillText(title, Wb / 2, 100);
    (rows || []).slice(0, 9).forEach((r, k) => {
        const y = 196 + k * 76;
        x.fillStyle = k % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.11)'; x.fillRect(38, y - 33, Wb - 76, 66);
        x.textAlign = 'left'; x.lineWidth = 8; x.strokeStyle = '#0a0c18';
        const name = '#' + (k + 1) + ' ' + r.n;
        fitFont(x, name, Wb - 320, 42, 700, 'Fredoka, sans-serif', 0);
        x.fillStyle = k === 0 ? '#ffd23a' : k === 1 ? '#e8ecf4' : k === 2 ? '#ffa86a' : '#ffffff';
        x.strokeText(name, 54, y); x.fillText(name, 54, y);
        x.textAlign = 'right'; x.font = '700 42px Fredoka, sans-serif'; x.strokeText(fmt(r.v), Wb - 54, y); x.fillStyle = '#7af4ff'; x.fillText(fmt(r.v), Wb - 54, y);
    });
    if (!rows || !rows.length) { x.textAlign = 'center'; x.font = '700 46px Fredoka, sans-serif'; x.fillStyle = '#c8d4f0'; x.fillText('Be the first!', Wb / 2, 230); }
    x.setTransform(1, 0, 0, 1, 0, 0);
    A.t.needsUpdate = true;
}
// ----- portals and gates: a swirl of light in an arch, bars of light across a gate that's shut. One small shader (the vertex
// colour is its colour; uv.x > 1.5: bars) -----
let swirlMat = null;
function swirlMaterial() {
    if (swirlMat) return swirlMat;
    swirlMat = new T.ShaderMaterial({
        uniforms: { uNow: CU.uNow }, transparent: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true, vertexColors: true,
        vertexShader: 'varying vec2 vUv; varying vec3 vC; void main() { vUv = uv; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uNow; varying vec2 vUv; varying vec3 vC;
            void main() {
                float a;
                vec3 c = vC;
                if (vUv.x > 1.5) {
                    // a gate's bars: slanted stripes sliding across, brighter at the edges
                    vec2 q = vec2(vUv.x - 2.0, vUv.y);
                    float s = step(0.5, fract(q.x * 7.0 + q.y * 2.0 - uNow * 0.5));
                    a = 0.28 + 0.4 * s + 0.3 * smoothstep(0.35, 0.5, abs(q.y - 0.5));
                } else {
                    vec2 q = vUv - 0.5; float r = length(q) * 2.0, an = atan(q.y, q.x);
                    float sw = 0.5 + 0.5 * sin(an * 3.0 + r * 9.0 - uNow * 2.6);
                    a = (1.0 - smoothstep(0.75, 1.0, r)) * (0.45 + 0.5 * sw);
                    c = mix(c, vec3(1.0), 0.55 * (1.0 - r) + 0.25 * sw);
                }
                gl_FragColor = vec4(c, a);
                #include <colorspace_fragment>
            }`,
    });
    return swirlMat;
}
// a flat panel for it: a rectangle w x h facing along z at (x, y, z); bars: a gate's (else a portal's swirl)
function panelGeo(list) {
    const pos = [], uv = [], col = [], idx = [], c = new T.Color();
    list.forEach((p, i) => {
        const [x, y, z, w, h, color, bars] = p, b = i * 4, u0 = bars ? 2 : 0;
        pos.push(x - w / 2, y - h / 2, z, x + w / 2, y - h / 2, z, x + w / 2, y + h / 2, z, x - w / 2, y + h / 2, z);
        uv.push(u0, 0, u0 + 1, 0, u0 + 1, 1, u0, 1);
        c.set(color);
        for (let k = 0; k < 4; k++) col.push(c.r, c.g, c.b);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeBoundingSphere();
    return g;
}
// an arch: two pillars and a stepped top (the Worlds portal, the Eruption gate)
function arch(K, x, z, hw, h, c, c2, trim, y0) {
    const y = y0 || 0;
    for (const s of [-1, 1]) { K.box(x + s * hw, y + h / 2, z, 3, h, 3, c); K.box(x + s * hw, y + 1, z, 3.6, 2, 3.6, c2); K.box(x + s * hw, y + h * 0.62, z, 3.3, 0.8, 3.3, trim); }
    K.box(x, y + h + 1.4, z, hw * 2 + 3, 2.8, 3, c);
    K.box(x, y + h + 3.3, z, hw * 2 - 2, 1.2, 2.6, c2);
    K.box(x, y + h - 0.3, z, hw * 2 - 3, 0.5, 3.2, trim);
}

export function buildHub(wi, opts) {
    const L = lookOf(wi), R = rng(wi * 97 + 11), low = !!opts.low;
    L.w = wi;
    const group = new T.Group(), signs = low ? new Signs(6, 352, 120) : new Signs(6, 448, 152);
    // a kit per stretch (Base Camp, then each island): the big shapes, and the small things (drawn only close up)
    const S0 = new Kit({ glow: true }), D0 = new Kit({ glow: true }), kitsS = [S0], kitsD = [D0], kitsB = [];
    D0.far = low ? 190 : 280;
    const P = W.plaza, mx = (P.x0 + P.x1) / 2, mz = (P.z0 + P.z1) / 2, PW = P.x1 - P.x0, PD = P.z1 - P.z0;
    const panels = [];
    // ----- Base Camp: a square of turf in two tones, a road from the spawn to the first bridge, a stone kerb round it, rock under it -----
    {
        // (the road runs from the north edge to the first row of tiles past the spawn: it ends exactly where they begin, so no two
        // surfaces ever lie in one place)
        const tile = 12.4, roadEnd = P.z0 + Math.ceil((W.spawn.z + 6 - P.z0) / tile - 1e-6) * tile;
        for (let x = P.x0; x < P.x1 - 0.01; x += tile) for (let z = P.z0; z < P.z1 - 0.01; z += tile) {
            const x1 = Math.min(P.x1, x + tile), z1 = Math.min(P.z1, z + tile);
            if (x1 > -W.hw && x < W.hw && z < roadEnd - 0.01) continue;
            S0.quad([x, 0, z1], [x1, 0, z1], [x1, 0, z], [x, 0, z], (Math.round(x / tile) + Math.round(z / tile)) & 1 ? L.deck : L.deck2);
        }
        // (the road's strips fill what the turf left out, column by column)
        for (let x = P.x0; x < P.x1 - 0.01; x += tile) { const x1 = Math.min(P.x1, x + tile); if (x1 > -W.hw && x < W.hw) S0.quad([x, 0, roadEnd], [x1, 0, roadEnd], [x1, 0, P.z0], [x, 0, P.z0], L.road); }
        for (let z = P.z0 + 4; z < W.spawn.z - 12; z += 9) D0.box(0, 0.05, z, 0.9, 0.1, 4.4, L.trim);
        const edge = (x, z, sx, sz) => { S0.box(x, 0.9, z, sx, 2.6, sz, L.rock); S0.box(x, 2.35, z, sx + 0.5, 0.4, sz + 0.5, L.trim); };
        edge(mx, P.z1 + 1.2, PW + 4.8, 2.4); edge(P.x0 - 1.2, mz, 2.4, PD); edge(P.x1 + 1.2, mz, 2.4, PD);
        for (const s of [-1, 1]) edge(s * (W.hw + 1.2 + (P.x1 - W.hw) / 2), P.z0 - 1.2, P.x1 - W.hw, 2.4);
        // the rock under it: straight down a way, then in to a ridge
        const x0 = P.x0 - 2.4, x1 = P.x1 + 2.4, z0 = P.z0 - 2.4, z1 = P.z1 + 2.4, y1 = -22, y2 = -120, k = 0.35;
        const sides = [[[x0, z1], [x1, z1], [0, 0, 1]], [[x1, z1], [x1, z0], [1, 0, 0]], [[x1, z0], [x0, z0], [0, 0, -1]], [[x0, z0], [x0, z1], [-1, 0, 0]]];
        const inn = (p) => [mx + (p[0] - mx) * k, mz + (p[1] - mz) * k];
        for (const [a, b, nn] of sides) {
            S0.faceTo([a[0], -0.4, a[1]], [b[0], -0.4, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], nn, L.rock);
            const a2 = inn(a), b2 = inn(b);
            S0.faceTo([a[0], y1, a[1]], [b[0], y1, b[1]], [b2[0], y2, b2[1]], [a2[0], y2, a2[1]], [nn[0], -0.6, nn[2]], L.rock2);
        }
        // the spawn: a painted ring with chevrons pointing up the road
        band(D0, W.spawn.x, W.spawn.z, 8.4, 0.06, 9.6, 0.06, low ? 20 : 32, (i) => (i & 1 ? L.accent : L.trim), { want: 'up' });
        band(D0, W.spawn.x, W.spawn.z, 0.001, 0.05, 8.4, 0.05, low ? 20 : 32, () => shade(L.road, 0.9), { want: 'up' });
        for (let i = 0; i < 3; i++) for (const s of [-1, 1]) D0.box(W.spawn.x + s * 1.5, 0.12, W.spawn.z - 2 - i * 2.2 + 0.0, 3.4, 0.1, 0.9, 0xffffff, { ry: s * 0.6, glow: 1 });
        // the arch over the first bridge's mouth
        for (const s of [-1, 1]) { S0.box(s * (W.hw + 2), 9, P.z0 + 1, 3, 18, 3, L.rock2); S0.box(s * (W.hw + 2), 5, P.z0 + 1, 3.4, 0.8, 3.4, L.accent); S0.box(s * (W.hw + 2), 18.4, P.z0 + 1, 3.8, 0.8, 3.8, L.trim); D0.box(s * (W.hw + 2), 19.8, P.z0 + 1, 1.5, 2, 1.5, L.lamp, { glow: 1 }); }
        S0.box(0, 16.6, P.z0 + 1, W.hw * 2 + 7, 3, 2.6, L.rock2); S0.box(0, 14.9, P.z0 + 1, W.hw * 2 + 2, 0.5, 2.9, L.accent);
        signs.add([big('THE CRATERS', GOLD, 108, '#2a1404'), { t: 'ride the wall  ·  mind the hole  ·  out the far side!', c: '#ffffff', s: '#2a1404', px: 40 }], 30, new V3(0, 24.6, P.z0 + 2), false, 340);
    }
    // ----- the dyno rollers: a plate each with two pairs of rollers, a console at its north end with its sign over it -----
    const postSigns = [];
    POSTS.forEach((c, i) => {
        const s = postSpot(i), hw = BELT.w / 2, hl = BELT.l / 2;
        S0.box(s.x, 0.14, s.z, BELT.w + 1.8, 0.28, BELT.l + 1.4, shade(c.c, 0.55));
        D0.box(s.x, 0.3, s.z, BELT.w - 0.4, 0.1, BELT.l - 0.6, 0x24262e);
        for (const rz of [2.5, -2.5]) for (const dz of [-0.55, 0.55]) D0.box(s.x, 0.42, s.z + rz + dz, BELT.w - 1.2, 0.62, 0.62, dz < 0 ? 0x9aa2b0 : 0x6a7280, { rx: Math.PI / 4 });
        for (const sx of [-1, 1]) { D0.box(s.x + sx * (hw + 0.5), 0.55, s.z, 0.5, 0.6, BELT.l + 1, c.c); D0.box(s.x + sx * (hw + 0.5), 0.9, s.z, 0.56, 0.12, BELT.l + 1, c.c2, { glow: 1 }); }
        // the console: a screen, the number, a light on top
        S0.box(s.x, 2.4, s.z - hl - 1.6, BELT.w + 1, 4.8, 1.6, shade(c.c, 0.8));
        D0.box(s.x, 3.1, s.z - hl - 0.76, BELT.w - 0.6, 2.4, 0.1, 0x10141e);
        D0.box(s.x, 5.0, s.z - hl - 1.6, BELT.w + 1.3, 0.4, 1.9, c.c2, { glow: 1 });
        const v = { i, open: null };
        signs.add([big(postLabel(c), i < 3 ? WHITE : i < 6 ? LIME : GOLD, 112, '#10141e')], 8.2, new V3(s.x, 8.2, s.z - hl - 1.4), false, 260);
        v.lock = signs.add([{ t: c.gems ? c.gems + ' Gems' : fmt(c.need) + ' Wins', c: '#ff9a8a', s: '#2a0a0a', px: 76 }, { t: c.gems ? 'drive up to open it' : 'earned in all', c: '#ffffff', s: '#2a0a0a', px: 42 }], 6.6, new V3(s.x, 3.4, s.z + 0.5), true, 110);
        postSigns.push(v);
    });
    signs.add([big('DYNO ROLLERS', AQUA, 96, '#0a1a2a'), { t: 'park on one: your wheels spin, your Speed climbs', c: '#ffffff', s: '#0a1a2a', px: 38 }], 30, new V3(postSpot(4).x, 14.5, postSpot(4).z - BELT.l / 2 - 2), false, 300);
    // ----- the Car Dealer and the Tuning garage: a back wall, a striped roof on posts, a counter; cars on show outside the dealer's -----
    const stall = (q, c, c2, name, sub, G) => {
        S0.box(q.x, 5, q.z - 11, 26, 10, 1.6, c); S0.box(q.x, 2.2, q.z - 6.5, 22, 4.4, 3, shade(c, 0.8)); S0.box(q.x, 4.5, q.z - 6.5, 22.6, 0.4, 3.6, L.trim);
        for (const sx of [-1, 1]) { S0.box(q.x + sx * 12.4, 5.5, q.z - 1.6, 1.2, 11, 1.2, shade(c, 0.7)); S0.box(q.x + sx * 12.4, 5.5, q.z - 10.6, 1.2, 11, 1.2, shade(c, 0.7)); }
        for (let i = 0; i < 8; i++) S0.box(q.x - 11.4 + i * 3.26, 11.6, q.z - 6, 3.26, 0.7, 13.6, i & 1 ? c2 : 0xffffff, { rx: 0.1 });
        D0.box(q.x, 9.3, q.z - 10.1, 20, 2.6, 0.2, 0x10141e);
        signs.add([big(name, G, 108, '#10141e'), { t: sub, c: '#ffffff', s: '#10141e', px: 40 }], 17, new V3(q.x, 16.6, q.z - 4), false, 300);
    };
    stall(tongueBar, 0x2a6ad8, 0x2a9aff, 'CAR DEALER', 'faster cars for your Wins', GOLD);
    stall(upgradeShed, 0xd8483a, 0xff6a4a, 'TUNING', 'more Speed, more Wins, more NITRO', LIME);
    {
        // two cars on turntables in front of the dealer's, a stack of tyres and a tool chest by the garage
        const wg = wheelGeometry(low), m4 = new T.Matrix4(), q = new T.Quaternion(), up = new V3(0, 1, 0);
        [[tongueBar.x - 7, tongueBar.z + 3, 3, 0.6], [tongueBar.x + 7, tongueBar.z + 3, 5, -0.6]].forEach(([x, z, ci, ry]) => {
            lathe(D0, x, z, [[5.4, 0, 0x30343c], [5.4, 0.5, 0x4a505c], [4.8, 0.7, L.trim]], low ? 12 : 18);
            const Sh = carShape(ci, low);
            q.setFromAxisAngle(up, ry);
            D0.addGeo(Sh.geo, m4.compose(new V3(x, 0.7, z), q, new V3(1, 1, 1)), 0);
            if (Sh.wr) for (const [wx, wz] of Sh.wheels) D0.addGeo(wg, m4.compose(new V3(wx, Sh.wr, wz).applyQuaternion(q).add(new V3(x, 0.7, z)), q, new V3(Sh.ww, Sh.wr, Sh.wr)), 0);
        });
        const ux = upgradeShed.x, uz = upgradeShed.z;
        for (let i = 0; i < 3; i++) lathe(D0, ux - 9, uz + 2, [[1.7, i * 1.1, 0x1c1c24], [1.9, i * 1.1 + 0.3, 0x1c1c24], [1.9, i * 1.1 + 0.8, 0x26262e], [1.7, i * 1.1 + 1.1, 0x1c1c24]], low ? 8 : 12);
        D0.box(ux + 9, 1.4, uz + 2, 3.4, 2.8, 2, 0xe8483a); D0.box(ux + 9, 2.9, uz + 2, 3.6, 0.2, 2.2, 0xb8c0cc);
        for (let i = 0; i < 3; i++) D0.box(ux + 9, 0.7 + i * 0.8, uz + 3.02, 2.8, 0.14, 0.06, 0xffd23a);
    }
    // ----- the Eggs on their stands, in an arc -----
    JAWBREAKERS.forEach((J, i) => {
        const s = jbSpot(i), n = low ? 8 : 12;
        lathe(S0, s.x, s.z, [[2.6, 0, L.rock2], [2.6, 1.6, L.rock], [2.0, 2.2, L.trim]], n);
        lathe(D0, s.x, s.z, [[0.9, 2.3, J.c1], [1.9, 3.3, J.c2], [2.2, 4.6, J.c1], [1.9, 6.0, J.c2], [1.2, 7.1, J.c1], [0.3, 7.7, J.c3]], n);
        signs.add([big(J.name.toUpperCase(), i < 3 ? WHITE : i < 6 ? AQUA : PINK, 76, '#1a1030'), { t: fmt(J.wins) + ' Wins', c: '#ffe24a', s: '#3a2400', px: 64 }], 7.4, new V3(s.x, 11.2, s.z), true, 150);
    });
    signs.add([big('PET EGGS', PINK, 96, '#2a0a2a'), { t: 'hatch pets that boost your Speed', c: '#ffffff', s: '#2a0a2a', px: 38 }], 22, new V3(46, 20, 112), false, 280);
    // ----- the Worlds portal and the Eruption gate -----
    arch(S0, worldsPortal.x, worldsPortal.z, 9, 16, 0x3a4a8a, 0x26305e, 0x7af4ff);
    panels.push([worldsPortal.x, 8.4, worldsPortal.z, 15, 15, 0x3ad8ff, 0]);
    signs.add([big('WORLDS', AQUA, 104, '#0a1a2a')], 13, new V3(worldsPortal.x, 24.4, worldsPortal.z), false, 300);
    arch(S0, playGate.x, playGate.z, 10, 16, 0x5a2e2a, 0x3a1e1e, 0xff8a2a);
    panels.push([playGate.x, 8.4, playGate.z, 17, 15, 0xff6a1a, 0]);
    signs.add([big('ERUPTION', ['#fff0a0', '#ff5a14'], 104, '#2a0a04'), { t: 'RACE: 6 buggies, 1 volcano, rising lava', c: '#ffffff', s: '#2a0a04', px: 38 }], 16, new V3(playGate.x, 25, playGate.z), false, 300);
    // ----- the FREE GIFT chest by the spawn -----
    {
        const g = giftSpot;
        S0.box(g.x, 1.3, g.z, 4.6, 2.6, 3.4, 0xb8563a, { soft: !low }); D0.box(g.x, 2.9, g.z, 4.8, 0.9, 3.6, 0xd86a44, { soft: !low });
        for (const sx of [-1.5, 1.5]) D0.box(g.x + sx, 1.7, g.z, 0.5, 3.5, 3.7, 0xffd23a);
        D0.box(g.x, 2.3, g.z + 1.74, 0.9, 1.0, 0.2, 0xffe24a, { glow: 1 });
        signs.add([big('FREE GIFT', GOLD, 104, '#3a1a00')], 7.5, new V3(g.x, 7.4, g.z), true, 110);
    }
    // ----- the leaderboards -----
    const BA = { c: document.createElement('canvas'), keys: ['', '', ''] };
    BA.c.width = 1536; BA.c.height = 600; BA.t = texFrom(BA.c);
    const TITLES = ['MOST WINS', 'FASTEST', 'RACES WON'], bPos = [], bUv = [], bIdx = [];
    boards.forEach((bd, i) => {
        const side = bd.x !== 0, dir = side ? (bd.x < 0 ? 1 : -1) : -1;
        S0.box(bd.x, 7.6, bd.z, side ? 1.2 : 25, 14.4, side ? 25 : 1.2, 0x30364e);
        for (const s of [-1, 1]) S0.box(bd.x + (side ? 0 : s * 13.2), 8, bd.z + (side ? s * 13.2 : 0), 1.2, 16, 1.2, L.accent);
        // the board's face (a quad of the atlas), looking in at the square
        const hw = 11.5, y0 = 0.9, y1 = 13.9, o = 0.66, b = i * 4;
        const cs = side ? [[bd.x + dir * o, bd.z + dir * hw], [bd.x + dir * o, bd.z - dir * hw]] : [[bd.x + hw, bd.z - o], [bd.x - hw, bd.z - o]];
        bPos.push(cs[0][0], y0, cs[0][1], cs[1][0], y0, cs[1][1], cs[1][0], y1, cs[1][1], cs[0][0], y1, cs[0][1]);
        bUv.push(i / 3, 0, (i + 1) / 3, 0, (i + 1) / 3, 1, i / 3, 1);
        bIdx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        drawBoard(BA, i, TITLES[i], [], L);
    });
    const boardG = new T.BufferGeometry();
    boardG.setAttribute('position', new T.Float32BufferAttribute(bPos, 3)); boardG.setAttribute('uv', new T.Float32BufferAttribute(bUv, 2)); boardG.setIndex(bIdx);
    const boardMesh = new T.Mesh(boardG, new T.MeshBasicMaterial({ map: BA.t, toneMapped: false, side: T.DoubleSide }));
    group.add(boardMesh);
    // ----- what stands about: lamp posts, trees round the edge, cones along the road -----
    for (const [x, z] of [[-12, 58], [12, 58], [-12, 84], [12, 84], [P.x0 + 5, P.z1 - 5], [P.x1 - 5, P.z1 - 5], [P.x0 + 5, 82], [P.x1 - 5, 86]]) {
        D0.box(x, 4.5, z, 0.6, 9, 0.6, 0x3a3e4a); D0.box(x, 0.4, z, 1.4, 0.8, 1.4, 0x2a2e38);
        lathe(D0, x, z, [[1.3, 8.8, L.lamp], [0.9, 10.2, L.lamp], [0.2, 10.8, L.lamp]], 6, { glow: 1 });
    }
    for (const [x, z] of [[P.x0 + 8, 56], [P.x0 + 9, 122], [P.x1 - 8, 124], [-58, P.z1 - 7], [28, P.z1 - 7], [70, P.z1 - 8], [112, 84], [-100, 146], [P.x0 + 20, 98]].filter((_, i) => !low || i % 2 === 0)) prop(D0, L.prop, x, 0, z, 1.1 + R() * 0.5, L, R);
    for (const s of [-1, 1]) for (let z = P.z0 + 8; z < W.spawn.z - 16; z += 12) { lathe(D0, s * (W.hw + 0.6), z, [[0.9, 0, 0xff7a2a], [0.75, 0.3, 0xff7a2a], [0.5, 1.1, 0xffffff], [0.32, 1.6, 0xff7a2a], [0.12, 2.3, 0xff7a2a]], 6); }

    // ----- the islands -----
    for (let k = 0; k < WALLS_N; k++) {
        const S = new Kit({ glow: true }), D = new Kit({ glow: true });
        D.far = low ? 200 : 300;
        const Bw = new Kit({ glow: true });
        islandKits(S, D, k, L, rng(wi * 131 + k * 17 + 5), low, signs, Bw);
        kitsS.push(S); kitsD.push(D); kitsB.push(Bw);
    }
    // the summit: the last platform, a great portal on it to the next world
    {
        const S = new Kit({ glow: true }), I = islandOf(WALLS_N - 1), y = summit.y, M = low ? 20 : 32, Rm = rng(wi * 53 + 1), wob = [], wob2 = [];
        for (let i = 0; i < 16; i++) { wob.push(0.94 + Rm() * 0.12); wob2.push(0.8 + Rm() * 0.4); }
        band(S, summit.x, summit.z, 0.001, y, summit.r - 1.6, y, M, () => L.deck, { want: 'up' });
        band(S, summit.x, summit.z, summit.r - 1.6, y, summit.r, y, M, () => L.trim, { want: 'up' });
        band(S, summit.x, summit.z, summit.r, y, summit.r * 0.9, y - 14, 16, (i) => shade(L.rock, 0.94 + wob2[i] * 0.08), { want: 'out', wob2: wob });
        band(S, summit.x, summit.z, summit.r * 0.9, y - 14, summit.r * 0.15, y - 60, 16, () => L.rock2, { want: 'down', wob, wob2 });
        // (its bridge: flat)
        // (from the last island's gate to the platform's edge; where it meets the round edge it runs in under the turf, a hair lower)
        S.box(0, y - 0.62, (I.zN + summit.z + summit.r * 0.94) / 2, W.hw * 2, 1.2, I.zN - (summit.z + summit.r * 0.94), L.wood);
        for (const s of [-1, 1]) S.box(s * (W.hw - 0.4), y + 0.25, (I.zN + summit.z + summit.r) / 2, 0.8, 0.5, I.zN - (summit.z + summit.r), L.trim);
        arch(S, endPortal.x, endPortal.z, 9, 17, L.rock2, shade(L.rock2, 0.7), L.glow, y);
        kitsS.push(S);
        panels.push([endPortal.x, y + 8.8, endPortal.z, 15, 16, L.glow, 0]);
        signs.add([big('NEXT WORLD', GOLD, 104, '#2a1404')], 15, new V3(endPortal.x, y + 26, endPortal.z), false, 320);
    }
    // ----- build it -----
    const stageFx = buildStageFx(group, wi, L, low);
    const mat = propMaterial();
    const sMesh = batchKits(kitsS, mat, true), dMesh = batchKits(kitsD, mat, false), bMesh = batchKits(kitsB, mat, false);
    if (sMesh) group.add(sMesh);
    if (dMesh) group.add(dMesh);
    if (bMesh) group.add(bMesh);
    const panelG = panelGeo(panels), panelMesh = new T.Mesh(panelG, swirlMaterial());
    panelMesh.renderOrder = 3;
    group.add(panelMesh);
    // every gate's bars of light (a mesh each: shown while it's shut for you)
    const bars = [];
    for (let k = 0; k < WALLS_N; k++) {
        const I = islandOf(k), g = panelGeo([[0, I.E + 4.4, I.zN + 2.2, W.hw * 2 + 0.8, 8.8, 0xff3a4a, 1]]), m = new T.Mesh(g, swirlMaterial());
        m.renderOrder = 3;
        group.add(m);
        bars.push(m);
    }
    signs.build(group);
    // nothing here moves as a whole: its matrices are worked out once, not every frame
    group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    group.updateMatrixWorld(true);
    scene.add(group);
    // ----- prompts: the dealer, the garage, the portals, the Eggs, a dyno with a price, the FREE GIFT chest -----
    const PR = [];
    PR.push({ pos: new V3(tongueBar.x, 0, tongueBar.z + 2), r: tongueBar.r, label: () => 'Cars', act: () => opts.cars(), zone: 'world' });
    PR.push({ pos: new V3(upgradeShed.x, 0, upgradeShed.z + 2), r: upgradeShed.r, label: () => 'Tuning', act: () => opts.shed(), zone: 'world' });
    PR.push({ pos: new V3(worldsPortal.x, 0, worldsPortal.z), r: worldsPortal.r + 2, label: () => 'Worlds', act: () => opts.worlds(), zone: 'world' });
    PR.push({ pos: new V3(playGate.x, 0, playGate.z), r: playGate.r + 2, label: () => 'Eruption', act: () => opts.play(), zone: 'world' });
    JAWBREAKERS.forEach((J, i) => { const s = jbSpot(i); PR.push({ pos: new V3(s.x, 0, s.z), r: JB_R + 1.5, label: () => J.name, act: () => opts.jaw(i), zone: 'world' }); });
    for (const v of postSigns) { const s = postSpot(v.i); if (POSTS[v.i].gems) PR.push({ pos: new V3(s.x, 0, s.z + 2), r: 8, label: () => 'Open the ' + POSTS[v.i].name, act: () => opts.post(v.i), zone: 'world', on: () => !v.open }); }
    if (opts.gift) PR.push({ pos: new V3(giftSpot.x, 0, giftSpot.z), r: 7, label: () => 'Free Gifts', act: () => opts.gift(), zone: 'world' });
    prompts.length = 0; prompts.push(...PR);
    const view = {
        w: wi, group, signs, stageFx, look: L,
        setBoards(m) { drawBoard(BA, 0, TITLES[0], m.wins, L); drawBoard(BA, 1, TITLES[1], m.speed, L); drawBoard(BA, 2, TITLES[2], m.race, L); },
        // what you've got: which dynos are open (a shut one shows what it wants)
        setProgress(p, postOpenFn) {
            for (const v of postSigns) {
                const open = !!postOpenFn(p, v.i);
                if (open === v.open) continue;
                v.open = open;
                signs.show(v.lock, !open);
            }
        },
        // stage k's north gate: its bars of light are there while it's shut for you
        setGate(k, open) { const m = bars[k]; if (m && m.visible === !!open) m.visible = !open; },
        update(t, cam, lt) { stageFx.update(t, cam, lt ?? t); },
        dispose() {
            signs.dispose(); stageFx.dispose();
            for (const m of [sMesh, dMesh, bMesh]) if (m) (m.isBatchedMesh ? m.dispose() : m.geometry.dispose());
            for (const m of bars) m.geometry.dispose();
            panelG.dispose();
            BA.t.dispose(); boardG.dispose();
            scene.remove(group);
        },
    };
    return view;
}
export { worldFor, band, quadS, panelGeo, swirlMaterial, P3 };
