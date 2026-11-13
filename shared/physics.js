// Driving, shared: your own car runs it on your screen every frame (the server only checks where you say you are; its bots ride on
// rails). A car is a point on the ground with a heading. The ground is a height everywhere (shared/world.js surf): flat decks and
// bridges, and the craters' bowls. On the ground the car's velocity lies in the ground's plane; the engine pushes along the heading,
// the tyres stop it sliding sideways, gravity pulls it down any slope, and all the tyres can give together is their grip times how
// hard the car is pressed into the ground (its weight on a slope, plus what a fast lap round a bowl presses it in). So on a steep
// wall a slow car slides back down, and a fast one holds its line: the faster, the higher. Over a lip (a gate's edge, a launch) the
// ground falls away and the car flies. Over a crater's lip from its landing, going in, it drops in instead (world.drop): it stays on
// the wall and is carried into a carve along it for a moment, as a skater drops into a bowl (the wheel picks which way round).
import { CFG } from './config.js';

export const CAR = { r: 2.4, turn: 2.6, lat: 0.07, cliff: 1 };

// how far a move may go (the server's guard): you earn distance at your top speed as time passes (a second and a half's worth
// saved, for moves bunched up by a hiccup in the network), and each move spends it. Too far too fast and it's refused.
export function moveBudget(s, dist, speed, dt) {
    s.moveB = Math.min((s.moveB ?? speed) + Math.max(0, dt) * speed, speed * 1.5 + 6);
    if (dist > s.moveB) return false;
    s.moveB -= dist;
    return true;
}

export function newCar(x, y, z, ry) {
    return { x, y, z, vx: 0, vy: 0, vz: 0, ry: ry || 0, air: false, airT: 0, load: CFG.grav, slip: 0, vf: 0, nx: 0, ny: 1, nz: 0, zone: 0, k: -1, u: -1, hitV: 0, om: 0, fs: 0 };
}

const S = {}, S2 = {}, S3 = {};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; else if (a < -Math.PI) a += Math.PI * 2; return a; };
// the drop begins (o: the wall where it's begun, going in): which way round: the wheel's; else the side of the middle it's on;
// else the crater's own way
function startDrop(c, o, steer, world) {
    const D = world.drop && world.drop(o.k);
    if (!D || c.vx * o.ex + c.vz * o.ez > -2) return;
    // (its right; along the wall by the east is (ez, -ex): way, whether its right is that way; offR: how far right of the middle's
    // line it is, in studs: its distance from the middle (the slope over its curve round) times the radial's share of its right)
    const rx = -Math.cos(c.ry), rz = Math.sin(c.ry), way = Math.sign(rx * o.ez - rz * o.ex) || 1;
    const offR = (o.ex * rx + o.ez * rz) * (o.ct > 0 ? Math.hypot(o.gx, o.gz) / o.ct : 0);
    c.dropS = Math.abs(steer) > 0.25 ? Math.sign(steer) * way : Math.abs(offR) > 0.6 ? Math.sign(offR) * way : D.side;
    c.dropDip = D.dip; c.drop = D.t;
}
// One step. inp: { steer (-1 left .. 1 right), throttle (-1 brake / reverse .. 1), top (the speed the engine pulls to, studs/s),
// kick (x the engine's push: NITRO), hold (on a wall: keep this height; else the car eases up the wall by itself while you give it gas) }
// world: { surf(x, z, out), clamp(car), boxes ([{ min: [x, z], max: [x, z] }]: only where the ground's zone is 0), drop(k) (a crater's
// drop: { side, dip, t }; none: no drop, as in a race's volcano) }
// Returns what happened: 0 nothing, 1 took off, 3 landed (car.hitV: how hard), 5 bumped into something
export function stepCar(c, inp, dt, world) {
    const sp = Math.hypot(c.vx, c.vy, c.vz), n = Math.max(1, Math.min(8, Math.ceil(sp * dt / 0.8)));
    let ev = 0;
    for (let i = 0; i < n; i++) { const e = sub(c, inp, dt / n, world); if (e > ev) ev = e; }
    return ev;
}
function sub(c, inp, dt, world) {
    const G = CFG.grav;
    let ev = 0;
    world.surf(c.x, c.z, S);
    c.zone = S.zone; c.k = S.k; c.u = S.u;
    if (c.air) {
        c.drop = 0;
        c.airT += dt;
        c.vy -= G * dt;
        c.ry -= (inp.steer || 0) * 1.1 * dt;
        c.slip = 0; c.om = 0;
        const px = c.x + c.vx * dt, pz = c.z + c.vz * dt, py = c.y + c.vy * dt;
        world.surf(px, pz, S2);
        // a cliff's face in the way (a gate's side): it stops you, you drop
        if (S2.y - S.y - (S.gx * (px - c.x) + S.gz * (pz - c.z)) > CAR.cliff && S2.y > py + 0.4) { c.vx *= -0.15; c.vz *= -0.15; c.y = py; ev = 5; }
        else { c.x = px; c.z = pz; c.y = py; }
        world.surf(c.x, c.z, S2);
        if (c.y <= S2.y) {
            // down: what was going into the ground is gone, the rest carries on along it
            const il = 1 / Math.sqrt(1 + S2.gx * S2.gx + S2.gz * S2.gz), nx = -S2.gx * il, ny = il, nz = -S2.gz * il, vn = c.vx * nx + c.vy * ny + c.vz * nz;
            c.y = S2.y; c.hitV = Math.max(0, -vn);
            c.vx -= vn * nx; c.vy -= vn * ny; c.vz -= vn * nz;
            c.nx = nx; c.ny = ny; c.nz = nz;
            c.air = false; ev = Math.max(ev, 3);
            // (flown in over a crater's lip, off its landing or the bridge's crest: it drops in where it comes down)
            if (S2.zone === 2 && (c.airFrom === 3 || c.airFrom === 5)) startDrop(c, S2, clamp(inp.steer || 0, -1, 1), world);
        }
        if (world.clamp(c)) ev = Math.max(ev, 5);
        return ev;
    }
    // the ground's plane: its normal n, forward along the heading f, left l
    const il = 1 / Math.sqrt(1 + S.gx * S.gx + S.gz * S.gz), nx = -S.gx * il, ny = il, nz = -S.gz * il;
    // (forward: the heading lifted onto the slope: over the ground it points where the heading does)
    const hx = Math.sin(c.ry), hz = Math.cos(c.ry);
    let fx = hx, fy = S.gx * hx + S.gz * hz, fz = hz;
    const fl = 1 / (Math.hypot(fx, fy, fz) || 1);
    fx *= fl; fy *= fl; fz *= fl;
    const lx = ny * fz - nz * fy, ly = nz * fx - nx * fz, lz = nx * fy - ny * fx;
    const vf = c.vx * fx + c.vy * fy + c.vz * fz, vl = c.vx * lx + c.vy * ly + c.vz * lz;
    // how hard it's pressed into the ground: its weight, and what the bowl's curve adds at speed
    const vr = c.vx * S.ex + c.vz * S.ez, vt2 = Math.max(0, c.vx * c.vx + c.vz * c.vz - vr * vr);
    // (dropping in: the drop's moment, on the wall; it's over if the car leaves the wall)
    if (c.drop > 0) c.drop = S.zone === 2 ? Math.max(0, c.drop - dt) : 0;
    const dropping = c.drop > 0;
    const N = Math.max(0, ny * (G + S.cr * vr * vr + S.ct * vt2)), grip = CFG.mu * S.grip * N * (dropping ? 3 : 1);
    // the heading turns in the ground's own plane (so the wheel bites as well on a steep wall as on the flat): your steering (less at
    // a crawl; never more than the tyres can turn the car), and on a wall the lap itself
    const av = Math.abs(vf), thr = inp.throttle || 0, steer = clamp(inp.steer || 0, -1, 1);
    let rate = CAR.turn * Math.min(1, (av + 1.5) / 9);
    if (av > 4) rate = Math.min(rate, 1.2 * Math.max(grip, 12) / av);
    let om = -steer * rate * (vf < -0.5 ? -1 : 1);
    const f1 = Math.hypot(S.gx, S.gz);
    c.fs = 0;
    if (S.u >= 0 && f1 > 0.02) {
        const wk = clamp((f1 - 0.1) / 0.4, 0, 1), sn = Math.sqrt(Math.max(0, 1 - ny * ny));
        // (up the slope, in its plane: how much of the heading points that way, and which way round turns it there)
        const sx = ny * S.ex, sz = ny * S.ez, fsl = fx * sx + fy * sn + fz * sz, side = lx * sx + ly * sn + lz * sz;
        c.fs = fsl;
        om += wk * (S.ez * c.vx - S.ex * c.vz) * S.ct / f1 * ny;
        // nobody steering: the heading eases to along the wall (and, with the gas on, up it: steeply while the tyres have grip to
        // spare, barely at all near their limit, so the car climbs as high as its speed holds by itself and stays there)
        if (Math.abs(steer) < 0.2 && vf > 3) om += wk * 1.8 * ((inp.hold || thr < 0.3 ? 0 : 0.12 * clamp((0.96 - (c.use || 0)) / 0.2, 0.06, 1)) - fsl) * (side >= 0 ? 1 : -1) * Math.min(1, vf / 10);
    }
    // sliding (the tyres past their grip): the nose swings round to where the car is really going, so it rolls down the slope and
    // picks its speed back up instead of scrubbing it all off sideways
    if ((c.slip || 0) > 0.05 && Math.hypot(vf, vl) > 3) om += clamp(Math.atan2(vl, Math.max(3, Math.abs(vf))) * 7 * Math.min(1, c.slip * 2), -3.2, 3.2);
    // the drop: the heading swung round to along the wall (its side), aimed in towards the hole by the drop's dip
    if (dropping) {
        const sd = c.dropS, cd = Math.cos(c.dropDip), sn2 = Math.sin(c.dropDip), tx = sd * S.ez, tz = -sd * S.ex;
        om = clamp(wrapA(Math.atan2(tx * cd - S.ex * sn2, tz * cd - S.ez * sn2) - c.ry) * 10, -7, 7);
    }
    {
        // forward, turned by that much about the ground's normal; the heading is where it points
        const th = om * dt, cs = Math.cos(th), si = Math.sin(th), qx = fx * cs + lx * si, qz = fz * cs + lz * si;
        if (qx * qx + qz * qz > 1e-6) c.ry = Math.atan2(qx, qz);
    }
    c.om = om;
    // the engine and the brakes
    let af;
    if (thr > 0.02) { const want = thr * inp.top; af = vf > want ? Math.max(-CFG.brake, (want - vf) * 2.5) : Math.min(CFG.accel * (inp.kick || 1), (want - vf) * 5); }
    else if (thr < -0.02) { if (vf > 1.5) af = CFG.brake * thr; else { const want = thr * 0.4 * inp.top; af = Math.max(-CFG.accel * 0.7, (want - vf) * 4); } }
    else af = clamp(-vf * 1.2, -CFG.coast, CFG.coast);
    // gravity along the ground
    const gtx = G * ny * nx, gty = -G * (1 - ny * ny), gtz = G * ny * nz, gl = gtx * lx + gty * ly + gtz * lz;
    // the tyres sideways: no sliding, hold against the slope, turn the car with its heading
    let al = -vl / CAR.lat - gl + om * vf;
    const m = Math.hypot(af, al);
    c.slip = 0;
    // (how much of their grip the tyres are using, eased)
    c.use = (c.use || 0) + (Math.min(1.2, m / Math.max(1, grip)) - (c.use || 0)) * Math.min(1, dt * 6);
    if (m > grip) { const k = grip / m; af *= k; al *= k; c.slip = Math.min(1, (m - grip) / (G * 0.6)); }
    c.vx += (af * fx + al * lx + gtx) * dt; c.vy += (af * fy + al * ly + gty) * dt; c.vz += (af * fz + al * lz + gtz) * dt;
    c.vf = vf; c.load = N; c.nx = nx; c.ny = ny; c.nz = nz;
    // where that takes it
    let px = c.x + c.vx * dt, pz = c.z + c.vz * dt;
    world.surf(px, pz, S2);
    // over a crater's lip from its landing, going in: the drop
    if (S.zone === 3 && S2.zone === 2) startDrop(c, S2, steer, world);
    if (S2.y - S.y - (S.gx * (px - c.x) + S.gz * (pz - c.z)) > CAR.cliff) {
        // a cliff's face: along it if there's a way, else stopped
        world.surf(px, c.z, S3);
        const okX = S3.y - S.y - S.gx * (px - c.x) <= CAR.cliff;
        if (!okX) world.surf(c.x, pz, S3);
        const okZ = !okX && S3.y - S.y - S.gz * (pz - c.z) <= CAR.cliff;
        if (Math.hypot(c.vx, c.vz) > 10) ev = 5;
        if (okX) { pz = c.z; c.vz = 0; } else if (okZ) { px = c.x; c.vx = 0; } else { px = c.x; pz = c.z; c.vx = 0; c.vz = 0; }
        world.surf(px, pz, S2);
    }
    const py = c.y + c.vy * dt - 0.5 * G * ny * ny * dt * dt;
    // (on a bridge, a deck or Base Camp the car keeps to the road over a crest: it leaves the ground only off a wall or a launch)
    const road = (z) => z === 0 || z === 3 || z === 5 || z === 6, glued = road(S.zone) && road(S2.zone);
    if (py > S2.y + 0.03 && !glued && !(c.drop > 0 && S2.zone === 2)) {
        // the ground's fallen away under it: flying
        c.x = px; c.z = pz; c.y = c.y + c.vy * dt; c.air = true; c.airT = 0; c.airFrom = S.zone;
        ev = Math.max(ev, 1);
    } else {
        // on the ground: the velocity turns with it (its speed kept)
        const s0 = Math.hypot(c.vx, c.vy, c.vz);
        c.x = px; c.z = pz; c.y = S2.y;
        const i2 = 1 / Math.sqrt(1 + S2.gx * S2.gx + S2.gz * S2.gz), ax = -S2.gx * i2, ay = i2, az = -S2.gz * i2, vn = c.vx * ax + c.vy * ay + c.vz * az;
        c.vx -= vn * ax; c.vy -= vn * ay; c.vz -= vn * az;
        const s1 = Math.hypot(c.vx, c.vy, c.vz);
        if (s1 > 0.01 && s0 > s1) { const k = Math.min(1.03, s0 / s1); c.vx *= k; c.vy *= k; c.vz *= k; }
    }
    // Base Camp's stalls and signs
    if (S.zone === 0 && world.boxes) {
        for (const b of world.boxes) {
            const qx = clamp(c.x, b.min[0], b.max[0]), qz = clamp(c.z, b.min[1], b.max[1]), dx = c.x - qx, dz = c.z - qz, d2 = dx * dx + dz * dz;
            if (d2 >= CAR.r * CAR.r) continue;
            if (d2 < 1e-6) {
                // inside it: out by the nearest side
                const e = [c.x - b.min[0], b.max[0] - c.x, c.z - b.min[1], b.max[1] - c.z], i = e.indexOf(Math.min(...e));
                if (i === 0) c.x = b.min[0] - CAR.r; else if (i === 1) c.x = b.max[0] + CAR.r; else if (i === 2) c.z = b.min[1] - CAR.r; else c.z = b.max[1] + CAR.r;
                c.vx = 0; c.vz = 0;
            } else {
                const d = Math.sqrt(d2), ux = dx / d, uz = dz / d, vn = c.vx * ux + c.vz * uz;
                c.x = qx + ux * CAR.r; c.z = qz + uz * CAR.r;
                if (vn < 0) { c.vx -= vn * ux; c.vz -= vn * uz; if (vn < -8) ev = Math.max(ev, 5); }
            }
        }
    }
    const v0 = Math.hypot(c.vx, c.vz);
    if (world.clamp(c) && v0 - Math.hypot(c.vx, c.vz) > 8) ev = Math.max(ev, 5);
    return ev;
}
