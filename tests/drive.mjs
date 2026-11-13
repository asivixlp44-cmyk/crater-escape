// QA helper: the autopilot drives from the spawn; its state every couple of seconds. Run: node tests/drive.mjs [secs] (LV: start Level)
import { startServer, startVite, stopAll, launch, open, shot, sleep, qa, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5649/', { w: 1280, h: 720, q: process.env.Q || 'medium', uid: 'drive' + Date.now() });
const secs = +(process.argv[2] || 60);
await sleep(500);
if (process.env.LV) { await qa(page, (lv) => window.__qa.give({ lv }), +process.env.LV); await sleep(400); }
if (process.env.K) { await qa(page, (k) => { const q = window.__qa, cp = q.checkpoint(k); q.give({ reach: k }); q.teleport(cp.x, cp.y, cp.z + 3, Math.PI); }, +process.env.K); await sleep(600); }
await qa(page, () => { const q = window.__qa; q.close(); q.noWatch(); q.auto(true); });
let last = '';
for (let t = 0; t < secs; t += 2) {
    await sleep(2000);
    const s = await qa(page, () => { const q = window.__qa; q.close(); return q.state(); });
    const line = `t${String(t + 2).padStart(3)} st ${s.stage} zone ${s.zone} u ${s.u} y ${s.y} v ${s.v}/${s.top} lv ${s.lv} wins ${s.wins} deep ${s.deep} out [${s.out}] reach ${s.reach} snaps ${s.snaps} air ${s.air} slip ${s.slip}`;
    if (line !== last) console.log(line);
    last = line;
    if (process.env.SHOT && (t + 2) % +process.env.SHOT === 0) console.log(await shot(page, 'drive_' + (t + 2)));
}
console.log('errors', page.errors);
await b.close(); stopAll();
process.exit(0);
