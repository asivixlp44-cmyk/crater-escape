// Z-fighting: two surfaces in the same place flickering through each other (in play: patches that break up and change as the camera
// moves). Each view is drawn several times into an off-screen picture with only the depth range nudged by a hair (the camera's near
// plane, and the camera moved a thousandth of a stud: nothing on the screen moves, only which of two surfaces at about the same depth
// wins), and every pixel that changes is marked. Writes each view, dimmed, with the changed pixels in red, to the screenshots folder,
// and lists how many pixels changed. Run: node tests/zfight.mjs (Q=low|medium|high, ONLY=name,name)
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startVite, stopAll, launch, open, qa, sleep, OUT, TEST_PORT } from './lib.mjs';

const W = 960, H = 540;
const VIEWS = [
    ['spawn', () => { const q = window.__qa; q.teleport(0, 0, 100, Math.PI); q.look(0, 0.3, 30); }],
    ['spawn-back', () => { const q = window.__qa; q.teleport(0, 0, 100, Math.PI); q.look(Math.PI, 0.3, 34); }],
    ['dynos', () => { const q = window.__qa; q.tpPost(2); q.look(0.6, 0.3, 26); }],
    ['bridge1', () => { const q = window.__qa; q.teleport(0, 0, 30, Math.PI); q.look(0, 0.2, 26); }],
    ['landing1', () => { const q = window.__qa, cp = q.checkpoint(0); q.teleport(cp.x, cp.y, cp.z - 4, Math.PI); q.look(0, 0.3, 24); }],
    ['over1', () => { const q = window.__qa, I = q.islandOf(0), cp = q.checkpoint(0); q.teleport(cp.x, cp.y, cp.z - 6, Math.PI); q.look(0, 1.0, 30 + I.R); }],
    ['wall1', () => { const q = window.__qa, I = q.islandOf(0), r = I.r0 + (I.R - I.r0) * 0.75; q.teleport(I.cx + r, I.E - I.H + I.H * 0.5625, I.cz, Math.PI); q.look(0, 0.3, 26); }],
    ['exit1', () => { const q = window.__qa, I = q.islandOf(0); q.teleport(0, I.E, I.cz - I.R - 7, Math.PI, true); q.look(0, 0.25, 26); }],
    ['far-craters', () => { const q = window.__qa, I = q.islandOf(1); q.teleport(0, I.E, I.cz - I.R - 7, Math.PI, true); q.look(0, 0.12, 30); }],
    ['crater8', () => { const q = window.__qa, I = q.islandOf(7), cp = q.checkpoint(7); q.teleport(cp.x, cp.y, cp.z - 6, Math.PI); q.look(0, 0.7, 30 + I.R * 0.6); }],
    ['crater12', () => { const q = window.__qa, I = q.islandOf(11), cp = q.checkpoint(11); q.teleport(cp.x, cp.y, cp.z - 6, Math.PI); q.look(0, 0.6, 30 + I.R * 0.5); }],
    ['summit', () => { const q = window.__qa, s = q.summit; q.teleport(s.x, s.y, s.z + 20, Math.PI, true); q.look(0, 0.2, 28); }],
];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
const out = [];
try {
    const page = await open(b, 'http://localhost:5649/', { w: 1280, h: 720, q: process.env.Q || 'high', uid: 'zf' + Date.now() });
    await qa(page, () => { const q = window.__qa; q.close(); q.noWatch(true); q.hud(false); window.__noFloat = true; q.give({ lv: 30, reach: 11 }); });
    await sleep(800);
    for (const [name, fn] of VIEWS) {
        if (only && !only.includes(name)) continue;
        await qa(page, fn);
        await sleep(1600);
        const r = await page.evaluate(async (w, h) => {
            const q = window.__qa, T = q.T, R = q.renderer(), cam = q.camera, sc = q.scene;
            // (the game's frames held while it's drawn)
            const raf = window.requestAnimationFrame, held = [];
            window.requestAnimationFrame = (cb) => { held.push(cb); return 0; };
            await new Promise((res) => setTimeout(res, 80));
            const rt = new T.WebGLRenderTarget(w, h, { samples: 0 }), near0 = cam.near, aspect0 = cam.aspect, p0 = cam.position.clone(), fwd = new T.Vector3();
            cam.getWorldDirection(fwd);
            cam.aspect = w / h;
            const shots = [];
            for (const [kn, mv] of [[1, 0], [1.0006, 0], [0.9994, 0], [1, 0.001], [1, -0.001], [1.0013, 0.0007]]) {
                cam.near = near0 * kn; cam.position.copy(p0).addScaledVector(fwd, mv); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
                R.setRenderTarget(rt); R.render(sc, cam);
                const buf = new Uint8Array(w * h * 4); R.readRenderTargetPixels(rt, 0, 0, w, h, buf); shots.push(buf);
            }
            R.setRenderTarget(null); cam.near = near0; cam.aspect = aspect0; cam.position.copy(p0); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
            rt.dispose();
            window.requestAnimationFrame = raf;
            for (const cb of held) raf(cb);
            const base = shots[0], mask = new Uint8Array(w * h);
            let changed = 0;
            for (let i = 0; i < w * h; i++) {
                const o = i * 4;
                for (let s = 1; s < shots.length; s++) { const z = shots[s]; if (Math.abs(z[o] - base[o]) + Math.abs(z[o + 1] - base[o + 1]) + Math.abs(z[o + 2] - base[o + 2]) > 30) { mask[i] = 1; changed++; break; } }
            }
            // (the picture: the view dimmed, what changed in red; readRenderTargetPixels is bottom-up)
            const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
            const x = cv.getContext('2d'), img = x.createImageData(w, h);
            for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
                const si = (h - 1 - yy) * w + xx, so = si * 4, o = (yy * w + xx) * 4;
                if (mask[si]) { img.data[o] = 255; img.data[o + 1] = 30; img.data[o + 2] = 30; } else { img.data[o] = base[so] * 0.5; img.data[o + 1] = base[so + 1] * 0.5; img.data[o + 2] = base[so + 2] * 0.5; }
                img.data[o + 3] = 255;
            }
            x.putImageData(img, 0, 0);
            return { changed, png: cv.toDataURL('image/png').split(',')[1] };
        }, W, H);
        const file = path.join(OUT, 'zf-' + name + '.png');
        fs.writeFileSync(file, Buffer.from(r.png, 'base64'));
        out.push([name, r.changed]);
        console.log(name.padEnd(14) + String(r.changed).padStart(7) + ' pixels changed (' + (r.changed / (W * H) * 100).toFixed(2) + '%)  ' + file);
    }
    const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
    console.log('errors', JSON.stringify(errs.slice(0, 4)));
} catch (e) { console.error(e); }
await b.close(); stopAll();
process.exit(0);
