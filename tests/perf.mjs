// Measured frame rates: desktop, a simulated weak laptop (CPU throttled 4x, 1366x768, Low), a simulated phone (touch, 844x390 and 390x844
// at 2x, Low, CPU 4x), each riding a funnel's wall on the autopilot (boulders, chevrons, pets behind), revving on a dyno, on a rim's crescent, at
// the spawn, and in a race with every bot and the lava; and a CPU profile of the unminified dev build.
// Run with Chrome on the integrated chip: LOW_GPU=1 node tests/perf.mjs [profile]
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startVite, stopAll, launch, open, qa, sleep, measure, OUT, TEST_PORT } from './lib.mjs';

const PROFILE = process.argv[2] === 'profile';
const DEV = [
    { name: 'Desktop 1920x1080 High', w: 1920, h: 1080, q: 'high' },
    { name: 'Desktop 1600x900 Medium', w: 1600, h: 900, q: 'medium' },
    { name: 'Weak laptop 1366x768 Low, CPU 4x', w: 1366, h: 768, q: 'low', cpu: 4 },
    { name: 'Phone 844x390 @2x, Low, CPU 4x', w: 844, h: 390, dpr: 2, q: 'low', cpu: 4, touch: true },
    { name: 'Phone 390x844 @2x, Low, CPU 4x', w: 390, h: 844, dpr: 2, q: 'low', cpu: 4, touch: true },
];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
const results = [];
const fmtM = (m) => `${m.fps} FPS${m.paced ? ' (every other refresh of ' + m.refresh + ')' : ''}, p50 ${m.p50} p95 ${m.p95} worst ${m.max} ms, ${m.over50} over 50 ms, work ${m.avgMs} ms, ${m.calls} calls, ${m.tris} tris`;
try {
    for (const D of (PROFILE ? [DEV[2]] : DEV.filter((d, i) => !ONLY || ONLY.includes(i)))) {
        console.log('\n=== ' + D.name);
        const page = await open(browser, 'http://localhost:5649/', { ...D, uid: 'perf' + Date.now() });
        console.log('  load + join: ' + page.loadSecs + ' s; ' + await qa(page, () => window.__qa.gpu()));
        // a team, a good car, some way along: what a player has after a while
        await qa(page, () => { const q = window.__qa; q.noWatch(true); q.close(); q.give({ wins: 2000, allCars: true, car: 4, lv: 12, reach: 7, allPals: true, speed: 60000 }); });
        await sleep(1500);
        const row = { name: D.name, load: page.loadSecs };
        // lapping a crater with boulders in it, at speed, on the autopilot: its wall going by, your pets behind (four Levels short of
        // its far side: it laps the wall, and doesn't get out)
        await qa(page, () => { const q = window.__qa, cp = q.checkpoint(7); q.close(); q.give({ lv: 9 }); q.teleport(cp.x, cp.y, cp.z + 3, Math.PI); q.perf(true); q.auto(true); });
        await sleep(5000);
        if (PROFILE) {
            const c = await page.createCDPSession();
            await c.send('Profiler.enable');
            await c.send('Profiler.setSamplingInterval', { interval: 500 });
            await c.send('Profiler.start');
            await sleep(12000);
            const { profile } = await c.send('Profiler.stop');
            const self = new Map(), total = profile.samples.length;
            const byId = new Map(profile.nodes.map((n) => [n.id, n]));
            for (const s of profile.samples) { const n = byId.get(s).callFrame; const k = n.functionName + ' ' + n.url.split('/').pop().split('?')[0] + ':' + n.lineNumber; self.set(k, (self.get(k) || 0) + 1); }
            const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 26);
            console.log('  CPU profile (self time):');
            for (const [k, v] of top) console.log('   ' + (v / total * 100).toFixed(1).padStart(5) + '%  ' + k);
            const reads = [...self.entries()].filter(([k]) => /getBoundingClientRect|getComputedStyle|offsetParent|offsetWidth|offsetHeight|clientWidth/.test(k)).reduce((a, [, v]) => a + v, 0);
            const audioCalls = [...self.entries()].filter(([k]) => /createOscillator|createGain|createBiquad|createBufferSource|setValueAtTime|setTargetAtTime|exponentialRamp|\bconnect\b/.test(k)).reduce((a, [, v]) => a + v, 0);
            console.log('  layout and style reads: ' + (reads / total * 100).toFixed(2) + '%, audio-node calls: ' + (audioCalls / total * 100).toFixed(2) + '%');
            fs.writeFileSync(path.join(OUT, 'cpu.cpuprofile'), JSON.stringify(profile));
            console.log('  sections:', JSON.stringify(await qa(page, () => window.__qa.sections())));
        }
        row.run = await measure(page, 6);
        console.log('  lapping a crater: ' + fmtM(row.run));
        // revving on a dyno
        await qa(page, () => { const q = window.__qa; q.auto(false); q.close(); q.tpPost(0); q.P.walkTo = { x: q.P.c.x, z: q.P.c.z - 9, until: 1e9 }; });
        await sleep(2600);
        await qa(page, () => { window.__qa.P.holdDash = true; });
        row.dyno = await measure(page, 4);
        console.log('  revving on a dyno: ' + fmtM(row.dyno));
        await qa(page, () => { window.__qa.P.holdDash = false; });
        // on a rim's deck, the crater below and the islands beyond
        await qa(page, () => { const q = window.__qa, cp = q.checkpoint(5); q.teleport(cp.x, cp.y, cp.z - 6, Math.PI); });
        await sleep(800);
        row.deck = await measure(page, 4);
        console.log("  on a rim's deck: " + fmtM(row.deck));
        // the biggest crater (201 studs to its rim, 199 deep), lapping it at Level 24
        await qa(page, () => { const q = window.__qa, cp = q.checkpoint(11); q.give({ lv: 24, reach: 11, padCool: true }); q.teleport(cp.x, cp.y, cp.z + 3, Math.PI, true); q.auto(true); });
        await sleep(3500);
        row.big = await measure(page, 5);
        console.log('  in the biggest crater: ' + fmtM(row.big));
        await qa(page, () => window.__qa.auto(false));
        // at the spawn (the bots about)
        await qa(page, () => { const q = window.__qa; q.teleport(0, 0, 100, Math.PI); });
        await sleep(800);
        row.spawn = await measure(page, 4);
        console.log('  at the spawn: ' + fmtM(row.spawn));
        // a race: six cars on the volcano, the lava rising
        await qa(page, () => window.__qa.play({ map: 1, lv: 14, now: true }));
        await page.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, { timeout: 30000 });
        await qa(page, () => window.__qa.auto(true));
        await sleep(2500);
        row.race = await measure(page, 6);
        console.log('  in a race: ' + fmtM(row.race));
        const sp = await qa(page, () => window.__qa.spikes());
        console.log('  frames over 45 ms all told: ' + sp.length + (sp.length ? ' ' + JSON.stringify(sp.slice(0, 6)) : ''), '| slow:', JSON.stringify(await qa(page, () => window.__qa.slow())).slice(0, 400));
        const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
        if (errs.length) console.log('  errors:', errs.slice(0, 4));
        results.push(row);
        await page.close();
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
const cell = (m) => (m ? `${m.fps}${m.paced ? ' paced' : ''} (${m.p95} ms)` : '-');
console.log("\n| Device | Lapping a crater | Revving on a dyno | On a rim's deck | The biggest crater | At the spawn | In a race | Load + join (dev build) |\n|---|---|---|---|---|---|---|---|");
for (const r of results) console.log(`| ${r.name} | ${cell(r.run)} | ${cell(r.dyno)} | ${cell(r.deck)} | ${cell(r.big)} | ${cell(r.spawn)} | ${cell(r.race)} | ${r.load.toFixed(1)} s |`);
process.exit(0);
