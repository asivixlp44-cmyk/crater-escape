// Looks at the game from set places (the spawn, a dyno, the dealer's, a crater from its on-ramp, from over it and from its wall, a gate, the summit,
// every world's Base Camp): a screenshot of each, with its draws and triangles. Run: node tests/look.mjs (W, H, Q, BOTS, ONLY=a,b)
import { startServer, startVite, stopAll, launch, open, shot, sleep, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: process.env.BOTS ? '' : '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5649/', { w: +(process.env.W || 1280), h: +(process.env.H || 720), q: process.env.Q || 'medium', uid: 'look' + Date.now(), touch: !!process.env.TOUCH });
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const log = async (name) => { if (only && !only.some((o) => name.startsWith(o))) return; const f = await shot(page, name); console.log(name, JSON.stringify(await page.evaluate(() => { const s = window.__qa.state(), d = window.__qa.diag(); return { x: s.x, y: s.y, z: s.z, stage: s.stage, zone: s.zone, ...d }; })), f); };
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await sleep(1000);
await ev(() => { const q = window.__qa; q.close(); q.noWatch(); });
await log('a_spawn');
await ev(() => { const q = window.__qa; q.look(Math.PI, 0.3, 30); });
await sleep(700);
await log('a2_spawn_back');
await ev(() => { const q = window.__qa; q.tpPost(0); q.look(0.6, 0.3, 24); });
await sleep(2500);
await log('b_dyno');
await ev(() => { const q = window.__qa; q.teleport(56, 0, 84, Math.PI); q.look(0, 0.25, 30); });
await sleep(800);
await log('c_dealer');
await ev(() => { const q = window.__qa; q.teleport(60, 0, 118, Math.PI * 0.5); q.look(0, 0.3, 30); });
await sleep(800);
await log('c2_eggs');
await ev(() => { const q = window.__qa; q.teleport(-55, 0, 112, 0); q.look(0, 0.2, 34); });
await sleep(800);
await log('c3_portals');
await ev(() => { const q = window.__qa; q.teleport(0, 0, 60, Math.PI); q.look(0, 0.18, 26); });
await sleep(800);
await log('d_bridge');
for (const k of [0, 3, 7, 11]) {
    await ev((kk) => { const q = window.__qa, cp = q.checkpoint(kk); q.teleport(cp.x, cp.y, cp.z + 4, Math.PI); q.look(0, 0.42, 30); }, k);
    await sleep(900);
    await log('e_deck' + k);
    await ev((kk) => { const q = window.__qa, I = q.islandOf(kk), cp = q.checkpoint(kk); q.teleport(cp.x, cp.y, cp.z - 6, Math.PI); q.look(0, 1.05, 30 + I.R * 0.9); }, k);
    await sleep(900);
    await log('f_over' + k);
    await ev((kk) => { const q = window.__qa, I = q.islandOf(kk); q.teleport(0, I.E, I.cz + I.R + 9, Math.PI); q.look(0, 0.34, 24); }, k);
    await sleep(900);
    await log('f_ramp' + k);
    await ev((kk) => { const q = window.__qa, I = q.islandOf(kk), r = I.r0 + (I.R - I.r0) * 0.75; q.teleport(I.cx + r, I.E - I.H + I.H * 0.5625, I.cz, Math.PI); q.look(0, 0.3, 30); }, k);
    await sleep(500);
    await log('g_wall' + k);
}
await ev(() => { const q = window.__qa, I = q.islandOf(0); q.teleport(0, I.E, I.zN + 22, Math.PI); q.look(0, 0.2, 26); });
await sleep(900);
await log('h_gate');
await ev(() => { const q = window.__qa, s = q.summit; q.teleport(0, s.y, s.z + 20, Math.PI, true); q.look(0, 0.2, 28); });
await sleep(900);
await log('i_summit');
for (const w of [1, 2, 3]) {
    await ev((ww) => { const q = window.__qa; q.give({ openWorlds: true }); q.send('world', { w: ww }); }, w);
    await sleep(3500);
    await ev(() => { window.__qa.close(); window.__qa.look(0, 0.25, 28); });
    await sleep(600);
    await log('j_world' + w);
    await ev(() => { const q = window.__qa, I = q.islandOf(4), cp = q.checkpoint(4); q.teleport(cp.x, cp.y, cp.z - 6, Math.PI); q.look(0, 0.8, 30 + I.R * 0.7); });
    await sleep(900);
    await log('k_world' + w + '_crater5');
}
console.log('errors', page.errors);
await b.close(); stopAll();
process.exit(0);
