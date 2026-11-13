// A slow avatar server: the avatar's model and skins arrive well after the game has loaded. Nothing may compile when they do (their
// shaders are warmed with stand-ins behind the loading screen, whatever the network does).
// Run: node tests/warmslow.mjs [low|medium|high ...]   (SLOW=ms the delay, 14000)
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT } from './lib.mjs';
const QS = process.argv.length > 2 ? process.argv.slice(2) : ['high', 'medium', 'low'], SLOW = Number(process.env.SLOW) || 14000;
// (in the page, before anything else: everything from the avatar server held back)
const HOLD = (ms) => {
    const slow = (u) => /avatars|player\.glb|\/skins\/|\/items\/|\/textures\//.test(String(u)) && /bloxity/.test(String(u));
    const f0 = window.fetch;
    window.fetch = function (u, o) { const url = typeof u === 'string' ? u : (u && u.url) || ''; return slow(url) ? new Promise((res) => setTimeout(res, ms)).then(() => f0.call(window, u, o)) : f0.call(window, u, o); };
    const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, get() { return d.get.call(this); }, set(v) { if (slow(v)) setTimeout(() => d.set.call(this, v), ms); else d.set.call(this, v); } });
};
let fails = 0;
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
const programs = (page) => page.evaluate(() => window.__qa.renderer().info.programs.map((p) => p.cacheKey));
try {
    for (const q of QS) {
        const page = await open(browser, 'http://localhost:5649/', { w: 1280, h: 720, q, uid: 'slowav' + q + Date.now(), init: HOLD, initArg: SLOW });
        await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); });
        await sleep(800);
        const before = await programs(page);
        const had = await page.evaluate(() => { let n = 0; window.__qa.scene.traverseVisible((o) => { if (o.isSkinnedMesh) n++; }); return n; });
        // driving about while they arrive: yours, and the bots' at Base Camp
        await qa(page, () => window.__qa.auto(true));
        await sleep(SLOW + 9000);
        await qa(page, () => window.__qa.auto(false));
        const now = await programs(page), fresh = now.filter((p) => !before.includes(p));
        const have = await page.evaluate(() => { let n = 0; window.__qa.scene.traverseVisible((o) => { if (o.isSkinnedMesh) n++; }); return n; });
        console.log((fresh.length ? 'FAIL  ' : '  ok  ') + q + ': loaded in ' + page.loadSecs + ' s with ' + before.length + ' shaders and ' + had + ' avatars drawn; ' + have + ' avatars later, ' + fresh.length + ' compiled when they came');
        for (const k of fresh) console.log('        ' + String(k).split(',').filter((x, i) => i < 2 || (x !== 'false' && x !== '' && x !== '0')).join(',').slice(0, 220));
        if (fresh.length || !have) fails++;
        if (!have) console.log('FAIL  no avatar ever arrived (the delay never let go?)');
        const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
        if (errs.length) { console.log('FAIL  console errors: ' + JSON.stringify(errs.slice(0, 3))); fails++; }
        await page.close();
    }
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
