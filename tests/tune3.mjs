// Headless: a race's volcano with the race's growing engine, the gas held: how the car climbs against its reach and the lava
import { CFG, matchInfo } from '../shared/config.js';
import { arenaPlan, arenaWorld, startSpot, topAt, arenaReach, surgeY, arenaPct } from '../shared/arena.js';
import { newCar, stepCar } from '../shared/physics.js';
const lv = +(process.argv[2] || 1), plan = arenaPlan(7, lv), T = arenaWorld(plan), D = plan.D, B = plan.B;
const sp = startSpot(0, plan), c = newCar(sp.x, sp.y, sp.z, sp.ry), inp = { steer: 0, throttle: 1, top: 26, kick: 1 };
console.log('R', B.R, 'r0', B.r0, 'H', B.H, 'tEsc', D.tEsc, 'vEsc', D.vEsc.toFixed(1), 'secs', D.secs);
let out = -1, dead = -1, nitroUntil = -1, nitroReady = 0;
for (let t = 0; t < D.secs; t += 1 / 60) {
    const top = topAt(D, t, 1), reach = arenaReach(plan, top), rn = arenaReach(plan, top * CFG.dashK);
    const dx = c.x, dz = c.z, rr = Math.hypot(dx, dz) || 1, outw = (Math.sin(c.ry) * dx + Math.cos(c.ry) * dz) / rr;
    inp.steer = c.zone === 1 ? (outw < 0.25 ? 0.4 : outw > 0.45 ? -0.3 : 0) : 0;
    if (process.env.NITRO && c.zone === 2 && rn >= 1 && c.u > reach - 0.08 && t >= nitroReady) { nitroUntil = t + CFG.dashSecs; nitroReady = t + CFG.dashCool; }
    inp.top = top * (t < nitroUntil ? CFG.dashK : 1); inp.kick = t < nitroUntil ? 1.8 : 1;
    stepCar(c, inp, 1 / 60, T);
    const ly = surgeY(plan, t);
    if (c.zone === 3 && !c.air && out < 0) { out = t; break; }
    if (c.y < ly - 0.6 && dead < 0) { dead = t; }
    if (Math.round(t * 60) % 60 === 0) console.log(`t ${String(Math.round(t)).padStart(2)} zone ${c.zone} u ${(c.u ?? -1).toFixed(2)} reach ${reach.toFixed(2)} v ${Math.hypot(c.vx, c.vy, c.vz).toFixed(0)}/${top.toFixed(0)} fs ${(c.fs || 0).toFixed(2)} use ${(c.use || 0).toFixed(2)} slip ${c.slip.toFixed(2)} pct ${arenaPct(plan, c.y).toFixed(2)} lava ${((ly + B.H) / B.H).toFixed(2)}${dead >= 0 ? ' DEAD' : ''}`);
}
console.log(out >= 0 ? 'OUT at ' + out.toFixed(1) : 'not out', dead >= 0 ? 'lava at ' + dead.toFixed(1) : '');
