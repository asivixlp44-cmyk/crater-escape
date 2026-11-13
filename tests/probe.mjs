// QA helper: the autopilot in one crater, its climb printed every 2 s (how far up the wall, speed against top speed, slip).
// Run: node tests/probe.mjs [crater 0..11] [level] [world 0..3] [seconds]
import { startServer, startVite, stopAll, launch, open, shot, sleep, qa, TEST_PORT } from './lib.mjs';
const K = Number(process.argv[2] ?? 11), LV = Number(process.argv[3] ?? 30), WORLD = Number(process.argv[4] ?? 0), SECS = Number(process.argv[5] ?? 150);
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
try {
    const page = await open(b, 'http://localhost:5649/', { w: 1280, h: 720, q: 'low', uid: 'probe' + Date.now() });
    await qa(page, () => { const q = window.__qa; q.close(); q.noWatch(true); });
    if (WORLD) { await qa(page, (w) => { const q = window.__qa; q.give({ openWorlds: true }); q.send('world', { w }); }, WORLD); await page.waitForFunction((w) => window.__qa.view() && window.__qa.view().w === w, { timeout: 15000 }, WORLD); await sleep(1500); }
    await qa(page, (lv, k) => { const q = window.__qa; q.close(); q.give({ lv, reach: k, padCool: true }); }, LV, K);
    await sleep(600);
    await qa(page, (k) => { const q = window.__qa, cp = q.checkpoint(k); q.teleport(cp.x, cp.y, cp.z + 3, Math.PI); q.auto(true); }, K);
    const t0 = Date.now();
    let out = false;
    while (Date.now() - t0 < SECS * 1000 && !out) {
        await sleep(2000);
        const s = await qa(page, () => window.__qa.state());
        out = s.out.includes(K);
        console.log(((Date.now() - t0) / 1000).toFixed(0).padStart(4) + ' s  zone ' + s.zone + '  u ' + s.u + '  v ' + s.v + ' / top ' + s.top + '  need ' + s.need + '  reach ' + s.reach + '  slip ' + s.slip + '  air ' + s.air + '  y ' + s.y + (out ? '  OUT' : '') + '  snaps ' + s.snaps);
    }
    console.log('shot', await shot(page, 'probe-' + K));
    console.log('errors', JSON.stringify([...page.errors, ...(await qa(page, () => window.__qa.errors()))]));
} catch (e) { console.error(e); }
await b.close(); stopAll();
process.exit(0);
