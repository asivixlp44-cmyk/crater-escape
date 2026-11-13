// Headless: a car on the shared physics at every crater, at so much of the crater's Recommended speed. It is driven straight up the
// bridge, across the landing and straight off the lip at the hole, the gas held: the drop carries it into a carve along the wall
// (nobody steering: the crater's own way; 'left' / 'right': the wheel over as it goes over the lip), it dives past the hole and
// comes up the wall towards the exit platform on the far side. NITRO as it comes up to the launch chevrons there, if that is what
// gets it onto them. Does it come out on the far side, settle on the wall (to lap for Levels), or go down the hole?
// Run: node tests/funnel.mjs           every crater at 0.3 to 1.06 of its Recommended speed
//      node tests/funnel.mjs 5 1.0 [how] one run, printed (crater 0..11, share of the speed; how: bridge, stop, left, right)
//      SWEEP=1 node tests/funnel.mjs   the least share that gets out of each crater
import { CFG, WALLS_N, stageV } from '../shared/config.js';
import { islandOf, reachU, worldFor, checkpoint, onExit, onExitBand, launchOut, exitU, exitArc, inHole, angDiff } from '../shared/world.js';
import { newCar, stepCar } from '../shared/physics.js';

const T = worldFor(0);
// how: 'bridge' rolling off the bridge's end at its top speed, nobody steering; 'stop' from a standstill at the checkpoint;
// 'left' / 'right' rolling, the wheel over as it goes over the lip
export function run(k, mult, how, loud) {
    const I = islandOf(k), cp = checkpoint(k), c = newCar(cp.x, cp.y, cp.z + (how === 'stop' ? 0 : 6), Math.PI), top = stageV(k) * mult;
    const inp = { steer: 0, throttle: 1, top, kick: 1 }, dt = 1 / 60;
    if (how !== 'stop') { c.vz = -top; c.vf = top; }
    { const o = {}; T.surf(c.x, c.z, o); c.y = o.y; c.air = false; }
    let nitroUntil = -1, nitroReady = 0, minU = 9, lastU = 0, side = 0;
    for (let t = 0; t < 60; t += dt) {
        const dx = c.x - I.cx, dz = c.z - I.cz, a = Math.atan2(dx, dz);
        inp.top = top * (t < nitroUntil ? CFG.dashK : 1); inp.kick = t < nitroUntil ? 1.6 : 1;
        // (the wheel over as it goes over the lip, then hands off)
        inp.steer = (how === 'left' || how === 'right') && dz > I.R - 4 && dz < I.R + 1.5 ? (how === 'right' ? 1 : -1) : 0;
        if (c.zone === 2 && !c.air) {
            minU = Math.min(minU, c.u); lastU = c.u;
            if (!side && c.drop > 0) side = c.dropS;
            // NITRO as it comes up to the far side's chevrons (about a second before them), if that's what gets it up onto them
            const eu = exitU(I), toBand = Math.abs(angDiff(I.aX, a)) - exitArc(I), lead = Math.hypot(c.vx, c.vz) * 1.0 / I.R;
            if (c.u < eu + 0.01 && c.u > eu - 0.2 && reachU(I, top * CFG.dashK) >= eu && toBand > 0 && toBand < lead && t >= nitroReady) { nitroUntil = t + CFG.dashSecs; nitroReady = t + CFG.dashCool; }
            if (onExitBand(k, c.x, c.z, c.u)) launchOut(k, c);
        }
        stepCar(c, inp, dt, T);
        if (loud && Math.round(t * 60) % 15 === 0) console.log(`t ${t.toFixed(2)} zone ${c.zone} a ${(a * 57.3).toFixed(0)} u ${(c.u ?? -1).toFixed(2)} v ${Math.hypot(c.vx, c.vy, c.vz).toFixed(0)}/${inp.top.toFixed(0)} y ${c.y.toFixed(1)} air ${c.air ? 1 : 0} slip ${(c.slip || 0).toFixed(2)} drop ${(c.drop || 0).toFixed(2)} side ${c.dropS || 0}`);
        if (inHole(k, c.x, c.y, c.z)) return { hole: t, minU, side };
        if (!c.air && c.zone === 3 && onExit(k, c.x, c.z)) return { out: t, minU, side };
    }
    return { minU, lastU, side, lapping: true };
}
const show = (r) => (r.out ? 'OUT ' + r.out.toFixed(1) + 's (dips to ' + (r.minU > 8 ? '-' : r.minU.toFixed(2)) + ')' : r.hole ? 'HOLE ' + r.hole.toFixed(1) + 's' : 'laps at ' + r.lastU.toFixed(2)).padEnd(26);
if (process.argv[2] && !process.env.SWEEP) { console.log(show(run(Number(process.argv[2]), Number(process.argv[3] || 1), process.argv[4] || 'bridge', true))); process.exit(0); }
const SHARES = [0.3, 0.5, 0.7, 0.8, 0.9, 1, 1.06];
if (process.env.SWEEP) {
    const row = [];
    for (let k = 0; k < WALLS_N; k++) { let m = 0.5; for (; m <= 1.2; m += 0.05) { const o = run(k, m, 'bridge'); if (o.out && o.out < 25) break; } row.push(m.toFixed(2)); }
    console.log('out from ' + row.join(' ') + ' of the Recommended speed (craters 1 to 12)');
    process.exit(0);
}
let bad = 0;
console.log('crater  R   | straight off the lip at ' + SHARES.join('x, ') + 'x of its Recommended speed | at 1.0x: from a standstill; the wheel left; the wheel right');
for (let k = 0; k < WALLS_N; k++) {
    const I = islandOf(k), rows = SHARES.map((m) => run(k, m, 'bridge')), stop = run(k, 1, 'stop'), left = run(k, 1, 'left'), right = run(k, 1, 'right');
    // at its Recommended speed, and a little over, it gets out (straight in, from a standstill, and steered either way); at 0.7 to 0.9
    // it doesn't go down the hole; the wheel picks the side
    const ok = rows[5].out && rows[6].out && stop.out && left.out && right.out && rows[5].out < 20 && !rows[2].hole && !rows[3].hole && !rows[4].hole && left.side === -1 && right.side === 1;
    if (!ok) bad++;
    console.log((ok ? '  ok ' : 'FAIL ') + String(k + 1).padStart(2) + '  ' + String(I.R).padStart(4) + '  | ' + rows.map(show).join('') + '| ' + show(stop) + show(left) + show(right) + ' (sides ' + left.side + ' ' + right.side + ')');
}
console.log(bad ? bad + ' FAILED' : 'all good');
process.exit(bad ? 1 : 0);
