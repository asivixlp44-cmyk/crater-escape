// QA helper: shots of the big craters (and a race's volcano) at High, the car on the wall at a few places round it: any shadow patch
// that comes and goes with the car, any stripes. Run: node tests/shadowlook.mjs
import { startServer, startVite, stopAll, launch, open, shot, sleep, qa, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
try {
    const page = await open(b, 'http://localhost:5649/', { w: 1280, h: 720, q: 'high', uid: 'shl' + Date.now() });
    await qa(page, () => { const q = window.__qa; q.close(); q.noWatch(true); q.give({ lv: 30, reach: 11 }); });
    await sleep(800);
    for (const [k, a] of [[11, 0.9], [11, 2.4], [9, 1.6], [6, 2.2]]) {
        await qa(page, (kk, aa) => { const q = window.__qa, I = q.islandOf(kk), u = 0.6, r = I.r0 + (I.R - I.r0) * u; q.teleport(I.cx + Math.sin(aa) * r, I.E - I.H + I.H * u * u, I.cz + Math.cos(aa) * r, aa + Math.PI / 2, true); q.look(0, 0.35, 28); }, k, a);
        await sleep(1500);
        console.log('shot', await shot(page, 'shl-' + k + '-' + a));
    }
    await qa(page, () => window.__qa.play({ map: 2, lv: 22, now: true }));
    await page.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, { timeout: 30000 });
    await qa(page, () => window.__qa.auto(true));
    await sleep(9000);
    console.log('shot', await shot(page, 'shl-race'));
    console.log('errors', JSON.stringify([...page.errors, ...(await qa(page, () => window.__qa.errors()))]));
} catch (e) { console.error(e); }
await b.close(); stopAll();
process.exit(0);
