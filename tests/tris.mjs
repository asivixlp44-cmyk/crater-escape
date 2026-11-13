// Where the triangles go: every mesh drawn in a few views, its triangles (instances and batch members counted), the biggest first.
// Run: node tests/tris.mjs (Q=low|medium|high)
import { startServer, startVite, stopAll, launch, open, sleep, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5649/', { w: 1280, h: 720, q: process.env.Q || 'medium', uid: 'tris' + Date.now() });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await sleep(800);
await ev(() => { window.__qa.close(); window.__qa.noWatch(true); });
const report = async (name) => {
    await sleep(1100);
    const r = await ev(() => {
        const q = window.__qa, out = [];
        const tri = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
        q.scene.traverseVisible((o) => {
            if (!(o.isMesh || o.isPoints)) return;
            let n = 0;
            if (o.isBatchedMesh) { n = o.userData.triShown || 0; }
            else if (o.isInstancedMesh) n = tri(o.geometry) * o.count;
            else if (o.geometry) n = tri(o.geometry);
            const nm = (o.material && (o.material.customProgramCacheKey ? o.material.customProgramCacheKey() : o.material.type)) + (o.isBatchedMesh ? ' [batch]' : o.isInstancedMesh ? ' [inst x' + o.count + ']' : '');
            out.push([nm, Math.round(n)]);
        });
        const agg = {};
        for (const [k, n] of out) agg[k] = (agg[k] || 0) + n;
        return { info: q.diag(), top: Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 12) };
    });
    console.log('==', name, JSON.stringify(r.info));
    for (const [k, n] of r.top) console.log('   ', String(n).padStart(8), String(k).slice(0, 90));
};
await report('Base Camp, at the spawn');
await ev(() => { const q = window.__qa; q.teleport(0, 0, 50, Math.PI); q.look(0, 0.12, 22); });
await report('the first bridge');
await ev(() => { const q = window.__qa, cp = q.checkpoint(0); q.give({ lv: 30 }); q.teleport(cp.x, cp.y, cp.z + 2, Math.PI, true); q.look(0, 0.3, 22); });
await report('Crater 1, from its near crescent');
await ev(() => { const q = window.__qa, cp = q.checkpoint(5); q.teleport(cp.x, cp.y, cp.z + 2, Math.PI, true); q.look(0, 0.3, 22); });
await report('Crater 6');
await ev(() => { const q = window.__qa, cp = q.checkpoint(11); q.teleport(cp.x, cp.y, cp.z + 2, Math.PI, true); q.look(0, 0.3, 22); });
await report('Crater 12 (the biggest)');
await ev(() => { const q = window.__qa, I = q.islandOf(11), r = I.r0 + (I.R - I.r0) * 0.22; q.teleport(I.cx + r, I.E - I.H + I.H * 0.0484, I.cz, Math.PI, true); q.look(0, 0.5, 30); });
await report('low on its wall, by the hole');
console.log('errors', page.errors);
await b.close(); stopAll();
process.exit(0);
