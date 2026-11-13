// A dropped connection, in a real browser: the socket's cut at Base Camp and in a race, briefly and for long enough that a bot takes
// over. The game must carry on from where things really are: steps counting, the race's clock right, nobody stuck in a volcano.
// Run: node tests/reconnect.mjs
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT } from './lib.mjs';

let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const st = (page) => qa(page, () => window.__qa.state());
const cutSocket = (page, slow) => page.evaluate((ms) => {
    const r = window.__qa.net.room;
    // (slow: the SDK waits this long before it tries to come back)
    if (ms) { r.reconnection.delay = ms; r.reconnection.minDelay = ms; r.reconnection.maxDelay = ms; r.reconnection.backoff = () => ms; }
    r.connection.transport.ws.close();
}, slow || 0);
async function until(page, fn, secs, arg) { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { const v = await page.evaluate(fn, arg); if (v) return v; await sleep(250); } return null; }

await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5649/', { w: 1280, h: 720, q: 'low', uid: 'recon' + Date.now() });
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); window.__qa.auto(true); });
    console.log('--- at Base Camp and up the first bridge');
    await until(page, () => (window.__qa.state().steps || 0) >= 8, 40);
    // the SDK only tries to come back after a few seconds in the room
    await sleep(5500);
    const c0 = (await st(page)).steps;
    await cutSocket(page);
    await sleep(2500);
    const back = await qa(page, () => window.__qa.net.room.connection.transport.ws.readyState === 1);
    check(back, 'it reconnects by itself');
    check(await page.$eval('#start', (e) => e.hidden), 'with no error screen');
    await qa(page, () => window.__qa.close());
    const more = await until(page, (c) => { window.__qa.close(); return window.__qa.state().steps > c + 6; }, 25, c0);
    check(!!more, 'and steps still count on the server');
    const s0 = await st(page);
    check(s0.snaps === 0, 'nothing sent back: ' + s0.snaps);

    console.log('--- in a race, a short drop');
    await qa(page, () => { const q = window.__qa; q.auto(false); q.close(); q.send('warp', { to: 'spawn' }); });
    await sleep(1500);
    await qa(page, () => { window.__qa.close(); window.__qa.play({ map: 0, lv: 2, now: true }); });
    const line = await until(page, () => { const m = window.__qa.state().match; return m && (m.phase === 'wait' || m.phase === 'play') && m; }, 25);
    check(!!line, 'on the volcano\'s floor');
    await until(page, () => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, 15);
    await qa(page, () => window.__qa.auto(true));
    await sleep(4000);
    const p0 = (await st(page)).match;
    await cutSocket(page);
    await sleep(2500);
    const m1 = (await st(page)).match;
    check(m1 && m1.phase === 'play', 'still in the race, the clock running');
    await sleep(4500);
    const m2 = (await st(page)).match;
    check(!m2 || m2.pct > (p0 ? p0.pct : 0) + 0.05 || m2.done || m2.out, 'and climbing on: ' + Math.round((p0 ? p0.pct : 0) * 100) + '% to ' + (m2 ? Math.round(m2.pct * 100) + '%' : 'the results'));
    await until(page, () => !window.__qa.state().match, 60);
    await qa(page, () => { window.__qa.auto(false); window.__qa.close(); });
    await sleep(1200);

    console.log('--- in a race, a long drop: a bot takes over, nobody\'s stuck in the volcano');
    await qa(page, () => { window.__qa.close(); window.__qa.play({ map: 1, lv: 8, now: true }); });
    await until(page, () => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, 40);
    await qa(page, () => window.__qa.auto(true));
    await sleep(3000);
    await cutSocket(page, 9000);
    await sleep(4000);
    check(!!(await st(page)).match, 'gone: the screen doesn\'t know yet');
    const home = await until(page, () => { const s = window.__qa.state(); return !s.match && s.zone === 0 && Math.hypot(s.x, s.z - 100) < 60; }, 40);
    check(!!home, 'back: Base Camp, not the volcano');
    await sleep(1500);
    await qa(page, () => window.__qa.auto(false));
    check(await page.$eval('#matchHud', (e) => e.hidden), 'the race\'s HUD is gone');
    check(await page.$eval('body', (e) => !e.classList.contains('inmatch')), 'and its leftovers');
    const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
    check(errs.length === 0, 'no console errors: ' + JSON.stringify(errs.slice(0, 4)));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
