// The production build with real input only: no QA hooks, the keyboard, mouse and touch as a player uses them, the game's
// own words on screen as the only way to know what happened. Run: node tests/prod.mjs (it builds first)
import { execSync } from 'node:child_process';
import { startServer, stopAll, launch, open, sleep, shot, ROOT, TEST_PORT } from './lib.mjs';

let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const text = (page, sel) => page.$eval(sel, (e) => e.textContent);
const parse = (t) => { const n = parseFloat(String(t).replace(/,/g, '')); return /K$/.test(t) ? n * 1000 : /M$/.test(t) ? n * 1e6 : /B$/.test(t) ? n * 1e9 : n; };
const num = async (page, sel) => parse(await text(page, sel));
const visible = (page, sel) => page.$eval(sel, (e) => !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).catch(() => false);
const toasts = (page) => page.$eval('#toasts', (e) => e.textContent);
const center = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
async function waitFor(fn, secs, every) { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { const v = await fn(); if (v) return v; await sleep(every || 150); } return null; }
const modalUp = (page) => page.$eval('#modal', (e) => !e.hidden && !!e.querySelector('.panel'));
const modalTitle = (page) => page.$eval('#modal h2', (e) => e.textContent.trim()).catch(() => '');
const closeModal = async (page) => { for (let i = 0; i < 3; i++) { if (await page.$eval('#confirm', (e) => !e.hidden)) { await page.click('#confirm [data-no]').catch(() => {}); await sleep(200); } if (await page.$eval('#modal', (e) => !e.hidden)) { await page.click('#modal [data-close]').catch(() => {}); await sleep(250); } } };
// every toast from now on, as it comes
const watchToasts = (page) => page.evaluate(() => {
    window.__toasts = [];
    if (window.__tObs) window.__tObs.disconnect();
    window.__tObs = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) window.__toasts.push(n.textContent); });
    window.__tObs.observe(document.querySelector('#toasts'), { childList: true });
});
const toastSeen = (page, re) => page.evaluate((src) => { const r = new RegExp(src); return (window.__toasts || []).find((t) => r.test(t)) || ''; }, re.source);
// Out of the first crater with the keys a player has: W held all the way (up the bridge, over the rim, down the wall, and round
// it: the car takes the wall's lap by itself), SPACE for NITRO now and then. Returns what the screen said.
async function escapeCrater1(page, io, secs) {
    const seen = { inCrater: false, skip: false, skipAsks: false, escaped: false, wins: 0, toast: '', turns: 0 };
    let still = 0;
    const w0 = await num(page, '#winsVal');
    await watchToasts(page);
    await io.gas(true);
    const t0 = Date.now();
    let lastNitro = 0;
    while (Date.now() - t0 < secs * 1000) {
        const bar = await visible(page, '#wallBar'), name = bar ? await text(page, '#wbName') : '', hp = bar ? await text(page, '#wbHp') : '';
        if (/CRATER 1/.test(name)) seen.inCrater = true;
        if (seen.inCrater && !seen.skip && await visible(page, '#bSkip')) {
            seen.skip = true;
            // SKIP asks first, for Gems; Cancel (the gas let go while a question's up)
            await io.gas(false);
            await io.tap('#bSkip'); await sleep(300);
            seen.skipAsks = await page.$eval('#confirm', (e) => !e.hidden && /SKIP/.test(e.textContent) && /💎/.test(e.textContent));
            await page.click('#confirm [data-no]').catch(() => {}); await sleep(200);
            await io.gas(true);
        }
        if (/ESCAPED/.test(hp)) { seen.escaped = true; break; }
        // the gas alone takes it straight off the rim, round the wall and out. (Stopped against something: the wheel over for a moment)
        const sp = parseInt(await text(page, '#spdNum'), 10) || 0;
        if (seen.inCrater && sp <= 2) { if (++still >= 3) { still = 0; seen.turns++; await io.turn(true); await sleep(650); await io.turn(false); } } else still = 0;
        if (seen.inCrater && seen.turns && Date.now() - lastNitro > 2500) { lastNitro = Date.now(); await io.nitro(); }
        await sleep(120);
    }
    await io.gas(false);
    await sleep(900);
    seen.wins = (await num(page, '#winsVal')) - w0;
    seen.toast = await toastSeen(page, /\+\d+ Wins/);
    seen.secs = (Date.now() - t0) / 1000;
    return seen;
}

// always this code, not a build left over from before
execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
await startServer(TEST_PORT, {});
const browser = await launch();
try {
    console.log('--- desktop, keyboard and mouse');
    const url = 'http://localhost:' + TEST_PORT + '/';
    const page = await open(browser, url, { w: 1280, h: 720, uid: 'prod' + Date.now() });
    console.log('  load + join', page.loadSecs, 's');
    check(await page.evaluate(() => !window.__qa), 'no QA hooks in the build');
    check(await visible(page, '#hud') && await visible(page, '#menuGrid') && await visible(page, '#botArea'), 'no start menu: straight in the world, the HUD up');
    check(/^\d+ SPEED$/.test((await text(page, '#powerLine')).trim()) && /^LEVEL 1$/.test(await text(page, '#lvTxt')) && /^Top speed: 24$/.test(await text(page, '#csMax')) && /^ALL YOUR BOOSTS: x1 SPEED$/.test((await text(page, '#boostLine')).trim()), 'Level 1, 0 Speed, top speed 24, all your boosts x1');
    await sleep(1200);
    // the first thing: driving is Speed, +1 a step
    const p0 = await num(page, '#powerVal');
    await page.keyboard.down('KeyW');
    await sleep(1800);
    await page.keyboard.up('KeyW');
    const p1 = await num(page, '#powerVal');
    check(p1 >= p0 + 3 && p1 <= p0 + 14 && parseInt(await text(page, '#spdNum'), 10) > 5, 'W: driving, every step +1 Speed (' + (p1 - p0) + ' in 1.8 s), the speedo up');
    // up the bridge, down into Crater 1, round its wall and out over its rim
    const kb = { gas: (on) => (on ? page.keyboard.down('KeyW') : page.keyboard.up('KeyW')), turn: (on) => (on ? page.keyboard.down('KeyD') : page.keyboard.up('KeyD')), nitro: () => page.keyboard.press('Space'), tap: (sel) => page.click(sel) };
    const run = await escapeCrater1(page, kb, 70);
    check(run.inCrater, 'up the bridge: CRATER 1 at the top of the screen');
    check(run.skip && run.skipAsks, 'in it: SKIP by its bar asks first, for Gems; Cancel');
    check(run.escaped, 'W held, NITRO now and then: straight off the rim, round the wall and out at the far side in ' + run.secs.toFixed(0) + ' s ("ESCAPED!")');
    check(run.wins >= 3 && /\+3 Wins/.test(run.toast), 'the server pays: "' + run.toast + '", ' + await text(page, '#winsVal') + ' Wins');
    await shot(page, 'prod-escaped');
    // home
    await page.keyboard.press('KeyR');
    check(await waitFor(async () => !(await visible(page, '#wallBar')), 5), 'R: back at Base Camp');
    await sleep(600);
    // codes, typed
    await page.click('#bCodes'); await sleep(350);
    for (const code of ['nitro', 'eruption', 'bloxity']) { await sleep(500); await page.click('#codeIn'); await page.keyboard.type(code); await sleep(120); await page.keyboard.press('Enter'); await sleep(1100); }
    check(/Code redeemed/.test(await toasts(page)) || /Code redeemed/.test(await toastSeen(page, /Code redeemed/)), 'three codes typed in: redeemed');
    await closeModal(page);
    const wins0 = await num(page, '#winsVal');
    check(wins0 >= 18, 'their Wins counted (' + wins0 + ')');
    // a car: the Pebble Buggy for 12 Wins; every step x2
    await page.keyboard.press('KeyV'); await sleep(400);
    check(await modalTitle(page) === 'Cars' && (await page.$$eval('#modal .card img', (l) => l.filter((i) => i.naturalWidth > 0).length)) === 12, 'V: the Cars panel, a picture of each of the 12');
    await page.click('#modal [data-act="car"][data-i="1"]'); await sleep(900);
    check(/x2 SPEED/.test(await text(page, '#boostLine')) && (await num(page, '#winsVal')) === wins0 - 12, 'the Pebble Buggy bought: all your boosts x2, 12 Wins spent');
    await closeModal(page);
    await shot(page, 'prod-buggy');
    // tuning
    await page.keyboard.press('KeyU'); await sleep(400);
    check(await modalTitle(page) === 'Tuning', 'U: Tuning');
    await page.click('#modal [data-act="upgrade"]'); await sleep(700);
    check((await num(page, '#winsVal')) === wins0 - 18, 'Turbo Intake bought for 6 Wins');
    await closeModal(page);
    // every menu button and its panel
    for (const [sel, title] of [['#bRebirth', 'Rebirth'], ['#bTele', 'Teleport'], ['#bPals', 'Pets'], ['#bWork', 'Tuning'], ['#bCars', 'Cars'], ['#bSpin', 'Lucky Wheel'], ['#bQuests', 'Quests'], ['#bSettings', 'Settings'], ['#bShop', 'Shop'], ['#bGift', 'FREE Gifts'], ['#bStats', 'Stats'], ['#winsBox', '🏆 Leaderboards'], ['#bDaily', 'Daily Rewards']]) {
        await page.click(sel); await sleep(350);
        const t = await modalTitle(page);
        check(t === title, sel + ' opens ' + title + (t === title ? '' : ' (got "' + t + '")'));
        if (title === 'Lucky Wheel') {
            // two spins from the BLOXITY code: one spun
            await page.click('#modal [data-act="spin"]');
            const won = await waitFor(async () => /YOU WON!/.test(await text(page, '#popT').catch(() => '')) && await visible(page, '#popup'), 8);
            check(!!won, '  the wheel spins and pays');
        }
        if (title === 'Daily Rewards') { await page.click('#modal [data-act="daily"]').catch(() => {}); await sleep(600); }
        await closeModal(page);
    }
    // the Gem buttons ask first
    // (a level-up or a quest's banner may be on its way across the screen: the question is waited for, not timed)
    await sleep(600);
    await page.click('#sp0');
    const asks = await waitFor(() => page.$eval('#confirm', (e) => !e.hidden && /SPEED/.test(e.textContent) && /💎/.test(e.textContent)), 3);
    if (!asks) console.log('      #confirm: ' + JSON.stringify(await page.$eval('#confirm', (e) => ({ hidden: e.hidden, text: e.textContent.trim().slice(0, 120) }))));
    await page.click('#confirm [data-no]').catch(() => {}); await sleep(300);
    await page.click('#bX2');
    const asks2 = await waitFor(() => page.$eval('#confirm', (e) => !e.hidden && /2X SPEED/.test(e.textContent)), 3);
    if (!asks2) console.log('      #confirm: ' + JSON.stringify(await page.$eval('#confirm', (e) => ({ hidden: e.hidden, text: e.textContent.trim().slice(0, 120) }))));
    await page.click('#confirm [data-no]').catch(() => {}); await sleep(300);
    check(asks && asks2, '+SPEED and x2 SPEED ask first, for Gems');
    // the Train tile: to the dyno, parked by itself; SHIFT revs it
    await page.click('#bTread');
    check(await waitFor(async () => (await text(page, '#spdNum')) === 'DYNO', 9), 'Train: onto your best dyno by itself (the speedo says DYNO)');
    const d0 = await num(page, '#powerVal');
    await sleep(2000);
    const d1 = await num(page, '#powerVal');
    await page.keyboard.down('ShiftLeft'); await sleep(2000); await page.keyboard.up('ShiftLeft');
    const d2 = await num(page, '#powerVal');
    check(d1 > d0 && d2 - d1 > (d1 - d0) * 1.3, 'parked: Speed climbs by itself (+' + (d1 - d0) + ' in 2 s), faster on SHIFT (+' + (d2 - d1) + ')');
    await shot(page, 'prod-dyno');
    await page.keyboard.down('KeyS'); await sleep(500); await page.keyboard.up('KeyS');
    check(await waitFor(async () => (await text(page, '#spdNum')) !== 'DYNO', 4), 'S: off it');
    // Eruption: the queue, the start line, the whole race on W and SPACE
    await page.keyboard.press('KeyP');
    const q = await waitFor(async () => (await visible(page, '#queueBar')) && /1 \/ 6 found/.test(await text(page, '#qFound')), 4);
    check(!!q, 'P: the queue, "1 / 6 found"');
    check(await waitFor(() => visible(page, '#matchHud'), 20), 'the start line: the race\'s clock and board');
    await waitFor(async () => /^\d+:\d\d$/.test(await text(page, '#mClock')) && !(await visible(page, '#countdown')), 12, 100);
    await page.keyboard.down('KeyW');
    const t0 = Date.now();
    let up = 0;
    const res = await waitFor(async () => {
        const rows = await page.$$eval('#scores .sr.me em', (e) => e.map((x) => x.textContent));
        if (rows.length && parseInt(rows[0], 10) > up) up = parseInt(rows[0], 10);
        if ((Date.now() - t0) % 2600 < 200) await page.keyboard.press('Space');
        return page.$eval('#modal', (e) => !e.hidden && /Race again/.test(e.textContent));
    }, 70, 180);
    await page.keyboard.up('KeyW');
    check(up >= 30, 'W: up the volcano on the board (' + up + '%)');
    check(!!res, 'the race ends: the results, with a prize (' + await modalTitle(page) + ')');
    await shot(page, 'prod-results');
    await closeModal(page);
    check(!(await visible(page, '#matchHud')) && await visible(page, '#menuGrid'), 'back in the world');
    check(page.errors.length === 0, 'no console errors: ' + JSON.stringify(page.errors.slice(0, 4)));
    await page.close();

    console.log('--- what the game tells Bloxity (an SDK stand-in)');
    const STUB = 'window.__log = []; window.Legion = { SDK: { init() { window.__log.push("init"); }, portal: { isEmbeddedInLegion() { return false; } }, game: { loadingStep() {}, updateRoom(r) { window.__log.push(r ? "room:yes" : "room:no"); }, loadingEnd() { window.__log.push("loadingEnd"); window.__startHidden = document.querySelector("#start").hidden; } }, on() {}, off() {} } };';
    const sdkPage = await open(browser, url, { w: 1280, h: 720, uid: 'prodsdk' + Date.now(), sdkStub: STUB });
    await sleep(800);
    const lg = await sdkPage.evaluate(() => window.__log);
    check(lg.filter((x) => x === 'loadingEnd').length === 1, 'loadingEnd() is called once: ' + lg.join(', '));
    check(lg.indexOf('room:yes') >= 0 && lg.indexOf('room:yes') < lg.indexOf('loadingEnd'), 'after it has joined a server, with no menu in between');
    check(await sdkPage.evaluate(() => window.__startHidden === true), 'with the loading screen already gone');
    check(sdkPage.errors.length === 0, 'no console errors: ' + JSON.stringify(sdkPage.errors.slice(0, 4)));
    await sdkPage.close();

    for (const [name, vw, vh] of [['a phone in portrait', 390, 844], ['a phone on its side', 844, 390]]) {
        console.log('--- ' + name + ', touch only');
        const ph = await open(browser, url, { w: vw, h: vh, dpr: 2, touch: true, uid: 'prodph' + vw + Date.now() });
        console.log('  load + join', ph.loadSecs, 's');
        await sleep(1500);
        check(await visible(ph, '#stick') && await visible(ph, '#lickBtn'), 'the stick and NITRO are there');
        const stick = await ph.$eval('#stick', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; });
        const cdp = await ph.createCDPSession();
        const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
        const tapAt = async (p, id) => { await touch('touchStart', [{ x: p.x, y: p.y, id }]); await sleep(50); await touch('touchEnd', []); };
        // the thumbs: the stick (id 1, pushed up), NITRO tapped by the other (id 2)
        let gasOn = false;
        let lean = 0;
        const thumb = () => [{ x: stick.x + stick.r * 0.72 * lean, y: stick.y - stick.r * (lean ? 0.7 : 1), id: 1 }];
        const lb = await center(ph, '#lickBtn');
        const io = {
            gas: async (on) => { if (on && !gasOn) { await touch('touchStart', [{ x: stick.x, y: stick.y, id: 1 }]); await touch('touchMove', thumb()); } else if (!on && gasOn) await touch('touchEnd', []); gasOn = on; },
            turn: async (on) => { lean = on ? 1 : 0; if (gasOn) await touch('touchMove', thumb()); },
            nitro: async () => { if (!gasOn) return; await touch('touchStart', [...thumb(), { x: lb.x, y: lb.y, id: 2 }]); await sleep(60); await touch('touchEnd', [{ x: lb.x, y: lb.y, id: 2 }]); },
            tap: async (sel) => tapAt(await center(ph, sel), 3),
        };
        const pw0 = await num(ph, '#powerVal');
        await io.gas(true);
        await sleep(1600);
        check(await num(ph, '#powerVal') >= pw0 + 3, 'the stick drives, and every step is Speed: ' + await text(ph, '#powerVal'));
        // NITRO with a thumb still on the stick
        await io.nitro();
        await sleep(120);
        check(/scaleY\(0\.[0-8]/.test(await ph.$eval('#lickFill', (e) => e.style.transform)), 'NITRO with a thumb still on the stick: the button empties and fills back');
        const prun = await escapeCrater1(ph, io, 75);
        check(prun.inCrater, 'the stick drives up the bridge: CRATER 1');
        check(prun.escaped && prun.wins >= 3, 'and round the wall and out at the far side on the stick and NITRO in ' + prun.secs.toFixed(0) + ' s: ' + await text(ph, '#winsVal') + ' Wins');
        await shot(ph, 'prod-phone-' + vw);
        await tapAt(await center(ph, '#bCars'), 3); await sleep(400);
        check(await modalUp(ph) && await modalTitle(ph) === 'Cars', 'a menu button by touch (Cars)');
        const fits = await ph.$eval('#modal .panel', (p) => { const r = p.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; });
        check(fits, 'its panel fits the screen');
        await sleep(700);
        await tapAt(await center(ph, '#modal [data-close]'), 4);
        // (closed: the Cars panel gone; a pop-up the game opens by itself at that moment may take the screen next)
        const shut = await waitFor(() => ph.$eval('#modal', (e) => e.hidden || !/Cars/.test((e.querySelector('h2') || {}).textContent || '')), 2);
        if (!shut) console.log('      #modal still: ' + await modalTitle(ph));
        check(!!shut, 'its X by touch' + (shut && !(await ph.$eval('#modal', (e) => e.hidden)) ? ' (then the game opened ' + await modalTitle(ph) + ' by itself)' : ''));
        await ph.evaluate(() => { const m = document.querySelector('#modal'); if (!m.hidden) { const x = m.querySelector('[data-close]'); if (x) x.click(); } });
        // a thumb on the stick, the other on a button: a browser makes no click for a second finger
        const t1 = await center(ph, '#bQuests');
        await touch('touchStart', [{ x: stick.x, y: stick.y, id: 1 }]); await sleep(120);
        await touch('touchStart', [{ x: stick.x, y: stick.y, id: 1 }, { x: t1.x, y: t1.y, id: 2 }]); await sleep(60);
        await touch('touchEnd', [{ x: stick.x, y: stick.y, id: 1 }]); await sleep(120);
        await touch('touchEnd', []); await sleep(400);
        check(await modalUp(ph), 'a button pressed with a thumb still on the stick');
        check(ph.errors.length === 0, 'no console errors: ' + JSON.stringify(ph.errors.slice(0, 4)));
        await ph.close();
    }
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
