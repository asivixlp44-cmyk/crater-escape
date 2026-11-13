import { Client } from '@colyseus/sdk';
import {
    T, V3, $, canvas, scene, camera, sun, renderer, updateSky, SUN_DIRECTION, GPU_NAME, setMood, setFogScale, updateEffects, floatText, setFloatCap, billboard, prompts, VIEW,
} from './engine.js';
import { S, actions, net, prof } from './state.js';
import { CU, setEpoch, rel } from './clock.js';
import { initAudio, resumeAudio, audioAway, audioDebug, startMusic, sfx, setVolume, audioSuspended, setMusicMode, setMusicIntensity, toggleMusic, toggleSound, playAsmr, prerenderMusic, allowLiveMusic, musicLite, engineSound } from './audio.js';
import { buildAsmr, adoptAsmr } from './asmr.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar, avatarStandIns } from './avatar.js';
import { pad, pollGamepad, onGamepadConnection, rumble } from './gamepad.js';
import { padNav } from './padnav.js';
import * as FX from './fx.js';
import { render, updateFx, setQuality, getQuality, autoQualityAllowed, shadowDue, setResScale, getResScale, fxWarmGroup, fxShowAll, updateAmbient, setSpeedLines, confetti, screenConfetti } from './fx.js';
import { buildHub } from './world.js';
import { buildArena } from './arenaview.js';
import { installIcons } from './icons.js';
import * as SH from './shadows.js';
import { beginPals, endPals, palsWarm, Team } from './pals.js';
import { Car, pumpAvatars, avatarsPending } from './chars.js';
import { beginWheels, endWheels, wheelsWarm, makeCarIcons, carShape, carMaterial } from './cars.js';
import { Track, pingSend, onPong, pingEvery } from './smooth.js';
import {
    toast, bigText, popup, notEnough, animateCounters, bump, updateHud, openPanel, openJaw, panelIs, refreshPanels, closeTop, anyPopup, codeResult, warmPanels,
    levelUp, measureHud, onSpun, askConfirm, flyWins, stepTick, queueState, matchHud, setScores, showCount, matchResults, questDone, dashFill, stageBar, hatchShow, speedo,
} from './ui.js';
import {
    CFG, WORLDS, WALLS_N, POSTS, postOpen, postXp, JAWBREAKERS, TASKS, QUESTS, UPGRADES, CARS, upgradeCost, stepGain, xpGain, maxWalk, strideOf, stageName, xpNeed, dailyStatus, fmt, clamp, titleOf, rebirthMult, rebirthPct, recLevel,
    matchInfo, MATCH, SPOT_COL, SPOT_CSS, SPEED_PACKS, rewardSpeed, nitroSecs,
} from '../../shared/config.js';
import {
    W, islandOf, stageAt, checkpoint, inBowl, onExit, onExitBand, launchOut, exitU, exitArc, angDiff, inHole, reachU, needV, worldFor, stagePlan, postSpot, postAt, BELT, jbSpot, upgradeShed, tongueBar, playGate, worldsPortal, endPortal, summit,
    rockU, sweepAngle, geyserAt, wallPoint, ROCK, SWEEP, GEYSER, PAD, STAGE_TIPS,
} from '../../shared/world.js';
import { newCar, stepCar } from '../../shared/physics.js';
import { arenaPlan, arenaWorld, startSpot, surgeY, topAt, arenaReach, arenaPoint, arenaRockU, arenaPct } from '../../shared/arena.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => new Promise((r) => setTimeout(r, 0));
const RND = Math.random;
const TAU = Math.PI * 2;
// NITRO and a boost chevron together make you go at most this much faster
const PADK = 1.12, BURST = CFG.dashK * PADK;
const angTo = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const lerpA = (a, b2, k) => a + angTo(a, b2) * k;

// =====================================================================================
// The world you're in
// =====================================================================================
let view = null, A = null;
const worldOpts = {
    cars: () => openPanel('cars'),
    shed: () => openPanel('work'),
    gift: () => openPanel('gifts'),
    worlds: () => openPanel('worlds'),
    play: () => pressPlay(),
    jaw: (i) => openJaw(i),
    post: (i) => buyPost(i),
};
function buyPost(i) {
    const c = POSTS[i];
    if (!c.gems) return;
    askConfirm('⚙️', c.name, 'Parked on it, every step gives x' + c.mult + ' Speed, for good.', c.gems + ' 💎', () => net.send('post', { i }));
}
function buildView(w) {
    if (view && view.w === w) return view;
    if (view) { view.dispose(); view = null; }
    worldOpts.low = getQuality() === 'low';
    view = buildHub(w, worldOpts);
    P.hub = worldFor(w, P.lock); if (!A) P.world = P.hub;
    setMood(WORLDS[w].mood, true);
    setFogScale(1);
    view.setProgress(S, postOpen);
    view.setBoards(boards);
    showGates();
    reachKey = '';
    return view;
}
function setProgress() { if (view) view.setProgress(S, postOpen); }
// every gate as it is for you now: open if you've come up out of its crater in this life
function showGates() { if (view) for (let k = 0; k < WALLS_N; k++) view.setGate(k, P.out.has(k)); }
// a world switch: behind the fade, built, drawn once with nothing culled (its shaders and textures on the
// graphics card before you see it)
async function drawHidden(group) {
    const culled = [];
    group.traverse((o) => { if ((o.isMesh || o.isPoints) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1200)]); } catch (e) { /* compiles when drawn */ }
    render();
    for (const o of culled) o.frustumCulled = true;
}
async function switchWorld(w, x, z) {
    switching = true;
    holdFpsWatch(6);
    closeTop(); closeTop();
    await fadeOut();
    try { buildView(w); await drawHidden(view.group); } catch (e) { console.error('[world]', e); noteError('[world] ' + (e && e.message)); }
    for (const r of remotes.values()) r.car.setVisible(false);
    switching = false;
    newLife();
    teleport(x, 0, z, Math.PI);
    fadeIn();
    bigText(WORLDS[w].icon + ' ' + WORLDS[w].name.toUpperCase(), '#7af4ff');
}

// =====================================================================================
// You: the shared car physics (shared/physics.js) on your screen, every frame
// =====================================================================================
const P = {
    c: newCar(W.spawn.x, 0, W.spawn.z, Math.PI), world: null, hub: null, moving: false,
    // the craters you've come up out of in this life (their north gates are open for you); the one you're down in
    out: new Set(), deep: -1,
    auto: null, frozen: false, snaps: 0, floatT: -9, tpN: 0,
    portalAt: -9, gateAt: -9, endAt: -9, stunUntil: -9, boostUntil: -9, dashUntil: -9, dashReady: 0, holdDash: false, pilotDash: false,
    tread: -1, treadK: 0, treadAcc: 0, treadLast: -1, treadOff: -9, distAcc: 0,
    padT: new Float64Array(WALLS_N).fill(-99), padHit: new Map(), v: CFG.walk, kSteer: 0, steer: 0, thr: 0, top: CFG.walk,
    vx: W.spawn.x, vy: 0, vz: W.spawn.z,
};
P.lock = { has: (k) => P.out.has(k) };
function newLife() { P.out.clear(); P.deep = -1; showGates(); }
const myTeam = new Team();
let me = null, localAvatarReq = 0;
function buildMe() {
    if (me) me.dispose();
    me = new Car({ name: S.name, lv: S.lv, tr: titleOf(S.cleared), labelW: 5.4, car: S.car || 0, low: getQuality() === 'low' });
    setupLocalAvatar();
}
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !me) { a.dispose(); return; }
    me.wear(a);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    if (me && me.blox && av) { me.blox.setProportions(av.proportions); me.blox.setEquipped(av, BX.getSkinTextureUrl()); }
    net.send('avatar', { av: packAvatar(av) });
}
const SG = {};
function teleport(x, y, z, yaw) {
    const c = P.c;
    P.world.surf(x, z, SG);
    c.x = x; c.z = z; c.y = Math.max(y ?? SG.y, SG.y); c.vx = c.vy = c.vz = 0; c.air = c.y > SG.y + 0.5; c.airT = 0; c.slip = 0;
    camSnap = true; snapMe = true;
    P.tpN++;
    P.tread = -1; P.treadK = 0; P.distAcc = 0; P.walkTo = null;
    if (me && me.trail) me.trail.reset();
    if (yaw !== undefined) { c.ry = yaw; cam.yaw = yaw + Math.PI; camOff = 0; }
    sendMove(true);
}
const goTo = (to, k) => { if (!A) { flushSteps(); net.send('warp', { to, k }); } };
actions.respawn = () => goTo('spawn');
actions.go = goTo;

// =====================================================================================
// A step: on your screen straight away (its numbers), on its way to the server a few times a second
// =====================================================================================
const pending = [];
// what's on its way: steps, their Speed (xp: the server's old name for it) and their XP (lx)
const out = { n: 0, post: -1, xp: 0, lx: 0 };
let seq = 0, outAt = 0, lowQ = false;
const speedNow = () => (S.speed || 0) + (S.pendXp || 0);
const fmtNum = (v) => (v >= 1000 ? fmt(v) : String(Math.round(v * 10) / 10));
function panOf(x, z) {
    const dx = x - camera.position.x, dz = z - camera.position.z;
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    return clamp((dx * rx + dz * rz) / 40, -0.8, 0.8);
}
function flushSteps() {
    if (out.n) {
        pending.push({ s: ++seq, xp: out.xp, lx: out.lx, n: out.n });
        net.send('step', { n: out.n, post: out.post, s: seq });
        out.n = 0; out.xp = 0; out.lx = 0;
    }
    outAt = performance.now();
}
// a step: +1 Speed and +1 XP (and everything that multiplies them; a dyno x its own), a "+1" beside your car
function takeStep(post) {
    const t = clockT;
    if ((post !== out.post) && out.n) flushSteps();
    const k = post >= 0 ? POSTS[post].mult : 1, gain = stepGain(S, S.x2, S.world, S.sq) * k, xg = xpGain(S) * (post >= 0 ? postXp(post) : 1);
    out.n++; out.post = post; out.xp += gain; out.lx += xg;
    S.pendXp = (S.pendXp || 0) + gain; S.pendN = (S.pendN || 0) + 1; S.pendLx = (S.pendLx || 0) + xg;
    S.xp = Math.min((S.need || xpNeed(S.lv)) - 0.01, (S.xp || 0) + xg);
    S.stepsShown = (S.stepsShown || 0) + 1;
    stepTick();
    // (the numbers are one instanced glyph sheet, a single draw for them all). Beside you, as the camera sees you, left and right
    // in turn, over the roll bar: clear of the big words over your head
    if (t - P.floatT > 0.09 && !window.__noFloat) {
        P.floatT = t; P.floatSide = -(P.floatSide || 1);
        const sd = P.floatSide * (3.6 + RND() * 1.8), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
        floatText('+' + fmtNum(gain), post >= 0 ? '#7dff6b' : '#ffffff', FX.tmpV.set(P.vx + rx * sd, P.vy + 5 + RND() * 1.8, P.vz + rz * sd), 3.4, false, 'speed');
    }
    if (out.n >= 12) flushSteps();
}
// NITRO: a burst of speed (on a dyno: hold it to rev flat out)
function dash() {
    const t = clockT;
    if (P.frozen) return;
    if (P.tread >= 0) { P.sprintAt = t; return; }
    if (t < P.dashReady || (A && A.phase !== 'play')) return;
    P.dashUntil = t + nitroSecs(S); P.dashReady = t + CFG.dashCool;
    fovKick = Math.max(fovKick, 7);
    playAsmr('whoosh', 0.6, 0.8 + RND() * 0.1); playAsmr('boost', 0.5, 1.1);
    rumble(0.4, 120);
    if (me) me.stretch(0.6);
    FX.ring(FX.tmpV.set(P.c.x, P.c.y + 0.6, P.c.z), 0x7af4ff, 8, 0.35);
}
actions.dash = dash;
const padReady = (k) => clockT - P.padT[k] >= CFG.padCool;

// ----- driving -----
// (the same objects every frame: read straight away, never kept)
const meSt = { x: 0, y: 0, z: 0, ry: 0, nx: 0, ny: 1, nz: 0, air: false, speed: 0, steer: 0, slip: 0, boost: false, dyno: false, sprint: false, far: false, snap: false };
const remSt = { x: 0, y: 0, z: 0, ry: 0, nx: 0, ny: 1, nz: 0, air: false, speed: 0, steer: 0, slip: 0, boost: false, dyno: false, sprint: false, far: false, snap: false };
const INP = { steer: 0, throttle: 0, top: CFG.walk, kick: 1, hold: false };
let teamRef = null, teamStr = '', snapMe = true;
function updateMe(dt) {
    const t = clockT, c = P.c;
    // the keys: W / S the gas and the brakes, A / D the wheel (it turns in over a moment, as a wheel does)
    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1;
    if (keys.KeyA || keys.ArrowLeft) r -= 1;
    P.kSteer += clamp(r - P.kSteer, -dt * (r ? 4.5 : 9), dt * (r ? 4.5 : 9));
    let steer = P.kSteer, thr = f;
    // a stick (a thumb, a controller): pushed anywhere but back it drives, and its sideways lean steers; pulled back it brakes, then backs up
    const sx = touchMove.x + pad.lx, sy = touchMove.y + pad.ly, sm = Math.hypot(sx, sy);
    if (sm > 0.14) { steer = clamp(sx * 1.25, -1, 1); thr = sy > 0.5 && Math.abs(sx) < 0.75 ? -Math.min(1, sy) : clamp(Math.max(-sy, Math.abs(sx) * 0.85, 0.35) * 1.15, 0, 1); }
    // the camera's stick: slow near the middle for aiming, quick at the edge
    if ((pad.rx || pad.ry) && !anyPopup()) { camOff -= pad.rx * Math.abs(pad.rx) * 3.2 * dt * camSens; camHold = t; cam.pitch = clamp(cam.pitch + pad.ry * Math.abs(pad.ry) * 2 * dt * camSens, -0.2, 1.3); }
    // the QA autopilot drives instead
    P.pilotDash = false;
    let hold = false;
    if (P.auto) { const a = pilot(dt); steer = a.steer; thr = a.throttle; hold = !!a.hold; }
    // sent to a dyno (the Train tile): onto its rollers by itself, unless you steer
    if (P.walkTo) {
        const dx = P.walkTo.x - c.x, dz = P.walkTo.z - c.z, d = Math.hypot(dx, dz);
        if (Math.abs(thr) > 0.2 || Math.abs(steer) > 0.2 || t > P.walkTo.until || d < 1.2) P.walkTo = null;
        else { steer = clamp(-angTo(c.ry, Math.atan2(dx, dz)) * 2.4, -1, 1); thr = d > 6 ? 0.5 : 0.28; }
    }
    const outRace = A && A.out;
    P.frozen = anyPopup() || switching || (A && A.phase === 'wait') || outRace || (A && A.done);
    if (P.frozen) { steer = 0; thr = c.air ? 0 : -Math.sign(c.vf || 0) * Math.min(1, Math.abs(c.vf || 0) / 6); if (Math.abs(c.vf || 0) < 1.5) thr = 0; }
    if (t < P.stunUntil) { thr = 0; steer = 0; }
    // (just out of a crater: the brakes are on for a moment, whatever you're doing, so you land on the crescent and stop, not sail
    // round it and back onto the wall)
    if (t < (P.brakeUntil || 0) && !A && c.zone === 3 && (c.vf || 0) > 8) thr = -1;
    P.moving = Math.abs(thr) > 0.05;
    P.steer = steer; P.thr = thr;
    // gas or the wheel takes you off the dyno (it rolls you back off its rollers)
    if (P.tread >= 0 && (Math.abs(thr) > 0.2 || Math.abs(steer) > 0.3) && !P.walkTo) { P.tread = -1; P.treadAcc = 0; P.treadOff = t; c.vx = -Math.sin(c.ry) * 16; c.vz = -Math.cos(c.ry) * 16; }
    // how fast the engine pulls: your Level's top speed (in a race, the race's engine), NITRO and a boost chevron on top
    const nitro = t < P.dashUntil, boosted = t < P.boostUntil;
    const base = A ? topAt(A.D, (net.now() - A.goAt) / 1000, A.power) : maxWalk(S);
    P.top = base;
    P.v = base * (nitro ? CFG.dashK : 1) * (boosted ? (A ? MATCH.boostK : PADK) : 1);
    INP.steer = steer; INP.throttle = thr; INP.top = P.v; INP.kick = nitro ? 1.8 : boosted ? 1.4 : 1; INP.hold = hold;
    const px = c.x, pz = c.z;
    let ev = 0;
    if (P.tread < 0) {
        // your car moves in real time down to 10 frames a second (a slow frame is two steps): the frame clock stops at 20, and
        // below that a weak device would drive in slow motion while the boulders, on the server's clock, don't
        const dtB = Math.max(dt, Math.min(0.1, frameDt));
        ev = stepCar(c, INP, dtB > 0.05 ? dtB / 2 : dtB, P.world);
        if (dtB > 0.05) ev = Math.max(ev, stepCar(c, INP, dtB / 2, P.world));
    }
    if (ev === 3) {
        // a landing: the harder, the more it shows
        const k = clamp(c.hitV / 46, 0.15, 1.4);
        if (me) me.squash(k);
        if (k > 0.3) { playAsmr('land', 0.35 + 0.35 * Math.min(1, k), 0.7 + RND() * 0.1); shake = Math.max(shake, 0.25 * k); rumble(0.3 * k, 90); if (!lowQ) FX.dust(FX.tmpV.set(c.x, c.y + 0.2, c.z), 6, 0.8); }
    } else if (ev === 5 && t - (P.bumpAt || -9) > 0.35) { P.bumpAt = t; playAsmr('thud', 0.45, 0.9 + RND() * 0.2); shake = Math.max(shake, 0.2); if (me) me.squash(0.5); }
    // steps: a stride at a time (longer the faster you go), the wheels on the ground
    const moved = Math.hypot(c.x - px, c.z - pz);
    if (!c.air && !A && moved < 8 && moved > 0) {
        P.distAcc += moved;
        const st = strideOf(Math.abs(c.vf));
        while (P.distAcc >= st) { P.distAcc -= st; takeStep(-1); }
    }
    // on a dyno: your wheels spin by themselves (faster while you hold NITRO); every step x the dyno's
    if (!A) {
        const i = postAt(c.x, c.z);
        if (P.tread < 0 && i >= 0 && !c.air && Math.abs(c.vf) < 9 && (Math.abs(thr) < 0.2 || P.walkTo) && t - P.treadOff > 1.2) {
            if (postOpen(S, i)) { P.tread = i; P.treadAcc = 0; P.walkTo = null; c.vx = c.vz = 0; playAsmr('belt', 0.4, 1); }
            else if (t - (P.lockT || -9) > 3) { P.lockT = t; const p = POSTS[i]; toast('🔒 ' + p.name + (p.gems ? ': open it with ' + p.gems + ' Gems' : ' opens when you have earned ' + fmt(p.need) + ' Wins (you have ' + fmt(S.totalWins || 0) + ')'), '#ff9a8a'); }
        }
        if (P.tread >= 0) {
            const sprint = P.holdDash || P.pilotDash || keys.ShiftLeft || keys.ShiftRight || keys.KeyF || keys.Enter || keys.Space || pad.held.has('X') || pad.held.has('RT') || pad.held.has('A') || t - (P.sprintAt || -9) < 0.35;
            P.treadAcc += dt * (sprint ? CFG.treadSprint : CFG.treadRate);
            P.sprinting = sprint;
            while (P.treadAcc >= 1) { P.treadAcc -= 1; takeStep(P.tread); }
        }
    }
    if (!A) hubTouch(t, dt); else raceTouch(t, dt);
    // (a safety net only: the deepest crater's floor is 91 under the camp, the sea 150)
    if (c.y < -135 && !A) goTo('spawn');
    // where you're drawn: where you are, or parked on the rollers
    P.treadK += ((P.tread >= 0 ? 1 : 0) - P.treadK) * Math.min(1, dt * 8);
    let dx = c.x, dy = c.y, dz = c.z, ry = c.ry;
    if (P.treadK > 0.002 && (P.tread >= 0 || P.treadLast >= 0)) {
        const i = P.tread >= 0 ? P.tread : P.treadLast, s = postSpot(i), e = P.treadK;
        dx += (s.x - dx) * e; dz += (s.z + 0.3 - dz) * e; dy += (0.42 - dy) * e;
        ry = lerpA(ry, Math.PI, e);
        if (P.tread >= 0) { c.x += (s.x - c.x) * Math.min(1, dt * 6); c.z += (s.z + 0.3 - c.z) * Math.min(1, dt * 6); c.ry = lerpA(c.ry, Math.PI, Math.min(1, dt * 6)); }
    }
    if (P.tread >= 0) P.treadLast = P.tread;
    P.vx = dx; P.vy = dy; P.vz = dz;
    const onTread = P.treadK > 0.5;
    if (me) {
        const q = meSt; q.x = dx; q.y = dy; q.z = dz; q.ry = ry; q.nx = onTread ? 0 : c.nx; q.ny = onTread ? 1 : c.ny; q.nz = onTread ? 0 : c.nz; q.air = c.air && !onTread;
        q.speed = c.vf || 0; q.steer = steer; q.slip = c.slip; q.boost = nitro; q.dyno = onTread; q.sprint = !!P.sprinting; q.snap = snapMe;
        q.lat = onTread || c.air ? 0 : (c.om || 0) * (c.vf || 0); q.load = onTread || c.air ? 1 : (c.load || CFG.grav) / CFG.grav;
        // the tyres past their grip: dust off the back wheels (not on Low)
        if (!lowQ && !c.air && !onTread && (c.slip || 0) > 0.3 && Math.abs(c.vf || 0) > 12 && t - (P.skidAt || 0) > 0.07) { P.skidAt = t; FX.dust(FX.tmpV.set(c.x - Math.sin(c.ry) * 2.2, c.y + 0.3, c.z - Math.cos(c.ry) * 2.2), 2, 0.5); }
        me.update(dt, t, q);
        snapMe = false;
    }
    // your pets, riding along behind
    if (!A) { if (S.team !== teamRef) { teamRef = S.team; teamStr = (S.team || []).join(','); } myTeam.set(teamStr); myTeam.update(dt, t, dx - Math.sin(ry) * 3, dy + 0.5, dz - Math.cos(ry) * 3, ry, onTread || Math.abs(c.vf) > 2); }
    sendMove(false);
}
function updateSteps() {
    // what's gone to the server: a few times a second
    if (performance.now() - outAt > 120 && out.n) flushSteps();
    // the NITRO button fills back up; on a dyno it's always ready to rev
    const t = clockT;
    dashFill(P.tread >= 0 ? 1 : clamp(1 - (P.dashReady - t) / CFG.dashCool, 0, 1), P.tread >= 0);
    const holding = P.holdDash || keys.ShiftLeft || keys.ShiftRight || keys.KeyF || keys.Enter || keys.Space || pad.held.has('X') || pad.held.has('RT') || pad.held.has('A') || P.pilotDash;
    if (holding && P.tread < 0 && t >= P.dashReady && Math.abs(P.c.vf) > 4 && !(padMode && padNav.hud)) dash();
}
// ----- what's under your wheels: a crater escaped, a boost chevron, a boulder, the sweeper, a geyser, the portals -----
const tipsShown = new Set();
let tipK = -1;
// knocked: your speed gone, shoved down the wall, a moment before the wheels bite again
function knock(c, word, px, pz, power, keep) {
    if (clockT < P.stunUntil + 0.7) return;
    P.stunUntil = clockT + (A ? MATCH.stunSecs : keep ? 0.4 : 0.75);
    rumble(0.7, 180);
    const d = Math.hypot(px, pz) || 1;
    // (a boulder costs you speed, so some height: in a race a quarter of it, in a crater near half. Thrown off the wall you'd drop
    // straight into the lava, or the hole. keep: how much of your speed is left; none given: you're thrown, at `power`)
    const kp = A ? 0.75 : keep;
    if (kp) { c.vx *= kp; c.vy *= kp; c.vz *= kp; } else { c.vx = px / d * power; c.vz = pz / d * power; c.vy = 0; }
    playAsmr('smash', 0.7, 0.9 + RND() * 0.1);
    shake = Math.max(shake, 0.5);
    if (me) me.squash(1);
    if (!window.__noFloat) floatText(word, '#ff9a8a', FX.tmpV.set(c.x, c.y + 8, c.z), 5, true);
    if (A) net.send('mHit', {});
}
// a boost chevron under you (pads: [{ a, u }], point(a, u): where on the wall)
function padTouch(t, c, pads, span, S1, key, onHit) {
    if (c.air || c.zone !== 2) return;
    const a = Math.atan2(S1.ex, S1.ez), r = Math.hypot(S1.gx, S1.gz) / (S1.ct || 1e-6), len = Math.hypot(1, Math.hypot(S1.gx, S1.gz));
    for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (Math.abs(angTo(a, p.a)) * r > PAD.hw + 1.2 || Math.abs(c.u - p.u) * span * len > PAD.hd + 1.2) continue;
        const id = key + i;
        if (t - (P.padHit.get(id) || -9) < 2.5) continue;
        P.padHit.set(id, t);
        P.boostUntil = t + (A ? MATCH.boostSecs : 1.7);
        playAsmr('boost', 0.6, 1); fovKick = Math.max(fovKick, 5); rumble(0.3, 100);
        if (!lowQ) FX.ring(FX.tmpV.set(c.x, c.y + 0.5, c.z), 0x7dff6b, 8, 0.3);
        if (onHit) onHit(i);
        return;
    }
}
const ST = {};
function hubTouch(t) {
    const c = P.c, k = stageAt(c.z), w = S.world || 0;
    if (!view || switching) return;
    if (k < 0) {
        // Base Camp: driving through the portal's arch, or the gate's
        if (Math.abs(c.x - worldsPortal.x) < 7.5 && Math.abs(c.z - worldsPortal.z) < 2.2) { if (t - P.portalAt > 3 && !anyPopup()) { sfx('whoosh'); openPanel('tele', 'worlds'); } P.portalAt = t; }
        if (Math.abs(c.x - playGate.x) < 8.5 && Math.abs(c.z - playGate.z) < 2.2) { if (t - P.gateAt > 3 && !S.queued && !anyPopup()) { sfx('whoosh'); pressPlay(); } P.gateAt = t; }
        return;
    }
    if (k >= WALLS_N) {
        // the summit's portal: on to the next world
        if (Math.abs(c.z - endPortal.z) < 2.5 && Math.abs(c.x - endPortal.x) < endPortal.r) { if (t - P.endAt > 3 && !anyPopup()) { sfx('whoosh'); openPanel('tele', 'worlds'); } P.endAt = t; }
        return;
    }
    const I = islandOf(k), plan = stagePlan(w, k), nowS = net.now() / 1000;
    if (c.z > I.zS) return;
    // a new crater: what's in it (once a session each kind)
    if (tipK !== k) { tipK = k; for (const b of [1, 2, 4, 8, 16]) if ((plan.flags & b) && !tipsShown.has(b)) { tipsShown.add(b); const T2 = STAGE_TIPS[b]; toast('🎯 ' + T2[0] + ': ' + T2[1], '#ffe24a'); break; } }
    // down its hole: back at Base Camp
    if (inHole(k, c.x, c.y, c.z)) { downTheHole(k, t); return; }
    // on its wall; up on the launch chevrons along the top of it, under the far crescent: thrown out over the lip; and down on the
    // far crescent: ESCAPED (the server checks it saw you in the funnel, and that your Level could)
    if (inBowl(k, c.x, c.z)) P.deep = k;
    if (!c.air && c.zone === 2 && t > P.stunUntil && onExitBand(k, c.x, c.z, c.u)) {
        launchOut(k, c);
        playAsmr('boost', 0.8, 1.15); playAsmr('whoosh', 0.6, 0.9);
        fovKick = Math.max(fovKick, 6); rumble(0.5, 160);
        if (me) me.stretch(1);
    } else if (P.deep === k && !c.air && c.zone === 3 && onExit(k, c.x, c.z)) {
        P.deep = -1;
        if (reachU(I, maxWalk(S) * BURST * 1.06) >= 0.985) escaped(k, t);
    }
    P.world.surf(c.x, c.z, ST);
    padTouch(t, c, plan.pads, I.R - I.r0, ST, 'p' + k + ':');
    const dx = c.x - I.cx, dz = c.z - I.cz;
    // a boulder rolling down its lane
    for (const o of plan.rocks) {
        const u = rockU(o, nowS);
        if (u < 0) continue;
        const p = wallPoint(k, o.a, u);
        if (Math.hypot(c.x - p.x, c.z - p.z) < ROCK.hit && Math.abs(c.y - p.y) < ROCK.r * 2 + 2) { knock(c, 'BONK!', -dx, -dz, 22, 0.65); return; }
    }
    // the sweeper's arms, turning round over the hole and sweeping the foot of the wall: shoved along, the way it turns
    if (plan.sweeper && !c.air && c.zone === 2 && c.u < plan.sweeper.su + 0.03) {
        const o = plan.sweeper;
        for (let j = 0; j < o.bars; j++) {
            const an = sweepAngle(o, nowS) + j * Math.PI * 2 / o.bars, bx = Math.sin(an), bz = Math.cos(an), along = dx * bx + dz * bz, perp = dx * bz - dz * bx;
            if (along > 0 && along < o.len + 1 && Math.abs(perp) < SWEEP.t / 2 + 2.3) { const sg = Math.sign(o.w); knock(c, 'WHACK!', bz * sg + bx * 0.5, -bx * sg + bz * 0.5, 26); return; }
        }
    }
    // a geyser going off under you: up you go, and out up the wall
    if (!c.air && c.zone === 2) for (const o of plan.geysers) {
        if (geyserAt(o, nowS) !== 2 || Math.hypot(c.x - o.x, c.z - o.z) > GEYSER.r) continue;
        const rr = Math.hypot(dx, dz) || 1;
        c.air = true; c.airT = 0; c.vy = GEYSER.kick; c.vx += dx / rr * 26; c.vz += dz / rr * 26; c.y += 0.3;
        playAsmr('whoosh', 0.7, 0.7); playAsmr('splash', 0.5, 1.2);
        fovKick = Math.max(fovKick, 6); shake = Math.max(shake, 0.3); rumble(0.5, 200);
        if (me) me.stretch(1);
        if (!lowQ) FX.splash(FX.tmpV.set(c.x, c.y, c.z), 0xdff6ff, 14, 1.4);
        if (!window.__noFloat) floatText('WHOOSH!', '#7af4ff', FX.tmpV.set(c.x, c.y + 8, c.z), 5, true);
        break;
    }
}
// down a crater's hole: a moment's fall into the dark, then Base Camp
function downTheHole(k, t) {
    if (switching || t - (P.holeAt || -9) < 2) return;
    P.holeAt = t; P.deep = -1;
    playAsmr('splash', 0.5, 0.6); sfx('denied');
    shake = Math.max(shake, 0.4); rumble(0.6, 220);
    toast('🕳️ Down the hole! Back to Base Camp', '#ff9a8a');
    goTo('spawn');
}
// out of crater k: its gate opens at once on your screen, its Wins come when the server says so ('padok')
function escaped(k, t) {
    flushSteps(); sendMove(true);
    net.send('pad', { k });
    P.out.add(k); showGates();
    sfx('escape');
    bigText('ESCAPED!', '#7dff6b');
    confetti(P.c);
    if (!lowQ) screenConfetti(24);
    fovKick = Math.max(fovKick, 5);
    P.escT = t; P.brakeUntil = t + 1.1;
}

// ----- the guide: chevrons on the ground, flowing from you to what to do next -----
const GUIDE_N = 12;
let guide = null, guideOn = false;
const guideM = new T.Matrix4(), guideQ = new T.Quaternion(), guideV = new V3(), guideS = new V3(1, 1, 1), guideUp = new V3(0, 1, 0);
function guideMesh() {
    const s = new T.Shape();
    s.moveTo(-2.4, -1); s.lineTo(0, 0.9); s.lineTo(2.4, -1); s.lineTo(2.4, 0.3); s.lineTo(0, 2.2); s.lineTo(-2.4, 0.3); s.closePath();
    const g = new T.ShapeGeometry(s).rotateX(-Math.PI / 2);
    const m = new T.InstancedMesh(g, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }), GUIDE_N);
    m.frustumCulled = false; m.renderOrder = 2; m.count = 0;
    scene.add(m);
    return m;
}
function bestPost() {
    let best = 0;
    for (let i = 0; i < POSTS.length; i++) if (postOpen(S, i) && POSTS[i].mult >= POSTS[best].mult) best = i;
    return best;
}
// the furthest stage you've reached in this world (where TO CRATER and the Teleport's last stop go)
const frontier = () => Math.max(0, Math.min(WALLS_N - 1, S.reach && Number.isFinite(S.reach[S.world || 0]) ? S.reach[S.world || 0] : 0));
// where to go next: Base Camp's things for a quest, else up the bridge and along the on-ramp; out on the far crescent: to its gate
function guideTarget() {
    const c = P.c, k = stageAt(c.z), Q = QUESTS[S.qi];
    if (k < 0) {
        let g = { x: 0, z: W.plaza.z0 - 6 };
        if (Q && Q.kind === 'matches') g = { x: playGate.x, z: playGate.z + 8 };
        else if (Q && Q.kind === 'upgrades' && UPGRADES.some((u) => S.wins >= upgradeCost(u, (S.ups && S.ups[u.id]) || 0))) g = { x: upgradeShed.x, z: upgradeShed.z + 9 };
        else if (Q && Q.kind === 'cars' && CARS.some((x, i) => i > 0 && x.wins && !(S.cars && S.cars[x.id]) && S.wins >= x.wins)) g = { x: tongueBar.x, z: tongueBar.z + 12 };
        else if (Q && Q.kind === 'hatch' && S.wins >= JAWBREAKERS[0].wins) { const s = jbSpot(0); g = { x: s.x - 7, z: s.z }; }
        // (to the bridge by way of the road's foot: not through the dynos)
        if (g.z < W.plaza.z0 && (Math.abs(c.x) > W.hw - 2 && c.z < W.plaza.z0 + 14)) return { x: 0, z: W.plaza.z0 + 16 };
        return g;
    }
    if (k >= WALLS_N) return { x: endPortal.x, z: endPortal.z };
    const I = islandOf(k);
    if (c.z > I.zS) return { x: 0, z: I.zS - 4 };
    // (straight on along the road, to where it runs off the rim)
    if (!P.out.has(k)) return c.zone === 3 && c.z > I.cz ? { x: 0, z: I.cz + I.R + 1.5, y: I.E } : null;
    // out: along the far crescent to where the road goes on (a point a little way on round the rim), then its gate
    const a = Math.atan2(c.x - I.cx, c.z - I.cz), left = angDiff(a, I.aX);
    if (Math.abs(left) < 0.25 || (Math.abs(c.x) < W.hw && c.z < I.cz)) return { x: 0, z: I.zN - 14 };
    const a2 = a + Math.sign(left) * Math.min(Math.abs(left), 0.5), rr = I.R + W.deck * 0.5;
    return { x: I.cx + Math.sin(a2) * rr, z: I.cz + Math.cos(a2) * rr };
}
function updateGuide(t) {
    if (!guide) guide = guideMesh();
    const c = P.c;
    const on = !A && !switching && !anyPopup() && P.tread < 0 && !c.air && (c.zone === 0 || c.zone === 3 || c.zone === 5 || c.zone === 6) && (S.steps || 0) < 9000;
    const g = on ? guideTarget() : null;
    if (!g) { if (guideOn) { guideOn = false; guide.count = 0; guide.visible = false; } return; }
    const dx = g.x - c.x, dz = g.z - c.z, d = Math.hypot(dx, dz);
    if (d < 9) { guide.count = 0; guide.visible = false; guideOn = false; return; }
    guideOn = true; guide.visible = true;
    const ux = dx / d, uz = dz / d, gap = 7, off = (t * 12) % gap;
    guideQ.setFromAxisAngle(guideUp, Math.atan2(ux, uz) + Math.PI);
    let n = 0;
    for (let i = 0; i < GUIDE_N; i++) {
        const s = 5 + i * gap + off;
        if (s > d - 2) break;
        const fade = Math.min(1, (d - 2 - s) / 3) * Math.min(1, (s - 3) / 2), x = c.x + ux * s, z = c.z + uz * s;
        P.world.surf(x, z, SG);
        // (only along the flat: never floating out over a crater)
        if (SG.zone === 1 || SG.zone === 2 || SG.zone === 7) break;
        guide.setMatrixAt(n++, guideM.compose(guideV.set(x, SG.y + 0.45, z), guideQ, guideS.setScalar(Math.max(0.05, fade))));
    }
    guide.count = n;
    guide.instanceMatrix.needsUpdate = true;
}
// the crater you're at, at the top of the screen: its name, how high up it you are, and your reach line on its wall
let stageKey = -1, stageNameS = '', stageTxtS = '', reachKey = '';
function stageHud() {
    const c = P.c, k = A ? -1 : stageAt(c.z), w = S.world || 0;
    if (A || k < 0 || k >= WALLS_N || c.z > islandOf(k).zS + 6) {
        if (!A) { stageBar(false); if (view && reachKey !== '') { reachKey = ''; view.stageFx.setReach(-1, 0); } }
        return;
    }
    const I = islandOf(k), top = maxWalk(S), u = reachU(I, top), can = reachU(I, top * BURST) >= 1, rec = recLevel(w, k), outK = P.out.has(k);
    const rk = k + ':' + Math.round(top * 10);
    if (rk !== reachKey && view) { reachKey = rk; view.stageFx.setReach(k, u); }
    const f = clamp((c.y - (I.E - I.H)) / I.H, 0, 1);
    // (the words made again only when what they say changes)
    const nk = w * 100000 + k * 1000 + (outK ? 500 : 0) + (u >= 1 ? 250 : can ? 125 : 0) + Math.round(u * 100);
    if (nk !== stageKey) {
        stageKey = nk; stageNameS = 'CRATER ' + (k + 1) + ' · ' + stageName(w, k);
        stageTxtS = outK ? 'ESCAPED! On to the gate' : u >= 1 ? 'Round the wall to the far side!' : can ? 'NITRO at the far chevrons: out!' : 'Your reach ' + Math.round(u * u * 100) + '% · Level ' + rec + ' to cross';
    }
    stageBar(true, stageNameS, f, stageTxtS, !outK && !can, outK ? -1 : k);
}

// =====================================================================================
// Eruption: the queue, the start line, your race
// =====================================================================================
let qaMap = null;
function pressPlay() {
    if (A || switching) return;
    if (S.queued) { net.send('unplay', {}); return; }
    sfx('queue');
    flushSteps();
    net.send('play', qaMap || {});
}
actions.pressPlay = pressPlay;
let enteringMatch = false;
async function enterMatch(m) {
    enteringMatch = true;
    switching = true;
    holdFpsWatch(6);
    closeTop(); closeTop();
    S.queued = false; queueState(null);
    flushSteps();
    await fadeOut();
    if (A) leaveMatchView();
    const plan = arenaPlan(m.seed, m.lv);
    A = { id: m.id, seed: m.seed, lv: m.lv, w: m.w, plan, spot: m.spot, power: m.power, phase: 'wait', goAt: m.goAt, endsAt: 0, scores: [], names: m.names || [], found: m.found, D: matchInfo(m.lv), done: false, sent: false, out: false, countShown: -1, pct: 0 };
    S.matchId = m.id;
    P.tread = -1; P.boostUntil = -9; P.stunUntil = -9; P.dashUntil = -9; P.dashReady = 0;
    if (view) { view.group.visible = false; view.stageFx.setReach(-1, 0); reachKey = ''; }
    stageBar(false);
    try {
        A.view = buildArena(plan, m.w, SPOT_COL, getQuality() === 'low', m.spot);
        P.world = arenaWorld(plan);
        setMood(WORLDS[m.w].mood, true);
        setFogScale(1);
        for (const r of remotes.values()) r.car.setVisible(false);
        await drawHidden(A.view.group);
        const t0 = performance.now();
        while (avatarsPending() && performance.now() - t0 < 1500) await sleep(30);
    } catch (e) { console.error('[race]', e); noteError('[race] ' + (e && e.message)); }
    switching = false; enteringMatch = false;
    teleport(m.x, m.y, m.z, m.ry);
    fadeIn();
    document.body.classList.add('inmatch');
    matchHud({ on: true, names: A.names, spot: A.spot, lv: A.lv, map: WORLDS[A.w].name });
    setScores(A);
    setMusicMode('climb');
    A.music = 0; setMusicIntensity(0);
    if (pendingSync && pendingSync.start.id === A.id) applySync(pendingSync);
    pendingSync = null;
}
// back from a dropped connection into a race: the clock, who's where, as they are now
let pendingSync = null;
function applySync(m) {
    if (m.phase === 'play') { A.phase = 'play'; A.endsAt = m.endAt; showCount(null); } else if (m.phase === 'done') A.phase = 'done';
    A.scores = m.lanes || [];
    const mine = A.scores.find((r) => r[0] === A.spot);
    if (mine && mine[3]) A.out = true;
    setScores(A);
}
function leaveMatchView() {
    if (A && A.view) A.view.dispose();
    A = null; S.matchId = 0;
}
async function leaveMatch(m, results) {
    if (!A) return;
    switching = true;
    // (a question still open, "Leave the race?" say, has nothing left to ask)
    closeTop(); closeTop();
    await fadeOut();
    leaveMatchView();
    document.body.classList.remove('inmatch');
    matchHud({ on: false }); showCount(null); stageBar(false);
    $('#veil').style.opacity = '0';
    if (view) view.group.visible = true;
    if (m.w !== (view && view.w)) buildView(m.w);
    P.world = P.hub;
    setMood(WORLDS[m.w].mood, true);
    switching = false;
    newLife();
    teleport(m.x, 0, m.z, Math.PI);
    setMusicMode('plaza');
    setMusicIntensity(1);
    fadeIn();
    if (results) matchResults(results);
}
// the start line's count, the clock, the lava
function matchTick(dt) {
    const nowS = net.now(), secs = (nowS - A.goAt) / 1000, c = P.c;
    if (A.phase === 'wait') {
        const left = Math.ceil((A.goAt - nowS) / 1000);
        if (left !== A.countShown) { A.countShown = left; showCount(left > 0 ? String(left) : null); if (left > 0 && left <= 3) sfx('tick3'); }
        // the gun's message has had a second to get here and hasn't: the clock says it went
        if (nowS > A.goAt + 1000) { A.phase = 'play'; A.endsAt = A.goAt + A.D.secs * 1000; }
    } else if (A.phase === 'play') {
        const left = Math.max(0, Math.ceil((A.endsAt - nowS) / 1000));
        if (left !== A.leftShown) { A.leftShown = left; matchHud({ left }); if (left <= 5 && left > 0) sfx('tick3'); }
    }
    const ly = surgeY(A.plan, secs);
    A.lavaY = ly;
    if (A.view) { A.view.update(nowS / 1000, ly, clockT); A.view.setReach(arenaReach(A.plan, topAt(A.D, secs, A.power))); }
    if (A.phase === 'play') A.pct = Math.max(A.pct, A.done ? 1 : arenaPct(A.plan, c.y));
    // the lava at your wheels: the screen rumbles, its edges glow
    const gap = c.y - ly;
    A.gap = gap;
    if (A.phase === 'play' && !A.out && !A.done && gap < 0.4 && !A.outPred) { A.outPred = true; flushSteps(); sendMove(true); }
    if (A.phase === 'play' && !A.out && !A.done && gap < 12) shake = Math.max(shake, 0.1 * (1 - gap / 12));
    const vk = A.out ? 0.7 : A.done ? 0 : clamp((14 - gap) / 14, 0, 1) * 0.55 * (secs > A.D.surgeAt ? 1 : 0);
    if (Math.abs(vk - (A.veil ?? -1)) > 0.03) { A.veil = vk; $('#veil').style.opacity = vk.toFixed(2); }
    // the music builds: calm on the line, the full chase at the gun, everything when the lava is close or the clock nearly out
    const mk = A.phase !== 'play' || A.out || A.done ? (A.phase === 'wait' ? 0 : 1) : gap < 16 || (A.leftShown !== undefined && A.leftShown <= 10) ? 2 : 1;
    if (mk !== A.music) { A.music = mk; setMusicIntensity(mk); }
    void dt;
}
// what's on the volcano's wall: a boost chevron, a boulder; and over its rim: the finish
function raceTouch(t) {
    const c = P.c, plan = A.plan, B = plan.B;
    if (A.phase !== 'play' || A.out || A.done) return;
    const nowS = net.now() / 1000;
    P.world.surf(c.x, c.z, ST);
    padTouch(t, c, plan.pads, B.R - B.r0, ST, 'a' + A.id + ':', (i) => { net.send('mItem', { i }); bigText('BOOST!', '#7dff6b'); });
    for (const o of plan.rocks) {
        const u = arenaRockU(o, nowS);
        if (u < 0) continue;
        const p = arenaPoint(plan, o.a, u);
        if (Math.hypot(c.x - p.x, c.z - p.z) < ROCK.hit && Math.abs(c.y - p.y) < ROCK.r * 2 + 2) { knock(c, 'BONK!', -c.x, -c.z, 20); return; }
    }
    if (!A.sent && !c.air && c.zone === 3 && Math.hypot(c.x, c.z) > B.R + 1.2) { A.sent = true; flushSteps(); sendMove(true); net.send('mFinish', {}); }
}

// =====================================================================================
// The QA autopilot: plays the loop by itself (the on-ramp, round each funnel's wall, NITRO at the far chevrons, to the gate; trains and
// buys at Base Camp; in a race, laps the volcano for the rim)
// =====================================================================================
let pilotBuyAt = 0;
const steerTo = (c, x, z) => clamp(-angTo(c.ry, Math.atan2(x - c.x, z - c.z)) * 2.4, -1, 1);
// in a race's volcano: round the floor to pick up speed, then onto the wall and up it; NITRO when that takes it over the rim
function pilotBowl(o, c, t, reachNitro, cx, cz) {
    const v = Math.hypot(c.vx, c.vz);
    o.throttle = 1;
    if (c.zone === 1) {
        // on the floor: a wide turn until it's up to speed, then straight out to the wall (never straight at the middle)
        const dx = c.x - cx, dz = c.z - cz, rr = Math.hypot(dx, dz) || 1, out = (Math.sin(c.ry) * dx + Math.cos(c.ry) * dz) / rr;
        // (out to the wall at a slant, never square on: it takes the wall along its lap)
        o.steer = v < P.top * 0.6 ? 0.5 : out < 0.25 ? 0.4 : out > 0.45 ? -0.3 : 0;
    } else if (c.zone === 2) {
        o.steer = 0;
        // at its line, and NITRO would carry it over: burn it, and steer up the wall
        if (reachNitro >= 1 && c.u > Math.min(0.9, P.pilotReach - 0.06) && t >= P.dashReady && !c.air) { P.pilotDash = true; }
        if (t < P.dashUntil || P.pilotReach >= 1) { const side = Math.sin(c.ry) * ST.ez - Math.cos(c.ry) * ST.ex; o.steer = clamp((0.3 - (c.fs || 0)) * 2.4, -1, 1) * (side >= 0 ? 1 : -1); }
    } else o.steer = 0;
}
// at a crater: straight up the road, across the landing and off the lip, the gas down (the drop carries it into a carve); on the
// funnel's wall hands off: it laps by itself, as high as its speed holds. NITRO as it comes up to the far side's launch chevrons, if
// that's what gets it onto them
function pilotFunnel(o, c, t, k, I, top) {
    const dx = c.x - I.cx, dz = c.z - I.cz, v = Math.hypot(c.vx, c.vz);
    o.steer = 0; o.throttle = 1;
    if (c.zone === 2 || c.zone === 1 || c.zone === 8) {
        const eu = exitU(I), toBand = Math.abs(angDiff(I.aX, Math.atan2(dx, dz))) - exitArc(I);
        if (c.zone === 2 && !c.air && c.u < eu + 0.01 && c.u > eu - 0.2 && reachU(I, top * CFG.dashK) >= eu && toBand > 0 && toBand < v / I.R && t >= P.dashReady) P.pilotDash = true;
        return true;
    }
    if (c.zone === 3 && dz > 0 && !P.out.has(k)) { o.steer = steerTo(c, 0, I.cz + I.R - 10); return true; }
    return false;
}
function pilot() {
    const o = { steer: 0, throttle: 0, hold: false }, c = P.c, t = clockT;
    // (a panel that pops up by itself, the daily reward say: it takes the reward and shuts it, as a player would)
    // (the summit's portal has opened the worlds: that's the end of its run, it stays up)
    if (anyPopup()) { if (panelIs('tele') && stageAt(c.z) >= WALLS_N) return o; if (t - (P.pilotPop || -9) > 1.2) { P.pilotPop = t; if (panelIs('daily')) net.send('daily', {}); closeTop(); } return o; }
    if (switching) return o;
    P.world.surf(c.x, c.z, ST);
    if (A) {
        if (A.phase !== 'play' || A.out || A.done) return o;
        const top = topAt(A.D, (net.now() - A.goAt) / 1000, A.power);
        P.pilotReach = arenaReach(A.plan, top);
        if (c.zone === 3) { o.throttle = 0.4; return o; }
        pilotBowl(o, c, t, arenaReach(A.plan, top * CFG.dashK), 0, 0);
        return o;
    }
    if (!view) return o;
    if (t > pilotBuyAt) {
        pilotBuyAt = t + 1.2;
        const Q = QUESTS[S.qi];
        if (rebirthPct(S) >= 100 && stageAt(c.z) < 0) net.send('rebirth', {});
        else if (Q && Q.kind === 'hatch' && S.wins >= JAWBREAKERS[0].wins) net.send('hatch', { j: 0, n: 1 });
        else if (Q && Q.kind === 'upgrades') { const u = UPGRADES.find((x) => S.wins >= upgradeCost(x, (S.ups && S.ups[x.id]) || 0)); if (u) net.send('upgrade', { id: u.id }); }
        else if (Q && Q.kind === 'cars') { const i = CARS.findIndex((x, j) => j > 0 && x.wins && !(S.cars && S.cars[x.id]) && S.wins >= x.wins); if (i > 0) net.send('car', { i }); }
        else if (Q && Q.kind === 'trail' && S.wins >= 15) net.send('trail', { i: 1 });
    }
    const k = stageAt(c.z);
    if (P.tread >= 0) { P.pilotDash = true; return o; }
    if (k >= 0 && k < WALLS_N) {
        const I = islandOf(k), top = maxWalk(S);
        P.pilotReach = reachU(I, top);
        if (pilotFunnel(o, c, t, k, I, top)) return o;
    }
    const g = guideTarget();
    if (g) {
        o.steer = steerTo(c, g.x, g.z);
        const d = Math.hypot(g.x - c.x, g.z - c.z), face = Math.cos(angTo(c.ry, Math.atan2(g.x - c.x, g.z - c.z)));
        // (on a deck or a bridge: no faster than it can turn)
        o.throttle = d < 3 ? (k >= WALLS_N ? 0.3 : 0) : face < 0.3 ? 0.35 : c.zone === 3 ? Math.min(1, 34 / Math.max(1, P.top)) : c.zone === 0 ? Math.min(1, 40 / Math.max(1, P.top)) : 1;
        // nose against a stall or a fence: back out on the other lock, then round it
        if (t < (P.pilotBack || 0)) { o.throttle = -1; o.steer = -P.pilotBackS; }
        else if (o.throttle > 0 && Math.hypot(c.vx, c.vz) < 1.2) { if (!P.pilotStuck) P.pilotStuck = t; else if (t - P.pilotStuck > 1.1) { P.pilotStuck = 0; P.pilotBack = t + 1.1; P.pilotBackS = o.steer >= 0 ? 1 : -1; } }
        else P.pilotStuck = 0;
    }
    return o;
}

// =====================================================================================
// The camera: behind your car and a little over it, swinging round with it (drag to look round, wheel / pinch to zoom); wider
// the faster you go
// =====================================================================================
const cam = { yaw: 0, pitch: 0.36, dist: isTouch ? 27 : 25 };
let camD = 22, camSens = 1, camSnap = true, shake = 0, fovKick = 0, speedFov = 0, camOff = 0, camHold = -9;
const dirV = new V3(), pivotV = new V3(), backV = new V3(), camPos = new V3(), lookV = new V3(), camBank = new V3();
let pivotY = 5;
function lookDir(out_) { const p = cam.pitch, cp = Math.cos(p); return out_.set(-Math.sin(cam.yaw) * cp, -Math.sin(p), -Math.cos(cam.yaw) * cp); }
const LZD = SUN_DIRECTION.clone().normalize(), LX = new V3(0, 1, 0).cross(LZD).normalize(), LY = LZD.clone().cross(LX), snapV = new V3();
function snapShadow(p) {
    const c = sun.shadow.camera, texel = (c.right - c.left) / sun.shadow.mapSize.x;
    const a = Math.round(p.dot(LX) / texel) * texel, b = Math.round(p.dot(LY) / texel) * texel;
    snapV.copy(LX).multiplyScalar(a).addScaledVector(LY, b).addScaledVector(LZD, p.dot(LZD));
    sun.target.position.copy(snapV);
    sun.position.copy(snapV).addScaledVector(LZD, 260);
}
const CS = {};
// In a funnel the camera keeps inside its rim: right behind a car lapping a small funnel it would be out over the kerb, the fence in
// the way. It swings round towards the middle instead (the least it needs), and watches the car from inside the bowl
let camBowl = 0;
function bowlBias(c, d) {
    let R0 = 0, ox = 0, oz = 0;
    if (A) { R0 = A.plan.B.R; } else {
        const k = stageAt(c.z);
        if (k < 0 || k >= WALLS_N) return 0;
        const I = islandOf(k); R0 = I.R; ox = I.cx; oz = I.cz;
    }
    const dx = c.x - ox, dz = c.z - oz;
    if (Math.hypot(dx, dz) > R0 + 0.5) return 0;
    const lim = R0 - 3, base = c.ry + Math.PI + camOff, k2 = d * Math.cos(cam.pitch), at = (yaw) => Math.hypot(dx + Math.sin(yaw) * k2, dz + Math.cos(yaw) * k2);
    if (at(base) <= lim) return 0;
    for (let b = 0.12; b <= 1.35; b += 0.12) { if (at(base + b) <= lim) return b; if (at(base - b) <= lim) return -b; }
    return at(base + 1.35) < at(base - 1.35) ? 1.35 : -1.35;
}
function updateCamera(dt) {
    const c = P.c, portrait = VIEW.portrait, t = clockT;
    // it follows the car's heading (a look round by hand eases back once you're driving again)
    if (drags.size === 0 && t - camHold > 1.4 && Math.abs(c.vf) > 5) camOff *= Math.exp(-dt * 2.2);
    camBowl += (bowlBias(c, camD) - camBowl) * (camSnap ? 1 : 1 - Math.exp(-dt * 3.2));
    const want = c.ry + Math.PI + camOff + camBowl, moving = Math.abs(c.vf) > 2 || c.air;
    if (camSnap) cam.yaw = want; else cam.yaw = lerpA(cam.yaw, want, 1 - Math.exp(-dt * (drags.size || t - camHold < 0.3 ? 30 : moving ? 5.5 : 2.5)));
    lookDir(dirV);
    const fx = P.vx, fz = P.vz, gy = P.vy + 4.2;
    if (camSnap || (pivotV.x - fx) ** 2 + (pivotV.z - fz) ** 2 > 2500) { pivotV.set(fx, gy, fz); pivotY = gy; camSnap = false; }
    else {
        const kx = 1 - Math.exp(-dt * 18);
        pivotV.x += (fx - pivotV.x) * kx; pivotV.z += (fz - pivotV.z) * kx;
        pivotY += (gy - pivotY) * (1 - Math.exp(-dt * 12));
        pivotV.y = pivotY;
    }
    backV.copy(dirV).negate();
    const lim = Math.max(6, cam.dist + (portrait ? 8 : 0) + speedFov * 0.35);
    camD += (lim - camD) * (1 - Math.exp(-dt * 4));
    // never under the ground (a crater's wall rises behind you as you lap it): closer in, then lifted clear
    let d = camD;
    for (let i = 0; i < 6; i++) {
        camPos.copy(pivotV).addScaledVector(backV, d);
        P.world.surf(camPos.x, camPos.z, CS);
        if (CS.zone === 7 || camPos.y >= CS.y + 2.2) break;
        d *= 0.8;
    }
    if (CS.zone !== 7 && camPos.y < CS.y + 2.2) camPos.y = CS.y + 2.2;
    camera.position.copy(camPos);
    {
        const k = c.air || A && A.phase !== 'play' ? 0 : 0.2, e = 1 - Math.exp(-dt * 4);
        camBank.x += ((c.nx || 0) * k - camBank.x) * e; camBank.z += ((c.nz || 0) * k - camBank.z) * e;
        camera.up.set(camBank.x, 1, camBank.z).normalize();
    }
    camera.lookAt(lookV.copy(pivotV).addScaledVector(dirV, 6));
    if (shake > 0.001) { const s = shake * shake * 0.9; camera.position.x += (RND() * 2 - 1) * s; camera.position.y += (RND() * 2 - 1) * s; shake = Math.max(0, shake - dt * 2.4); }
    // NITRO and every boost widen the view a touch, easing back; and the faster you go, the wider it stays
    fovKick = Math.max(0, fovKick - dt * 8);
    const hv = Math.hypot(c.vx, c.vz), sfTarget = clamp((hv - 26) * 0.14, 0, 10);
    speedFov += (sfTarget - speedFov) * Math.min(1, dt * 2.5);
    const fov = (portrait ? 84 : 68) + fovKick + speedFov;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
}

// =====================================================================================
// Input
// =====================================================================================
const keys = {};
const touchMove = { x: 0, y: 0 };
let running = false;
actions.onPanel = () => { for (const k in keys) keys[k] = false; P.holdDash = false; };
addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); if (e.key === 'Escape') closeTop(); return; }
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    if (!running) return;
    if (e.code === 'Escape' && !e.repeat) { if (closeTop()) return; if (BX.isEmbedded()) BX.showPortalMenu(); else openPanel('settings'); return; }
    keys[e.code] = true;
    if (e.repeat || anyPopup()) return;
    if (e.code === 'KeyE') { if (activePrompt) usePrompt(); }
    if (e.code === 'Space' || e.code === 'KeyF' || e.code === 'Enter' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') dash();
    if (e.code === 'KeyM') actions.toggleSound();
    if (A) return;
    if (e.code === 'KeyR') goTo('spawn');
    if (e.code === 'KeyB') goStage();
    if (e.code === 'KeyQ') openPanel('quests');
    if (e.code === 'KeyC') openPanel('spin');
    if (e.code === 'KeyG') openPanel('shop');
    if (e.code === 'KeyT') openPanel('tele');
    if (e.code === 'KeyJ') openPanel('inv');
    if (e.code === 'KeyU') openPanel('work');
    if (e.code === 'KeyV') openPanel('cars');
    if (e.code === 'KeyP') pressPlay();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; drags.clear(); pinchD = 0; P.holdDash = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const drags = new Map();
let pinchD = 0, holdId = null;
canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    if (!running || anyPopup()) return;
    canvas.setPointerCapture(e.pointerId);
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, at: performance.now() });
    if (drags.size === 2) { const [a, b] = [...drags.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); P.holdDash = false; holdId = null; }
    // a click on the world on a dyno revs it (held: flat out). The right button is only ever the camera
    else if (e.button === 0 && P.tread >= 0) { dash(); holdId = e.pointerId; P.holdDash = true; }
});
canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) { d.moved = true; if (holdId === e.pointerId) { holdId = null; P.holdDash = false; } }
    if (drags.size === 2) {
        const [a, b] = [...drags.values()], nd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD) cam.dist = clamp(cam.dist * pinchD / Math.max(20, nd), 12, 52);
        pinchD = nd;
    } else if (d.moved) {
        const k = (e.pointerType === 'touch' ? 0.0068 : 0.0045) * camSens;
        camOff -= (e.clientX - d.x) * k; camHold = clockT;
        cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k, -0.2, 1.3);
    }
    d.x = e.clientX; d.y = e.clientY;
});
const endDrag = (e) => { drags.delete(e.pointerId); if (drags.size < 2) pinchD = 0; if (holdId === e.pointerId) { holdId = null; P.holdDash = false; } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 2, 12, 52); e.preventDefault(); }, { passive: false });
(function touchControls() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null, rect = null;
    const set = (e) => {
        const r = rect;
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, l = Math.hypot(dx, dy);
        if (l > max) { dx *= max / l; dy *= max / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMove.x = dx / max; touchMove.y = dy / max;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; rect = stick.getBoundingClientRect(); stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const wb = $('#lickBtn');
    wb.addEventListener('pointerdown', (e) => { e.preventDefault(); wb.setPointerCapture(e.pointerId); wb.classList.add('on'); dash(); P.holdDash = true; });
    const wEnd = () => { wb.classList.remove('on'); P.holdDash = false; };
    wb.addEventListener('pointerup', wEnd); wb.addEventListener('pointercancel', wEnd);
})();

// A button: a click. A browser makes no click for a second finger, though, and a thumb on the stick is the first: then the lift of
// that finger is the tap.
let touchesDown = 0;
addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touchesDown++; }, true);
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => { if (e.pointerType === 'touch') touchesDown = Math.max(0, touchesDown - 1); }, true);
addEventListener('blur', () => { touchesDown = 0; });
function tapOn(el, fn) {
    let id = null, at = 0;
    el.addEventListener('pointerdown', (e) => { id = e.pointerType === 'touch' && touchesDown > 1 ? e.pointerId : null; });
    el.addEventListener('pointerup', (e) => {
        if (e.pointerId !== id) return;
        id = null;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { at = performance.now(); fn(); }
    });
    el.addEventListener('pointercancel', () => { id = null; });
    el.addEventListener('click', () => { if (performance.now() - at > 700) fn(); });
}
actions.tapOn = tapOn;
// ----- proximity prompts (the Car Dealer, the Tuning garage, the portals, an Egg, a dyno with a price, the gift) -----
let activePrompt = null, promptX = -1, promptY = -1;
const pv = new V3();
function updatePrompt() {
    let best = null, bd = 1e9;
    const c = P.c;
    if (!A && !anyPopup() && P.tread < 0 && c.zone === 0 && Math.abs(c.vf) < 30) for (const p of prompts) { if (p.on && !p.on()) continue; const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z); if (d < p.r && d < bd) { bd = d; best = p; } }
    activePrompt = best;
    const el = $('#promptBtn');
    if (!best) { if (!el.hidden) el.hidden = true; return; }
    pv.copy(best.pos).setY(best.pos.y + 7).project(camera);
    if (pv.z > 1) { el.hidden = true; return; }
    el.hidden = false;
    const lbl = best.label();
    if ($('#promptTxt').textContent !== lbl) $('#promptTxt').textContent = lbl;
    const px = Math.round(clamp((pv.x + 1) / 2, 0.24, 0.76) * VIEW.w), py = Math.round(clamp((1 - pv.y) / 2, 0.24, 0.7) * VIEW.h);
    if (px !== promptX || py !== promptY) { promptX = px; promptY = py; el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -110%)`; }
}
function usePrompt() { if (activePrompt) { sfx('click'); activePrompt.act(); } }
tapOn($('#promptBtn'), usePrompt);

// ----- controller -----
let padMode = false, padSeen = 0, padTipsShown = false, padMenu = false, padHud = false;
function setPadMode(on) {
    if (padMode === on) return;
    padMode = on;
    document.body.classList.toggle('pad', on);
    $('#promptBtn').querySelector('kbd').textContent = on ? 'Y' : 'E';
    if (!on) { padNav.clear(); setPadMenu(false); }
    else if (running && !padTipsShown) { padTipsShown = true; showTips(); }
}
function setPadMenu(on) {
    if (padMenu !== on) { padMenu = on; document.body.classList.toggle('padmenu', on); }
    const h = on && padNav.hud && !anyPopup();
    if (padHud !== h) { padHud = h; document.body.classList.toggle('padhud', h); }
}
// a mouse, a key, a finger: the ring and the controller's hints get out of the way until the controller's used again
const padOff = () => { if (padMode) setPadMode(false); };
addEventListener('keydown', padOff, true);
addEventListener('pointerdown', padOff, true);
addEventListener('pointermove', (e) => { if (padMode && e.pointerType === 'mouse' && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) padOff(); }, true);
onGamepadConnection((g, on) => {
    if (on) { toast('🎮 Controller ready!', '#7dff6b'); setPadMode(true); } else { toast('🎮 Controller disconnected', '#ffc27a'); setPadMode(false); }
});
const ZOOMS = [18, 25, 36];
function padButtons(dt) {
    if (!pad.connected) return;
    if (pad.lastUsed !== padSeen) {
        padSeen = pad.lastUsed;
        setPadMode(true);
        // a button on a controller doesn't count as a tap for the browser's sound rules everywhere
        if (pad.pressed.size && audioSuspended()) resumeAudio();
    }
    if (!running) return;
    const menu = padNav.frame(performance.now(), dt, padMode);
    setPadMenu(!!menu && padMode);
    if (!padMode) return;
    if (pad.pressed.has('START')) { if (!closeTop()) openPanel('settings'); return; }
    if (menu === 'back') { closeTop(); return; }
    if (menu) return;
    if (pad.pressed.has('A') || pad.pressed.has('X') || pad.pressed.has('RT') || pad.pressed.has('LT')) dash();
    for (const d of ['UP', 'DOWN', 'LEFT', 'RIGHT']) if (pad.pressed.has(d)) { padNav.enterHud(d); return; }
    if (pad.pressed.has('R3')) { const i = ZOOMS.findIndex((z) => z >= cam.dist - 0.5); cam.dist = ZOOMS[(i + 1) % ZOOMS.length] || ZOOMS[0]; }
    if (A) return;
    if (pad.pressed.has('Y')) { if (activePrompt) usePrompt(); else goStage(); }
    if (pad.pressed.has('LB')) pressPlay();
    if (pad.pressed.has('BACK')) openPanel('quests');
    if (pad.pressed.has('L3')) goTo('spawn');
}

// =====================================================================================
// Everyone else in your world or your race (smoothed on the server's clock)
// =====================================================================================
const remotes = new Map();
const smp = { x: 0, y: 0, z: 0, ry: 0, a: 0, speed: 0 };
const RS = {};
class Remote {
    constructor(p, id) {
        this.id = id;
        this.car = new Car({ name: p.name, lv: p.lv, tr: p.title, car: p.car, low: getQuality() === 'low' });
        this.car.setAvatar(p.av);
        this.av = p.av; this.track = new Track(); this.here = false; this.prevRy = p.ry; this.steer = 0; this.wasAir = false;
        this.team = new Team(); this.treadK = 0; this.treadI = -1; this.carI = p.car; this.p = p;
    }
    update(p, dt, t) {
        this.p = p;
        this.track.push(p.t, p.x, p.y, p.z, p.ry, p.anim);
        const matchNow = A ? A.id : 0;
        this.here = p.match === matchNow && (matchNow > 0 || p.world === S.world);
        if (!this.here || switching) { this.car.setVisible(false); return; }
        const rt = net.now() - this.track.delayFor(dt);
        if (!this.track.sample(rt, smp, dt)) { smp.x = p.x; smp.y = p.y; smp.z = p.z; smp.ry = p.ry; smp.a = p.anim; smp.speed = 0; }
        if (p.av !== this.av) { this.av = p.av; this.car.setAvatar(p.av); }
        if (p.car !== this.carI) { this.carI = p.car; this.car.setCar(p.car); }
        // (their tag, when something on it has changed)
        const raceId = A ? A.id : 0;
        if (p.lv !== this.tagLv || p.name !== this.tagName || p.title !== this.tagTr || raceId !== this.tagRace) { this.tagLv = p.lv; this.tagName = p.name; this.tagTr = p.title; this.tagRace = raceId; this.car.setLabel(p.name, p.lv, p.title, A ? SPOT_CSS[A.names.find((n) => n.n === p.name)?.spot ?? 0] : undefined); }
        this.car.setTrail(p.trail); this.car.setAura(p.aura);
        // (right up against the camera a rival would fill the screen and hide you: they aren't drawn there)
        const d2 = camera.position.distanceToSquared(FX.tmpV.set(smp.x, smp.y + 3, smp.z)), near = d2 < (lowQ ? 220 * 220 : 340 * 340) && d2 > 49;
        this.car.setVisible(near);
        if (!near) return;
        this.car.fitLabel(Math.sqrt(d2));
        const far = d2 > 110 * 110;
        // on a dyno: parked on its rollers
        const tread = p.post !== 255 && p.anim === 3;
        this.treadK += ((tread ? 1 : 0) - this.treadK) * Math.min(1, dt * 8);
        if (tread) this.treadI = p.post;
        let x = smp.x, y = smp.y, z = smp.z, ry = smp.ry;
        if (this.treadK > 0.01 && this.treadI >= 0) {
            const s = postSpot(this.treadI), e = this.treadK;
            x += (s.x - x) * e; y += (0.42 - y) * e; z += (s.z + 0.3 - z) * e; ry = lerpA(ry, Math.PI, e);
        }
        // the ground under them tilts their car as it does yours (in the air, or not near it: level)
        const q = remSt, air = smp.a === 2;
        P.world.surf(x, z, RS);
        if (!air && Math.abs(y - RS.y) < 2.5 && this.treadK < 0.5) { const il = 1 / Math.sqrt(1 + RS.gx * RS.gx + RS.gz * RS.gz); q.nx = -RS.gx * il; q.ny = il; q.nz = -RS.gz * il; } else { q.nx = 0; q.ny = 1; q.nz = 0; }
        // their steering, read off how their heading turns
        const om = dt > 0 ? angTo(this.prevRy, ry) / dt : 0;
        this.prevRy = ry;
        this.steer += (clamp(-om / 2.2, -1, 1) - this.steer) * Math.min(1, dt * 6);
        if (this.wasAir && !air) this.car.squash(0.6);
        this.wasAir = air;
        q.x = x; q.y = y; q.z = z; q.ry = ry; q.air = air; q.speed = this.treadK > 0.35 ? 0 : (p.spd || smp.speed); q.steer = this.steer; q.slip = 0; q.boost = false; q.dyno = this.treadK > 0.5; q.sprint = false; q.far = far; q.snap = false;
        this.car.update(dt, t, q);
        if (!far && !A) { this.team.set(p.team); this.team.update(dt, t, x - Math.sin(ry) * 3, y + 0.5, z - Math.cos(ry) * 3, ry, q.speed > 2 || q.dyno); }
        this.x = x; this.y = y; this.z = z;
    }
    dispose() { this.car.dispose(); }
}
const seenIds = new Set();
function syncRemotes(dt, t) {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return;
    seenIds.clear();
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) { if (S.name !== p.name) { S.name = p.name; if (me) me.setLabel(S.name, S.lv, titleOf(S.cleared)); } return; }
        seenIds.add(id);
        let r = remotes.get(id);
        if (!r) { r = new Remote(p, id); remotes.set(id, r); }
        r.update(p, dt, t);
    });
    for (const [id, r] of remotes) if (!seenIds.has(id)) { r.dispose(); remotes.delete(id); }
}

// =====================================================================================
// HUD buttons
// =====================================================================================
let switching = false;
// (the button lets go of the keyboard: SPACE is NITRO, it never presses the last button clicked again)
const bind = (sel, fn) => { const el = $(sel); if (!el) return; tapOn(el, () => { sfx('click'); el.blur(); fn(); }); };
// the left column's tiles
bind('#bRebirth', () => openPanel('rebirth'));
bind('#bWork', () => openPanel('work'));
bind('#bPals', () => openPanel('inv'));
bind('#bTele', () => openPanel('tele'));
bind('#bCars', () => openPanel('cars'));
bind('#bTread', () => actions.toTread());
let treadAskAt = -9;
actions.toTread = () => { if (A) return; treadAskAt = clockT; goTo('post'); toast('⚙️ To your best dyno!', '#7af4ff'); };
// the round ones up top
bind('#bQuests', () => openPanel('quests'));
bind('#bDaily', () => openPanel('daily'));
bind('#bSpin', () => openPanel('spin'));
bind('#bCodes', () => openPanel('shop', 'codes'));
bind('#bSettings', () => openPanel('settings'));
// the right column, top right
bind('#bShop', () => openPanel('shop'));
bind('#bX2', () => { if (S.x2) { toast('⚡ 2X SPEED is on: ' + Math.ceil(((S.x2Until || 0) - net.now()) / 60000) + ' min left', '#7dff6b'); return; } askConfirm('⚡', '2X SPEED', 'Double Speed from every step for ' + CFG.boostP2Mins + ' minutes.', '💎 ' + CFG.boostP2Gems, () => net.send('x2', {})); });
bind('#bGift', () => openPanel('gifts'));
bind('#bPlay', () => pressPlay());
// x2 WINS (Gems), STATS, the bar's + (Tuning), the three +SPEED buttons (Gems), SKIP the crater you're at (Gems)
bind('#bW2', () => { if ((S.w2Until || 0) > net.now()) { toast('🏆 x2 WINS is on: ' + Math.ceil(((S.w2Until || 0) - net.now()) / 60000) + ' min left', '#7dff6b'); return; } askConfirm('🏆', 'x2 WINS', 'Double the Wins from every crater for ' + CFG.boostW2Mins + ' minutes.', '💎 ' + CFG.boostW2Gems, () => net.send('w2', {})); });
bind('#bStats', () => openPanel('stats'));
bind('#bLvPlus', () => openPanel('work'));
bind('#csBox', () => openPanel('stats'));
for (let i = 0; i < 3; i++) bind('#sp' + i, () => {
    const k = SPEED_PACKS[i];
    if (!k) return;
    const n = fmt(rewardSpeed({ speed: k.sp }, S.lv));
    askConfirm('⚡', '+' + n + ' SPEED', 'Get ' + n + ' Speed (and as much XP) right now.', '💎 ' + k.gems, () => net.send('spack', { i }));
});
bind('#bSkip', () => { if (A) return; askConfirm('⏩', 'SKIP THIS CRATER?', 'Jump straight to the next island (this crater pays no Wins).', '💎 ' + (CFG.skipGems || 8), () => net.send('skip', {})); });
bind('#questLine', () => openPanel('quests'));
bind('#winsBox', () => openPanel('boards'));
bind('#gemsBox', () => openPanel('shop'));
bind('#qCancel', () => net.send('unplay', {}));
bind('#bQuit', () => askConfirm('🏳️', 'Leave the race?', 'A bot takes your place and you get no prize.', 'Leave', () => net.send('quit', {})));
function goStage() {
    if (A) return;
    if (stageAt(P.c.z) >= 0) goTo('spawn'); else goTo('stage', frontier());
}
function fadeOut() { $('#fade').style.opacity = 1; return sleep(260); }
function fadeIn() { $('#fade').style.opacity = 0; }
let showFps = false;
actions.fpsOn = () => showFps;
actions.toggleFps = () => { showFps = !showFps; $('#fps').hidden = !showFps; };
let boards = { wins: [], speed: [], race: [] };
actions.boards = () => boards;
actions.world = (w) => { if (w === S.world) { closeTop(); goTo('spawn'); return; } net.send('world', { w }); };
actions.toggleMusic = () => toggleMusic();
actions.toggleSound = () => { const on = toggleSound(); toast(on ? '🔊 Sound on' : '🔇 Sound off', '#7de8ff'); updateHud(); };
actions.myPct = () => (A ? Math.round(A.pct * 100) : 0);
addEventListener('resize', () => measureHud());

// =====================================================================================
// Networking
// =====================================================================================
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
const ON_BLOXITY_HOST = /\.play\.bloxity\.io$/.test(location.hostname);
const DEV_CHANNEL = /\.dev\.play\.bloxity\.io$/.test(location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL
    || (ON_BLOXITY_HOST ? `https://${location.hostname.replace(/\.play\.bloxity\.io$/, '.host.bloxity.io')}`
        : BLOXITY_GAME_ID ? `https://${BLOXITY_GAME_ID}.host.bloxity.io`
        : import.meta.env.DEV ? `${location.protocol}//${location.hostname}:3087` : location.origin);
async function serverEndpoint() {
    let url = SERVER_URL;
    if (BLOXITY_GAME_ID) {
        const r = await BX.resolveEndpoint(BLOXITY_GAME_ID, DEV_CHANNEL ? 'preview' : undefined);
        if (r && r.cold) loadingText('Waking up a server…');
        url = (r && r.endpoint) || SERVER_URL;
    }
    if (!/^https?:/i.test(url)) return url;
    if (!(await serverUp(url))) {
        loadingText('Waking up a server…');
        const until = Date.now() + 60000;
        while (Date.now() < until) { await sleep(2000); if (await serverUp(url)) break; }
    }
    return url;
}
async function serverUp(url) {
    try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(url.replace(/\/$/, '') + '/health', { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        return r.ok;
    } catch (e) { return false; }
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    if (switching) return;
    const now = performance.now();
    if (!force && now - lastMoveSent < 66) return;
    const c = P.c, tread = P.tread >= 0 && P.treadK > 0.3;
    const a = tread ? 3 : c.air ? 2 : Math.abs(c.vf) > 1.5 ? 1 : 0;
    const m = { x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), ry: +c.ry.toFixed(3), a, v: Math.round(c.vf || 0) };
    if (tread) m.post = P.tread;
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a;
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    m.ts = Math.round(net.now());
    net.send('move', m);
}
function playerUid() {
    let uid = storageGet('cre1_uid');
    if (!uid) { uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); storageSet('cre1_uid', uid); }
    return uid;
}
// an answer from the server: its numbers, plus what you've stepped since that it hasn't seen yet
function reconcile(m) {
    if (m.ack !== undefined) while (pending.length && pending[0].s <= m.ack) pending.shift();
    let x = out.xp, n = out.n, lx = out.lx;
    for (const p of pending) { x += p.xp; n += p.n; lx += p.lx || 0; }
    S.pendXp = x; S.pendN = n; S.pendLx = lx;
    if (m.xp !== undefined) S.xp = Math.min((m.need || S.need) - 0.01, m.xp + lx);
    delete m.xp; delete m.ack;
}
const clearPending = () => { pending.length = 0; out.n = 0; out.xp = 0; out.lx = 0; S.pendXp = 0; S.pendN = 0; S.pendLx = 0; };
let gotProfile = false, lastGems = 0, lastWins = 0, lastReb = -1, epochSet = false, connLost = false;
async function connect(name, endpoint) {
    const url = endpoint || await serverEndpoint();
    const client = new Client(url);
    const id = BX.identity();
    const room = await client.joinOrCreate('run', { uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()), save: storageGet('cre1_save') || '' });
    net.room = room;
    net.bloxity = false;
    BX.updateRoom(room.roomId);
    room.onMessage('hello', (m) => { net.offset = m.now - Date.now(); if (!epochSet) { epochSet = true; setEpoch(m.now - 300000); } net.bloxity = !!m.bloxity; pingSend(); });
    room.onDrop(() => { toast('📶 Connection lost: reconnecting…', '#ffe24a'); });
    room.onReconnect(() => { toast('📶 Back online!', '#7dff6b'); });
    room.onMessage('pong', onPong);
    room.onMessage('profile', (m) => {
        const first = !gotProfile;
        if (m.save) storageSet('cre1_save', m.save);
        delete m.now;
        const prevWorld = S.world, prevCar = S.car;
        // (which dynos were open: the Wins in this message may open the next one)
        const wasOpen = first ? null : POSTS.map((c, i) => postOpen(S, i));
        reconcile(m);
        // the gates open for you, as the server has them
        if (m.out !== undefined) { const bits = m.out | 0; let ch = false; for (let k = 0; k < WALLS_N; k++) if ((bits >> k) & 1 && !P.out.has(k)) { P.out.add(k); ch = true; } if (ch) showGates(); delete m.out; }
        Object.assign(S, m);
        if (wasOpen) for (let i = POSTS.length - 1; i > 0; i--) if (!wasOpen[i] && !POSTS[i].gems && postOpen(S, i)) { popup('🔓', POSTS[i].name.toUpperCase() + ' OPEN!', 'Every step on it is +' + POSTS[i].mult + ': press Train', '#7dff6b'); sfx('reward'); break; }
        S.x2 = (S.x2Until || 0) > net.now();
        S.profileAt = Date.now();
        gotProfile = true;
        if (!first && m.gems > lastGems) { bump('#gemsBox'); sfx('gem'); }
        if (!first && m.wins > lastWins + 0.5) bump('#winsBox');
        lastGems = m.gems; lastWins = m.wins;
        if (me) { me.setLabel(S.name, S.lv, titleOf(S.cleared)); me.setTrail(S.trail); me.setAura(S.aura); if (prevCar !== S.car) { me.setCar(S.car || 0); me.squash(0.8); } }
        setProgress();
        if (lastReb !== S.rebirths) { lastReb = S.rebirths; document.body.classList.toggle('reborn', S.rebirths > 0); }
        // a world switch made elsewhere (another tab) shows up here
        if (!first && running && !switching && !A && prevWorld !== S.world && view && view.w !== S.world) switchWorld(S.world, W.spawn.x, W.spawn.z);
        refreshPanels();
        updateHud();
    });
    // while driving: only what changes then, four times a second
    room.onMessage('lite', (m) => {
        reconcile(m);
        S.lv = m.lv; S.need = m.need; S.wins = m.wins; S.totalSpeed = m.totalSpeed; S.speed = m.speed; S.steps = m.steps; S.cleared = m.cleared;
        if (m.qv !== undefined) S.qv = m.qv;
        if (m.sq !== undefined) S.sq = m.sq;
        if (m.bests) S.bests = m.bests;
        S.profileAt = S.profileAt || Date.now();
        updateHud();
    });
    room.onMessage('toast', (m) => toast(m.text, m.color));
    // the squad boost: players came or went
    room.onMessage('sq', (m) => { const was = S.sq || 0; S.sq = +m.sq || 0; if (gotProfile && S.sq > was) toast('🤝 Squad Boost: +' + Math.round(S.sq * 100) + '% Speed a step!', '#7dff6b'); updateHud(); });
    room.onMessage('broke', (m) => notEnough(m));
    room.onMessage('code', (m) => codeResult(m));
    room.onMessage('boards', (m) => { boards = m; if (view) view.setBoards(m); if (panelIs('boards')) refreshPanels(); });
    room.onMessage('reward', (m) => { popup(m.gems && !/pc|wc/.test(m.text) ? '💎' : '🧰', m.why || 'Reward!', m.text, '#ffe24a', true); sfx('reward'); confetti(P.c); if (/wc/.test(m.text)) flyWins(8); });
    room.onMessage('levelup', (m) => {
        const was = S.lv;
        S.lv = m.lv; S.need = m.need || xpNeed(m.lv); S.xp = m.xp !== undefined ? Math.min(S.need - 0.01, m.xp) : 0;
        sfx('levelup');
        levelUp(was, m.lv);
        if (me) { FX.sparkleColumn(P.c, 0x7af4ff); me.setLabel(S.name, S.lv, titleOf(S.cleared)); }
        updateHud();
    });
    room.onMessage('padok', (m) => onPadOk(m));
    room.onMessage('warped', (m) => {
        const tread = clockT - treadAskAt < 3;
        warpTo(m.x, m.y, m.z).then(() => { if (tread && !A) { treadAskAt = -9; const s = postSpot(bestPost()); P.walkTo = { x: s.x, z: s.z + 0.3, until: clockT + 3.5 }; } if (m.why === 'skip') bigText('CRATER ' + ((m.k | 0) + 1) + '!', '#7dff6b'); });
    });
    room.onMessage('reborn', (m) => {
        sfx('rankup');
        popup('🔄', 'REBIRTH ' + m.r + '!', 'Every step now gives x' + rebirthMult(m.r) + ' Speed and XP', '#e0a8ff');
        screenConfetti(90);
        clearPending();
        P.padT.fill(-99);
        newLife();
        teleport(m.x, 0, m.z, Math.PI);
    });
    room.onMessage('warp', (m) => { S.world = m.w; clearPending(); P.padT.fill(-99); switchWorld(m.w, m.x, m.z); });
    room.onMessage('spun', (m) => onSpun(m));
    room.onMessage('hatched', (m) => { hatchShow(m); });
    room.onMessage('bought', (m) => {
        sfx('buy');
        screenConfetti(60);
        if (m.what === 'upgrade') toast('🔧 Tuned!', '#7dff6b');
        else if (m.what === 'post') toast('⚙️ The ' + POSTS[m.i].name + ' is open: go and park on it!', '#7dff6b');
        else if (m.what === 'car') popup('🏎️', CARS[m.i].name.toUpperCase() + '!', 'Every step now gives x' + fmt(CARS[m.i].mult) + ' Speed', '#7dff6b');
    });
    room.onMessage('taskdone', (m) => { sfx('task'); toast('✅ Daily task done: ' + TASKS[m.k].text + '! Claim it in Quests', '#7dff6b'); });
    room.onMessage('questdone', (m) => { sfx('task'); questDone(m); if (m.wins) flyWins(m.wins); });
    room.onMessage('authed', (m) => { S.name = m.name; });
    room.onMessage('snap', (m) => { P.snaps++; teleport(m.x, m.y, m.z); });
    room.onMessage('emote', (m) => { const r = remotes.get(m.s); if (r && r.car.blox) playEmoteOn(r.car.blox, m.id); });
    room.onMessage('chat', (m) => { const r = remotes.get(m.s); if (r) chatBubble(r.car.root, m.text); else if (m.s === room.sessionId && me) chatBubble(me.root, m.text); });
    // ----- Eruption -----
    room.onMessage('mQueue', (m) => {
        if (m.off) { S.queued = false; queueState(null); return; }
        const was = S.queued ? S.qFound : 0;
        S.queued = true; S.qFound = m.found;
        if (was && m.found > was) sfx('found');
        queueState(m);
    });
    room.onMessage('mStart', (m) => enterMatch(m));
    room.onMessage('mSync', (m) => { if (A && A.id === m.start.id) applySync(m); else { pendingSync = m; enterMatch(m.start); } });
    room.onMessage('mNone', (m) => { if (A) leaveMatch(m, null); });
    room.onMessage('mJoined', (m) => { toast('🏎️ ' + m.name + ' joined the race!', '#7af4ff'); sfx('found'); if (A) { const n = A.names.find((x) => x.spot === m.spot); if (n) n.n = m.name; setScores(A); } });
    room.onMessage('mLeft', (m) => { toast(m.name + ' left: a bot takes over', '#c8d0dc'); });
    room.onMessage('mGo', (m) => {
        if (!A) return;
        A.phase = 'play'; A.endsAt = m.at + m.secs * 1000;
        showCount('GO!'); setTimeout(() => showCount(null), 800);
        sfx('go');
        matchHud({ left: m.secs });
    });
    room.onMessage('mScore', (m) => { if (!A) return; A.scores = m.s; setScores(A); });
    room.onMessage('mOut', (m) => {
        if (!A) return;
        if (m.spot === A.spot) { A.out = true; sfx('caught'); rumble(0.9, 300); bigText('THE LAVA GOT YOU!', '#ffc27a'); }
        else toast('🌋 The lava got ' + m.name + '!', '#ffc27a');
        const row = A.scores.find((r) => r[0] === m.spot);
        if (row) row[3] = 1;
        setScores(A);
    });
    room.onMessage('mDone', (m) => {
        if (!A) return;
        A.endsAt = m.endAt;
        if (m.spot === A.spot) { A.done = true; sfx('win'); screenConfetti(90); bigText(m.place === 0 ? 'YOU WIN!' : 'ESCAPED!', '#ffe24a'); }
        else toast('🏁 ' + m.name + ' is over the rim!', '#ffe24a');
        const row = A.scores.find((r) => r[0] === m.spot);
        if (row) row[2] = m.place;
        setScores(A);
    });
    room.onMessage('mTime', () => { if (A) { A.phase = 'done'; showCount('TIME!'); sfx('whoosh'); } });
    room.onMessage('mEnd', (m) => leaveMatch(m, m));
    room.onMessage('mBack', (m) => leaveMatch(m, null));
    room.onLeave((code) => {
        if (code === 4000) { $('#connectErr').textContent = 'You joined from somewhere else.'; }
        else $('#connectErr').textContent = 'Lost the connection to the server.';
        $('#start').hidden = false; $('#connectErr').hidden = false; $('#retryBtn').hidden = false; $('#loading').textContent = '';
        running = false; connLost = true;
        audioAway(true);
    });
    return room;
}
// a quick way round: behind a short fade (no moves go out meanwhile: the server has you where you're going already). A new life
// from there: every gate shut again
async function warpTo(x, y, z) {
    if (A || enteringMatch) return;
    switching = true;
    await fadeOut();
    if (A || enteringMatch) return;
    switching = false;
    newLife();
    teleport(x, y || 0, z, Math.PI);
    fadeIn();
    FX.sparkleColumn(P.c, 0x7dff6b);
}
// out of a crater: "+N Wins", trophies flying into the counter (again: you'd escaped it a moment ago: its gate opens, no Wins yet)
function onPadOk(m) {
    const n = m.n ?? m.wins ?? 0;
    P.out.add(m.k); showGates();
    if (m.again || !n) { if (clockT - (P.againT || -9) > 4) { P.againT = clockT; toast('🏁 Out again! This crater pays again in a moment', '#c8d0dc'); } return; }
    sfx('trophy');
    toast('🏆 +' + fmt(n) + ' Wins' + (m.first ? ' · first escape: x3!' : ''), '#ffe24a', false, true);
    flyWins(n);
    FX.coinBurst(FX.tmpV.set(P.c.x, P.c.y + 3, P.c.z));
    if (!lowQ) screenConfetti(m.first ? 30 : 10);
    S.wins += n; S.totalWins = (S.totalWins || 0) + n;
    P.padT[m.k] = clockT;
    const best = (S.bests && S.bests[S.world || 0]) || 0;
    if (m.k + 1 > best) S.bests = { ...S.bests, [S.world || 0]: m.k + 1 };
    updateHud();
    setTimeout(offerDaily, 2500);
}
// the daily reward pops up only when you're parked, between things
function offerDaily() {
    if (!running || A || P.c.air || anyPopup() || offerDaily.done || P.c.zone === 1 || P.c.zone === 2) return;
    if (!dailyStatus(S.daily, net.now()).can) return;
    offerDaily.done = true;
    openPanel('daily');
}
async function playEmoteOn(avatar, id) {
    if (!avatar) return;
    const cat = await BX.loadEmotes();
    const e = cat.get(id);
    if (e && e.clip) avatar.playEmote(e.clip);
}
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubbleLbl) { group.remove(group.userData.bubbleLbl); group.userData.bubbleLbl.material.map.dispose(); }
    const lb = billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#10203a', px: 44 }], 9, 1024, new V3(0, 13, 0), group);
    group.userData.bubbleLbl = lb;
    setTimeout(() => { if (group.userData.bubbleLbl === lb) { group.remove(lb); lb.material.map.dispose(); group.userData.bubbleLbl = null; } }, 5000);
}

// =====================================================================================
// Every frame
// =====================================================================================
let clockT = 0, slowT = 0, pingT = 0, metaT = 20, engT = 0;
function update(dt) {
    clockT += dt;
    const t = clockT;
    CU.uNow.value = rel(net.now());
    if (lowQ !== (getQuality() === 'low')) { lowQ = !lowQ; setFloatCap(lowQ ? 4 : 12); }
    pumpAvatars();
    beginPals();
    beginWheels(scene, lowQ);
    updateMe(dt);
    updateSteps();
    updatePrompt();
    syncRemotes(dt, t);
    endWheels();
    stageHud();
    updateGuide(t);
    contactShadows();
    endPals();
    // (the boulders roll on the server's own seconds: the same clock the hits use)
    if (view && !A) view.update(net.now() / 1000, camera.position, clockT);
    updateEffects(dt);
    updateFx(dt);
    S.powerShown = speedNow();
    animateCounters(dt);
    if (A) matchTick(dt);
    // the engine's note and the tyres' squeal, the speedo: a dozen times a second
    engT -= dt;
    if (engT <= 0) {
        engT = 0.08;
        const c = P.c, v = Math.abs(c.vf || 0), onDyno = P.tread >= 0, top = Math.max(1, P.v);
        const rpm = onDyno ? (P.sprinting ? 0.95 : 0.6) : clamp(v / Math.max(40, top) * 0.85 + (Math.abs(P.thr) > 0.1 ? 0.12 : 0) + (clockT < P.dashUntil ? 0.15 : 0), 0, 1.2);
        engineSound(anyPopup() || switching ? 0 : rpm, Math.abs(P.thr) > 0.1 || onDyno ? 1 : 0.35, c.air || onDyno ? 0 : c.slip);
        speedo(Math.round(onDyno ? 0 : Math.hypot(c.vx, c.vz)), Math.round(P.top), onDyno);
    }
    slowT -= dt;
    if (slowT <= 0) {
        slowT = 1;
        S.x2 = (S.x2Until || 0) > net.now();
        updateHud();
    }
    pingT -= dt;
    if (pingT <= 0) { pingT = pingEvery(); pingSend(); }
    metaT -= dt;
    if (metaT <= 0) { metaT = 30; sendMeta(); }
}
// the contact shadows (Low quality): under you and everyone near
function contactShadows() {
    SH.shadowsOn(lowQ);
    if (!lowQ) { SH.begin(); SH.end(); return; }
    SH.begin();
    const c = P.c;
    P.world.surf(c.x, c.z, SG);
    if (SG.zone !== 2 || !c.air) SH.add(P.vx, P.tread >= 0 ? 0.3 : SG.y, P.vz, Math.max(0, P.vy - SG.y), 5.5);
    for (const r of remotes.values()) if (r.here && r.x !== undefined && r.car.shown) { P.world.surf(r.x, r.z, SG); if (SG.zone !== 2) SH.add(r.x, SG.y, r.z, Math.max(0, r.y - SG.y), 5.5); }
    SH.end();
}
const AMB = { meadow: { color: 0xfffff0, dir: 0.08, snow: false }, ember: { color: 0xffa860, dir: 0.14, snow: false }, frost: { color: 0xffffff, dir: 0.2, snow: true }, lunar: { color: 0xc8d0ff, dir: 0.05, snow: false } };
function updateCameraAll(dt) {
    updateCamera(dt);
    const t = clockT;
    if (shadowDue()) snapShadow(FX.tmpV.set(P.vx, P.vy, P.vz));
    updateSky(camera.position, t, dt);
    const w = A ? A.w : S.world;
    updateAmbient(camera.position, t, AMB[WORLDS[w || 0].mood] || AMB.meadow);
    // speed lines at the edges: flat out, on NITRO, boosted
    const hv = Math.hypot(P.c.vx, P.c.vz);
    // (not on Low: drawing them is a canvas's worth of work every frame)
    setSpeedLines(lowQ ? 0 : clamp((hv - 44) / 50 + (clockT < P.dashUntil ? 0.5 : 0), 0, 1), dt);
}

// ----- play stats: how the game runs on this device and any error it hit -----
const fpsWin = { sum: 0, n: 0 }, errSeen = new Set(), errQueue = [];
let metaFirst = true, loadSecs = 0, lastFps = 60;
function noteError(msg, src, line, col) {
    const file = src ? String(src).split('/').pop().split('?')[0] : '';
    const k = String(msg || '?').slice(0, 150) + (file ? ' @' + file + ':' + (line || 0) + ':' + (col || 0) : '');
    if (errSeen.has(k) || errSeen.size >= 20) return;
    errSeen.add(k); errQueue.push(k);
}
window.addEventListener('error', (e) => noteError(e.message, e.filename, e.lineno, e.colno));
window.addEventListener('unhandledrejection', (e) => noteError('promise: ' + ((e.reason && e.reason.message) || e.reason)));
addEventListener('pagehide', () => { if (running) sendMeta(); });
let gpuNameCache = null;
function gpuName() {
    if (gpuNameCache !== null) return gpuNameCache;
    gpuNameCache = GPU_NAME.slice(0, 90) + (renderer.getContext().getContextAttributes().antialias ? '' : ' (no AA)');
    return gpuNameCache;
}
function sendMeta() {
    const m = { touch: isTouch, fps: fpsWin.n ? Math.round(fpsWin.sum / fpsWin.n) : lastFps, q: getQuality(), errs: errQueue.splice(0, 5) };
    fpsWin.sum = 0; fpsWin.n = 0;
    if (metaFirst) { metaFirst = false; Object.assign(m, { gpu: gpuName(), load: loadSecs, dpr: Math.round(devicePixelRatio * 100) / 100, w: innerWidth, h: innerHeight, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0 }); }
    net.send('meta', m);
}

// ----- the smoothness watch (every half second): the resolution adapts first, then the quality -----
const fpsWatch = { t: 0, avg: 60, low: 0, good: 0, trial: null, cpuUntil: 0, fails: 0, upAt: -99, upFrom: 1, ceil: 1, ceilUntil: 0, holdUntil: 0, lows: 0 };
// a world switch builds things for a moment: the watcher looks away for a few seconds
function holdFpsWatch(secs) { fpsWatch.holdUntil = fpsWatch.t + (secs || 4); fpsWatch.avg = Math.max(fpsWatch.avg, 58); }
let watchOff = false;
function watchFps(fps) {
    if (!running || document.hidden || watchOff) return;
    const w = fpsWatch;
    w.t += 0.5;
    // a single stall (one slow half-second) doesn't count: only two in a row do
    w.lows = fps < 45 ? w.lows + 1 : 0;
    if (w.lows === 1 && fps < 45) return;
    w.avg += (fps - w.avg) * 0.35;
    if (w.t < 3 || w.t < w.holdUntil) return;
    if (w.t > w.ceilUntil) w.ceil = 1;
    if (w.trial) {
        if (w.t - w.trial.at < 2) return;
        if (w.avg < w.trial.fps * 1.06) { setResScale(w.trial.prev); w.fails++; w.cpuUntil = w.t + Math.min(240, 30 * w.fails); } else w.fails = 0;
        w.trial = null;
        return;
    }
    const scale = getResScale();
    // high frame rates first: below 54 a 60 Hz screen is already missing frames
    if (w.avg < 54 && w.t > w.cpuUntil && scale > 0.56) {
        if (w.t - w.upAt < 6) { w.ceil = w.upFrom; w.ceilUntil = w.t + 60; }
        w.trial = { at: w.t, fps: w.avg, prev: scale };
        setResScale(scale * 0.85);
        w.good = 0;
        return;
    }
    if (w.avg >= 57) {
        w.good += 0.5;
        if (w.good >= 6 && scale < w.ceil - 0.01) { w.good = 0; w.upAt = w.t; w.upFrom = scale; setResScale(Math.min(w.ceil, scale / 0.88)); }
    } else w.good = 0;
    if (!autoQualityAllowed()) return;
    w.low = w.avg < 45 && (scale <= 0.56 || w.t < w.cpuUntil) ? w.low + 0.5 : 0;
    if (w.low < 3) return;
    w.low = 0;
    const next = { high: 'medium', medium: 'low' }[getQuality()];
    if (!next) return;
    setQuality(next, true, w.t < 45);
    if (next === 'low') musicLite(true);
    toast('⚙️ Graphics set to ' + (next === 'medium' ? 'Medium' : 'Low') + ' for smoother play', '#7de8ff');
}
// Even frame pacing: on a fast screen (120 Hz and up) a frame that misses the refresh waits for the next one, so
// a game running between half and full rate shows frames of uneven length (a stutter, though the FPS is high).
// When most frames miss and some don't, it draws every other refresh instead: an even 72 on a 144 Hz screen.
const ivs = [];
let refreshMs = 0, paceN = 0, strikes = 0, pacedAt = 0, paced = false, trial = false;
function noteInterval(ms) { if (ms > 2 && ms < 60 && ivs.length < 400) ivs.push(ms); }
function paceFrames() {
    if (!running || document.hidden || isTouch) return;
    const now = performance.now();
    if (paced) { if (now - pacedAt > 30000) { paced = false; skipOdd = false; trial = true; ivs.length = 0; } return; }
    if (ivs.length < 200) return;
    paceN++;
    const s = ivs.slice().sort((a, b) => a - b), p10 = s[Math.floor(s.length * 0.1)];
    refreshMs = refreshMs ? Math.min(refreshMs, p10) : p10;
    const late = s.filter((v) => v > refreshMs * 1.5).length / s.length;
    ivs.length = 0;
    const uneven = refreshMs < 9 && late > 0.25 && late < 0.9;
    strikes = uneven ? strikes + 1 : 0;
    if ((trial && uneven) || (paceN > 3 && strikes >= 2 && fpsWatch.t >= fpsWatch.holdUntil)) {
        paced = true; skipOdd = true; pacedAt = now; strikes = 0;
        console.info('[pace] every other refresh (' + Math.round(500 / refreshMs) + ' FPS), ' + Math.round(late * 100) + '% of frames were late');
    }
    trial = false;
}
const perf = { n: 0, sum: 0, max: 0, last: 0 };
const spikes = [], slowParts = [];
let secAvg = {};
let frameErrors = 0, lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, skipOdd = false, oddFrame = false;
let rafN = 0, frameDt = 0;
// scrolled out of view in a feed (the page doesn't count as hidden then): no sound, nothing worked out or drawn
let offscreen = false;
if ('IntersectionObserver' in window) new IntersectionObserver((es) => { offscreen = !es[es.length - 1].isIntersecting; audioAway(offscreen || connLost); }).observe($('#app'));
function frame(now) {
    requestAnimationFrame(frame);
    if (offscreen) { lastFrame = 0; return; }
    rafN++;
    if (skipOdd) { oddFrame = !oddFrame; if (oddFrame) return; }
    frameDt = (now - (lastFrame || now)) / 1000;
    const dt = Math.min(0.05, frameDt);
    if (lastFrame && !skipOdd) noteInterval(now - lastFrame);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) {
        const fps = fpsFrames / fpsAcc;
        lastFps = Math.round(fps);
        if (running && !document.hidden) { fpsWin.sum += fps; fpsWin.n++; }
        if (showFps) $('#fps').textContent = lastFps + ' FPS';
        if (isTouch && !skipOdd && fps > 100) skipOdd = true;
        // drawing every other refresh only makes sense on a fast screen keeping up: if the refreshes themselves are slow, draw them all
        if (skipOdd && rafN / fpsAcc < 95) { skipOdd = false; paced = false; pacedAt = 0; }
        rafN = 0;
        paceFrames();
        watchFps(fps); fpsAcc = 0; fpsFrames = 0;
    }
    if (lastFrame && now - lastFrame > 45 && spikes.length < 60) spikes.push({ at: Math.round(now), ms: Math.round(now - lastFrame), work: +perf.last.toFixed(1), res: getResScale() });
    lastFrame = now;
    if (!loadingSignaled) { loadingSignaled = true; BX.triggerAllSettings(); }
    if (epochSet) CU.uNow.value = rel(net.now());
    pollGamepad();
    padButtons(dt);
    if (running) {
        const w0 = performance.now();
        try {
            prof.start();
            update(dt);
            prof.mark('update');
            updateCameraAll(dt);
            prof.mark('camera+sky');
            render();
            prof.mark('render');
        } catch (e) {
            if (frameErrors++ < 5) console.error('[frame]', e);
            const at = String((e && e.stack) || '').split('\n').find((l) => /:\d+:\d+/.test(l)) || '';
            noteError('[frame] ' + ((e && e.message) || e), '', 0, 0);
            if (at) noteError('[frame at] ' + at.trim().slice(-120));
        }
        const w = performance.now() - w0;
        perf.n++; perf.sum += w; perf.max = Math.max(perf.max, w); perf.last = w;
        for (let i = 0; i < prof.parts.length; i += 2) secAvg[prof.parts[i]] = (secAvg[prof.parts[i]] || 0) + prof.parts[i + 1];
        secAvg.n = (secAvg.n || 0) + 1;
        if (w > 50 && slowParts.length < 20) { const o = {}; for (let i = 0; i < prof.parts.length; i += 2) o[prof.parts[i]] = +(o[prof.parts[i]] || 0) + +prof.parts[i + 1].toFixed(1); slowParts.push({ at: Math.round(now), ms: Math.round(w), calls: renderer.info.render.calls, prog: renderer.info.programs.length, ...o }); }
    }
}

// =====================================================================================
// Boot: build everything behind the loading screen, join, play (no start menu)
// =====================================================================================
function loadingText(t) { $('#loading').textContent = t; }
let joining = false, joinTask = null, worldReady = null;
async function joinServer() {
    const endpointTask = serverEndpoint();
    endpointTask.catch(() => {});
    await waitForLogin(400);
    const saved = (storageGet('cre1_name') || '').slice(0, 20);
    for (let attempt = 0; ; attempt++) {
        try { return await connect(BX.identity().loggedIn ? '' : saved, attempt === 0 ? await endpointTask : null); } catch (e) {
            if (attempt >= 4) throw e;
            console.warn('[join] attempt', attempt + 1, 'failed:', e && e.message);
            loadingText('Waking up a server…');
            await sleep(2000 * (attempt + 1));
        }
    }
}
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => { const t0 = performance.now(); (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })(); });
}
async function play() {
    if (joining || running) return;
    joining = true;
    $('#connectErr').hidden = true; $('#retryBtn').hidden = true;
    if (!joinTask) joinTask = joinServer();
    initAudio();
    try {
        await worldReady;
        loadingText('Joining a server…');
        $('#loadBar').style.width = '92%';
        BX.loadingStep('Joining a server…');
        await joinTask;
        const t0 = performance.now();
        while (!gotProfile && performance.now() - t0 < 6000) await sleep(50);
    } catch (e) {
        joinTask = null;
        console.error(e);
        joining = false;
        loadingText('');
        $('#connectErr').hidden = false;
        $('#connectErr').textContent = 'Could not reach the game server. Check your connection and try again.';
        $('#retryBtn').hidden = false;
        BX.loadingEnd();
        return;
    }
    joining = false;
    if (connLost) { BX.loadingEnd(); return; }
    // your world (the one you were in last time)
    if (S.world !== view.w) buildView(S.world);
    showGates();
    setProgress();
    running = true;
    S.joinedAt = Date.now();
    if (!me) buildMe();
    me.setCar(S.car || 0);
    me.setTrail(S.trail); me.setAura(S.aura);
    const p = net.room.state.players.get(net.room.sessionId);
    teleport(p ? p.x : W.spawn.x, 0, p ? p.z : W.spawn.z, Math.PI);
    cam.pitch = 0.36;
    loadingText('Almost there…');
    $('#loadBar').style.width = '100%';
    await primeFrames();
    if (connLost) { BX.loadingEnd(); return; }
    // everyone's avatar made behind the loading screen too
    { const t0 = performance.now(); while (avatarsPending() && performance.now() - t0 < 2000) await sleep(30); }
    fpsAcc = 0; fpsFrames = 0;
    // until a song's first loop is rendered it plays note by note (~100 audio nodes a second): fine on a PC, not on
    // a phone or a weak laptop (Low), which waits for the loop in silence
    allowLiveMusic(getQuality() !== 'low');
    startMusic();
    setMusicMode('plaza');
    $('#start').hidden = true;
    $('#start').style.opacity = '';
    $('#hud').hidden = false;
    measureHud();
    updateHud();
    showTips();
    const fresh = !S.steps && !S.pads;
    if (fresh) {
        setTimeout(() => bigText('EVERY STEP IS +1 SPEED!', '#ffe24a'), 500);
        setTimeout(() => toast(isTouch ? '🌋 Up the bridge, straight into the funnel, round the wall past the hole: faster is higher. Mind the hole!' : '🌋 Drive (WASD) up the bridge, straight into the funnel, round the wall past the hole: faster is higher. Mind the hole!', '#ffffff'), 1600);
    } else toast('👋 Welcome back, ' + (S.name || 'Driver') + '!', '#ffffff');
    setTimeout(() => { if (audioSuspended()) toast('🔊 Tap anywhere for sound!', '#7de8ff'); }, 3500);
    // the daily reward: straight away for someone back, after the first crater for someone new
    if (!fresh) setTimeout(offerDaily, 1500);
    canvas.focus();
    loadSecs = Math.round(performance.now() / 100) / 10;
    metaT = 8;
    BX.loadingEnd();
}
async function primeFrames() {
    $('#start').style.opacity = '0.985';
    $('#hud').hidden = false;
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* compiles on first use */ }
    for (let i = 0; i < 4; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
    const gl = renderer.getContext();
    if (!gl.fenceSync) return;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const t0 = performance.now();
    while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 1500) await sleep(15);
    gl.deleteSync(sync);
}
let tipsT0 = 0, tipsT1 = 0;
function showTips() {
    if (isTouch && !padMode) return;
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = padMode
        ? k('L stick', 'Drive') + k('A / RT', 'NITRO') + k('R stick', 'Camera') + k('Y', 'Use') + k('LB', 'Race') + k('D-pad', 'Menus') + k('Start', 'Settings')
        : k('WASD', 'Drive') + k('Space', 'NITRO') + k('Drag', 'Camera') + k('E', 'Use') + k('P', 'Race') + k('T', 'Teleport') + k('V', 'Cars') + k('R', 'Home');
    el.hidden = false; el.style.opacity = 1;
    clearTimeout(tipsT0); clearTimeout(tipsT1);
    tipsT0 = setTimeout(() => { el.style.opacity = 0; }, 12000);
    tipsT1 = setTimeout(() => { el.hidden = true; }, 12900);
}
function unlockAudioOnGesture() {
    // (kept on: a phone call or another app can stop the sound again, and only a touch brings it back)
    const unlock = () => { if (audioSuspended()) resumeAudio(); };
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) addEventListener(ev, unlock, true);
}
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => { const n = parseFloat(String(v)); if (!isFinite(n)) return undefined; return clamp(n > 1 ? n / 100 : n, 0, 1); };
    BX.listenSetting('master_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('master', p); }));
    BX.listenSetting('music_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('music', p); }));
    BX.listenSetting('graphics_quality', embedded((v) => { setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : 'high', true); musicLite(v === 'Low'); }));
    BX.listenSetting('camera_sensitivity', embedded((v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); }));
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        if (event === 'respawn_request') { if (running) goTo('spawn'); }
        else if (event === 'open_daily') openPanel('daily');
        else if (event === 'chat_message_sent' && data) net.send('chat', { text: String(data) });
        else if (event === 'play_emote' && data) { if (me) playEmoteOn(me.blox, String(data)); net.send('emote', { id: String(data) }); }
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
}
// The HUD's words and emoji painted for a few frames behind the loading screen, in the fonts and sizes
// the game uses: the first time a glyph (an emoji above all, on Windows) is drawn costs a long pause.
async function warmHudText() {
    const lines = [['🔄✨🌈🌍⚙️🎁❄️🌟🧰🚀🌙🌋🔥🔁🔧📈🎲🐾🥚🤝⏩🏎️🛞🌀', 2.3], ['🔊🔇🏆🎯✅⭐🎡🏁🎟️🏠📍🚩🍀♥', 1.8], ['🥉🥈🥇🔒🔓💬👋🎉📶💎⚡⬆️🏳️🎮⏱️', 1.4], ['⚡🍀🏠🎟️✓✕−+🎮🚩📍💎🏆🚀🌀🔒', 2.6]];
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:0;width:3000px;opacity:0.01;pointer-events:none;z-index:1';
    d.innerHTML = lines.map(([em, s]) => `<div style="font-size:${s}rem;white-space:nowrap">${em}</div>`).join('')
        + [['var(--chunky)', 3, 400, 'o'], ['var(--chunky)', 2, 400, 'o'], ['var(--font)', 2.3, 700, 'o'], ['var(--font)', 1.1, 700, 'o1']]
            .map(([f, s, w, c]) => `<div class="${c}" style="font-family:${f};font-size:${s}rem;font-weight:${w};white-space:nowrap">LEVEL UP Level SPEED 2X TOP · MAX OK PETS TRAIL &amp; GLOW TUNING REBIRTHS x / STEP XP RACE CLAIM! CRATER 0123456789? FREE! Shop SHOP Rebirth Tuning Cars Pets Teleport Train WINS OPEN! ALL YOUR BOOSTS: SPEEDO Top speed: Reach: STATS SKIP FREE SPIN Next in SPIN! Eruption Squad Boost: MIN left x2 +1.5 K M B / % NITRO ESCAPED!</div>`).join('');
    document.body.appendChild(d);
    for (let i = 0; i < 3; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 150); });
    d.remove();
    // and once in a canvas (name tags, chat bubbles and signs are drawn there)
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 140;
    const cx = cv.getContext('2d');
    for (const px of [36, 44, 52, 70, 76]) { cx.font = '700 ' + px + 'px Fredoka, "Arial Rounded MT Bold", sans-serif'; cx.fillText('💬💎🔒🔓🏆🚀⭐✓🥚🌋 Lv. 0123456789 Speed Wins Crater', 4, 100); }
}
// The sound bank: made by a worker on another core while the world is built here (on a weak phone that was over a second of loading
// on this thread). Should the worker not start, or not answer in time, it's made here as before.
function startSounds(low) {
    const here = () => buildAsmr(pause, low);
    let w = null;
    try { w = new Worker(new URL('./asmr-worker.js', import.meta.url), { type: 'module' }); } catch (e) { return null; }
    return new Promise((done) => {
        let over = false;
        const end = (res) => { if (over) return; over = true; clearTimeout(tm); try { w.terminate(); } catch (e) { /* gone */ } if (res) { adoptAsmr(res, low); done(); } else here().then(done, done); };
        const tm = setTimeout(() => end(null), 20000);
        w.onmessage = (e) => end(e.data && e.data.bank ? e.data : null);
        w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); end(null); };
        w.postMessage({ low });
    });
}
async function prepareWorld() {
    const low = getQuality() === 'low';
    const sounds = startSounds(low);
    const step = (t, k) => { loadingText(t); BX.loadingStep(t); if (k) $('#loadBar').style.width = Math.round(k * 100) + '%'; };
    step('Loading fonts…', 0.08);
    try { await Promise.race([Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('400 40px "Lilita One"')]), sleep(2500)]); } catch (e) { /* fallback font */ }
    await warmHudText();
    step('Digging the craters…', 0.18);
    buildView(0);
    SH.initShadows();
    await pause();
    step('Polishing the cars…', 0.34);
    try { await makeCarIcons(pause, low); } catch (e) { console.warn('[icons]', e); }
    installIcons();
    step('Filling the tanks…', 0.44);
    if (!sounds) await buildAsmr(pause, low);
    musicLite(low);
    prerenderMusic();
    // every HUD screen and panel painted once, invisibly (the browser compiles how to draw them now)
    step('Checking the tyres…', 0.58);
    {
        const hud = $('#hud');
        hud.hidden = false; hud.classList.add('warmui');
        measureHud();
        const endPanels = warmPanels(low);
        for (let i = 0; i < (low ? 2 : 4); i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
        endPanels();
        hud.classList.remove('warmui'); hud.hidden = true;
    }
    // the warm-up: every shader the game uses (the islands' batches, the craters' moving things, the cars and their wheels, the
    // pets, a whole race with its lava, every effect) compiled and drawn once now, not in play
    step('Starting the engines…', 0.76);
    const extras = [fxWarmGroup()];
    for (const g of extras) { g.position.set(0, -60, 0); scene.add(g); }
    beginPals(); palsWarm();
    wheelsWarm(scene, low);
    let warmA = null, warmCar = null;
    try { warmA = buildArena(arenaPlan(7, 14), 0, SPOT_COL, low, 0); warmA.group.position.set(0, -300, 0); warmA.group.updateMatrixWorld(true); warmA.showAll(); } catch (e) { console.warn('[warm]', e); }
    try {
        warmCar = new T.Mesh(carShape(0, low).geo, carMaterial());
        warmCar.position.set(0, -60, 6); warmCar.castShadow = !low; scene.add(warmCar); extras.push(warmCar);
        // (the avatar's shaders by stand-ins: its model and skins may come from their server long after this)
        const standIns = avatarStandIns(!low); standIns.position.set(0, -60, 14); scene.add(standIns); extras.push(standIns);
        const base = await Promise.race([loadBase(), sleep(4000)]);
        const a = base ? await createAvatar(null) : null;
        if (a) { a.root.position.set(0, -60, 10); a.update(1 / 60, { t: 0, pose: 'kart', steer: 0, bump: 0 }); scene.add(a.root); extras.push(a.root); }
    } catch (e) { /* the avatar's shaders compile when it first shows */ }
    fxShowAll(true);
    if (view && view.stageFx) view.stageFx.showAll(true);
    camera.position.set(0, 60, 130); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    gpuName();
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* later */ }
    const culled = [];
    scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    render();
    for (const o of culled) o.frustumCulled = true;
    await pause();
    fxShowAll(false);
    if (view && view.stageFx) view.stageFx.showAll(false);
    for (const g of extras) scene.remove(g);
    if (warmA) warmA.dispose();
    beginPals(); endPals();
    beginWheels(scene, low); endWheels();
    setMood(WORLDS[view.w].mood, true);
    if (sounds) await sounds;
    console.info('[prewarm] ready,', renderer.info.programs.length, 'shaders');
}
async function boot() {
    BX.initBloxity();
    joinTask = joinServer();
    joinTask.catch(() => {});
    loadBase().catch(() => {});
    worldReady = prepareWorld();
    wirePortalSettings();
    wirePortalEvents();
    BX.onIdentity((id) => {
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    addEventListener('pagehide', () => { try { if (net.room) net.room.leave(true); } catch (e) { /* closing anyway */ } });
    $('#retryBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// =====================================================================================
// QA: the autopilot and hooks for the test scripts
// =====================================================================================
if (import.meta.env.DEV || import.meta.env.VITE_QA) {
    window.__qa = {
        P, S, cam, net, scene, camera, T, Raycaster: T.Raycaster, me: () => me, renderer: () => renderer, audio: () => audioDebug(), actions, view: () => view, match: () => A,
        state: () => {
            const c = P.c, k = stageAt(c.z);
            return {
                world: S.world, x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), ry: +c.ry.toFixed(2), air: c.air, zone: c.zone, u: +(c.u ?? -1).toFixed(3), vf: +(c.vf || 0).toFixed(1), v: +Math.hypot(c.vx, c.vz).toFixed(1), top: +P.top.toFixed(1), slip: +(c.slip || 0).toFixed(2),
                wins: S.wins, gems: S.gems, lv: S.lv, xp: S.xp, speed: S.powerShown, rebirths: S.rebirths, car: S.car, steps: S.steps, cleared: S.cleared, pads: S.pads, bests: S.bests, stage: k, deep: P.deep, out: [...P.out], tread: P.tread,
                maxWalk: +maxWalk(S).toFixed(1), rebirthPct: rebirthPct(S), snaps: P.snaps, programs: renderer.info.programs.length, prompt: activePrompt && activePrompt.label(), q: getQuality(), others: remotes.size, qi: S.qi, queued: !!S.queued,
                reach: k >= 0 && k < WALLS_N ? +reachU(islandOf(k), maxWalk(S)).toFixed(3) : -1, need: k >= 0 && k < WALLS_N ? +needV(islandOf(k), 1).toFixed(1) : 0,
                match: A ? { phase: A.phase, lv: A.lv, w: A.w, spot: A.spot, secs: A.D.secs, done: A.done, out: A.out, scores: A.scores, pct: +A.pct.toFixed(2), lavaY: +(A.lavaY || 0).toFixed(1), R: A.plan.B.R, H: A.plan.B.H } : null,
                matches: S.matches, matchWins: S.matchWins, hatched: S.hatched, team: S.team,
            };
        },
        auto: (on) => { P.auto = on === false ? null : true; },
        key: (code, down) => { keys[code] = !!down; },
        dash,
        teleport: (x, y, z, yaw, open) => { net.send('qa', { tp: [x, y, z], tpOpen: !!open }); newLife(); if (open) { for (let k = 0; k < WALLS_N; k++) P.out.add(k); showGates(); } teleport(x, y, z, yaw); },
        look: (off, pitch, dist) => { camOff = off; camHold = 1e9; cam.pitch = pitch; if (dist !== undefined) cam.dist = dist; camSnap = true; },
        quality: (q) => setQuality(q),
        give: (o) => net.send('qa', o),
        send: (type, m) => net.send(type, m || {}),
        panel: (k, tab) => openPanel(k, tab),
        close: () => { let n = 0; while (closeTop() && n < 9) n++; return n; },
        world: (w) => switchWorld(w, W.spawn.x, W.spawn.z),
        play: (m) => { qaMap = m || null; pressPlay(); },
        perf: (reset) => { const r = { frames: perf.n, avgMs: +(perf.sum / Math.max(1, perf.n)).toFixed(2), maxMs: +perf.max.toFixed(1), fps: lastFps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, paced: skipOdd }; if (reset) { perf.n = 0; perf.sum = 0; perf.max = 0; } return r; },
        diag: () => { renderer.info.reset(); renderer.info.autoReset = false; render(); const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio: renderer.getPixelRatio(), programs: renderer.info.programs.length }; renderer.info.autoReset = true; return r; },
        errors: () => [...errSeen],
        noWatch: (on) => { watchOff = on === undefined ? true : !!on; },
        hud: (on) => { $('#hud').style.display = on ? '' : 'none'; $('#touch').style.display = on ? '' : 'none'; },
        mood: (m) => setMood(m, true),
        res: (k) => setResScale(k),
        gpu: () => gpuName(),
        spikes: () => spikes.splice(0),
        slow: () => slowParts.splice(0),
        sections: () => { const n = secAvg.n || 1, o = {}; for (const k in secAvg) if (k !== 'n') o[k] = +(secAvg[k] / n).toFixed(2); secAvg = {}; return o; },
        avatars: () => avatarsPending(),
        remotes: () => remotes,
        delays: () => [...remotes.values()].map((r) => Math.round(r.track.delay)),
        ui: { toast, bigText, popup, levelUp, hatchShow, flyWins },
        padNav,
        guideTarget,
        checkpoint, islandOf, stagePlan: (k) => stagePlan(S.world || 0, k), summit,
        // (how far the nearest boulder on the wall of the crater you're in is)
        rockGap: () => { const c = P.c, k = stageAt(c.z); if (k < 0 || k >= WALLS_N) return 1e9; let d = 1e9; for (const o of stagePlan(S.world || 0, k).rocks) { const u = rockU(o, net.now() / 1000); if (u < 0) continue; const p = wallPoint(k, o.a, u); d = Math.min(d, Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z)); } return d; },
        tpPost: (i) => { const sp = postSpot(i || 0); net.send('qa', { tp: [sp.x, 0, sp.z + BELT.l / 2 + 4] }); teleport(sp.x, 0, sp.z + BELT.l / 2 + 4, Math.PI); },
    };
}
void panelIs; void refreshPanels; void toggleMusic; void popup; void flyWins; void sun; void matchInfo;
