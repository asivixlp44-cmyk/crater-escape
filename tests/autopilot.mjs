// Browser runs with the autopilot: the HUD's words; the whole loop from a new player's start (steps, up the bridge and straight off the rim,
// round Crater 1's wall and out at its far side for Wins, its gate, the next craters; down a hole and back at Base Camp; the Train
// tile onto a dyno); full races on all four maps; a run in each other world; the last crater and the summit's portal; no rejected
// moves, no console errors.
// Run: node tests/autopilot.mjs [loop,races,worlds,last]
import { startServer, startVite, stopAll, launch, open, shot, sleep, qa, TEST_PORT } from './lib.mjs';
const PARTS = process.argv[2] ? process.argv[2].split(',') : ['loop', 'races', 'worlds', 'last'];
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
let bad = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) bad++; };
const st = (page) => qa(page, () => window.__qa.state());
const until = async (page, fn, ms, arg) => { try { await page.waitForFunction(fn, { timeout: ms, polling: 200 }, arg); return true; } catch (e) { return false; } };
try {
    const page = await open(b, 'http://localhost:5649/', { w: 1280, h: 720, q: 'medium', uid: 'auto' + Date.now() });
    await qa(page, () => { const q = window.__qa; q.close(); q.noWatch(); });
    if (PARTS.includes('loop')) {
        console.log('--- the HUD');
        const hud = await page.evaluate(() => ({ lv: document.querySelector('#lvTxt').textContent, boost: document.querySelector('#boostLine').textContent, spd: document.querySelector('#csBox').textContent, quest: document.querySelector('#questLine').textContent, play: document.querySelector('#bPlay').textContent, nitro: document.querySelector('#lickTxt').textContent, corner: (() => { for (const e of document.querySelectorAll('#hud *')) { if (e.hidden || !e.offsetParent) continue; const r = e.getBoundingClientRect(); if (r.width > 0 && r.left < 100 && r.top < 60 && r.right > 0 && r.bottom > 0 && e.children.length === 0) return e.id || e.className; } return ''; })() }));
        check(hud.lv === 'LEVEL 1' && /x1 SPEED/.test(hud.boost) && /SPEED/.test(hud.spd) && /Top speed: 24/.test(hud.spd), 'Level 1, all your boosts x1, the speedo: top speed 24');
        check(/RACE/.test(hud.play) && /Eruption/.test(hud.play) && hud.nitro === 'NITRO' && hud.quest.length > 5, 'the race card, NITRO, a quest (' + hud.quest + ')');
        check(!hud.corner, 'the Bloxity corner (top left) is free' + (hud.corner ? ': ' + hud.corner : ''));
        console.log('--- the loop, from a new player\'s start');
        const s0 = await st(page);
        check(s0.lv === 1 && s0.wins === 0 && s0.stage === -1 && s0.zone === 0, 'at Base Camp, Level 1, nothing yet');
        await qa(page, () => window.__qa.auto(true));
        const t0 = Date.now();
        check(await until(page, () => window.__qa.state().speed > 5, 8000), 'steps: Speed climbs as it drives');
        check(await until(page, () => { const s = window.__qa.state(); return s.stage === 0 && s.deep === 0; }, 20000), 'up the bridge and straight off the rim onto the wall of Crater 1 (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
        check(await until(page, () => window.__qa.state().out.includes(0), 60000), 'round the wall and out at the far side (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
        check(await until(page, () => (window.__qa.S.totalWins || 0) >= 3 && (window.__qa.S.bests[0] || 0) >= 1, 4000), 'the server pays: ' + (await qa(page, () => window.__qa.S.totalWins)) + ' Wins (x3 the first time)');
        check(await until(page, () => window.__qa.state().stage >= 1, 25000), 'along the far crescent, through its gate, onto the next bridge');
        check(await until(page, () => window.__qa.state().out.length >= 3, 90000), 'Craters 2 and 3 too (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
        const s1 = await st(page);
        check(s1.lv >= 4 && s1.snaps === 0, 'Level ' + s1.lv + ' by then; no move sent back (' + s1.snaps + ')');
        console.log('shot', await shot(page, 'auto-loop'));
        // down a crater's hole: back at Base Camp, told why, nothing sent back
        await qa(page, () => { const q = window.__qa, I = q.islandOf(1); q.auto(false); q.close(); q.teleport(I.cx, I.E - I.H, I.cz, 0, true); });
        check(await until(page, () => { const s = window.__qa.state(); return s.stage === -1 && s.zone === 0 && !s.air; }, 9000), 'down the hole in the middle of Crater 2: back at Base Camp');
        check(/hole/i.test(await page.evaluate(() => document.querySelector('#toasts').textContent)), 'and told why ("' + (await page.evaluate(() => document.querySelector('#toasts').textContent.trim().slice(0, 60))) + '")');
        check((await st(page)).snaps === 0, 'nothing sent back');
        await sleep(800);
        // the Train tile: to your best dyno, onto its rollers by itself, steps while parked
        await qa(page, () => { const q = window.__qa; q.auto(false); q.close(); q.actions.toTread(); });
        check(await until(page, () => window.__qa.state().tread >= 0, 9000), 'the Train tile: parked on a dyno');
        const n0 = await qa(page, () => window.__qa.S.stepsShown || 0);
        await qa(page, () => { window.__qa.P.holdDash = true; });
        await sleep(2500);
        const n1 = await qa(page, () => { window.__qa.P.holdDash = false; return window.__qa.S.stepsShown || 0; });
        check(n1 - n0 >= 10, 'revving flat out: ' + (n1 - n0) + ' steps in 2.5 s');
        await page.keyboard.down('KeyS'); await sleep(500); await page.keyboard.up('KeyS');
        check(await until(page, () => window.__qa.state().tread < 0, 3000), 'the brakes take you off it');
    }
    if (PARTS.includes('races')) {
        console.log('--- full races on all four maps');
        for (let map = 0, tries = 0; map < 4; map++) {
            const lv = [1, 8, 14, 22][map];
            await qa(page, () => { const q = window.__qa; q.close(); q.auto(false); });
            const m0 = await qa(page, () => window.__qa.S.matches || 0);
            await qa(page, (mm, l) => window.__qa.play({ map: mm, lv: l, now: true }), map, lv);
            const inRace = await until(page, () => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, 30000);
            await qa(page, () => window.__qa.auto(true));
            const info = await qa(page, () => { const m = window.__qa.state().match; return m ? { w: m.w, R: m.R, H: m.H, secs: m.secs } : null; });
            let top = 0, done = false, out = false;
            const t0 = Date.now();
            while (Date.now() - t0 < 90000) {
                const s = await st(page);
                if (!s.match) break;
                top = Math.max(top, s.match.pct); done = done || s.match.done; out = out || s.match.out;
                await sleep(400);
            }
            await sleep(600);
            const r = await page.evaluate(() => { const h = document.querySelector('#modal h2'); return { title: h ? h.textContent.trim() : '', matches: window.__qa.S.matches || 0, snaps: window.__qa.state().snaps }; });
            // (a boulder at the wrong moment and the lava has it, as it would anyone: that race is run again, once)
            if (out && !done && tries < 2) { tries++; console.log('      the lava got it at ' + Math.round(top * 100) + '%: again'); await qa(page, () => { window.__qa.auto(false); window.__qa.close(); }); await sleep(400); map--; continue; }
            check(inRace && info && info.w === map, 'map ' + (map + 1) + ' at Level ' + lv + ': a volcano ' + (info && info.R) + ' across the rim, ' + (info && info.H) + ' deep, ' + (info && info.secs) + ' s on the clock');
            check(done && r.matches === m0 + 1 && /PLACE|WON/.test(r.title), '  over the rim in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s: ' + r.title + (out ? ' (the lava got it)' : '') + ', ' + Math.round(top * 100) + '% up');
            if (map === 1) console.log('shot', await shot(page, 'auto-results'));
            await qa(page, () => { window.__qa.auto(false); window.__qa.close(); });
            await sleep(400);
        }
        check((await st(page)).snaps === 0, 'no move sent back in any race');
    }
    if (PARTS.includes('worlds')) {
        console.log('--- a run in each other world');
        await qa(page, () => { const q = window.__qa; q.give({ openWorlds: true, lv: 9 }); });
        await sleep(500);
        for (const w of [1, 2, 3]) {
            await qa(page, (ww) => { const q = window.__qa; q.close(); q.auto(false); q.send('world', { w: ww }); }, w);
            check(await until(page, (ww) => window.__qa.state().world === ww && window.__qa.view() && window.__qa.view().w === ww, 12000, w), 'world ' + (w + 1) + ' builds');
            await sleep(1500);
            await qa(page, () => { const q = window.__qa; q.close(); q.auto(true); });
            const ok = await until(page, () => window.__qa.state().out.length >= 2, 90000);
            const s = await st(page);
            check(ok && s.snaps === 0, '  two craters escaped there (Level ' + s.lv + ', ' + s.wins + ' Wins)');
            if (w === 1) console.log('shot', await shot(page, 'auto-world2'));
        }
        await qa(page, () => { const q = window.__qa; q.auto(false); q.close(); q.send('world', { w: 0 }); });
        await until(page, () => window.__qa.state().world === 0 && window.__qa.view().w === 0, 12000);
        await sleep(1200);
    }
    if (PARTS.includes('last')) {
        console.log('--- the last crater, and the summit');
        await qa(page, () => { const q = window.__qa; q.close(); q.give({ lv: 31, reach: 11, padCool: true }); });
        await sleep(500);
        await qa(page, () => { const q = window.__qa, cp = q.checkpoint(11); q.teleport(cp.x, cp.y, cp.z + 3, Math.PI); q.auto(true); });
        const t0 = Date.now();
        check(await until(page, () => window.__qa.state().out.includes(11), 150000), 'Crater 12 (the biggest, a Level over its Recommended 30: the autopilot dodges nothing) escaped in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
        check(await until(page, () => (window.__qa.S.bests[0] || 0) >= 12, 5000), 'the world\'s last crater: counted');
        check(await until(page, () => window.__qa.state().stage >= 12, 60000), 'over the last bridge to the summit');
        check(await until(page, () => !document.querySelector('#modal').hidden && /Teleport|Worlds/.test(document.querySelector('#modal h2').textContent), 30000), 'its portal opens the worlds');
        console.log('shot', await shot(page, 'auto-summit'));
        check((await st(page)).snaps === 0, 'no move sent back');
    }
    const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
    check(errs.length === 0, 'no console errors ' + JSON.stringify(errs.slice(0, 5)));
} catch (e) { console.error(e); bad++; }
console.log(bad ? bad + ' FAILED' : 'all good');
await b.close(); stopAll();
process.exit(bad ? 1 : 0);
