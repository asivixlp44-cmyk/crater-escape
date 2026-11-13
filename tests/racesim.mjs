// Headless: is a race fair to someone who just holds the gas? A car on the shared physics in a race's volcano, the engine growing as
// it does in the race, nobody steering on the wall. With no mistake it must be out over the rim before the clock; knocked by one
// boulder (a quarter of its speed gone and MATCH.stunSecs off the gas) at any moment of the race it must still beat the lava.
// Prints how close the lava came (of the volcano's depth). Run: node tests/racesim.mjs
import { matchInfo, MATCH } from '../shared/config.js';
import { arenaPlan, arenaWorld, startSpot, topAt, surgeY, arenaPct } from '../shared/arena.js';
import { newCar, stepCar } from '../shared/physics.js';

const KNOCK = 0.75;
function run(lv, K) {
    const plan = arenaPlan(7, lv), T = arenaWorld(plan), D = plan.D;
    const sp = startSpot(0, plan), c = newCar(sp.x, sp.y, sp.z, sp.ry), inp = { steer: 0, throttle: 1, top: D.v0, kick: 1 };
    let stunUntil = -1, gap = 9;
    for (let t = 0; t < D.secs; t += 1 / 60) {
        const rr = Math.hypot(c.x, c.z) || 1, outw = (Math.sin(c.ry) * c.x + Math.cos(c.ry) * c.z) / rr;
        // (round the floor and out to the wall at a slant; on the wall, hands off)
        inp.steer = t < stunUntil ? 0 : c.zone === 1 ? (outw < 0.25 ? 0.4 : outw > 0.45 ? -0.3 : 0) : 0;
        inp.throttle = t < stunUntil ? 0 : 1;
        inp.top = topAt(D, t, 1);
        if (K > 0 && Math.abs(t - K) < 1 / 120) { c.vx *= KNOCK; c.vy *= KNOCK; c.vz *= KNOCK; stunUntil = t + MATCH.stunSecs; }
        stepCar(c, inp, 1 / 60, T);
        const ly = surgeY(plan, t);
        if (t > D.surgeAt + 2 && c.zone === 2) gap = Math.min(gap, arenaPct(plan, c.y) - arenaPct(plan, ly));
        if (c.zone === 3 && !c.air) return { out: t, gap };
        if (c.y < ly - 0.6) return { lava: t, gap };
    }
    return { time: true, gap };
}
let bad = 0;
for (const lv of [1, 8, 14, 22, 30, 40, 54]) {
    const D = matchInfo(lv), clean = run(lv, -1);
    const row = [];
    for (let K = 6; K <= Math.floor(D.tEsc) + 2; K += 2) { const r = run(lv, K); if (!r.out) bad++; row.push(K + ' s: ' + (r.out ? 'out ' + r.out.toFixed(1) + ' (' + r.gap.toFixed(2) + ')' : r.lava ? 'LAVA ' + r.lava.toFixed(1) : 'TIME')); }
    if (!clean.out) bad++;
    console.log((clean.out ? '  ok  ' : 'FAIL  ') + 'Level ' + lv + ' (' + D.secs + ' s on the clock, ' + D.rocks + ' boulders' + (D.slick ? ', a slick band' : '') + '): no mistake, out at ' + (clean.out ? clean.out.toFixed(1) + ' s, the lava never closer than ' + clean.gap.toFixed(2) : 'never'));
    console.log('        knocked once at ' + row.join(' | '));
}
console.log(bad ? bad + ' FAILED' : 'all good: one mistake is survivable at every Level');
process.exit(bad ? 1 : 0);
