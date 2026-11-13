// What moves in the craters, a draw each for the whole world: the boost chevrons on the walls and the golden launch chevrons along
// the top of each far wall (one mesh, their arrows running in the shader), the boulders rolling down their lanes (instances of one
// rock), the sweepers' arms turning round over the holes, the geysers (a glow that grows, then a column of steam), and your reach
// line (how high up this crater's wall your speed holds).
// Everything runs on the server's clock (shared/world.js rockU, sweepAngle, geyserAt), so everyone sees it in the same place.
import { T, V3, selfLit } from './engine.js';
import { CU } from './clock.js';
import { WALLS_N } from '../../shared/config.js';
import { islandOf, stagePlan, wallPoint, rockU, sweepAngle, sweepArm, geyserAt, exitU, exitArc, ROCK, SWEEP, GEYSER, PAD } from '../../shared/world.js';

// the chevrons' material: arrows running up the pad, bright on dark (uv: across, along)
let padMat = null;
export function padMaterial() {
    if (padMat) return padMat;
    padMat = new T.ShaderMaterial({
        uniforms: { uNow: CU.uNow }, transparent: true, depthWrite: false, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        vertexShader: 'varying vec2 vUv; varying vec3 vC; void main() { vUv = uv; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uNow; varying vec2 vUv; varying vec3 vC;
            void main() {
                float x = abs(vUv.x - 0.5) * 2.0, e = max(x, abs(vUv.y - 0.5) * 2.0);
                float ch = fract(vUv.y * 3.0 - x * 0.9 - uNow * 1.6);
                float arrow = smoothstep(0.0, 0.08, ch) * (1.0 - smoothstep(0.42, 0.5, ch));
                float rim = smoothstep(0.82, 0.9, e);
                vec3 c = mix(vC * 0.35, mix(vC, vec3(1.0), 0.45), max(arrow, rim));
                gl_FragColor = vec4(c, (0.55 + 0.4 * max(arrow, rim)) * (1.0 - smoothstep(0.96, 1.0, e)));
                #include <colorspace_fragment>
            }`,
    });
    return padMat;
}
// pads lying on a bowl's wall: point(a, u) gives a wall point and normal(u) its normal's [out, up]; list: [{ a, u }] (da, du: a
// pad's own half-size round the wall and up it, else a boost chevron's)
export function padGeo(list, point, normalAt, span, color) {
    const pos = [], uv = [], col = [], idx = [], c = new T.Color(color);
    list.forEach((p, i) => {
        const c0 = point(p.a, p.u), da = p.da ?? PAD.hw / c0.r, du = p.du ?? PAD.hd / span / Math.hypot(1, normalAt(p.u).f1), b = i * 4, hi = p.du ? 0.999 : 0.98;
        const cs = [[p.a - da, p.u - du], [p.a + da, p.u - du], [p.a + da, p.u + du], [p.a - da, p.u + du]];
        cs.forEach(([a, u], j) => {
            const q = point(a, Math.max(0.02, Math.min(hi, u))), n = normalAt(Math.max(0.02, Math.min(hi, u)));
            pos.push(q.x + Math.sin(a) * n.out * 0.16, q.y + n.up * 0.16, q.z + Math.cos(a) * n.out * 0.16);
            uv.push(j === 0 || j === 3 ? 0 : 1, j < 2 ? 0 : 1);
            col.push(c.r, c.g, c.b);
        });
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeBoundingSphere();
    return g;
}
// a lumpy rock, flat-shaded, a little darker underneath (radius 1)
export function rockGeo(low, c1, c2) {
    const g = new T.IcosahedronGeometry(1, low ? 0 : 1).toNonIndexed(), p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), a = new T.Color(c1), b = new T.Color(c2);
    const h = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
    for (let i = 0; i < n; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.86 + h(Math.round(x * 4), Math.round(y * 4), Math.round(z * 4)) * 0.26; p.setXYZ(i, x * k, y * k, z * k); }
    g.computeVertexNormals();
    for (let i = 0; i < n; i += 3) { const k = h(i, 1, 2) < 0.4 ? b : a, s = 0.9 + h(i, 3, 4) * 0.2; for (let j = 0; j < 3; j++) { col[(i + j) * 3] = k.r * s; col[(i + j) * 3 + 1] = k.g * s; col[(i + j) * 3 + 2] = k.b * s; } }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
}
let litMat = null;
export const litVCMaterial = () => litMat || (litMat = selfLit(new T.MeshLambertMaterial({ vertexColors: true })));

export function buildStageFx(group, wi, L, low) {
    const m4 = new T.Matrix4(), q = new T.Quaternion(), q2 = new T.Quaternion(), v = new V3(), s = new V3(), ax = new V3(), up = new V3(0, 1, 0);
    const nrmOf = (I) => (u) => { const f1 = I.S * u, l = Math.hypot(f1, 1); return { out: -f1 / l, up: 1 / l, f1 }; };
    // ----- boost chevrons: every crater's, one mesh -----
    const padsG = [];
    let padMesh = null;
    {
        const pos = [], uv = [], col = [], idx = [];
        for (let k = 0; k < WALLS_N; k++) {
            const P = stagePlan(wi, k), I = islandOf(k);
            // (the way out: a row of golden chevrons along the top of the far wall, under the far crescent)
            const eu = exitU(I), arc = exitArc(I), a0 = I.aX - arc, a1 = I.aX + arc, n = Math.max(3, Math.round(Math.abs(a1 - a0) * I.R / 12)), exits = [];
            for (let i = 0; i < n; i++) exits.push({ a: a0 + (i + 0.5) * ((a1 - a0) / n), u: (eu + 1) / 2, da: Math.abs(a1 - a0) / n * 0.45, du: (1 - eu) / 2 });
            for (const [list, colour] of [[P.pads, 0x46ec50], [exits, 0xffd23a]]) {
                if (!list.length) continue;
                const g = padGeo(list, (a, u) => wallPoint(k, a, u), nrmOf(I), I.R - I.r0, colour), o = pos.length / 3;
                pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array); col.push(...g.attributes.color.array);
                for (let i = 0; i < g.index.count; i++) idx.push(o + g.index.getX(i));
                g.dispose();
            }
        }
        if (pos.length) {
            const g = new T.BufferGeometry();
            g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
            g.setIndex(idx); g.computeBoundingSphere();
            padMesh = new T.Mesh(g, padMaterial());
            padMesh.renderOrder = 1; padMesh.frustumCulled = false;
            group.add(padMesh); padsG.push(g);
        }
    }
    // ----- boulders: an instance each -----
    const rocks = [];
    for (let k = 0; k < WALLS_N; k++) stagePlan(wi, k).rocks.forEach((o) => rocks.push({ k, o, i: rocks.length, on: false }));
    const rockG = rockGeo(low, L.rock, L.rock2), rockM = new T.InstancedMesh(rockG, litVCMaterial(), Math.max(1, rocks.length));
    rockM.instanceMatrix.setUsage(T.DynamicDrawUsage); rockM.frustumCulled = false; rockM.castShadow = !low; rockM.count = rocks.length;
    const ZERO = new T.Matrix4().makeScale(0.0001, 0.0001, 0.0001).setPosition(0, -400, 0);
    for (const r of rocks) rockM.setMatrixAt(r.i, ZERO);
    rockM.visible = rocks.length > 0;
    group.add(rockM);
    // ----- sweepers: a hub in the middle of the hole and its arms, tilted up along the wall's foot -----
    const sweeps = [];
    for (let k = 0; k < WALLS_N; k++) { const o = stagePlan(wi, k).sweeper; if (o) for (let j = 0; j < o.bars; j++) sweeps.push({ k, o, j, i: sweeps.length }); }
    // (a bar: from the hub out along +z, length 1; a warning stripe along its top)
    const barG = (() => {
        const parts = [], tint = (g, c) => { const col = new T.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new T.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g.toNonIndexed(); };
        parts.push(tint(new T.BoxGeometry(SWEEP.t, SWEEP.h, 1).translate(0, SWEEP.h / 2 + 0.3, 0.5), 0x3a3e4a));
        for (let i = 0; i < 6; i++) parts.push(tint(new T.BoxGeometry(SWEEP.t + 0.1, SWEEP.h * 0.5, 1 / 13).translate(0, SWEEP.h / 2 + 0.3, (i * 2 + 1.5) / 13), i & 1 ? 0xffd23a : 0xff5a2a));
        const n = parts.reduce((a, g) => a + g.attributes.position.count, 0), g = new T.BufferGeometry(), P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
        let o = 0;
        for (const p of parts) { P.set(p.attributes.position.array, o * 3); N.set(p.attributes.normal.array, o * 3); C.set(p.attributes.color.array, o * 3); o += p.attributes.position.count; p.dispose(); }
        g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('normal', new T.BufferAttribute(N, 3)); g.setAttribute('color', new T.BufferAttribute(C, 3));
        g.computeBoundingSphere();
        return g;
    })();
    const barM = new T.InstancedMesh(barG, litVCMaterial(), Math.max(1, sweeps.length));
    barM.instanceMatrix.setUsage(T.DynamicDrawUsage); barM.frustumCulled = false; barM.castShadow = !low; barM.count = sweeps.length; barM.visible = sweeps.length > 0;
    for (const b of sweeps) barM.setMatrixAt(b.i, ZERO);
    group.add(barM);
    // ----- geysers: a disc that glows as it warms, a column of steam when it blows -----
    const geys = [];
    for (let k = 0; k < WALLS_N; k++) stagePlan(wi, k).geysers.forEach((o) => geys.push({ k, o, i: geys.length, st: -1 }));
    const geyG = new T.CylinderGeometry(0.72, 1, 1, low ? 8 : 12, 1, true).translate(0, 0.5, 0);
    const geyM = new T.InstancedMesh(geyG, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, side: T.DoubleSide, forceSinglePass: true }), Math.max(1, geys.length));
    geyM.instanceMatrix.setUsage(T.DynamicDrawUsage); geyM.frustumCulled = false; geyM.count = geys.length; geyM.visible = geys.length > 0; geyM.renderOrder = 2;
    const cWarm = new T.Color(0xffd23a), cBlow = new T.Color(0xdff6ff), cTmp = new T.Color();
    for (const g of geys) { geyM.setMatrixAt(g.i, ZERO); geyM.setColorAt(g.i, cWarm); }
    group.add(geyM);
    // ----- your reach line: a band of light round the wall where your speed holds (at the rim, green: you can get out) -----
    const RM = low ? 48 : 96, reachG = new T.BufferGeometry(), rPos = new Float32Array(RM * 4 * 3), rIdx = [];
    for (let i = 0; i < RM; i++) { const b = i * 4; rIdx.push(b, b + 2, b + 1, b, b + 3, b + 2, b, b + 1, b + 2, b, b + 2, b + 3); }
    reachG.setAttribute('position', new T.BufferAttribute(rPos, 3)); reachG.setIndex(rIdx);
    reachG.boundingSphere = new T.Sphere(new V3(), 1e5);
    const reachMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const reach = new T.Mesh(reachG, reachMat);
    reach.frustumCulled = false; reach.visible = false; reach.renderOrder = 1; reach.matrixAutoUpdate = false;
    group.add(reach);
    let reachKey = '', reachOut = false, shown = false;
    const fx = {
        rocks, sweeps, geys,
        // where the reach line goes: stage k (-1: none), wall fraction u
        setReach(k, u) {
            const out = u >= 1, uu = Math.min(1, Math.max(0.03, u)), key = k < 0 ? '' : k + ':' + Math.round(uu * 400);
            if (key === reachKey) return;
            reachKey = key; reachOut = out;
            if (k < 0) { reach.visible = shown; return; }
            const I = islandOf(k), span = I.R - I.r0, w = Math.min(0.03, 1.4 / span), u0 = Math.max(0.005, uu - w), nA = nrmOf(I)(u0), nB = nrmOf(I)(uu);
            for (let i = 0; i < RM; i++) {
                // (dashes: every other one a little shorter)
                const a0 = (i + 0.08) / RM * Math.PI * 2, a1 = (i + 0.92) / RM * Math.PI * 2, o = i * 12;
                const A = wallPoint(k, a0, u0), B = wallPoint(k, a1, u0), C = wallPoint(k, a1, uu), D = wallPoint(k, a0, uu);
                const put = (j, p, a, n) => { rPos[o + j * 3] = p.x + Math.sin(a) * n.out * 0.22; rPos[o + j * 3 + 1] = p.y + n.up * 0.22; rPos[o + j * 3 + 2] = p.z + Math.cos(a) * n.out * 0.22; };
                put(0, A, a0, nA); put(1, B, a1, nA); put(2, C, a1, nB); put(3, D, a0, nB);
            }
            reachG.attributes.position.needsUpdate = true;
            reach.visible = true;
        },
        // every frame: what's in the crater the camera's at (the rest stand still, out of sight)
        update(t, cam, lt) {
            if (reach.visible) { const p = 0.5 + 0.5 * Math.sin(lt * (reachOut ? 9 : 4)); reachMat.color.setHex(reachOut ? 0x46ff5a : 0xfff07a); reachMat.opacity = 0.55 + 0.4 * p; }
            let any = false;
            for (const r of rocks) {
                const I = islandOf(r.k), near = Math.abs(cam.z - I.cz) < I.Ro + 140;
                if (!near) { if (r.on) { r.on = false; rockM.setMatrixAt(r.i, ZERO); any = true; } continue; }
                const u = rockU(r.o, t);
                if (u < 0) { if (r.on) { r.on = false; rockM.setMatrixAt(r.i, ZERO); any = true; } continue; }
                const p = wallPoint(r.k, r.o.a, u), n = nrmOf(I)(u), span = I.R - I.r0;
                r.on = true; any = true;
                // rolling: turned by how far it's come down the wall
                ax.set(Math.cos(r.o.a), 0, -Math.sin(r.o.a));
                q.setFromAxisAngle(ax, -(1 - u) * span * Math.hypot(1, n.f1) / ROCK.r);
                rockM.setMatrixAt(r.i, m4.compose(v.set(p.x + Math.sin(r.o.a) * n.out * ROCK.r, p.y + n.up * ROCK.r, p.z + Math.cos(r.o.a) * n.out * ROCK.r), q, s.setScalar(ROCK.r)));
            }
            if (any) rockM.instanceMatrix.needsUpdate = true;
            any = false;
            for (const b of sweeps) {
                const I = islandOf(b.k);
                if (Math.abs(cam.z - I.cz) > I.Ro + 140) continue;
                const arm = sweepArm(I, b.o);
                q.setFromAxisAngle(up, sweepAngle(b.o, t) + b.j * Math.PI * 2 / b.o.bars).multiply(q2.setFromAxisAngle(ax.set(1, 0, 0), -arm.tilt));
                barM.setMatrixAt(b.i, m4.compose(v.set(I.cx, arm.y, I.cz), q, s.set(1, 1, arm.long)));
                any = true;
            }
            if (any) barM.instanceMatrix.needsUpdate = true;
            any = false;
            for (const g of geys) {
                const I = islandOf(g.k);
                if (Math.abs(cam.z - I.cz) > I.Ro + 140) continue;
                const st = geyserAt(g.o, t), y0 = g.o.y + 0.05;
                if (st === 0 && g.st === 0) continue;
                g.st = st; any = true;
                if (st === 0) { geyM.setMatrixAt(g.i, ZERO); continue; }
                const blow = st === 2;
                geyM.setMatrixAt(g.i, m4.compose(v.set(g.o.x, y0, g.o.z), q2.identity(), blow ? s.set(GEYSER.r * 0.7, 24 + Math.sin(lt * 30) * 2, GEYSER.r * 0.7) : s.set(GEYSER.r * (0.5 + 0.5 * st), 0.5 + st * 1.2, GEYSER.r * (0.5 + 0.5 * st))));
                geyM.setColorAt(g.i, blow ? cBlow : cTmp.copy(cWarm).lerp(cBlow, st * 0.5));
            }
            if (any) { geyM.instanceMatrix.needsUpdate = true; if (geyM.instanceColor) geyM.instanceColor.needsUpdate = true; }
        },
        // (the warm-up: everything drawn once behind the loading screen)
        showAll(on) {
            shown = on;
            if (on) { reach.visible = true; rockM.visible = true; barM.visible = true; geyM.visible = true; }
            else { reach.visible = reachKey !== ''; rockM.visible = rocks.length > 0; barM.visible = sweeps.length > 0; geyM.visible = geys.length > 0; }
        },
        dispose() {
            for (const g of padsG) g.dispose();
            rockG.dispose(); rockM.dispose(); barG.dispose(); barM.dispose(); geyG.dispose(); geyM.dispose(); reachG.dispose();
        },
    };
    return fx;
}
