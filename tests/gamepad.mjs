// A whole session with nothing but a controller: a stand-in for the browser's Gamepad API, pressed like real buttons and read by the
// game's own code. Drives, looks round, burns NITRO, revs on a dyno, reaches every button of the HUD and of every panel with the ring,
// buys tuning, uses a stall with Y, rides a funnel's wall round to its far side, plays a race to the end, unplugs. Run: node tests/gamepad.mjs
import { startServer, startVite, stopAll, launch, open, qa, shot, sleep, TEST_PORT } from './lib.mjs';

let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const FAKE = () => {
    const g = { id: 'Test Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        vibrationActuator: { playEffect: () => { window.__rumbles = (window.__rumbles || 0) + 1; return Promise.resolve('complete'); } } };
    window.__pad = g;
    navigator.getGamepads = () => [window.__padOn ? g : null, null, null, null];
    window.__padPlug = (on) => { window.__padOn = on; g.connected = on; const e = new Event(on ? 'gamepadconnected' : 'gamepaddisconnected'); e.gamepad = g; dispatchEvent(e); };
};
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const set = (page, name, on) => page.evaluate((i, v) => { const b = window.__pad.buttons[i]; b.pressed = v; b.value = v ? 1 : 0; window.__pad.timestamp = performance.now(); }, BTN[name], on);
const tap = async (page, name) => { await set(page, name, true); await sleep(70); await set(page, name, false); await sleep(70); };
const axes = (page, a) => page.evaluate((v) => { window.__pad.axes = v; window.__pad.timestamp = performance.now(); }, a);
const st = (page) => qa(page, () => window.__qa.state());
const ringId = (page) => page.evaluate(() => { const r = window.__qa.padNav.ring; return r ? (r.id || r.dataset.act || r.dataset.tab || r.textContent.trim().slice(0, 20)) : null; });
const modalUp = (page) => page.evaluate(() => !document.querySelector('#modal').hidden && !!document.querySelector('#modal .panel'));
// every button of a layer: can the ring get to it from where it starts, with the four directions?
const reach = (page) => page.evaluate(() => {
    const N = window.__qa.padNav, layer = N.layer();
    if (!layer) return { all: 0, got: 0, missed: ['no layer'] };
    const list = N.list(layer);
    const seen = new Set(), todo = [N.ring || list[0]];
    if (todo[0]) seen.add(todo[0]);
    while (todo.length) {
        const at = todo.pop();
        for (const d of ['UP', 'DOWN', 'LEFT', 'RIGHT']) {
            N.setRing(at);
            N.step(d);
            const to = N.ring;
            if (to && !seen.has(to)) { seen.add(to); todo.push(to); }
        }
    }
    const missed = list.filter((b) => !seen.has(b)).map((b) => b.id || b.dataset.act || b.dataset.tab || b.className);
    N.setRing(list[0]);
    return { all: list.length, got: seen.size, missed };
});

await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5649/', { w: 1280, h: 720, q: 'low', uid: 'pad' + Date.now(), init: FAKE });
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); });
    await sleep(500);

    console.log('--- plugged in');
    await page.evaluate(() => window.__padPlug(true));
    await sleep(300);
    check(await page.evaluate(() => document.body.classList.contains('pad')), 'the game knows a controller is in use');
    check(await page.evaluate(() => /RT|NITRO/.test(document.querySelector('#tips').textContent)), 'the hints are the controller\'s');
    await shot(page, 'pad-tips');
    await qa(page, () => window.__qa.close());

    console.log('--- driving and looking');
    await qa(page, () => window.__qa.teleport(0, 0, 120, Math.PI));
    await sleep(400);
    const a0 = await st(page);
    await axes(page, [0, -1, 0, 0]);
    await sleep(1300);
    const a1 = await st(page);
    check(Math.hypot(a1.x - a0.x, a1.z - a0.z) > 8 && a1.steps > a0.steps, 'left stick up drives: ' + Math.hypot(a1.x - a0.x, a1.z - a0.z).toFixed(0) + ' studs, ' + (a1.steps - a0.steps) + ' steps');
    await axes(page, [1, -0.4, 0, 0]);
    await sleep(700);
    const a2 = await st(page);
    check(Math.abs(a2.ry - a1.ry) > 0.4, 'left stick across steers: heading ' + a1.ry + ' to ' + a2.ry);
    await axes(page, [0, 0, 0, 0]);
    await sleep(3800);
    const a3 = await st(page);
    check(a3.v < 1.5, 'let go and it rolls to a stop (' + a3.v + ' studs/s)');
    await axes(page, [0.08, 0.08, 0, 0]);
    await sleep(500);
    const a4 = await st(page);
    check(Math.hypot(a4.x - a3.x, a4.z - a3.z) < 0.6, 'a stick resting a little off centre doesn\'t drive you anywhere');
    await axes(page, [0, 0, 0, 0]);
    const yaw0 = await qa(page, () => window.__qa.cam.yaw);
    await axes(page, [0, 0, 1, 0]);
    await sleep(600);
    await axes(page, [0, 0, 0, 0]);
    const yaw1 = await qa(page, () => window.__qa.cam.yaw);
    check(Math.abs(yaw1 - yaw0) > 0.3, 'right stick turns the camera: ' + yaw0.toFixed(2) + ' to ' + yaw1.toFixed(2));
    const d0 = await qa(page, () => window.__qa.cam.dist);
    await tap(page, 'R3');
    check((await qa(page, () => window.__qa.cam.dist)) !== d0, 'R3 changes the zoom');
    await qa(page, () => window.__qa.teleport(0, 0, 130, Math.PI));
    await axes(page, [0, -1, 0, 0]);
    await sleep(900);
    const n0 = await qa(page, () => window.__qa.P.dashReady || 0);
    await tap(page, 'A');
    await sleep(250);
    await axes(page, [0, 0, 0, 0]);
    check((await qa(page, () => window.__qa.P.dashReady || 0)) > n0, 'A burns NITRO');
    check((await page.evaluate(() => window.__rumbles || 0)) > 0, 'you feel it in your hands');

    console.log('--- a dyno, flat out');
    await qa(page, () => { const q = window.__qa; q.tpPost(0); q.P.walkTo = { x: q.P.c.x, z: q.P.c.z - 9, until: 1e9 }; });
    await page.waitForFunction(() => window.__qa.state().tread >= 0, { timeout: 8000 }).catch(() => {});
    check((await st(page)).tread >= 0, 'parked on the rollers');
    const p0 = (await st(page)).steps;
    await sleep(1500);
    const idle = (await st(page)).steps - p0;
    await set(page, 'RT', true);
    await sleep(1500);
    await set(page, 'RT', false);
    await sleep(200);
    const fast = (await st(page)).steps - p0 - idle;
    check(fast > idle * 1.2, 'holding RT revs harder: ' + idle + ' steps idling, then ' + fast + ' in 1.5 s');
    await qa(page, () => { window.__qa.P.walkTo = null; });
    await axes(page, [0, 1, 0, 0]);
    await sleep(600);
    await axes(page, [0, 0, 0, 0]);
    check(await page.waitForFunction(() => window.__qa.state().tread < 0, { timeout: 3000 }).then(() => true, () => false), 'stick back: off the rollers');

    console.log('--- the Tuning garage, with Y');
    await qa(page, () => { const q = window.__qa; q.give({ wins: 5000, gems: 500, playSecs: 200 }); q.teleport(96, 0, 68, Math.PI); });
    await sleep(600);
    check((await st(page)).prompt === 'Tuning', 'at the Tuning garage, its prompt is up: ' + (await st(page)).prompt);
    check(await page.evaluate(() => document.querySelector('#promptBtn kbd').textContent === 'Y'), 'the prompt says Y');
    await tap(page, 'Y');
    await sleep(450);
    check(await modalUp(page), 'Y opens it');
    check(!!(await ringId(page)), 'the ring is on: ' + (await ringId(page)));
    check(await page.evaluate(() => getComputedStyle(document.querySelector('#padHint')).display !== 'none'), 'the hints for a menu are up');
    await shot(page, 'pad-panel');
    const ups = () => qa(page, () => Object.values(window.__qa.S.ups || {}).reduce((a, n) => a + n, 0));
    const up0 = await ups();
    await page.evaluate(() => window.__qa.padNav.setRing(document.querySelector('#modal [data-act="upgrade"]')));
    await tap(page, 'A');
    await sleep(500);
    const confirmUp = await page.evaluate(() => !document.querySelector('#confirm').hidden);
    if (confirmUp) { await tap(page, 'A'); await sleep(500); }
    check((await ups()) > up0, 'A buys tuning: ' + up0 + ' to ' + (await ups()) + ' levels' + (confirmUp ? ' (after a yes)' : ''));
    await tap(page, 'B');
    await sleep(300);
    check(!(await modalUp(page)), 'B closes it');
    check((await ringId(page)) === null, 'the ring has gone');

    console.log('--- the HUD');
    await qa(page, () => window.__qa.teleport(0, 0, 100, Math.PI));
    await sleep(300);
    await tap(page, 'LEFT');
    check((await ringId(page)) === 'bRebirth', 'the D-pad brings the ring to the HUD: ' + (await ringId(page)));
    await shot(page, 'pad-hud');
    const hud = await reach(page);
    check(hud.missed.length === 0, 'the ring reaches every button of the HUD: ' + hud.got + ' of ' + hud.all + (hud.missed.length ? ' missing ' + hud.missed : ''));
    // each of the HUD's buttons pressed with A: its panel opens, B closes it, the ring stays on it
    let opened = 0;
    for (const id of ['bRebirth', 'bCars', 'bWork', 'bPals', 'bTele', 'bQuests', 'bDaily', 'bSpin', 'bCodes', 'bSettings', 'bShop', 'bGift', 'winsBox', 'gemsBox', 'bStats', 'bLvPlus']) {
        const isBtn = await page.evaluate((i) => { const e = document.getElementById(i); return !!e && e.tagName === 'BUTTON' && !e.hidden && !!e.offsetParent; }, id);
        if (!isBtn) continue;
        await page.evaluate((i) => window.__qa.padNav.setRing(document.getElementById(i)), id);
        await tap(page, 'A');
        await sleep(320);
        if (!(await modalUp(page))) check(false, id + ' opens its panel with A');
        else opened++;
        await tap(page, 'B');
        await sleep(260);
        if ((await ringId(page)) !== id) check(false, 'B closes ' + id + '\'s panel, the ring back on it: ' + (await ringId(page)));
    }
    check(opened >= 10, 'A opens every HUD button\'s panel (' + opened + '), B closes it');
    await page.evaluate(() => window.__qa.padNav.setRing(document.querySelector('#bRebirth')));
    await tap(page, 'B');
    await sleep(200);
    check((await ringId(page)) === null, 'B and you\'re back in the world');
    await tap(page, 'RIGHT');
    check((await ringId(page)) === 'bPlay', 'D-pad right starts on RACE: ' + (await ringId(page)));
    const z0 = await st(page);
    await axes(page, [0, -1, 0, 0]);
    await sleep(700);
    await axes(page, [0, 0, 0, 0]);
    const z1 = await st(page);
    check((await ringId(page)) === null && Math.hypot(z1.x - z0.x, z1.z - z0.z) > 1, 'the stick drives you off the HUD');

    console.log('--- every panel');
    for (const [k, t] of [['cars'], ['work'], ['inv', 'team'], ['inv', 'jaws'], ['inv', 'trails'], ['inv', 'auras'], ['tele', 'stages'], ['tele', 'worlds'], ['spin'], ['rebirth'], ['shop'], ['quests'], ['daily'], ['gifts'], ['boards'], ['stats'], ['settings']]) {
        await qa(page, (a) => { window.__qa.close(); window.__qa.panel(a.k, a.t); }, { k, t });
        await sleep(220);
        await qa(page, () => {});
        const r = await reach(page);
        const name = k + (t ? '/' + t : '');
        check(r.missed.length === 0 && r.all > 0, name + ': ' + r.got + ' of ' + r.all + ' buttons' + (r.missed.length ? ', missing ' + r.missed.slice(0, 5) : ''));
    }
    await qa(page, () => { window.__qa.close(); window.__qa.panel('inv', 'jaws'); });
    await sleep(250);
    const tab0 = await page.evaluate(() => document.querySelector('.tab.on').dataset.tab);
    await tap(page, 'RB');
    await sleep(250);
    const tab1 = await page.evaluate(() => document.querySelector('.tab.on').dataset.tab);
    check(tab1 !== tab0, 'RB changes the tab: ' + tab0 + ' to ' + tab1);
    await tap(page, 'LB');
    await sleep(250);
    check((await page.evaluate(() => document.querySelector('.tab.on').dataset.tab)) === tab0, 'LB changes it back');
    await qa(page, () => { window.__qa.close(); window.__qa.panel('settings'); });
    await sleep(250);
    await page.evaluate(() => window.__qa.padNav.setRing(document.querySelector('input[type=range]')));
    await sleep(150);
    const v0 = await page.evaluate(() => +document.querySelector('input[type=range]').value);
    await tap(page, 'LEFT');
    await sleep(150);
    const v1 = await page.evaluate(() => +document.querySelector('input[type=range]').value);
    check(v1 !== v0 || v0 === 0, 'the D-pad moves a slider: ' + v0 + ' to ' + v1);
    await shot(page, 'pad-settings');
    await tap(page, 'START');
    await sleep(250);
    check(!(await modalUp(page)), 'START closes a panel');

    console.log('--- a crater on the stick');
    await qa(page, () => { const q = window.__qa, cp = q.checkpoint(0); q.close(); q.give({ lv: 3, padCool: true }); q.teleport(cp.x, cp.y, cp.z + 3, Math.PI); });
    await sleep(500);
    const w0 = (await st(page)).wins;
    await axes(page, [0, -1, 0, 0]);
    let outOk = false;
    for (let i = 0; i < 110 && !outOk; i++) {
        await sleep(350);
        const s = await st(page);
        // (stopped against something: the stick over for a moment)
        if (s.zone === 3 && s.v < 2 && !s.out.includes(0)) { await axes(page, [1, -0.5, 0, 0]); await sleep(650); await axes(page, [0, -1, 0, 0]); }
        if (s.zone === 2 && s.u > 0.55) await tap(page, 'RT');
        outOk = s.out.includes(0);
    }
    await axes(page, [0, 0, 0, 0]);
    await sleep(900);
    check(outOk && (await st(page)).wins > w0, 'the stick held up, RT now and then: straight off the rim, round the wall of Crater 1 and out at its far side, paid');

    console.log('--- a race');
    await qa(page, () => { const q = window.__qa; q.close(); q.send('warp', { to: 'spawn' }); });
    await sleep(1500);
    await qa(page, () => window.__qa.close());
    await tap(page, 'LB');
    await sleep(700);
    check(await page.evaluate(() => { const e = document.querySelector('#queueBar'); return !!e && !e.hidden; }), 'LB: in the queue for Eruption');
    await page.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, { timeout: 40000 });
    await axes(page, [0, -1, 0, 0]);
    let top = 0;
    for (let i = 0; i < 160; i++) { await sleep(400); const s = await st(page); if (!s.match) break; top = Math.max(top, s.match.pct); if (i % 6 === 3) await tap(page, 'RT'); }
    await axes(page, [0, 0, 0, 0]);
    await sleep(800);
    check(top > 0.5, 'the stick and RT up the volcano: ' + Math.round(top * 100) + '% up');
    check(await modalUp(page), 'the results come up');
    check(!!(await ringId(page)), 'with the ring on a button: ' + (await ringId(page)));
    await tap(page, 'B');
    await sleep(400);
    check(!(await modalUp(page)), 'B closes them');

    console.log('--- unplugged');
    await page.evaluate(() => window.__padPlug(false));
    await sleep(300);
    check(await page.evaluate(() => !document.body.classList.contains('pad')), 'the controller\'s hints and ring are gone');
    const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
    check(errs.length === 0, 'no console errors: ' + JSON.stringify(errs.slice(0, 4)));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
