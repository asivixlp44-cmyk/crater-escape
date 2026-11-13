// Eruption on screen: one volcano. Its crater is a bowl like the craters of the worlds (the same wall in bands of rock), a deck of
// stone round its rim with lamps in the racers' colours, the mountain's flanks falling away outside. Boost chevrons on the wall,
// boulders rolling down their lanes, and the lava: a disc of molten rock (all in its shader) that rises up the bowl.
import { T, V3, scene } from './engine.js';
import { Kit, batchKits, rng } from './geo.js';
import { CU } from './clock.js';
import { propMaterial, lookOf, shade, bowlKit, band, P3, lathe } from './world.js';
import { padGeo, padMaterial, rockGeo, litVCMaterial } from './stagefx.js';
import { CFG } from '../../shared/config.js';
import { arenaPoint, arenaRockU, startSpot } from '../../shared/arena.js';
import { ROCK } from '../../shared/world.js';

function lavaMaterial(c1, c2) {
    return new T.ShaderMaterial({
        uniforms: { uNow: CU.uNow, uA: { value: new T.Color(c1) }, uB: { value: new T.Color(c2) } },
        vertexShader: 'varying vec2 vP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float uNow; uniform vec3 uA, uB; varying vec2 vP;
            void main() {
                float t = uNow * 0.5;
                // slow cells of molten rock, bright cracks between crusts
                float a = sin(vP.x * 0.09 + t + sin(vP.y * 0.07 - t * 0.7) * 2.0) * sin(vP.y * 0.11 - t * 0.8 + sin(vP.x * 0.05 + t * 0.4) * 2.0);
                float b = sin(vP.x * 0.31 - t * 1.7) * sin(vP.y * 0.27 + t * 1.3);
                float k = smoothstep(-0.25, 0.75, a + b * 0.35);
                vec3 c = mix(uA * 0.72, uB * 1.25, k);
                c += vec3(1.0, 0.9, 0.6) * smoothstep(0.82, 1.0, k) * 0.5;
                gl_FragColor = vec4(c, 1.0);
                #include <colorspace_fragment>
            }`,
    });
}

export function buildArena(plan, w, spotsCol, low, mySpot) {
    const L = lookOf(w), B = plan.B, R = rng(plan.seed), group = new T.Group(), span = B.R - B.r0;
    const S = new Kit({ glow: true }), D = new Kit({ glow: true }), Bw = new Kit({ glow: true });
    // a volcano's own rock whatever the world: dark basalt banded hotter towards the floor (the world's colours on its deck and lamps)
    const strata = [0xff7a2a, 0xd8542a, 0x9a3a2a, 0x5e3232, 0x46333a, 0x3a3038];
    // (the bowl a kit of its own: it throws no shadow, only takes them)
    const M = bowlKit(Bw, 0, 0, B, 0, strata, 0x5a2a22, L.slick, L.trim, { slicks: plan.slicks }, low);
    band(S, 0, 0, B.R, 0, B.R + 1.6, 0, M, () => L.trim, { want: 'up' });
    band(S, 0, 0, B.R + 1.6, 0, B.Ro, 0, M, () => 0x524a52, { want: 'up' });
    // the mountain outside: its flanks falling away
    const Mc = low ? 18 : 28, wob = [], wob2 = [];
    for (let i = 0; i < Mc; i++) { wob.push(0.94 + R() * 0.12); wob2.push(0.85 + R() * 0.3); }
    band(S, 0, 0, B.Ro, 0, B.Ro + 1.2, -2, M, () => 0x3a343c, { want: 'out' });
    band(S, 0, 0, B.Ro + 1.2, -2, B.Ro * 1.35, -B.H * 0.45, Mc, (i) => shade(0x443c44, 0.94 + (wob[i] - 0.97) * 1.2), { want: 'out', wob2: wob });
    band(S, 0, 0, B.Ro * 1.35, -B.H * 0.45, B.Ro * 2.3, -B.H * 1.6, Mc, (i) => shade(0x332e36, 0.94 + (wob2[i] - 0.9) * 0.6), { want: 'out', wob, wob2 });
    // lamps round the rim in the racers' colours, a low kerb at the edge
    const nL = low ? 12 : 24;
    for (let i = 0; i < nL; i++) {
        const a = (i + 0.5) / nL * Math.PI * 2, p = P3(0, 0, a, B.Ro - 1.6, 0), c = spotsCol[i % spotsCol.length];
        D.box(p[0], 2.2, p[2], 0.7, 4.4, 0.7, 0x2a2a32);
        lathe(D, p[0], p[2], [[1.1, 4.2, c], [0.8, 5.4, c], [0.2, 5.9, c]], 6, { glow: 1 });
    }
    band(S, 0, 0, B.Ro - 0.8, 0.9, B.Ro, 0.9, M, () => L.trim, { want: 'up' });
    band(S, 0, 0, B.Ro - 0.8, 0, B.Ro - 0.8, 0.9, M, () => shade(L.trim, 0.8), { want: 'in' });
    // the start: a disc of each racer's colour on the floor (yours ringed in white)
    for (let i = 0; i < CFG.matchSpots; i++) {
        const p = startSpot(i, plan);
        band(D, p.x, p.z, 0.001, p.y + 0.06, 3.4, p.y + 0.06, low ? 10 : 16, () => spotsCol[i], { want: 'up', glow: 1 });
        if (i === mySpot) band(D, p.x, p.z, 3.4, p.y + 0.07, 4.3, p.y + 0.07, low ? 10 : 16, () => 0xffffff, { want: 'up', glow: 1 });
    }
    const mat = propMaterial(), sMesh = batchKits([S], mat, true), dMesh = batchKits([D], mat, false), bMesh = batchKits([Bw], mat, false);
    if (bMesh) group.add(bMesh);
    if (sMesh) group.add(sMesh);
    if (dMesh) group.add(dMesh);
    // boost chevrons
    const nrm = (u) => { const f1 = B.S * u, l = Math.hypot(f1, 1); return { out: -f1 / l, up: 1 / l, f1 }; };
    let padMesh = null;
    if (plan.pads.length) {
        padMesh = new T.Mesh(padGeo(plan.pads, (a, u) => arenaPoint(plan, a, u), nrm, span, 0x46ec50), padMaterial());
        padMesh.renderOrder = 1; padMesh.frustumCulled = false;
        group.add(padMesh);
    }
    // boulders
    const rockG = rockGeo(low, 0x5a4a4a, 0x34282a), rockM = new T.InstancedMesh(rockG, litVCMaterial(), Math.max(1, plan.rocks.length));
    rockM.instanceMatrix.setUsage(T.DynamicDrawUsage); rockM.frustumCulled = false; rockM.castShadow = !low; rockM.count = plan.rocks.length; rockM.visible = plan.rocks.length > 0;
    const ZERO = new T.Matrix4().makeScale(0.0001, 0.0001, 0.0001).setPosition(0, -400, 0);
    plan.rocks.forEach((o, i) => rockM.setMatrixAt(i, ZERO));
    group.add(rockM);
    // the lava: a disc as wide as the bowl is at its height
    const lavaG = new T.CircleGeometry(1, low ? 32 : 56).rotateX(-Math.PI / 2), lavaMat = lavaMaterial(L.hazard, L.hazard2), lava = new T.Mesh(lavaG, lavaMat);
    lava.frustumCulled = false; lava.position.y = -B.H + 0.2; lava.scale.set(B.r0 * 0.5, 1, B.r0 * 0.5);
    group.add(lava);
    // your reach line
    const RM = low ? 48 : 96, reachG = new T.BufferGeometry(), rPos = new Float32Array(RM * 4 * 3), rIdx = [];
    for (let i = 0; i < RM; i++) { const b = i * 4; rIdx.push(b, b + 2, b + 1, b, b + 3, b + 2, b, b + 1, b + 2, b, b + 2, b + 3); }
    reachG.setAttribute('position', new T.BufferAttribute(rPos, 3)); reachG.setIndex(rIdx);
    reachG.boundingSphere = new T.Sphere(new V3(), 1e5);
    const reachMat = new T.MeshBasicMaterial({ color: 0xfff07a, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const reach = new T.Mesh(reachG, reachMat);
    reach.frustumCulled = false; reach.visible = false; reach.renderOrder = 1;
    group.add(reach);
    group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    lava.matrixAutoUpdate = true;
    scene.add(group);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), v = new V3(), s = new V3(), ax = new V3();
    let reachKey = -1, reachOut = false;
    return {
        group, plan,
        setReach(u) {
            const out = u >= 1, uu = Math.min(1, Math.max(0.03, u)), key = Math.round(uu * 300);
            reachOut = out;
            if (key === reachKey) return;
            reachKey = key;
            const wd = Math.min(0.03, 1.4 / span), u0 = Math.max(0.005, uu - wd), nA = nrm(u0), nB = nrm(uu);
            for (let i = 0; i < RM; i++) {
                const a0 = (i + 0.08) / RM * Math.PI * 2, a1 = (i + 0.92) / RM * Math.PI * 2, o = i * 12;
                const A = arenaPoint(plan, a0, u0), Bp = arenaPoint(plan, a1, u0), C = arenaPoint(plan, a1, uu), Dp = arenaPoint(plan, a0, uu);
                const put = (j, p, a, n) => { rPos[o + j * 3] = p.x + Math.sin(a) * n.out * 0.22; rPos[o + j * 3 + 1] = p.y + n.up * 0.22; rPos[o + j * 3 + 2] = p.z + Math.cos(a) * n.out * 0.22; };
                put(0, A, a0, nA); put(1, Bp, a1, nA); put(2, C, a1, nB); put(3, Dp, a0, nB);
            }
            reachG.attributes.position.needsUpdate = true;
            reach.visible = true;
        },
        // t: the server's seconds (the boulders); lavaY: how high the lava stands; lt: this screen's seconds
        update(t, lavaY, lt) {
            const f = Math.max(0, Math.min(1, (lavaY + B.H) / B.H)), rl = (lavaY >= 0 ? B.Ro : B.r0 + span * Math.sqrt(f)) + 0.6;
            lava.position.y = lavaY; lava.scale.set(rl, 1, rl);
            if (reach.visible) { const p = 0.5 + 0.5 * Math.sin(lt * (reachOut ? 9 : 4)); reachMat.color.setHex(reachOut ? 0x46ff5a : 0xfff07a); reachMat.opacity = 0.55 + 0.4 * p; }
            let any = false;
            plan.rocks.forEach((o, i) => {
                const u = arenaRockU(o, t);
                if (u < 0) { rockM.setMatrixAt(i, ZERO); any = true; return; }
                const p = arenaPoint(plan, o.a, u), n = nrm(u);
                ax.set(Math.cos(o.a), 0, -Math.sin(o.a));
                q.setFromAxisAngle(ax, -(1 - u) * span * Math.hypot(1, n.f1) / ROCK.r);
                rockM.setMatrixAt(i, m4.compose(v.set(p.x + Math.sin(o.a) * n.out * ROCK.r, p.y + n.up * ROCK.r, p.z + Math.cos(o.a) * n.out * ROCK.r), q, s.setScalar(ROCK.r)));
                any = true;
            });
            if (any) rockM.instanceMatrix.needsUpdate = true;
        },
        showAll() { reach.visible = true; rockM.visible = true; },
        dispose() {
            for (const m of [sMesh, dMesh, bMesh]) if (m) (m.isBatchedMesh ? m.dispose() : m.geometry.dispose());
            if (padMesh) padMesh.geometry.dispose();
            // (not the materials: their programs stay compiled for the next race)
            rockG.dispose(); rockM.dispose(); lavaG.dispose(); reachG.dispose();
            scene.remove(group);
        },
    };
}
