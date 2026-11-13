// A car on screen: yours, someone else's in your world, a rival's in a race. Its body (cars.js: one draw), its four wheels
// (instances of the one wheel: spinning with its speed, the front pair turning with the steering), its driver (the Bloxity avatar
// sat at the wheel, hands turning it), the name tag and title, the exhaust trail behind it, its underglow, the NITRO's flames.
// The body lies on the ground's slope under it (banked right over on a crater's wall), leans into a turn, squats on a landing.
import { T, V3, scene, billboard, buildRig } from './engine.js';
import { createAvatar, unpackAvatar } from './avatar.js';
import * as FX from './fx.js';
import { TRAILS, AURAS, CARS } from '../../shared/config.js';
import { carShape, carMaterial, addWheel } from './cars.js';

const KIT = { shirt: 0x2a8aff, shorts: 0x26263e, socks: 0xffffff, hair: 0x3a2618, skin: 0xf2c9a0 };
export const nameLines = (name, lv, title, color) => [{ t: (title ? title + ' · ' : '') + 'Lv. ' + (lv || 1), c: '#ffe24a', s: '#3a2400', px: 36 }, { t: name || ' ', c: color || '#ffffff', s: '#10203a', px: 52 }];

// Avatars are built one a frame at most (a whole match's worth at once was a long frame on a slow laptop);
// main.js pumps the queue every frame, and waits for it behind the fade into a match
const avQueue = [];
let avBusy = false;
export function pumpAvatars() {
    if (avBusy || !avQueue.length) return;
    const job = avQueue.shift();
    if (job.char.dead) return;
    avBusy = true;
    createAvatar(job.data).then((a) => { avBusy = false; job.done(a); }, () => { avBusy = false; job.done(null); });
}
export const avatarsPending = () => avQueue.length + (avBusy ? 1 : 0);

// (read straight away by whoever's updated: one will do for everyone)
const BLOX_ST = { moving: false, air: false, vy: 0, speed: 0, hspeed: 0, jump: false, airJump: false, t: 0, sprint: false, pose: 'kart', lick: 0, steer: 0, bump: 0 };
const UP = new V3(0, 1, 0), vF = new V3(), vL = new V3(), vN = new V3(), vP = new V3(), ONE = new V3(1, 1, 1);
const mB = new T.Matrix4(), mR = new T.Matrix4(), mW = new T.Matrix4(), qT = new T.Quaternion(), qS = new T.Quaternion(), qW = new T.Quaternion(), eW = new T.Euler();
const sW = new V3();
export class Car {
    // o: { name, lv, tr, car, color (the name's), noLabel, low }
    constructor(o) {
        o = o || {};
        this.root = new T.Group();                      // where it is, lying on the ground's slope
        this.lean = new T.Group();                      // the body's own roll, pitch and bounce
        this.root.add(this.lean);
        this.seat = new T.Group();                      // the driver
        this.lean.add(this.seat);
        const rig = buildRig(o.kit || KIT);
        sit(rig);
        this.seat.add(rig);
        this.body = rig;
        this.low = !!o.low;
        this.mesh = null; this.shape = null; this.carIdx = -1;
        this.setCar(o.car || 0);
        scene.add(this.root);
        this.blox = null; this.av = null; this.loading = false; this.dead = false;
        this.labelKey = '';
        this.labelW = o.labelW || 6.5; this.labelK = 1;
        this.label = o.noLabel ? null : billboard(nameLines(o.name, o.lv, o.tr, o.color), this.labelW, 512, new V3(0, 9, 0), scene);
        if (this.label) this.label.renderOrder = 9;
        this.trail = null; this.trailIdx = -1; this.aura = 0;
        this.n = new V3(0, 1, 0); this.spin = 0; this.steerK = 0; this.roll = 0; this.pitch = 0; this.bounce = 0; this.bounceV = 0; this.bump = 0; this.lastV = 0;
        this.pos = new V3(); this.shown = true; this.fresh = true;
    }
    // which car (config CARS index): its body, where its wheels and its driver go
    setCar(i) {
        i = Math.max(0, Math.min(CARS.length - 1, i | 0));
        if (i === this.carIdx) return;
        this.carIdx = i;
        const S = carShape(i, this.low);
        this.shape = S;
        if (this.mesh) this.lean.remove(this.mesh);
        this.mesh = new T.Mesh(S.geo, carMaterial());
        this.mesh.castShadow = !this.low; this.mesh.receiveShadow = false;
        this.lean.add(this.mesh);
        this.seat.position.set(0, S.floor - 0.95, S.seat);
    }
    setLabel(name, lv, tr, color) {
        if (!this.label) return;
        const k = name + '|' + lv + '|' + (tr || '') + '|' + (color || '');
        if (k === this.labelKey) return;
        this.labelKey = k;
        this.label.userData.set(nameLines(name, lv, tr, color));
        this.labelK = 1;
        const im = this.label.material.map.image;
        this.label.scale.set(this.labelW, this.labelW * im.height / im.width, 1);
    }
    // d: how far from the camera. Close up, a tag keeps to the size it has at 34 studs (a name the size of the screen hides everything)
    fitLabel(d) {
        const k = d < 34 ? Math.max(0.3, d / 34) : 1;
        if (!this.label || Math.abs(k - this.labelK) < 0.03) return;
        this.labelK = k;
        const im = this.label.material.map.image, w = this.labelW * k;
        this.label.scale.set(w, w * im.height / im.width, 1);
    }
    // a packed avatar (someone else's), or an avatar object made already (yours)
    setAvatar(packed) {
        if (packed === this.av && (this.blox || this.loading)) return;
        this.av = packed;
        const data = packed ? unpackAvatar(packed) : null;
        if (this.blox) { this.blox.setProportions(data && data.proportions); this.blox.setEquipped(data || {}); return; }
        if (this.loading) return;
        this.loading = true;
        avQueue.push({ char: this, data, done: (a) => {
            this.loading = false;
            if (!a) return;
            if (this.dead) { a.dispose(); return; }
            this.wear(a);
            if (this.av !== packed) this.setAvatar(this.av);
        } });
    }
    wear(a) {
        if (this.blox && this.blox !== a) this.blox.dispose();
        this.blox = a;
        // the blocky stand-in driver goes for good (its parts share their geometry and colours: nothing to free)
        if (this.body) { this.seat.remove(this.body); this.body = null; }
        this.seat.add(a.root);
    }
    setTrail(i) {
        if (i === this.trailIdx) return;
        this.trailIdx = i;
        const T0 = TRAILS[i];
        if (!T0 || T0.id === 'none') { if (this.trail) { this.trail.dispose(); this.trail = null; } return; }
        if (!this.trail) this.trail = FX.makeTrail(T0.c1);
        this.trail.setColor(T0.c1, !!T0.rainbow);
        this.trail.width = 0.9;
    }
    setAura(i) { this.aura = AURAS[i] && AURAS[i].id !== 'none' ? i : 0; }
    // a landing, a knock: the body squats and the driver nods (k 0..1.5)
    squash(k) { this.bounceV = -5 * Math.min(1.5, k); this.bump = Math.min(1, k); }
    stretch(k) { this.bounceV = 3 * Math.min(1, k); }
    // st: { x, y, z, ry, nx, ny, nz (the ground's normal under it), air, speed (along its heading), steer (-1..1), slip (0..1),
    // boost, dyno (parked on the rollers: its wheels spin, it stays put), far (simpler: its driver animated every other frame),
    // snap (no easing: it was just put there) }
    update(dt, t, st) {
        const r = this.root, S = this.shape, sp = st.speed || 0, hover = S.wr === 0;
        // the ground's slope under it, eased (in the air: back towards level)
        vN.set(st.nx || 0, st.ny ?? 1, st.nz || 0);
        if (st.air) vN.lerp(UP, 0.6);
        if (st.snap || this.fresh) { this.n.copy(vN); this.fresh = false; }
        else this.n.lerp(vN, 1 - Math.exp(-dt * (st.air ? 2.5 : 16))).normalize();
        // (forward: the heading lifted onto the slope, as the physics has it)
        const n = this.n, hx = Math.sin(st.ry), hz = Math.cos(st.ry);
        vF.set(hx, -(hx * n.x + hz * n.z) / Math.max(0.2, n.y), hz).normalize();
        vL.crossVectors(n, vF);
        mB.makeBasis(vL, n, vF);
        qT.setFromRotationMatrix(mB);
        if (st.snap) r.quaternion.copy(qT); else r.quaternion.slerp(qT, 1 - Math.exp(-dt * 22));
        r.position.set(st.x, st.y, st.z);
        this.pos.set(st.x, st.y, st.z);
        // the body: leaning out of a turn, its nose up when it pulls away and down when it brakes, a bounce after a landing
        this.steerK += ((st.steer || 0) - this.steerK) * Math.min(1, dt * 10);
        const acc = dt > 0 ? (sp - this.lastV) / dt : 0;
        this.lastV = sp;
        // (lat: the sideways pull it's under, studs/s2: the heading's turning times its speed; load: how hard the ground presses, in g)
        const lat = Math.max(-1, Math.min(1, (st.lat || 0) / 70)), squat = st.air ? 0 : Math.max(0, Math.min(0.42, ((st.load ?? 1) - 1) * 0.11));
        this.roll += (this.steerK * Math.min(1, Math.abs(sp) / 36) * 0.07 - lat * 0.12 - this.roll) * Math.min(1, dt * 8);
        this.squat = (this.squat || 0) + (squat - (this.squat || 0)) * Math.min(1, dt * 9);
        this.pitch += (Math.max(-0.07, Math.min(0.07, -acc * 0.0022)) - this.pitch) * Math.min(1, dt * 6);
        this.bounceV += (-this.bounce * 190 - this.bounceV * 15) * dt;
        this.bounce = Math.max(-0.5, Math.min(0.5, this.bounce + this.bounceV * dt));
        this.bump = Math.max(0, this.bump - dt * 3);
        const idle = st.dyno ? Math.sin(t * 46) * 0.035 : Math.sin(t * 31) * 0.012, hov = hover ? 0.5 + Math.sin(t * 2.6) * 0.22 : 0;
        this.lean.position.y = this.bounce + idle + hov - (this.squat || 0);
        this.lean.rotation.set(this.pitch + (hover ? Math.sin(t * 1.7) * 0.02 : 0), 0, this.roll);
        // the wheels
        if (!hover && this.shown) {
            this.spin += dt * (st.dyno ? (st.sprint ? 46 : 30) : sp) / S.wr;
            mR.compose(r.position, r.quaternion, ONE);
            for (let k = 0; k < 4; k++) {
                const w = S.wheels[k];
                qS.setFromEuler(eW.set(this.spin, k < 2 ? -this.steerK * 0.45 : 0, 0, 'YXZ'));
                mW.compose(vP.set(w[0], S.wr, w[1]), qS, sW.set(S.ww, S.wr, S.wr));
                addWheel(mW.premultiply(mR));
            }
        }
        // the driver
        this.skip = st.far ? !this.skip : false;
        this.animDt = (this.animDt || 0) + dt;
        if (this.blox) {
            this.blox.setFar(!!st.far);
            if (!this.skip) { const q = BLOX_ST; q.t = t; q.steer = this.steerK; q.bump = this.bump; q.speed = 0; this.blox.update(this.animDt, q); this.animDt = 0; }
        } else if (this.body) { const a = this.body.userData.arms; a[0].rotation.set(-1.05 - this.steerK * 0.3, 0, -0.25); a[1].rotation.set(-1.05 + this.steerK * 0.3, 0, 0.25); }
        if (this.label) this.label.position.set(st.x, st.y + S.floor + 8.2, st.z);
        // the exhaust: a trail while it moves, flames on NITRO, smoke off the tyres when they slide
        if (this.trail) { FX.tmpV.set(st.x - vF.x * S.len * 0.42 + n.x * 1.4, st.y - vF.y * S.len * 0.42 + n.y * 1.4, st.z - vF.z * S.len * 0.42 + n.z * 1.4); this.trail.update(FX.tmpV, (!!st.air || Math.abs(sp) > 8) && !st.far && !st.dyno, dt, t); }
        if (!st.far) {
            if (this.aura) { const A = AURAS[this.aura]; FX.auraColor(this.pos, A.c1, !!A.rainbow, dt); }
            if (st.boost) for (const e of S.ex) { vP.set(e[0], e[1], e[2]).applyQuaternion(r.quaternion).add(r.position); FX.trailDot(vP.x, vP.y, vP.z, Math.random() < 0.5 ? 0x7af4ff : 0xffffff, 1.5); }
            if (st.slip > 0.35 && !st.air && Math.random() < dt * 22) FX.dust(vP.set(st.x - vF.x * 2.5, st.y, st.z - vF.z * 2.5), 1, 0.5, 0xe8e0d8);
        }
    }
    // hidden (far off, another world): out of the scene too, so its bones and parts aren't worked out every frame
    setVisible(on) {
        if (on === this.shown) return;
        this.shown = on;
        this.root.visible = on;
        if (this.label) this.label.visible = on;
        if (on && !this.root.parent && !this.dead) scene.add(this.root); else if (!on && this.root.parent) scene.remove(this.root);
        if (this.trail && !on) this.trail.reset();
        if (on) this.fresh = true;
    }
    dispose() {
        this.dead = true;
        if (this.blox) this.blox.dispose();
        scene.remove(this.root);
        if (this.label) { scene.remove(this.label); if (this.label.userData.ownTex) this.label.material.map.dispose(); }
        if (this.trail) this.trail.dispose();
    }
}
// the blocky stand-in sat at the wheel: legs out in front, hands forward
function sit(g) {
    const u = g.userData;
    u.legs[0].rotation.set(-1.4, 0, 0.1); u.legs[1].rotation.set(-1.4, 0, -0.1);
    u.arms[0].rotation.set(-1.05, 0, -0.25); u.arms[1].rotation.set(-1.05, 0, 0.25);
}
