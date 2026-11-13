// QA helper: one Eruption race on the autopilot, its state every two seconds. Run: node tests/race.mjs [map] [level]
import { startServer, startVite, stopAll, launch, open, shot, sleep, qa, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5649/', { w: 1280, h: 720, q: process.env.Q || 'medium', uid: 'race' + Date.now() });
await sleep(500);
await qa(page, (map, lv) => { const q = window.__qa; q.close(); q.noWatch(); q.play({ map, lv, now: true }); }, +(process.argv[2] || 0), +(process.argv[3] || 1));
await sleep(1500);
if (!process.env.MANUAL) await qa(page, () => window.__qa.auto(true));
for (let t = 0; t < 70; t += 1) {
    await sleep(1000);
    const s = await qa(page, () => { const q = window.__qa; return q.state(); });
    if (!s.match) { console.log('t' + (t + 2), 'back at Base Camp: wins', s.wins, 'gems', s.gems, 'matches', s.matches, 'matchWins', s.matchWins); break; }
    console.log(`t${String(t + 1).padStart(3)} ${s.match.phase} zone ${s.zone} u ${s.u} y ${s.y} v ${s.v}/${s.top} slip ${s.slip} air ${s.air} lava ${s.match.lavaY} done ${s.match.done} out ${s.match.out} best ${Math.max(...s.match.scores.map((r) => r[1]), 0)}`);
    if (t === 16 || t === 26) console.log(await shot(page, 'race_' + t));
}
await sleep(1500);
console.log(await shot(page, 'race_results'));
console.log('errors', page.errors);
await b.close(); stopAll();
process.exit(0);
