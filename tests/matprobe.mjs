// QA helper: which materials make Three.js look its program up again every frame? Lists any material whose version moves from frame
// to frame (needsUpdate set in play) and any material shared by meshes of different kinds (batched / instanced / plain / skinned, or
// vertex colours with and without alpha): each switch between them costs a program lookup. Run: node tests/matprobe.mjs
import { startServer, startVite, stopAll, launch, open, sleep, qa, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const b = await launch();
try {
    const page = await open(b, 'http://localhost:5649/', { w: 1280, h: 720, q: process.env.Q || 'low', uid: 'mat' + Date.now() });
    await qa(page, () => { const q = window.__qa, cp = q.checkpoint(7); q.close(); q.noWatch(true); q.give({ lv: 15, reach: 7, allPals: true, allCars: true, car: 4 }); q.teleport(cp.x, cp.y, cp.z + 3, Math.PI); q.auto(true); });
    await sleep(5000);
    for (const view of ['a crater', 'Base Camp', 'a race']) {
    if (view === 'Base Camp') { await qa(page, () => { const q = window.__qa; q.auto(false); q.teleport(0, 0, 110, Math.PI); q.key('KeyW', true); }); await sleep(1500); await qa(page, () => window.__qa.key('KeyW', false)); }
    if (view === 'a race') { await qa(page, () => window.__qa.play({ map: 2, lv: 14, now: true })); await page.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, { timeout: 30000 }); await qa(page, () => window.__qa.auto(true)); await sleep(5000); }
    const r = await page.evaluate(async () => {
        const q = window.__qa, mats = new Map();
        const kind = (o) => (o.isBatchedMesh ? 'batched' : o.isInstancedMesh ? 'instanced' + (o.instanceColor ? '+color' : '') : o.isSkinnedMesh ? 'skinned' : o.isSprite ? 'sprite' : o.isPoints ? 'points' : 'plain');
        const scan = () => q.scene.traverseVisible((o) => {
            if (!o.material || !(o.isMesh || o.isPoints || o.isSprite)) return;
            for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
                let e = mats.get(m);
                if (!e) mats.set(m, e = { type: m.type, name: m.name || (m.customProgramCacheKey ? String(m.customProgramCacheKey()).slice(0, 40) : ''), kinds: new Set(), v0: m.version, bumps: 0, last: m.version });
                const col = o.geometry && o.geometry.attributes.color;
                e.kinds.add(kind(o) + (m.vertexColors && col ? ' c' + col.itemSize : '') + (o.geometry && o.geometry.morphAttributes && Object.keys(o.geometry.morphAttributes).length ? ' morph' : '') + (o.receiveShadow ? ' rs' : ''));
            }
        });
        for (let f = 0; f < 90; f++) {
            scan();
            for (const [m, e] of mats) { if (m.version !== e.last) { e.bumps++; e.last = m.version; } }
            await new Promise((res) => requestAnimationFrame(res));
        }
        const out = [];
        for (const [, e] of mats) if (e.bumps > 2 || e.kinds.size > 1) out.push({ type: e.type, name: e.name, bumps: e.bumps, kinds: [...e.kinds] });
        return { n: mats.size, out, programs: q.renderer().info.programs.length };
    });
    console.log(view + ': ' + r.n + ' materials in view, ' + r.programs + ' programs');
    for (const o of r.out) console.log('  ', JSON.stringify(o));
    if (!r.out.length) console.log('   none recompiled or shared across kinds');
    }
} catch (e) { console.error(e); }
await b.close(); stopAll();
process.exit(0);
