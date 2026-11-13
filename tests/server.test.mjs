// The whole loop and its guards, headless: starts its own server (QA=1, a temporary data folder) and plays it over the
// network as real clients do. Run: npm --prefix tests run server
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import {
    CFG, STEP, SPEED_PACKS, squadOf, WALLS_N, WORLDS, CARS, TRAILS, AURAS, POSTS, UPGRADES, JAWBREAKERS, upgradeCost, xpNeed, xpGain, maxWalk, rebirthLv, rebirthMult, padWins, FIRST_PAD, stepGain, CODES, GIFTS, DAILY,
    rewardSpeed, strideOf, matchInfo, recLevel,
} from '../shared/config.js';
import { W, postSpot, checkpoint, islandOf, heightAt, reachU, needV, BELT } from '../shared/world.js';
import { arenaPlan, startSpot, surgeAt, topAt, arenaNeed } from '../shared/arena.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.TEST_PORT || 3098), URL_ = 'http://localhost:' + PORT;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cre-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(cond, what) { if (cond) { pass++; console.log('  ok  ' + what); } else { fail++; console.log('FAIL  ' + what); } }

class Bot {
    constructor(name) { this.name = name; this.msgs = {}; this.p = {}; this.x = 0; this.z = W.spawn.z; this.y = 0; this.seq = 0; this.snaps = 0; }
    async join(extra) {
        const c = new Client(URL_);
        this.room = await c.joinOrCreate('run', { uid: 'test_' + this.name, name: this.name, ...(extra || {}) });
        const R = this.room;
        for (const t of ['hello', 'pong', 'sq', 'toast', 'broke', 'code', 'boards', 'reward', 'levelup', 'padok', 'warped', 'reborn', 'warp', 'spun', 'bought', 'taskdone', 'questdone', 'hatched', 'authed', 'emote', 'chat', 'mQueue', 'mStart', 'mSync', 'mNone', 'mJoined', 'mLeft', 'mGo', 'mScore', 'mOut', 'mDone', 'mTime', 'mEnd', 'mBack']) R.onMessage(t, (m) => { (this.msgs[t] = this.msgs[t] || []).push(m); });
        R.onMessage('profile', (m) => { Object.assign(this.p, m); this.profiles = (this.profiles || 0) + 1; });
        R.onMessage('lite', (m) => { Object.assign(this.p, m); });
        R.onMessage('snap', (m) => { this.snaps++; this.x = m.x; this.y = m.y; this.z = m.z; });
        await this.wait(() => this.p.now);
        const me = R.state.players.get(R.sessionId);
        this.x = me.x; this.z = me.z;
        return this;
    }
    send(t, m) { this.room.send(t, m || {}); }
    async wait(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms ?? 5000)) { const v = fn(); if (v) return v; await sleep(15); } return null; }
    got(t) { return (this.msgs[t] || []).length; }
    last(t) { const l = this.msgs[t]; return l && l[l.length - 1]; }
    clear(t) { this.msgs[t] = []; }
    // (in the world: on the ground where it is, unless a height's given)
    move(x, z, o) { o = o || {}; const y = o.y ?? heightAt(this.p.world || 0, x, z); this.x = x; this.y = y; this.z = z; this.send('move', { x, y, z, ry: 0, a: o.a ?? 1, ts: Date.now(), post: o.post, v: o.v }); }
    // a QA teleport: the next move is checked from there (and a new life starts there)
    async tp(x, z, open) { const y = heightAt(this.p.world || 0, x, z); this.send('qa', { tp: [x, y, z], tpOpen: !!open }); this.x = x; this.z = z; this.y = y; await sleep(60); this.move(x, z); await sleep(60); }
    // drive in a straight line to (x, z) at v studs a second, a move every 100 ms
    async run(x, z, v) {
        const sx = this.x, sz = this.z, d = Math.hypot(x - sx, z - sz), n = Math.max(1, Math.ceil(d / ((v || 30) * 0.1)));
        for (let i = 1; i <= n; i++) { this.move(sx + (x - sx) * i / n, sz + (z - sz) * i / n); await sleep(100); }
    }
    step(n, post) { this.send('step', { n, post: post ?? -1, s: ++this.seq }); }
    // n steps on a dyno at a rate the bucket allows
    async tread(n, post) { for (let i = 0; i < n; i += 3) { this.step(Math.min(3, n - i), post); await sleep(330); } await sleep(300); }
    me() { return this.room.state.players.get(this.room.sessionId); }
    leave() { return this.room.leave(); }
}

const srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(ROOT, 'server'), env: { ...process.env, PORT: String(PORT), QA: '1', DATA_DIR: dataDir, NO_BOTS: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(d); });
srv.stderr.on('data', (d) => { if (!/SAVE_SECRET/.test(String(d))) process.stderr.write(d); });
for (let i = 0; i < 60; i++) { try { const r = await fetch(URL_ + '/health'); if (r.ok) break; } catch (e) { /* not yet */ } await sleep(150); }

try {
    console.log('--- a new player');
    const a = await new Bot('alice').join();
    ok(a.p.lv === 1 && a.p.speed === 0 && a.p.wins === 0 && a.p.rebirths === 0 && a.p.xp === 0 && a.p.car === 0, 'starts at Level 1 in the Scrap Kart with nothing');
    ok(a.got('boards') === 1, 'told the leaderboards');
    a.send('ping', { c: 123 });
    await a.wait(() => a.last('pong'));
    ok(a.last('pong').c === 123 && Math.abs(a.last('pong').s - Date.now()) < 2000, 'ping answers with the server\'s clock');
    let bots = 0;
    a.room.state.players.forEach((p) => { if (p.bot) bots++; });
    ok(bots === CFG.bots - 1, 'a bot goes home for each real player (' + bots + ' left)');

    console.log('--- the bots drive up to the craters, never faster than their Level');
    {
        a.send('qa', { botsRun: true });
        let inRun = 0, tooFast = 0, maxRatio = 0, under = 0;
        const t0 = Date.now();
        while (Date.now() - t0 < 12000) {
            a.room.state.players.forEach((p) => {
                if (!p.bot || p.match) return;
                if (p.z < W.plaza.z0 - 4) { inRun++; if (p.y < heightAt(0, p.x, p.z) - 1) under++; }
                if (p.anim === 1 && p.spd > 0) { maxRatio = Math.max(maxRatio, p.spd / maxWalk({ lv: p.lv })); if (p.spd > maxWalk({ lv: p.lv }) + 0.05) tooFast++; }
            });
            if (inRun > 40 && Date.now() - t0 > 6000) break;
            await sleep(100);
        }
        ok(inRun > 0, 'they go up the bridge and into the craters (' + inRun + ' looks at one out there)');
        ok(tooFast === 0 && maxRatio > 0.5, 'never faster than their Level drives (at most x' + maxRatio.toFixed(2) + ' of it)');
        ok(under === 0, 'and never under the ground');
    }

    console.log('--- steps: +1 Speed and +1 XP');
    a.step(3);
    await sleep(300);
    ok(a.p.steps === 0, 'steps standing still count for nothing (' + a.p.steps + ')');
    await a.run(a.x, a.z - 30, 20);
    a.step(4);
    await a.wait(() => a.p.steps >= 4);
    await sleep(100);
    ok(a.p.steps === 4 && a.p.speed === 4 * STEP, 'steps after driving 30 studs: +1 Speed each (' + a.p.speed + ')');
    { let lv = 1, xp = 0; for (let i = 0; i < 4; i++) { xp += xpGain({ lv }); while (xp >= xpNeed(lv)) { xp -= xpNeed(lv); lv++; } } ok(a.p.lv === lv && Math.abs(a.p.xp - xp) < 0.2, 'and +1 XP each (Level ' + a.p.lv + ', ' + a.p.xp + ' XP)'); }
    ok(a.p.need === xpNeed(a.p.lv) && xpNeed(1) === 20 && xpNeed(2) === 23, 'told what the next Level needs (' + a.p.need + ')');
    ok(a.p.ack >= 2, 'the answer says which steps it has heard');
    const st0 = a.p.steps;
    a.step(30);
    await sleep(400);
    ok(a.p.steps - st0 <= Math.ceil(30 / (strideOf(CFG.walk) * 0.7)), 'no more steps than the strides driven (' + (a.p.steps - st0) + ')');
    a.send('step', { n: 9999, post: -1, s: ++a.seq });
    await sleep(300);
    ok(a.p.steps < 45, 'a batch is cut down to 30 steps at most');

    console.log('--- dynos');
    const t0 = postSpot(0), t1 = postSpot(1);
    await a.tp(t0.x, t0.z + 1);
    a.move(t0.x, t0.z + 1, { a: 3, post: 0 });
    await sleep(80);
    const sp0 = a.p.speed, x0 = a.p.xp, lv0 = a.p.lv, n0 = a.p.steps;
    await a.tread(9, 0);
    ok(a.p.speed - sp0 >= 8 && Math.abs((a.p.speed - sp0) - (a.p.steps - n0)) < 1e-6, 'on the ' + POSTS[0].name + ': +1 Speed a step (' + (a.p.speed - sp0) + ')');
    ok(a.p.lv > lv0 || a.p.xp > x0, 'and XP (Level ' + a.p.lv + ')');
    ok(a.p.tread >= 8, 'dyno steps counted (' + a.p.tread + ')');
    ok(a.me().post === 0 && a.me().anim === 3, 'everyone sees you on it');
    const sp1 = a.p.speed;
    await a.tread(6, 1);
    ok(a.p.speed - sp1 <= 1, 'the ' + POSTS[1].name + ' is shut until you have earned its Wins (' + (a.p.speed - sp1) + ')');
    await a.tp(t1.x + 40, t1.z + 30);
    const sp2 = a.p.speed;
    await a.tread(6, 0);
    ok(a.p.speed - sp2 <= 1, 'a dyno counts only parked on it');
    {
        // (the dyno's own bucket: a flood of steps counts no faster than flat out on it)
        await a.tp(t0.x, t0.z + 1);
        a.move(t0.x, t0.z + 1, { a: 3, post: 0 });
        await sleep(2600);
        const n1 = a.p.steps;
        for (let i = 0; i < 20; i++) a.step(30, 0);
        await sleep(1000);
        ok(a.p.steps - n1 <= 14 + Math.ceil(CFG.treadSprint * 1.12 * 1.2), 'a flood of dyno steps counts no faster than its rollers turn (' + (a.p.steps - n1) + ')');
    }

    console.log('--- the move guard');
    const I0 = islandOf(0), I1 = islandOf(1);
    await a.tp(0, 90);
    let sn = a.snaps;
    a.move(0, 20);
    await sleep(200);
    ok(a.snaps === sn + 1 && a.z === 90, 'a move further than your Level drives is sent back');
    await sleep(400);
    sn = a.snaps;
    a.move(W.plaza.x1 + 30, 90);
    await sleep(200);
    ok(a.snaps > sn, 'off the edge of the world: sent back');
    await a.tp(0, 90);
    await sleep(400);
    sn = a.snaps;
    a.move(0, 89, { y: -30 });
    await sleep(200);
    ok(a.snaps > sn, 'under the ground: sent back');
    // up the bridge and onto the first island's landing: fine. There's no way round the rim: off the landing, round the side of the
    // crater, there's nothing to be on
    await a.tp(0, W.plaza.z0 + 4);
    sn = a.snaps;
    await a.run(0, I0.zS - 4, 30);
    ok(a.snaps === sn && Math.abs(a.y - I0.E) < 0.01, 'up the bridge onto the first island (' + I0.E + ' studs up): fine');
    const rim = (ang, out) => [I0.cx + Math.sin(ang) * (I0.R + out), I0.cz + Math.cos(ang) * (I0.R + out)];
    await a.run(0, I0.cz + I0.R + 4, 30);
    ok(a.snaps === sn, 'onto the landing at the lip: fine');
    await a.run(...rim(1.6, 6), 30);
    await sleep(150);
    ok(a.snaps > sn, 'on round the rim, where there is no deck: sent back');
    // the far crescent by a jump (not through the funnel): no escape; and its gate is shut
    const north = [0, I0.cz - I0.R - 5];
    await a.tp(...north);
    a.clear('padok');
    a.send('pad', { k: 0 });
    await sleep(200);
    ok(a.got('padok') === 0, 'on the far crescent without having been through the funnel: nothing');
    sn = a.snaps;
    await a.run(0, I0.zN - 12, 20);
    await sleep(150);
    ok(a.snaps > sn && a.z > I0.zN - 1, 'and out its gate without escaping the crater: sent back');

    console.log('--- escaping a crater');
    const w0 = a.p.wins;
    // straight off the landing over the lip onto the wall, round it (by the east), and out onto the far crescent
    await a.tp(0, I0.zS - 4);
    sn = a.snaps;
    await a.run(0, I0.cz + I0.R - 4, 30);
    const rW = I0.r0 + (I0.R - I0.r0) * 0.8, mid = [I0.cx + rW, I0.cz];
    await a.run(...mid, 30);
    ok(a.snaps === sn && a.y > I0.E - I0.H + 3 && a.y < I0.E - 1, 'over the lip and round the wall of the funnel (' + a.y.toFixed(1) + ' studs up): fine');
    await a.run(0, I0.cz - I0.R + 4, 30);
    await a.run(...north, 30);
    ok(a.snaps === sn, 'and out onto the far crescent: fine');
    a.send('pad', { k: 0 });
    await a.wait(() => a.got('padok'));
    const pk = a.last('padok');
    await a.wait(() => a.p.wins >= w0 + pk.wins, 1500);
    ok(pk && pk.k === 0 && pk.first && pk.wins === padWins(0, 0) * FIRST_PAD && a.p.wins >= w0 + pk.wins, 'out of Crater 1: ' + (pk && pk.wins) + ' Wins (x' + FIRST_PAD + ' the first time)');
    await a.wait(() => a.p.bests && a.p.bests[0] === 1);
    ok(a.p.bests[0] === 1 && a.p.cleared === 1, 'counted: 1 crater escaped');
    sn = a.snaps;
    await a.run(0, I0.zN + 5, 30);
    await a.run(0, I1.zS + 10, 30);
    ok(a.snaps === sn, 'and its gate is open: on over the next bridge');
    // straight back in and out: the gate stays open, no Wins again so soon
    await a.tp(0, I0.zS - 4, true);
    await a.run(...mid, 40);
    await a.run(...north, 40);
    a.clear('padok');
    a.send('pad', { k: 0 });
    await a.wait(() => a.got('padok'));
    ok(a.last('padok').again && a.last('padok').wins === 0, 'out again within ' + CFG.padCool + ' s: no Wins yet');
    {
        // a crater your Level can't get across: being on its far crescent after its wall pays nothing (the server works out what your top speed holds)
        const k = 5, I = islandOf(k);
        ok(reachU(I, maxWalk(a.p) * CFG.dashK * 1.12 * 1.06) < 0.985 && needV(I, 1) > maxWalk(a.p), 'Crater ' + (k + 1) + ' wants ' + needV(I, 1).toFixed(0) + ' studs/s at its rim (Level ' + recLevel(0, k) + '); you top out at ' + maxWalk(a.p).toFixed(0));
        const low = I.r0 + (I.R - I.r0) * 0.3;
        a.send('qa', { tp: [I.cx + low, heightAt(0, I.cx + low, I.cz), I.cz], tpOpen: true });
        a.x = I.cx + low; a.z = I.cz;
        await sleep(80);
        a.move(I.cx + low, I.cz - 3);
        await sleep(120);
        a.clear('padok');
        // (a cheat: from low on the wall to the far crescent in two moves the guard lets through one after another)
        a.send('qa', { tp: [0, I.E, I.cz - I.R - 5], tpOpen: false });
        await sleep(80);
        a.send('pad', { k });
        await sleep(300);
        ok(a.got('padok') === 0, 'so a jump to its far crescent pays nothing');
    }

    console.log('--- spending and rewards');
    a.send('qa', { wins: 5000, gems: 2000 });
    await a.wait(() => a.p.gems >= 2000);
    const u0 = UPGRADES[0], w1 = a.p.wins;
    a.send('upgrade', { id: u0.id });
    await a.wait(() => a.p.ups && a.p.ups[u0.id] === 1);
    ok(a.p.ups[u0.id] === 1 && a.p.wins <= w1 - upgradeCost(u0, 0) + 30, u0.name + ' bought for ' + upgradeCost(u0, 0) + ' Wins');
    const g1 = stepGain(a.p, false, 0);
    a.send('car', { i: 1 });
    await a.wait(() => a.p.car === 1 && a.me().car === 1);
    ok(a.p.car === 1 && a.p.cars[CARS[1].id] && a.me().car === 1, 'the ' + CARS[1].name + ' bought for ' + CARS[1].wins + ' Wins, and you\'re driving it');
    ok(Math.abs(stepGain(a.p, false, 0) - g1 * CARS[1].mult) < 1e-9, 'every step now x' + CARS[1].mult + ' Speed');
    const wc = a.p.wins;
    a.send('car', { i: 0 }); await a.wait(() => a.p.car === 0);
    a.send('car', { i: 1 }); await a.wait(() => a.p.car === 1);
    ok(a.p.wins === wc, 'a car you own is free to switch to');
    const gemCar = CARS.findIndex((c) => c.gems), gg = a.p.gems;
    a.send('car', { i: gemCar });
    await a.wait(() => a.p.car === gemCar);
    ok(a.p.car === gemCar && a.p.gems <= gg - CARS[gemCar].gems + 60, 'the ' + CARS[gemCar].name + ' for ' + CARS[gemCar].gems + ' Gems');
    a.send('car', { i: 9 });
    await a.wait(() => a.got('broke'));
    ok(a.p.car === gemCar && a.last('broke').cur === 'wins', 'a car you can\'t afford: told how much more');
    a.send('trail', { i: 1 }); await a.wait(() => a.p.trail === 1);
    a.send('aura', { i: 1 }); await a.wait(() => a.p.aura === 1 && a.me().trail === 1);
    ok(a.p.trail === 1 && a.p.aura === 1 && a.me().trail === 1, TRAILS[1].name + ' and ' + AURAS[1].name + ' bought and worn');
    const gp = POSTS.findIndex((c) => c.gems);
    a.send('post', { i: gp });
    await a.wait(() => a.p.posts && a.p.posts[POSTS[gp].id]);
    ok(a.p.posts[POSTS[gp].id] === 1, 'the ' + POSTS[gp].name + ' opened for Gems');
    a.send('hatch', { j: 0, n: 3 });
    await a.wait(() => a.got('hatched'));
    ok(a.last('hatched').got.length === 3 && a.p.hatched === 3 && a.p.team.length === 3, 'three ' + JAWBREAKERS[0].name + 's hatched; the pets go on your team');
    a.send('daily');
    await a.wait(() => a.p.daily && a.p.daily.streak === 1);
    ok(a.p.daily.streak === 1, 'the daily reward, once');
    const gd = a.got('reward');
    a.send('daily'); await sleep(200);
    ok(a.got('reward') === gd, 'and not twice a day');
    a.send('gift', { i: 0 }); await sleep(200);
    ok(!a.p.gifts[0], 'a playtime gift isn\'t ready before its time');
    a.send('qa', { playSecs: GIFTS[0].min * 60 + 5 }); await sleep(100);
    a.send('gift', { i: 0 });
    await a.wait(() => a.p.gifts && a.p.gifts[0]);
    ok(a.p.gifts[0] === true, 'and is after ' + GIFTS[0].min + ' minutes');
    const code = Object.keys(CODES)[0];
    a.send('code', { code: code.toLowerCase() });
    await a.wait(() => a.got('code'));
    ok(a.last('code').ok, 'the code ' + code + ' works');
    a.send('code', { code }); await a.wait(() => a.got('code') === 2);
    ok(!a.last('code').ok, 'once');
    a.send('qa', { spins: 1 }); await sleep(100);
    a.send('spin');
    await a.wait(() => a.got('spun'));
    ok(a.got('spun') === 1 && a.p.spins === 0, 'the wheel spins and pays');
    ok(a.p.qi >= 2 && a.got('questdone') >= 2, 'quests pay as they\'re done (' + a.p.qi + ' so far)');
    const sv = a.p.speed, gv = a.p.gems, pk0 = SPEED_PACKS[0];
    a.send('spack', { i: 0 });
    await a.wait(() => a.p.gems <= gv - pk0.gems);
    ok(a.p.speed >= sv + rewardSpeed({ speed: pk0.sp }, a.p.lv) * 0.5, 'a Speed pack for ' + pk0.gems + ' Gems (+' + (a.p.speed - sv) + ' Speed)');
    a.send('spack', { i: 7 }); await sleep(150);
    a.send('x2'); await a.wait(() => a.p.x2Until > Date.now());
    ok(a.p.x2Until > Date.now(), 'x2 Speed for ' + CFG.boostP2Gems + ' Gems');

    console.log('--- SKIP and the quick ways round');
    await a.tp(0, 100);
    const gs = a.p.gems;
    a.clear('warped');
    a.send('skip'); await sleep(250);
    ok(a.p.gems === gs && a.got('warped') === 0, 'SKIP at Base Camp: refused');
    await a.tp(0, I0.zS - 4);
    await sleep(900);
    a.send('skip');
    await a.wait(() => a.got('warped'));
    ok(a.last('warped') && Math.abs(a.last('warped').z - checkpoint(1).z) < 0.01 && a.last('warped').k === 1 && a.p.gems === gs - CFG.skipGems, 'SKIP in Crater 1: to the top of Crater 2\'s bridge for ' + CFG.skipGems + ' Gems');
    a.x = checkpoint(1).x; a.z = checkpoint(1).z; a.move(a.x, a.z);
    await sleep(150);
    sn = a.snaps;
    await a.run(I1.cx, I1.cz, 40);
    ok(a.snaps === sn, 'and you can drop into it');
    await a.tp(0, checkpoint(WALLS_N - 1).z, true);
    await sleep(900);
    const gl = a.p.gems;
    a.send('skip'); await sleep(250);
    ok(a.p.gems === gl, 'the last crater can\'t be skipped');
    a.clear('warped');
    await sleep(700);
    a.send('qa', { reach: 3 }); await sleep(80);
    a.send('warp', { to: 'stage', k: 9 });
    await a.wait(() => a.got('warped'));
    ok(a.last('warped').k === 3 && Math.abs(a.last('warped').z - checkpoint(3).z) < 0.01, 'TELEPORT goes no further than you\'ve reached this rebirth (Crater 4)');
    await sleep(800);
    a.send('warp', { to: 'post' });
    await a.wait(() => a.last('warped').z > 60);
    ok(Math.abs(a.last('warped').x - postSpot(gp + 1 < POSTS.length && a.p.posts[POSTS[gp + 1].id] ? gp + 1 : gp).x) < 1 && a.last('warped').z > postSpot(0).z + BELT.l / 2, 'TRAIN goes to your best dyno');

    console.log('--- rebirth and the worlds');
    a.send('qa', { lv: rebirthLv(0) - 1 });
    await a.wait(() => a.p.lv === rebirthLv(0) - 1);
    a.send('rebirth'); await sleep(200);
    ok(a.p.rebirths === 0, 'below Level ' + rebirthLv(0) + ': no rebirth');
    a.send('qa', { lv: rebirthLv(0), speed: 999 });
    await a.wait(() => a.p.lv === rebirthLv(0));
    const wr = a.p.wins, gr = a.p.gems;
    a.send('rebirth');
    await a.wait(() => a.got('reborn'));
    await a.wait(() => a.p.rebirths === 1);
    ok(a.p.rebirths === 1 && a.p.lv === 1 && a.p.speed === 0 && a.p.xp === 0 && a.p.wins === wr && a.p.gems === gr, 'rebirth at Level ' + rebirthLv(0) + ': back to Level 1 and 0 Speed, and it costs nothing');
    ok(a.last('reborn').next === rebirthLv(1), 'the next one wants Level ' + rebirthLv(1));
    ok(a.p.ups[u0.id] === 1 && a.p.hatched === 3 && a.p.trail === 1 && a.p.car === gemCar && a.p.cars[CARS[1].id], 'tuning, pets, trails and cars kept');
    ok(stepGain(a.p, false, 0) > stepGain({ ...a.p, rebirths: 0 }, false, 0) && xpGain(a.p) > xpGain({ ...a.p, rebirths: 0 }), 'every step x' + rebirthMult(1) + ' Speed and XP');
    a.send('world', { w: 1 }); await sleep(200);
    ok(a.p.world === 0, 'the next world is shut until the last crater is escaped');
    a.send('qa', { best: WALLS_N, rebirths: 2 }); await sleep(100);
    a.send('world', { w: 1 });
    await a.wait(() => a.got('warp'));
    await sleep(150);
    ok(a.p.world === 1 && a.me().world === 1, 'then it opens: ' + WORLDS[1].name);
    a.send('world', { w: 0 });
    await a.wait(() => a.got('warp') === 2);

    console.log('--- someone else');
    const b = await new Bot('bob').join();
    const c = await new Bot('carol').join();
    await sleep(200);
    let seesA = false;
    b.room.state.players.forEach((p) => { if (p.name === 'alice') seesA = true; });
    ok(seesA, 'a second player sees the first');
    await a.wait(() => a.last('sq') && Math.abs(a.last('sq').sq - squadOf(2)) < 1e-9, 2000);
    ok(a.last('sq') && Math.abs(a.last('sq').sq - squadOf(2)) < 1e-9 && c.p.sq === squadOf(2), 'the squad boost: two others in the server, +' + Math.round(squadOf(2) * 100) + '% Speed a step for everyone');

    console.log('--- Eruption: the queue, a late player, the race');
    a.send('play', { map: 2, lv: 1 });
    await a.wait(() => a.last('mQueue'));
    ok(a.last('mQueue').found === 1 && a.last('mQueue').spots === CFG.matchSpots, 'the queue: 1 / ' + CFG.matchSpots + ' found');
    b.send('play');
    await b.wait(() => b.last('mQueue'));
    await a.wait(() => a.last('mQueue').found === 2);
    ok(a.last('mQueue').found === 2 && b.last('mQueue').found === 2, 'pressing RACE about the same time: the same queue (2 found)');
    await a.wait(() => a.got('mStart'), 15000);
    await b.wait(() => b.got('mStart'), 3000);
    const ms = a.last('mStart'), plan = arenaPlan(ms.seed, ms.lv), B = plan.B, D = matchInfo(ms.lv);
    ok(ms && b.got('mStart') && ms.id === b.last('mStart').id, 'one race for both');
    ok(ms.names.length === CFG.matchSpots, 'bots fill the empty places');
    c.send('play');
    await c.wait(() => c.got('mStart'), 3000);
    ok(c.got('mStart') && c.last('mStart').id === ms.id && a.got('mJoined') === 1, 'a late RACE takes a bot\'s place on the line');
    // on the line before the gun
    const sa = startSpot(ms.spot, plan), raceMove = (bot, x, y, z) => { bot.x = x; bot.y = y; bot.z = z; bot.send('move', { x, y, z, ry: 0, a: 1, ts: Date.now() }); };
    raceMove(a, sa.x, sa.y, sa.z);
    await sleep(120);
    const sn5 = a.snaps;
    raceMove(a, sa.x + 14, sa.y, sa.z + 14);
    await sleep(200);
    ok(a.snaps > sn5, 'nobody drives off before the gun');
    await a.wait(() => a.got('mGo'), 9000);
    ok(a.got('mGo') === 1, 'the gun');
    const goAt = a.last('mGo').at;
    c.leave();
    await a.wait(() => a.got('mLeft'), 3000);
    ok(a.got('mLeft') === 1, 'carol left: everyone is told');
    // out of the volcano; over the rim before any engine could hold it
    const sn6 = a.snaps;
    raceMove(a, B.Ro + 40, 0, 0);
    await sleep(150);
    ok(a.snaps > sn6, 'out of the volcano: sent back');
    a.clear('mDone');
    a.send('mFinish');
    await sleep(200);
    ok(!(a.msgs.mDone || []).some((m) => m.spot === ms.spot), 'finishing from the floor: no');
    // the race: alice laps up the wall as high as the race's engine holds, a little under it; bob sits on the floor and the lava takes him
    let ang = Math.atan2(sa.x, sa.z), u = 0;
    const t0r = Date.now();
    let tooSoon = false;
    while (Date.now() - t0r < 45000 && !(a.msgs.mDone || []).some((m) => m.spot === ms.spot)) {
        const secs = (Date.now() - goAt) / 1000, v = topAt(D, secs, 1);
        let top = 0; { let lo = 0, hi = 1; for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (arenaNeed(plan, m) <= v) lo = m; else hi = m; } top = v >= arenaNeed(plan, 1) ? 1.01 : lo; }
        u = Math.min(top, u + 0.012);
        const rad = u >= 1 ? B.R + 5 : B.r0 + (B.R - B.r0) * u;
        ang += v / rad * 0.1 * 0.8;
        raceMove(a, Math.sin(ang) * rad, u >= 1 ? 0 : -B.H + B.H * u * u, Math.cos(ang) * rad);
        if (u >= 1 && secs < D.tEsc - 3) tooSoon = true;
        await sleep(100);
    }
    ok((a.msgs.mDone || []).some((m) => m.spot === ms.spot) && !tooSoon, 'up the wall as the engine grows and over the rim: finished (' + ((Date.now() - t0r) / 1000).toFixed(1) + ' s)');
    await b.wait(() => (b.msgs.mOut || []).some((m) => m.spot === b.last('mStart').spot), 25000);
    ok((b.msgs.mOut || []).some((m) => m.spot === b.last('mStart').spot), 'sitting on the floor, the lava takes you');
    ok(surgeAt(D, 0) === 0 && surgeAt(D, 30) - surgeAt(D, 20) > surgeAt(D, 20) - surgeAt(D, 10), 'the lava rises faster and faster');
    await a.wait(() => a.got('mEnd'), 40000);
    const me_ = a.last('mEnd');
    // (over the rim before the clock: a place among the finishers, ahead of anyone the lava had; where among them depends on the bots' pace)
    ok(me_ && me_.place >= 0 && me_.place < CFG.matchSpots && me_.rows.every((r) => !r.out || r.place > me_.place), 'placed: ' + (me_ && me_.placeName) + ', ahead of everyone the lava had');
    ok(me_ && me_.prize.wins > 0 && me_.prize.gems > 0 && me_.prize.speed > 0, 'a prize: ' + (me_ && me_.prize.wins) + ' Wins, ' + (me_ && me_.prize.gems) + ' Gems, ' + (me_ && me_.prize.speed) + ' Speed and XP');
    await a.wait(() => a.p.matches === 1, 1500);
    ok(a.p.matches === 1, 'counted: 1 race');
    const bE = await b.wait(() => b.last('mEnd'), 3000);
    ok(bE && bE.place > me_.place && me_.rows.length === CFG.matchSpots, 'everyone placed, ' + me_.rows.length + ' rows');
    ok(me_.rows.some((r) => r.n === 'carol' && r.bot), 'carol\'s place was taken by a bot under her name');

    console.log('--- nonsense');
    for (const t of ['step', 'move', 'pad', 'warp', 'hatch', 'team', 'world', 'upgrade', 'code', 'mItem', 'mFell', 'car', 'skip', 'spack', 'rebirth', 'post', 'trail', 'aura']) a.send(t, { n: 'x', x: 'NaN', k: {}, id: [1], w: 'a', code: 5, i: -1, why: 7 });
    a.send('move', { x: Infinity, y: 0, z: 0 });
    a.send('pad', { k: 1e9 }); a.send('car', { i: 1e9 }); a.send('car', {});
    await sleep(300);
    ok(a.me() && a.room.connection.isOpen, 'nonsense messages are ignored, the room carries on');

    console.log('--- saved');
    const wSaved = a.p.wins, rbSaved = a.p.rebirths, upSaved = a.p.ups[u0.id], hSaved = a.p.hatched, carSaved = a.p.car;
    await a.leave();
    await sleep(400);
    const a2 = await new Bot('alice').join();
    ok(a2.p.wins === wSaved && a2.p.rebirths === rbSaved && a2.p.ups[u0.id] === upSaved && a2.p.hatched === hSaved && a2.p.car === carSaved, 'rejoining: everything as it was');
    void DAILY;
} catch (e) {
    fail++;
    console.log('FAIL  threw: ' + (e && e.stack));
}
console.log(`\n${pass} passed, ${fail} failed`);
srv.kill();
process.exit(fail ? 1 : 0);
