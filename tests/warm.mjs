// Is everything really warmed up behind the loading screen? Counts the shaders right after loading, then does everything a player can do
// (a dyno, the bridge, straight off a rim, round a funnel's wall, the launch chevrons, an escape and its Wins, NITRO, down a hole, every kind
// of crater with its chevrons, boulders, slicks, sweeper and geysers, shopping, a new car, a trail, an underglow, pets, a race, the
// results, every world) and lists any shader compiled in play.
// Run: node tests/warm.mjs
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT } from './lib.mjs';

let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
const programs = (page) => page.evaluate(() => window.__qa.renderer().info.programs.map((p) => p.cacheKey));
try {
    for (const q of ['medium', 'low', 'high']) {
        console.log('--- ' + q);
        const page = await open(browser, 'http://localhost:5649/', { w: 1280, h: 720, q, uid: 'warm' + q + Date.now() });
        await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); });
        await sleep(1200);
        const before = new Set(await programs(page));
        console.log('  after loading: ' + before.size + ' shaders');
        // a race and a new world are built behind a fade: what compiles there can't be seen. Anything else in the list is a hitch in play
        const step = async (name, fn, wait, behindFade, arg) => {
            await qa(page, fn, arg);
            await sleep(wait || 700);
            await qa(page, () => window.__qa.close());
            const now = await programs(page), fresh = now.filter((p) => !before.has(p));
            if (fresh.length) { console.log('  ' + (behindFade ? 'behind the fade, ' : 'IN PLAY, ') + name + ': ' + fresh.length + ' compiled'); for (const p of fresh) { before.add(p); if (!behindFade) console.log('      ' + String(p).slice(0, 150)); } if (!behindFade) fails += fresh.length; } else console.log('  ' + name + ': nothing new');
        };
        await step('a dyno', () => { const q2 = window.__qa; q2.tpPost(0); q2.P.walkTo = { x: q2.P.c.x, z: q2.P.c.z - 9, until: 1e9 }; }, 2200);
        await step('flat out on it', () => { window.__qa.P.holdDash = true; }, 2200);
        await step('off it, and up the bridge', () => { const q2 = window.__qa; q2.P.holdDash = false; q2.P.walkTo = null; q2.teleport(0, 0, 40, Math.PI); q2.auto(true); }, 2500);
        // Crater 1 on the autopilot: off the rim, round its wall, out at the far side (the trophy, "+N Wins", the coins flying to the counter)
        const w0 = await qa(page, () => window.__qa.state().wins);
        await page.waitForFunction(() => window.__qa.state().out.includes(0), { timeout: 60000 }).catch(() => {});
        await step('round the wall of Crater 1 and out at its far side', () => 0, 1800);
        check((await qa(page, () => window.__qa.state().wins)) > w0, 'the escape paid');
        await step('NITRO', () => window.__qa.dash(), 1500);
        await step('through its gate', () => 0, 4000);
        // down a hole: the fall, the words, Base Camp
        await step('down the hole of Crater 2', () => { const q2 = window.__qa, I = q2.islandOf(1); q2.auto(false); q2.teleport(I.cx, I.E - I.H, I.cz, 0, true); }, 4500);
        // every kind of crater: boost chevrons, boulders, a slick band, a sweeper, geysers
        await qa(page, () => { const q2 = window.__qa; q2.auto(false); q2.give({ lv: 30, padCool: true }); });
        await sleep(500);
        for (let k = 1; k < 12; k++) {
            await step('Crater ' + (k + 1), (kk) => { const q2 = window.__qa, cp = q2.checkpoint(kk); q2.auto(false); q2.teleport(cp.x, cp.y, cp.z + 3, Math.PI, true); q2.auto(true); }, k % 3 ? 3200 : 9000, false, k);
        }
        await step('the summit', () => { const q2 = window.__qa, s = q2.summit; q2.auto(false); q2.teleport(s.x, s.y, s.z + 12, Math.PI, true); }, 1500);
        await step('shopping', () => { const q2 = window.__qa; q2.send('warp', { to: 'spawn' }); q2.give({ wins: 5e8, gems: 2000 }); q2.send('hatch', { j: 0, n: 3 }); q2.send('upgrade', { id: 'soles' }); }, 2800);
        await step('a new car', () => { const q2 = window.__qa; q2.give({ allCars: true }); q2.send('car', { i: 5 }); }, 1500);
        await step('the best car', () => window.__qa.send('car', { i: 11 }), 1500);
        await step('a rainbow trail, an underglow, every pet', () => { const q2 = window.__qa; q2.send('trail', { i: 8 }); q2.send('aura', { i: 5 }); q2.give({ allPals: true }); q2.key('KeyW', true); }, 2600);
        await step('every panel', async () => { const q2 = window.__qa; q2.key('KeyW', false); for (const k of ['cars', 'work', 'tele', 'spin', 'rebirth', 'shop', 'quests', 'daily', 'gifts', 'boards', 'settings', 'inv', 'stats']) { q2.panel(k); await new Promise((r) => setTimeout(r, 300)); q2.close(); } }, 600);
        await step('a race', () => window.__qa.play({ map: 2, lv: 14, now: true }), 2500, true);
        await page.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, { timeout: 25000 });
        await step('racing', () => window.__qa.auto(true), 9000);
        await page.waitForFunction(() => !window.__qa.state().match, { timeout: 170000 });
        await step('the results', () => window.__qa.auto(false));
        for (const w of [1, 2, 3]) {
            await step('world ' + (w + 1), (ww) => { const q2 = window.__qa; q2.give({ openWorlds: true }); q2.send('world', { w: ww }); }, 3200, true, w);
            await step('  driving there', () => { const q2 = window.__qa; q2.teleport(0, 0, 40, Math.PI); q2.auto(true); }, 6000);
            await qa(page, () => window.__qa.auto(false));
        }
        const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
        check(errs.length === 0, 'no console errors: ' + JSON.stringify(errs.slice(0, 3)));
        await page.close();
    }
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' new shaders or problems' : 'nothing compiled in play');
process.exit(fails ? 1 : 0);
