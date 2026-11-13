// The cars: every one built here from its numbers in shared/config.js CARS (a go-kart, buggies, a rally car, trucks, racers, a
// hover-glider), one vertex-coloured geometry each (one draw a car), open-topped so its driver shows. Every wheel of every car in
// view is an instance of one wheel (one draw for the lot). And a little picture of each car for the menus, drawn once while loading.
import { T, renderer, selfLit } from './engine.js';
import { Kit, merge, glowVCMaterial } from './geo.js';
import { CU } from './clock.js';
import { CARS } from '../../shared/config.js';

const DARK = 0x20222a, METAL = 0xb8c0cc, SEAT = 0x2c2e3a, LAMP = 0xfff4c0, TAIL = 0xff3a3a;
// A car's shape: { geo, wr (wheel radius), ww (wheel width), wheels: [[x, z] x 4] (front pair first), floor (the cockpit's floor),
// seat (where the driver sits: z), ex: [[x, y, z]] the exhausts, len }
const cache = new Map();
export function carShape(i, low) {
    const key = i + (low ? 'l' : 'h');
    if (cache.has(key)) return cache.get(key);
    const C = CARS[i] || CARS[0], K = new Kit({ glow: true }), soft = !low;
    const { c1, c2, c3 } = C, G = C.glow || c2;
    const box = (x, y, z, sx, sy, sz, c, o) => K.box(x, y, z, sx, sy, sz, c, { soft, ...(o || {}) });
    const lit = (x, y, z, sx, sy, sz, c) => K.box(x, y, z, sx, sy, sz, c, { glow: 1 });
    const pair = (fn) => { fn(1); fn(-1); };
    let S;
    if (C.kind === 0) {
        // a go-kart: a flat frame, a nose cone, side pods, a bucket seat, the engine out the back
        S = { wr: 0.95, ww: 0.85, wheels: [[2.15, 2.35], [-2.15, 2.35], [2.2, -2.25], [-2.2, -2.25]], floor: 0.85, seat: -1.0, ex: [[0.7, 1.5, -3.5], [-0.7, 1.5, -3.5]], len: 7.4 };
        box(0, 0.68, 0, 3.0, 0.3, 6.2, c3);
        box(0, 1.0, 2.7, 2.1, 0.6, 1.7, c1); box(0, 1.2, 1.7, 1.5, 0.5, 0.9, c1, { rx: -0.5 });
        box(0, 0.72, 3.6, 3.7, 0.34, 0.42, c2);
        pair((s) => box(s * 1.85, 0.98, -0.1, 0.9, 0.6, 2.7, c1));
        box(0, 1.9, -1.75, 1.9, 2.1, 0.42, SEAT, { rx: -0.12 }); box(0, 0.98, -0.9, 1.9, 0.3, 1.6, SEAT);
        box(0, 1.3, -2.75, 1.7, 0.95, 1.05, METAL); box(0, 1.9, -2.75, 0.9, 0.3, 0.7, c2);
        pair((s) => box(s * 0.7, 1.5, -3.35, 0.32, 0.32, 0.7, DARK));
        box(0, 1.75, 1.15, 0.2, 1.5, 0.2, DARK, { rx: 0.6 }); box(0, 2.35, 0.75, 1.25, 0.22, 0.22, DARK);
        box(0, 0.78, -3.4, 3.5, 0.3, 0.3, c2);
        lit(0, 1.05, 3.56, 0.9, 0.3, 0.06, LAMP);
    } else if (C.kind === 1) {
        // a dune buggy: a tub with a sloped bonnet, a roll cage of tubes, fat tyres, mudguards
        S = { wr: 1.35, ww: 1.15, wheels: [[2.55, 2.65], [-2.55, 2.65], [2.6, -2.5], [-2.6, -2.5]], floor: 1.35, seat: -0.7, ex: [[1.0, 1.9, -3.9], [-1.0, 1.9, -3.9]], len: 8 };
        box(0, 1.55, 0.1, 3.5, 1.0, 5.9, c1);
        box(0, 2.0, 2.5, 3.1, 0.55, 2.3, c1, { rx: 0.2 }); box(0, 1.25, 3.5, 3.3, 0.6, 0.5, c3);
        pair((s) => { box(s * 2.55, 2.75, 2.65, 1.25, 0.22, 2.5, c2); box(s * 2.6, 2.75, -2.5, 1.3, 0.22, 2.6, c2); });
        box(0, 2.6, -1.55, 2.6, 2.2, 0.45, SEAT, { rx: -0.1 });
        // the cage: two hoops and the bars between them
        pair((s) => { box(s * 1.62, 3.25, -2.3, 0.24, 2.6, 0.24, c3); box(s * 1.62, 3.15, 1.25, 0.24, 2.5, 0.24, c3, { rx: 0.35 }); box(s * 1.62, 4.45, -0.75, 0.24, 0.24, 3.4, c3); });
        box(0, 4.45, -2.3, 3.5, 0.24, 0.24, c3); box(0, 4.3, 0.85, 3.5, 0.24, 0.24, c3);
        box(0, 2.05, -3.2, 2.5, 1.0, 1.3, METAL); box(0, 2.7, -3.2, 1.4, 0.35, 0.9, c2);
        pair((s) => box(s * 1.0, 1.9, -3.75, 0.36, 0.36, 0.8, DARK));
        box(0, 2.55, 1.35, 0.2, 1.3, 0.2, DARK, { rx: 0.7 }); box(0, 3.0, 0.95, 1.3, 0.22, 0.22, DARK);
        pair((s) => lit(s * 1.1, 2.0, 3.62, 0.7, 0.5, 0.08, LAMP));
        pair((s) => lit(s * 1.3, 1.7, -3.86, 0.5, 0.3, 0.06, TAIL));
        if (C.wing) { pair((s) => box(s * 1.2, 4.0, -3.5, 0.2, 1.5, 0.2, c3)); box(0, 4.8, -3.6, 4.0, 0.2, 1.1, c2); }
    } else if (C.kind === 2) {
        // a rally car: a long low body with no roof, a windscreen frame, a hoop behind the seats, a stripe down the bonnet
        S = { wr: 1.25, ww: 1.05, wheels: [[2.4, 2.75], [-2.4, 2.75], [2.4, -2.6], [-2.4, -2.6]], floor: 1.3, seat: -0.5, ex: [[1.2, 1.2, -4.1], [-1.2, 1.2, -4.1]], len: 8.4 };
        box(0, 1.55, 0, 4.5, 1.2, 8.0, c1);
        box(0, 2.25, 2.6, 4.1, 0.3, 2.6, c1, { rx: 0.08 }); box(0, 2.25, -3.0, 4.1, 0.3, 1.8, c1);
        box(0, 2.42, 2.6, 1.3, 0.08, 2.5, c2, { rx: 0.08 }); box(0, 2.42, -3.0, 1.3, 0.06, 1.7, c2);
        pair((s) => { box(s * 2.3, 1.7, 2.75, 0.5, 1.0, 2.9, c1); box(s * 2.3, 1.7, -2.6, 0.5, 1.0, 2.9, c1); box(s * 2.3, 1.15, 0, 0.3, 0.3, 2.6, c2); });
        pair((s) => box(s * 1.9, 3.0, 1.05, 0.2, 1.4, 0.2, DARK, { rx: 0.45 }));
        box(0, 3.62, 0.75, 4.0, 0.2, 0.2, DARK);
        pair((s) => box(s * 1.9, 3.3, -1.9, 0.26, 2.2, 0.26, c3));
        box(0, 4.35, -1.9, 4.1, 0.26, 0.26, c3);
        box(0, 2.7, -1.4, 3.4, 1.9, 0.45, SEAT, { rx: -0.1 });
        box(0, 2.6, 0.9, 0.2, 1.0, 0.2, DARK, { rx: 0.7 }); box(0, 2.95, 0.6, 1.3, 0.22, 0.22, DARK);
        box(0, 1.1, 4.05, 4.3, 0.5, 0.4, c3); box(0, 1.1, -4.05, 4.3, 0.5, 0.4, c3);
        pair((s) => { lit(s * 1.5, 1.85, 4.02, 0.9, 0.45, 0.08, LAMP); lit(s * 1.5, 1.85, -4.02, 0.9, 0.4, 0.08, TAIL); });
        if (C.wing) { pair((s) => box(s * 1.5, 3.0, -3.7, 0.2, 1.5, 0.3, c3)); box(0, 3.85, -3.8, 4.6, 0.2, 1.2, c2); if (C.wing > 1) pair((s) => box(s * 2.3, 3.85, -3.8, 0.2, 0.9, 1.4, c1)); }
        pair((s) => box(s * 1.2, 1.2, -4.05, 0.4, 0.4, 0.6, DARK));
    } else if (C.kind === 3) {
        // a big truck: riding high on huge tyres, a bull bar, a scoop on the bonnet, an open cab with a roll bar and a light bar
        S = { wr: 1.8, ww: 1.5, wheels: [[2.9, 2.95], [-2.9, 2.95], [2.9, -2.8], [-2.9, -2.8]], floor: 2.3, seat: -0.3, ex: [[1.9, 4.6, -1.9], [-1.9, 4.6, -1.9]], len: 8.8 };
        box(0, 1.55, 2.95, 4.4, 0.5, 0.6, DARK); box(0, 1.55, -2.8, 4.4, 0.5, 0.6, DARK);
        box(0, 2.75, 0.2, 4.7, 1.4, 8.2, c1);
        box(0, 3.65, 2.9, 4.3, 0.5, 2.6, c1); box(0, 3.5, -3.0, 4.5, 0.3, 2.2, c3);
        pair((s) => { box(s * 2.9, 3.75, 2.95, 1.7, 0.26, 3.2, c2); box(s * 2.9, 3.75, -2.8, 1.7, 0.26, 3.2, c2); });
        if (C.scoop) { box(0, 4.15, 2.7, 1.5, 0.7, 1.6, c2); lit(0, 4.15, 3.52, 1.1, 0.4, 0.06, G); }
        pair((s) => box(s * 2.0, 4.6, 1.25, 0.22, 1.6, 0.22, DARK, { rx: 0.4 }));
        box(0, 5.3, 0.95, 4.2, 0.22, 0.22, DARK);
        pair((s) => box(s * 2.05, 4.9, -1.7, 0.34, 2.8, 0.34, c3));
        box(0, 6.3, -1.7, 4.5, 0.34, 0.34, c3);
        for (const lx of [-1.5, -0.5, 0.5, 1.5]) lit(lx, 6.7, -1.62, 0.7, 0.5, 0.2, LAMP);
        box(0, 4.0, -1.2, 3.6, 2.0, 0.5, SEAT, { rx: -0.08 });
        box(0, 3.9, 1.0, 0.22, 1.1, 0.22, DARK, { rx: 0.7 }); box(0, 4.3, 0.7, 1.4, 0.24, 0.24, DARK);
        // the bull bar
        box(0, 2.6, 4.5, 4.6, 0.3, 0.3, c3); box(0, 3.3, 4.5, 3.6, 0.3, 0.3, c3); pair((s) => box(s * 1.6, 2.9, 4.5, 0.3, 1.2, 0.3, c3));
        pair((s) => { lit(s * 1.6, 3.0, 4.32, 0.9, 0.55, 0.08, LAMP); lit(s * 1.7, 3.0, -4.02, 0.8, 0.45, 0.08, TAIL); });
        pair((s) => box(s * 1.9, 4.2, -1.95, 0.42, 1.2, 0.42, DARK));
        if (C.wing) { pair((s) => box(s * 1.6, 4.4, -3.7, 0.24, 1.6, 0.3, c3)); box(0, 5.3, -3.8, 5.0, 0.24, 1.3, c2); }
    } else if (C.kind === 4) {
        // an open-wheel racer: a long nose, side pods, an air box behind the driver, wings front and back
        S = { wr: 1.25, ww: 1.3, wheels: [[2.55, 3.0], [-2.55, 3.0], [2.65, -2.6], [-2.65, -2.6]], floor: 1.0, seat: -0.6, ex: [[0.5, 1.5, -4.1], [-0.5, 1.5, -4.1]], len: 9.2 };
        K.loft([{ z: 5.2, pts: [[-0.35, 0.75], [0.35, 0.75], [0.35, 1.05], [-0.35, 1.05]] }, { z: 2.6, pts: [[-0.85, 0.7], [0.85, 0.7], [0.85, 1.55], [-0.85, 1.55]] }, { z: 1.2, pts: [[-1.15, 0.65], [1.15, 0.65], [1.15, 1.85], [-1.15, 1.85]] }], () => c1, c1);
        box(0, 1.2, -1.2, 2.5, 1.2, 5.0, c1);
        pair((s) => { box(s * 1.85, 1.1, -0.9, 1.2, 0.9, 3.4, c2); lit(s * 1.85, 1.1, 0.84, 0.9, 0.5, 0.06, G); });
        box(0, 2.6, -2.0, 1.2, 1.5, 1.8, c1); lit(0, 2.9, -1.08, 0.7, 0.6, 0.06, DARK);
        box(0, 0.7, 5.0, 5.2, 0.16, 1.0, c2); pair((s) => box(s * 2.55, 0.95, 5.0, 0.16, 0.7, 1.1, c1));
        pair((s) => box(s * 1.1, 2.8, -3.9, 0.2, 2.0, 0.5, c3));
        box(0, 3.8, -4.0, 4.6, 0.2, 1.2, c2); pair((s) => box(s * 2.3, 3.6, -4.0, 0.2, 1.0, 1.4, c1));
        if (C.wing > 1) box(0, 3.2, -4.1, 4.2, 0.16, 0.8, c2);
        box(0, 2.1, -1.15, 1.9, 1.5, 0.4, SEAT, { rx: -0.25 });
        box(0, 2.05, 0.75, 0.18, 0.8, 0.18, DARK, { rx: 0.8 }); box(0, 2.3, 0.45, 1.1, 0.2, 0.2, DARK);
        pair((s) => { box(s * 1.7, 1.2, 3.0, 1.6, 0.16, 0.16, DARK); box(s * 1.7, 1.2, -2.6, 1.7, 0.2, 0.2, DARK); });
        pair((s) => box(s * 0.5, 1.5, -3.95, 0.34, 0.34, 0.7, DARK));
        lit(0, 1.3, -3.72, 0.6, 0.4, 0.06, TAIL);
    } else {
        // a hover-glider: no wheels at all: a sleek hull on four glowing pods, fins at the back
        S = { wr: 0, ww: 0, wheels: [[2.5, 2.6], [-2.5, 2.6], [2.5, -2.6], [-2.5, -2.6]], floor: 1.6, seat: -0.4, ex: [[1.1, 1.9, -4.3], [-1.1, 1.9, -4.3]], len: 9 };
        K.loft([{ z: 5, pts: [[-0.5, 1.4], [0.5, 1.4], [0.5, 1.8], [-0.5, 1.8]] }, { z: 2.4, pts: [[-1.9, 1.2], [1.9, 1.2], [1.7, 2.3], [-1.7, 2.3]] }, { z: -2.4, pts: [[-2.2, 1.2], [2.2, 1.2], [2.0, 2.5], [-2.0, 2.5]] }, { z: -4.4, pts: [[-1.5, 1.4], [1.5, 1.4], [1.3, 2.3], [-1.3, 2.3]] }], (r, f) => (f === 1 ? c2 : c1), c3);
        box(0, 2.5, 1.9, 2.4, 0.3, 2.6, c2, { rx: 0.12 });
        for (const [wx, wz] of S.wheels) { box(wx, 1.2, wz, 1.5, 0.7, 2.4, c3); lit(wx, 0.78, wz, 1.1, 0.16, 1.9, G); box(wx * 0.75, 1.5, wz, 1.0, 0.3, 0.6, c3); }
        pair((s) => box(s * 1.9, 3.3, -3.6, 0.2, 1.8, 1.6, c2, { rz: s * -0.3 }));
        box(0, 3.0, -1.3, 2.6, 1.6, 0.4, SEAT, { rx: -0.15 });
        box(0, 2.9, 0.8, 0.18, 0.8, 0.18, DARK, { rx: 0.8 }); box(0, 3.15, 0.5, 1.1, 0.2, 0.2, DARK);
        pair((s) => { lit(s * 1.1, 1.9, -4.42, 0.7, 0.5, 0.06, G); lit(s * 0.9, 1.6, 3.9, 0.5, 0.3, 0.06, LAMP); });
    }
    S.geo = K.geometry();
    S.tris = S.geo.attributes.position.count / 3;
    cache.set(key, S);
    return S;
}
// every car's body shares one material (vertex colours, glowing parts unlit)
let bodyMat = null;
export function carMaterial() { return bodyMat || (bodyMat = glowVCMaterial(CU.uNow)); }

// ----- the wheels: one tyre with its rim, every wheel in view an instance of it (radius and width by its scale) -----
let wheelGeo = null, wheelMesh = null, wn = 0;
const WMAX = 128;
function tint(g, c) { const col = new T.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new T.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; }
function buildWheels(low) {
    if (wheelMesh) return;
    const n = low ? 10 : 16;
    // (its axle along x; radius 1, width 1)
    const tyre = tint(new T.CylinderGeometry(1, 1, 1, n, 1).rotateZ(Math.PI / 2), 0x1c1c24);
    const rim = tint(new T.CylinderGeometry(0.58, 0.58, 1.04, n, 1).rotateZ(Math.PI / 2), 0xd8dce6);
    const parts = [tyre, rim];
    // spokes on both faces, so you see it spin
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) parts.push(tint(new T.BoxGeometry(0.06, 1.0, 0.16).rotateX(k * Math.PI / 3).translate(s * 0.52, 0, 0), 0x3a3e4a));
    wheelGeo = merge(parts);
    wheelMesh = new T.InstancedMesh(wheelGeo, selfLit(new T.MeshLambertMaterial({ vertexColors: true })), WMAX);
    wheelMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    wheelMesh.frustumCulled = false; wheelMesh.castShadow = !low; wheelMesh.receiveShadow = false;
    wheelMesh.count = 0;
}
// (the one wheel's geometry: the cars on show at the dealer's are built with it)
export function wheelGeometry(low) { buildWheels(low); return wheelGeo; }
export function beginWheels(scene, low) { buildWheels(low); if (!wheelMesh.parent) scene.add(wheelMesh); wn = 0; }
export function addWheel(m) { if (wn < WMAX) wheelMesh.setMatrixAt(wn++, m); }
export function endWheels() { if (!wheelMesh) return; wheelMesh.count = wn; wheelMesh.visible = wn > 0; if (wn) { wheelMesh.instanceMatrix.clearUpdateRanges(); wheelMesh.instanceMatrix.addUpdateRange(0, wn * 16); wheelMesh.instanceMatrix.needsUpdate = true; } }
// (the warm-up: one wheel drawn behind the loading screen)
export function wheelsWarm(scene, low) { beginWheels(scene, low); addWheel(new T.Matrix4().makeTranslation(0, -80, 0)); endWheels(); }

// ----- a picture of every car (the Cars panel, the dealer's signs): drawn once, behind the loading screen -----
const icons = [];
export const carIcon = (i) => icons[i] || '';
export async function makeCarIcons(pause, low) {
    if (icons.length) return;
    const W = 192, H = 128, rt = new T.WebGLRenderTarget(W, H, { samples: 0 });
    const sc = new T.Scene(), cam = new T.PerspectiveCamera(21, W / H, 1, 100), buf = new Uint8Array(W * H * 4);
    sc.add(new T.HemisphereLight(0xffffff, 0x8a8a9a, 1.5), new T.AmbientLight(0xffffff, 0.5));
    const sun = new T.DirectionalLight(0xffffff, 1.4); sun.position.set(6, 10, 8); sc.add(sun);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'), img = cx.createImageData(W, H), wm = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), s = new T.Vector3();
    buildWheels(!!low);
    const wheels = new T.InstancedMesh(wheelGeo, wheelMesh.material, 4);
    sc.add(wheels);
    const prevRT = renderer.getRenderTarget(), prevClear = renderer.getClearAlpha();
    for (let i = 0; i < CARS.length; i++) {
        const S = carShape(i, !!low), body = new T.Mesh(S.geo, carMaterial()), d = 12.6 + (S.len - 7.4) * 1.5 + S.wr * 0.8, cy = 1.3 + S.floor * 0.45;
        cam.position.set(d, d * 0.62 + cy, d); cam.lookAt(0, cy, 0); cam.updateMatrixWorld();
        sc.add(body);
        S.wheels.forEach(([x, z], k) => { wheels.setMatrixAt(k, wm.compose(v.set(x, S.wr, z), q.identity(), s.set(S.ww || 0.001, S.wr || 0.001, S.wr || 0.001))); });
        wheels.instanceMatrix.needsUpdate = true;
        renderer.setRenderTarget(rt); renderer.setClearAlpha(0); renderer.clear();
        renderer.render(sc, cam);
        renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
        // (the target's rows run bottom to top; its colours are linear)
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const a = ((H - 1 - y) * W + x) * 4, b = (y * W + x) * 4;
            for (let c = 0; c < 3; c++) { const l = buf[a + c] / 255; img.data[b + c] = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055)); }
            img.data[b + 3] = buf[a + 3];
        }
        cx.putImageData(img, 0, 0);
        icons[i] = cv.toDataURL('image/png');
        sc.remove(body);
        if (pause && i % 4 === 3) await pause();
    }
    renderer.setRenderTarget(prevRT); renderer.setClearAlpha(prevClear);
    wheels.dispose(); rt.dispose();
}
