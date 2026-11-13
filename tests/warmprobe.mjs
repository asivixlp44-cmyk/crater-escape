// QA helper: what compiles when a step is taken, with the full program keys and what differs from the nearest one already there.
// Run: node tests/warmprobe.mjs [quality] [step: dyno|race|world]
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT } from './lib.mjs';
const Q = process.argv[2] || 'high', STEP = process.argv[3] || 'dyno';
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
const programs = (page) => page.evaluate(() => window.__qa.renderer().info.programs.map((p) => p.cacheKey));
try {
    const page = await open(browser, 'http://localhost:5649/', { w: 1280, h: 720, q: Q, uid: 'warmp' + Date.now() });
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); });
    await sleep(1200);
    const before = await programs(page);
    console.log(Q + ', after loading: ' + before.length + ' shaders');
    if (STEP === 'dyno') await qa(page, () => { const q2 = window.__qa; q2.tpPost(0); q2.P.walkTo = { x: q2.P.c.x, z: q2.P.c.z - 9, until: 1e9 }; });
    if (STEP === 'race') await qa(page, () => window.__qa.play({ map: 2, lv: 14, now: true }));
    if (STEP === 'world') await qa(page, () => { const q2 = window.__qa; q2.give({ openWorlds: true }); q2.send('world', { w: 1 }); });
    await sleep(STEP === 'dyno' ? 2500 : 6000);
    const now = await programs(page), fresh = now.filter((p) => !before.includes(p));
    console.log(fresh.length + ' compiled');
    for (const k of fresh) {
        const a = String(k).split(',');
        // the nearest key already there: the one with the fewest fields different
        let best = null, bd = 1e9;
        for (const o of before) { const b = String(o).split(','); if (b[0] !== a[0]) continue; let d = Math.abs(a.length - b.length); for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++; if (d < bd) { bd = d; best = b; } }
        console.log('  ' + a[0] + ' (' + a.length + ' fields), ' + bd + ' different from the nearest:');
        if (best) for (let i = 0; i < Math.max(a.length, best.length); i++) if (a[i] !== best[i]) console.log('     field ' + i + ': ' + String(best[i]).slice(0, 70) + '  ->  ' + String(a[i]).slice(0, 70));
        console.log('     tail: ' + a.slice(-6).join(',').slice(0, 200));
    }
    // which meshes draw with a freshly compiled program
    const users = await page.evaluate((fresh) => { const q = window.__qa, r = q.renderer(), out = []; q.scene.traverse((o) => { if (!o.material) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { const p = r.properties.get(m), prog = p && p.currentProgram; if (prog && fresh.includes(prog.cacheKey)) out.push((o.name || o.type) + (o.isInstancedMesh ? ' instanced' : '') + (o.isBatchedMesh ? ' batched' : '') + ' / ' + m.type + ' uniforms ' + Object.keys(m.uniforms || {}).join(',') + ' side ' + m.side + ' transparent ' + m.transparent + ' visible ' + o.visible + ' parent ' + (o.parent && (o.parent.name || o.parent.type))); } }); return out.slice(0, 12); }, fresh);
    console.log('drawn with a new program:', JSON.stringify(users, null, 1));
    // who's drawing with a material that has a map, in view
    const who = await page.evaluate(() => { const out = []; window.__qa.scene.traverseVisible((o) => { if (o.isMesh && o.material && o.material.map && o.material.isMeshLambertMaterial) out.push((o.name || o.type) + (o.isSkinnedMesh ? ' skinned' : '') + (o.isInstancedMesh ? ' instanced' : '') + (o.castShadow ? ' casts' : '') + (o.receiveShadow ? ' receives' : '') + ' alphaTest ' + o.material.alphaTest + ' transparent ' + o.material.transparent + ' vc ' + o.material.vertexColors + ' parent ' + (o.parent && (o.parent.name || o.parent.type))); }); return out.slice(0, 20); });
    console.log('lambert meshes with a map in view: ' + who.length);
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
