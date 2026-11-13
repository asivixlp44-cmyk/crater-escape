// Far from the server: everything through a relay that adds 175 ms each way (a 350 ms round trip), two real browser players.
// On a dyno: Speed never jumps back and no step is lost. A funnel crossed on your screen pays on the server, its gate lets you
// through, nothing is sent back. The clock: corrected for the round trip. Others: smooth on the server's clock. Both RACE presses
// land in one race, each sees the other, nobody is sent back.
// Run: node tests/latency.mjs
import net from 'node:net';
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT } from './lib.mjs';

const ONE_WAY = Number(process.env.ONE_WAY) || 175;
let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
// the relay: TEST_PORT (where the dev client looks) to the server on TEST_PORT + 1, every chunk held back ONE_WAY ms, in order
const relay = net.createServer((a) => {
    const b = net.connect(TEST_PORT + 1, '127.0.0.1');
    const pipe = (from, to) => { from.on('data', (d) => { setTimeout(() => { if (!to.destroyed) to.write(d); }, ONE_WAY); }); from.on('close', () => setTimeout(() => to.destroy(), ONE_WAY)); from.on('error', () => {}); };
    pipe(a, b); pipe(b, a);
}).listen(TEST_PORT);

await startServer(TEST_PORT + 1, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const A = await open(browser, 'http://localhost:5649/', { w: 960, h: 540, q: 'low', uid: 'latA' + Date.now() });
    const B = await open(browser, 'http://localhost:5649/', { w: 960, h: 540, q: 'low', uid: 'latB' + Date.now() });
    for (const p of [A, B]) await qa(p, () => { window.__qa.noWatch(true); window.__qa.close(); });
    await sleep(5000);
    const rtt = await qa(A, () => window.__qa.net.rtt);
    check(rtt > ONE_WAY * 1.8 && rtt < ONE_WAY * 3, 'the round trip measured: ' + rtt + ' ms');
    const clk = await qa(A, async () => { const q = window.__qa, r = q.net.room; return q.net.now() - r.state.now; });
    check(Math.abs(clk) < rtt, 'the client\'s server clock against the last state it got: ' + Math.round(clk) + ' ms ahead (a one-way trip or so)');
    // revving on a dyno with a long way to the server: Speed never goes backwards, and every step gets there
    await qa(A, () => { const q = window.__qa; q.tpPost(0); q.P.walkTo = { x: q.P.c.x, z: q.P.c.z - 9, until: 1e9 }; });
    await A.waitForFunction(() => window.__qa.state().tread >= 0, { timeout: 8000 }).catch(() => {});
    const sp = await qa(A, async () => {
        const q = window.__qa, out = [], t0 = performance.now();
        q.P.holdDash = true;
        await new Promise((res) => { const f = () => { out.push(q.S.powerShown); if (performance.now() - t0 < 10000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        q.P.holdDash = false;
        let back = 0, worst = 0;
        for (let i = 1; i < out.length; i++) { const d = out[i] - out[i - 1]; if (d < -1e-6) { back++; worst = Math.min(worst, d); } }
        return { back, worst, last: out[out.length - 1] };
    });
    check(sp.last > 40, 'revving over a round trip that long: Speed ' + Math.floor(sp.last));
    check(sp.back === 0 || sp.worst > -sp.last * 0.05, 'Speed doesn\'t jump back: ' + sp.back + ' dips, worst ' + sp.worst.toFixed(2));
    // off the rollers (they'd keep turning), then everything sent has had its answer
    await qa(A, () => window.__qa.key('KeyS', true));
    await sleep(500);
    await qa(A, () => window.__qa.key('KeyS', false));
    await sleep(4500);
    const srv = await qa(A, () => { const q = window.__qa; return { shown: q.S.powerShown, server: q.S.speed, pend: q.S.pendXp }; });
    check(Math.abs(srv.shown - srv.server) < 1 && !srv.pend, 'every step got there: ' + Math.floor(srv.shown) + ' on screen, ' + Math.floor(srv.server) + ' on the server');
    // Crater 1, from the top of its bridge on the autopilot: straight off the rim, round its wall, out at its far side; the server (a moment behind) pays, the
    // gate lets it through, nothing sent back
    await qa(A, () => { const q = window.__qa, cp = q.checkpoint(0); q.teleport(cp.x, cp.y, cp.z + 3, Math.PI); });
    await sleep(900);
    const wA = (await qa(A, () => window.__qa.state())).wins;
    await qa(A, () => window.__qa.auto(true));
    const outOk = await A.waitForFunction(() => window.__qa.state().out.includes(0), { timeout: 60000 }).then(() => true, () => false);
    await sleep(1200);
    const g2 = await qa(A, () => window.__qa.state());
    check(outOk && g2.snaps === 0, 'round the wall of Crater 1 and out at its far side: nothing sent back (snaps ' + g2.snaps + ')');
    check(g2.wins > wA, 'the server saw it too and paid: +' + (g2.wins - wA) + ' Wins');
    const on = await A.waitForFunction(() => window.__qa.state().stage >= 1, { timeout: 30000 }).then(() => true, () => false);
    const g3 = await qa(A, () => window.__qa.state());
    check(on && g3.snaps === 0, 'through its gate onto the next bridge: nothing sent back');
    await qa(A, () => { const q = window.__qa; q.auto(false); q.close(); q.send('warp', { to: 'spawn' }); });
    await sleep(1600);
    // others, smooth: the one bot left is sent up the craters, and B watches from the first island's deck
    await qa(B, () => window.__qa.give({ botsRun: true }));
    await sleep(1500);
    // (a bot on the move, not parked on a dyno. It may be anywhere up the craters by now: B goes and stands near it, on the deck of
    // the island it's on or beside it at Base Camp, and waits till it's seen moving; a bot put back at the spawn in one frame is a
    // respawn, not a stutter)
    let near = false;
    for (let i = 0; i < 30 && !near; i++) {
        near = await qa(B, () => {
            const q = window.__qa, room = q.net.room;
            let ok = false, bot = null;
            room.state.players.forEach((p, id) => { if (!p.bot) return; bot = p; const r = q.remotes().get(id); if (p.anim === 1 && r && r.x !== undefined && r.car.shown && Math.hypot(p.x - q.P.c.x, p.z - q.P.c.z) < 130) ok = true; });
            if (!ok && bot && Math.hypot(bot.x - q.P.c.x, bot.z - q.P.c.z) > 110) {
                let k = -1;
                if (bot.z < 44) for (k = 0; k < 11 && bot.z < q.islandOf(k).zN; k++);
                if (k < 0) q.teleport(bot.x + 14, 0, bot.z + 14, Math.PI, true); else { const cp = q.checkpoint(k); q.teleport(cp.x + 5, cp.y, cp.z, Math.PI, true); }
            }
            return ok;
        });
        if (!near) await sleep(3000);
    }
    const smooth = !near ? { none: true, players: -1 } : await qa(B, async () => {
        const q = window.__qa, room = q.net.room;
        let id = null;
        room.state.players.forEach((p, k) => { const r = q.remotes().get(k); if (p.bot && p.anim === 1 && r && r.x !== undefined) id = k; });
        const r = q.remotes().get(id), out = []; let last2 = null; const t0 = performance.now();
        await new Promise((res) => { let tl = performance.now(); const f = (n) => { const dt = (n - tl) / 1000; tl = n; if (r.x !== undefined) { if (last2) out.push({ d: Math.hypot(r.x - last2.x, r.z - last2.z), dt }); last2 = { x: r.x, z: r.z }; } if (n - t0 < 3000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        const walk = out.filter((o) => o.d < 25);
        if (!walk.length) return { none: true, players: room.state.players.size };
        const step = walk.map((o) => o.d).sort((a, b) => a - b), secs = walk.reduce((a, o) => a + o.dt, 0), dist = walk.reduce((a, o) => a + o.d, 0);
        const top = Math.max(40, room.state.players.get(id) ? room.state.players.get(id).spd * 1.25 : 40);
        const pop = Math.max(...walk.map((o) => o.d - top * o.dt)), longest = Math.max(...out.map((o) => o.dt));
        return { frames: walk.length, speed: dist / secs, p99: step[Math.floor(step.length * 0.99)], max: step[step.length - 1], pop, longest, delay: r.track.delay, respawns: out.length - walk.length };
    });
    if (smooth && smooth.none) console.log('      (no bot in the room: ' + smooth.players + ' players)');
    check(smooth && !smooth.none && smooth.speed > 3 && smooth.pop < 1.5, 'a bot seen from far away moves smoothly: ' + (smooth && smooth.speed !== undefined ? smooth.speed.toFixed(1) + ' studs/s, a frame\'s step p99 ' + smooth.p99.toFixed(2) + ', most ' + smooth.max.toFixed(2) + ' studs, ' + smooth.pop.toFixed(2) + ' over its speed; drawn ' + Math.round(smooth.delay) + ' ms in the past' : JSON.stringify(smooth)));
    // two RACE presses at about the same time: one queue, one race
    await qa(A, () => window.__qa.play({ map: 0, lv: 2 }));
    await sleep(600);
    const qb = await qa(B, () => { window.__qa.play({}); return true; });
    await sleep(1500);
    const found = await A.$eval('#qFound', (e) => e.textContent);
    check(qb && /2 \/ 6/.test(found), 'both RACE presses in one queue: ' + found);
    await A.waitForFunction(() => window.__qa.state().match, { timeout: 25000 });
    await B.waitForFunction(() => window.__qa.state().match, { timeout: 25000 });
    const mA = await qa(A, () => window.__qa.match().id), mB = await qa(B, () => window.__qa.match().id);
    check(mA === mB, 'one race for both');
    await A.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, { timeout: 15000 });
    await qa(A, () => window.__qa.auto(true));
    await qa(B, () => window.__qa.auto(true));
    await sleep(7000);
    const seen = await qa(B, () => { const q = window.__qa, room = q.net.room; let other = null; room.state.players.forEach((p, id) => { if (id !== room.sessionId && !p.bot) other = id; }); if (!other) return null; const r = q.remotes().get(other), p = room.state.players.get(other); return r ? { here: r.here, d: Math.round(Math.hypot((r.x ?? 1e9) - p.x, (r.z ?? 1e9) - p.z)), y: Math.round(r.y ?? -999), serverY: Math.round(p.y) } : null; });
    check(seen && seen.here && seen.d < 45, 'each sees the other in the race: ' + JSON.stringify(seen));
    const sa = await qa(A, () => window.__qa.state()), sb = await qa(B, () => window.__qa.state());
    check(sa.match && sb.match && sa.match.pct > 0.08 && sb.match.pct > 0.08, 'both climbing the volcano: ' + Math.round(sa.match.pct * 100) + '% and ' + Math.round(sb.match.pct * 100) + '% up');
    const inB = sb.match && sb.match.scores.find((r) => r[0] === sa.match.spot);
    check(inB && (Math.abs(inB[1] - sa.match.pct * 100) < 30 || inB[2] >= 0), 'one\'s climb shows on the other\'s board: ' + (inB && inB[1]) + '% against ' + Math.round(sa.match.pct * 100) + '%');
    await A.waitForFunction(() => !window.__qa.state().match, { timeout: 60000 }).catch(() => {});
    await sleep(800);
    const sF = await qa(A, () => window.__qa.state()), sG = await qa(B, () => window.__qa.state());
    check(sF.snaps === 0 && sG.snaps === 0, 'nobody sent back, to the end of the race: ' + sF.snaps + ', ' + sG.snaps);
    const errs = [...A.errors, ...B.errors, ...(await qa(A, () => window.__qa.errors())), ...(await qa(B, () => window.__qa.errors()))];
    check(errs.length === 0, 'no console errors: ' + JSON.stringify(errs.slice(0, 4)));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); relay.close(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
