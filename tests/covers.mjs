// The two store covers (1920x1080, 800x800), rendered from the game itself at High: a buggy high on a funnel's wall with its NITRO
// lit, the hole in the middle below it, with the title, the "+1 SPEED" badge, "+1" pops and the tagline
// over it in the game's own lettering.
// How: no floating numbers or name tag, the HUD hidden; the autopilot drops into the crater and laps its wall; the frame is held (the
// game's next animation frame is kept back) the moment the car is the wanted way up the wall with NITRO burning. Then the lettering.
// Run: node tests/covers.mjs   (TRY=1: small test shots of a few camera angles into the screenshots folder, no lettering)
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startVite, stopAll, launch, open, qa, sleep, shot, ROOT, TEST_PORT } from './lib.mjs';

await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const browser = await launch();
const dir = path.join(ROOT, 'covers');
fs.mkdirSync(dir, { recursive: true });

// ----- the lettering (SVG: a thick navy outline under a gradient fill, a hard drop under that) -----
const N = '#141a2e', F = "'Lilita One', 'Arial Black', sans-serif";
let gid = 0;
// one line of words, centred: spans [{ t, c: [top, bottom] }], baseline y, outline width
const words = (spans, size, y, stroke, ls) => {
    const id = 'w' + (gid++);
    const grads = spans.map((s, i) => `<linearGradient id="${id}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.c[0]}"/><stop offset="1" stop-color="${s.c[1]}"/></linearGradient>`).join('');
    const line = (fill, extra) => `<text x="50%" y="${y}" text-anchor="middle" font-family="${F}" font-size="${size}" letter-spacing="${ls}" ${extra}>${spans.map((s, i) => `<tspan fill="${fill || `url(#${id}${i})`}">${s.t}</tspan>`).join(' ')}</text>`;
    const out = `stroke="${N}" stroke-width="${stroke * 2}" stroke-linejoin="round"`;
    return `<defs>${grads}</defs>${line(N, out + ` transform="translate(0 ${Math.round(size * 0.075)})"`)}${line(N, out)}${line('', '')}`;
};
// a "+1" popping off the car: the game's bolt, then the number white to gold (like the game's own step numbers)
const pop = ([px, py, size, rot, text]) => {
    const id = 'p' + (gid++), tw = size * (0.62 * text.length + 0.7), th = size * 1.3, x = size * 0.66, y = th * 0.5 + size * 0.36, b = size * 0.84;
    const num = (extra) => `<text x="${x}" y="${y}" font-family="${F}" font-size="${size}" stroke="${N}" stroke-width="${size * 0.16}" stroke-linejoin="round" ${extra}>${text}</text>`;
    return `<svg style="position:absolute;left:${px}%;top:${py}%;transform:translate(-50%,-50%) rotate(${rot}deg);overflow:visible;filter:drop-shadow(0 ${size * 0.06}px ${size * 0.08}px rgba(0,0,40,.45))" width="${tw}" height="${th}" viewBox="0 0 ${tw} ${th}">`
        + `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.15" stop-color="#ffffff"/><stop offset="1" stop-color="#ffd23a"/></linearGradient></defs>`
        + `<g transform="translate(0 ${th * 0.5 - size * 0.42}) scale(${b / 100})"><path d="M58 0 L14 58 L44 58 L30 100 L82 36 L52 36 L66 0 Z" fill="#3ad8ff" stroke="${N}" stroke-width="10" stroke-linejoin="round" paint-order="stroke"/><path d="M58 6 L22 54 L36 54" fill="none" stroke="#c8f6ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>`
        + num(`fill="${N}" transform="translate(0 ${size * 0.06})"`) + num(`paint-order="stroke" fill="url(#${id})"`) + '</svg>';
};
// the whole overlay for a w x h cover: pops, the title (two lines on the square), the badge over it, the tagline ribbon at the bottom
function lettering(w, h, pops) {
    const sq = w < 1000, L = sq ? { badge: 40, bh: 62, t: 132, gap: 116, top: 18, st: 9 } : { badge: 50, bh: 76, t: 168, gap: 0, top: 22, st: 10 };
    const y1 = L.bh + 6 + L.t * 0.86, H = sq ? y1 + L.gap + 40 : y1 + 40;
    const ICE = ['#ffffff', '#ffd84a'], LAVA = ['#ffd23a', '#ff5a1e'];
    const title = sq ? words([{ t: 'CRATER', c: ICE }], L.t, y1, L.st, 2) + words([{ t: 'ESCAPE', c: LAVA }], L.t, y1 + L.gap, L.st, 2)
        : words([{ t: 'CRATER', c: ICE }, { t: 'ESCAPE', c: LAVA }], L.t, y1, L.st, 3);
    const tag = sq ? 46 : 62;
    return `<div id="cover" style="position:fixed;inset:0;z-index:99;pointer-events:none;overflow:hidden">${pops.map(pop).join('')}`
        + `<svg style="position:absolute;left:0;top:${L.top}px;overflow:visible;filter:drop-shadow(0 10px 18px rgba(0,0,40,.45))" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">${title}</svg>`
        + `<div style="position:absolute;left:50%;top:${L.top}px;transform:translateX(-50%) rotate(-2deg);height:${L.bh}px;box-sizing:border-box;padding:${L.badge * 0.06}px ${L.bh * 0.42}px 0;border-radius:${L.bh * 0.3}px;border:${sq ? 5 : 6}px solid ${N};background:linear-gradient(#4ad0ff,#1e8ae8 60%,#1a4fb8);box-shadow:0 ${sq ? 6 : 8}px 0 ${N},0 12px 22px rgba(0,10,40,.4);display:flex;align-items:center;gap:${L.bh * 0.2}px;font-family:${F};font-size:${L.badge}px;line-height:1;color:#fff;white-space:nowrap;text-shadow:0 3px 0 rgba(0,20,60,.55)"><span style="color:#ffe24a">+1</span><span>SPEED EVERY STEP</span></div>`
        + `<div style="position:absolute;left:50%;bottom:${sq ? 22 : 34}px;transform:translateX(-50%);white-space:nowrap;font-family:${F};font-size:${tag}px;line-height:1;padding:${tag * 0.2}px ${tag * 0.55}px ${tag * 0.16}px;border-radius:${tag * 0.32}px;background:linear-gradient(rgba(30,40,84,.95),rgba(16,22,48,.95));border:${sq ? 5 : 6}px solid #ffc23a;box-shadow:0 8px 0 ${N},0 14px 26px rgba(0,10,30,.5);color:#fff;letter-spacing:.02em">${sq ? '' : 'RIDE THE WALL · '}<span style="color:#ffd23a">MIND</span> THE HOLE!</div></div>`;
}

// ----- the shots: Greenhorn Craters' Sweeper Hollow (Crater 6) at Level 1, so the car laps half way up its wall, the hole right
// below it (lv: a shot's own Level).
// cam: [how far round to the front of the car the camera stands (radians from square on its side), pitch, distance]; u: how far up
// the wall the car is when the frame is held (a range) -----
const STAGE = Number(process.env.STAGE ?? 5), CAR = Number(process.env.CAR ?? 5);
const SHOTS = process.env.TRY ? (process.env.TRY.includes(',') ? process.env.TRY.split(';').map((x) => x.split(',').map(Number)) : [[0.25, 0.02, 13], [0.7, -0.04, 12], [1.05, 0.05, 12], [1.25, 0.12, 13], [-0.5, 0.16, 15], [2.2, 0.3, 14]]).map((cam, i) => ({ w: +(process.env.TW || 960), h: +(process.env.TH || 540), name: 'try' + i, cam, lv: cam[3] || 0, u: cam[4] ? [cam[4], cam[4] + 0.16] : [0.66, 0.86], pops: [] }))
    : [
        { w: 1920, h: 1080, name: 'cover-1920x1080.png', cam: (process.env.CAM || '2.5,0.85,26').split(',').map(Number), lv: +(process.env.LV1 || 1), u: [+(process.env.U1 || 0.5), +(process.env.U1 || 0.5) + 0.16],
            pops: [[24, 44, 118, -8, '+1'], [77, 40, 96, 7, '+1'], [17, 64, 78, -5, '+1'], [84, 60, 70, 6, '+1']] },
        { w: 800, h: 800, name: 'cover-800x800.png', cam: (process.env.CAM2 || '2.5,0.85,26').split(',').map(Number), lv: +(process.env.LV2 || 1), u: [+(process.env.U2 || 0.5), +(process.env.U2 || 0.5) + 0.16],
            pops: [[16, 50, 76, -9, '+1'], [84, 47, 64, 8, '+1']] },
    ];
try {
    for (const s of SHOTS) {
        if (process.env.ONLY && !s.name.includes(process.env.ONLY)) continue;
        const page = await open(browser, 'http://localhost:5649/', { w: s.w, h: s.h, dpr: 1, q: 'high', uid: 'cover' + s.w + Date.now() });
        await qa(page, (lv, car) => { const q = window.__qa; q.noWatch(true); q.close(); window.__noFloat = true; q.give({ wins: 5e8, gems: 3000, lv, allCars: true, car, qi: 99, steps: 10000 }); }, s.lv || [1, 2, 3, 5, 7, 9, 12, 15, 18, 22, 26, 30][STAGE], CAR);
        await sleep(1500);
        await qa(page, (car) => { const q = window.__qa; q.send('car', { i: car }); q.send('trail', { i: 8 }); }, CAR);
        await sleep(1200);
        await qa(page, () => {
            const q = window.__qa; q.close(); q.hud(false);
            const me = q.me(); if (me && me.label) me.label.visible = false;
            // (the craters' name signs too: the lettering is the cover's own)
            const vw = q.view(); if (vw && vw.signs && vw.signs.mesh) vw.signs.mesh.visible = false;
            for (const sel of ['#toasts', '#bigText', '#popup', '#winPop', '#lvlUp', '#fps', '#tips', '#wallBar', '#padHint', '#promptBtn', '#flyLayer', '#queueBar', '#flash', '#guide']) { const e = document.querySelector(sel); if (e) e.style.display = 'none'; }
        });
        const got = await page.evaluate(async (s, STAGE) => {
            const q = window.__qa, I = q.islandOf(STAGE), cp = q.checkpoint(STAGE);
            const go = () => { q.give({ padCool: true }); q.teleport(cp.x, cp.y, cp.z + 3, Math.PI); q.auto(true); };
            go();
            const t0 = performance.now();
            let burnAt = 0;
            return await new Promise((res) => {
                const f = () => {
                    const c = q.P.c, st = q.state(), me = q.me();
                    if (me && me.label) me.label.visible = false;
                    if (st.zone === 2 && !c.air) {
                        // which way round it laps: the camera stands on the bowl's side of the car, a little ahead of it
                        const side = Math.sin(c.ry) * (I.cz - c.z) - Math.cos(c.ry) * (I.cx - c.x) > 0 ? -1 : 1;
                        q.look(side * (Math.PI / 2 - s.cam[0]) - Math.PI, s.cam[1], s.cam[2]);
                        if (!burnAt && st.u >= s.u[0] - 0.05 && st.u <= s.u[1]) { q.dash(); burnAt = performance.now(); }
                        if (burnAt && performance.now() - burnAt > 320 && st.u >= s.u[0] && st.u <= s.u[1] && q.rockGap() > 22 && Math.hypot(q.camera.position.x - c.x, q.camera.position.y - c.y, q.camera.position.z - c.z) > s.cam[2] * 0.8) {
                            // hold this frame: the game's next one is kept back (and given back after the screenshot)
                            window.__raf = window.requestAnimationFrame; window.__held = [];
                            window.requestAnimationFrame = (cb) => { window.__held.push(cb); return 0; };
                            return res({ u: st.u, v: st.v, secs: +((performance.now() - t0) / 1000).toFixed(1) });
                        }
                        if (burnAt && performance.now() - burnAt > 1200) burnAt = 0;
                    }
                    if (performance.now() - t0 > 120000) return res({ failed: true });
                    // out over the rim before the frame was caught: in again
                    if (st.out.includes(STAGE) && st.zone === 3) { burnAt = 0; go(); }
                    requestAnimationFrame(f);
                };
                requestAnimationFrame(f);
            });
        }, s, STAGE);
        await sleep(150);
        if (process.env.TRY) console.log('try', s.name, JSON.stringify(s.cam), JSON.stringify(got), await shot(page, 'cover-' + s.name));
        else {
            await page.evaluate((html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d.firstChild); }, lettering(s.w, s.h, s.pops));
            await page.evaluate(() => document.fonts.ready);
            await sleep(300);
            await page.screenshot({ path: path.join(dir, s.name), type: 'png' });
            console.log('wrote', s.name, JSON.stringify(got), page.errors);
        }
        await page.evaluate(() => { if (window.__raf) window.requestAnimationFrame = window.__raf; for (const cb of window.__held || []) requestAnimationFrame(cb); window.__qa.auto(false); });
        await page.close();
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
