import { Room } from 'colyseus';
import { GameState, PlayerState } from './schema.js';
import {
    getProfile, hasProfile, markDirty, saveProfiles, adoptGuestProgress, loadProfile, releaseProfile,
    topProfiles, recordSession, saveSoon, USE_DB,
} from './profiles.js';
import { sealProfile, openSave } from './saves.js';
import { verifyBloxityToken } from './bloxity.js';
import { Match } from './Match.js';
import {
    CFG, WORLDS, WALLS_N, CARS, carOwned, TRAILS, AURAS, POSTS, postOpen, postXp, JAWBREAKERS, palById, palsOf, jbGems, teamMax, teamMult, SPIN, spinPrize, upgradeById, upgradeCost, xpNeed,
    stepGain, xpGain, maxWalk, rebirthLv, recLevel, strideOf, padPay, padWins, worldOpen, worldReb, titleOf, TASKS, tasksFor, dayKey, QUESTS, DAILY, dailyStatus, GIFTS, CODES, PACKS, rewardText, rewardSpeed, clamp, BOT_NAMES, PLACES, PALS, SPEED_PACKS, squadOf,
} from '../../shared/config.js';
import { W, stageAt, checkpoint, nearPost, postSpot, BELT, islandOf, inBowl, onExit, exitU, exitArc, angDiff, reachU, heightAt, inWorld } from '../../shared/world.js';
import { moveBudget } from '../../shared/physics.js';

const GREEN = '#7dff6b', GOLD = '#ffd028', RED = '#ff9a8a';
const cleanName = (name) => String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
const randomName = () => 'Driver' + Math.floor(1000 + Math.random() * 9000);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const num = (v, d) => (finite(v) ? v : d);
const rnd = (a, b) => a + Math.random() * (b - a);
const r1 = (v) => Math.round(v * 10) / 10;
// Guest ids come from the browser; they can never claim a Bloxity identity
const guestUid = (uid, fallback) => String(uid || fallback).replace(/^legion_/, 'guest_').slice(0, 64);
const cleanAvatar = (av) => (typeof av === 'string' && av.length <= 2000 ? av : '');
// NITRO and a boost chevron together make you go at most this much faster
const BURST = CFG.dashK * 1.12;
// how far a move may go, studs a second, at a top speed v (the bursts on top, and a little; in a crater, what its depth adds to a
// car dropping in). The server's guard only ever trusts your Level's top speed
const moveRate = (v, k) => Math.max(v * BURST * 1.25 + 10, 50) + (k >= 0 && k < WALLS_N ? Math.sqrt(2 * CFG.grav * islandOf(k).H) : 0);

export const liveRooms = new Set();

// One server: up to 16 players training on the same plaza (a few bots keep it lively when it's quiet). Moving is client-side;
// every step, every gate passed, every death and revive and everything that earns or costs anything is counted and checked here.
// A life: from the spawn (or a revive, a warp) to the next death; the server remembers the stages your position was in during it.
export class RunRoom extends Room {
    maxClients = CFG.maxPlayers;
    // (a real client sends well under a hundred: its moves, its steps, a ping)
    maxMessagesPerSecond = 160;

    onCreate() {
        liveRooms.add(this);
        this.setState(new GameState());
        this.setPatchRate(50);
        this.sessions = new Map();
        this.bots = [];
        this.race = new Match(this);
        const on = (type, fn) => this.onMessage(type, (client, m) => { try { fn.call(this, client, m || {}); } catch (e) { console.warn('[msg]', type, e.message); } });
        on('ping', (client, m) => client.send('pong', { c: num(m.c, 0), s: Date.now() }));
        on('move', this.onMove);
        on('step', this.onStep);
        on('pad', this.onPadTouch);
        on('warp', this.onWarp);
        on('car', this.onCar);
        on('upgrade', this.onUpgrade);
        on('trail', this.onTrail);
        on('aura', this.onAura);
        on('post', this.onBuyPost);
        on('hatch', this.onHatch);
        on('team', this.onTeam);
        on('teamBest', this.onTeamBest);
        on('rebirth', this.onRebirth);
        on('world', this.onWorld);
        on('spin', this.onSpin);
        on('pack', this.onPack);
        on('spack', this.onSpeedPack);
        on('skip', this.onSkip);
        on('x2', this.onX2);
        on('w2', this.onW2);
        on('tclaim', this.onTaskClaim);
        on('daily', this.onDaily);
        on('gift', this.onGift);
        on('code', this.onCode);
        on('tut', this.onTut);
        on('meta', this.onMeta);
        // (opening Quests: how far the daily tasks have got)
        on('want', (client) => { const s = this.sessions.get(client.sessionId), now = Date.now(); if (s && now - (s.wantAt || 0) > 1000) { s.wantAt = now; this.sendProfile(s); } });
        on('auth', this.onBloxityLogin);
        on('avatar', this.onAvatar);
        on('emote', this.onEmote);
        on('chat', this.onChat);
        on('play', (client, m) => { const s = this.sessions.get(client.sessionId); if (s) this.race.press(s, m); });
        on('unplay', (client) => { const s = this.sessions.get(client.sessionId); if (s) this.race.cancel(s); });
        on('quit', this.onQuit);
        on('mItem', (client, m) => { const s = this.sessions.get(client.sessionId); if (s) this.race.item(s, m.i); });
        on('mFell', (client, m) => { const s = this.sessions.get(client.sessionId); if (s) this.race.fell(s, m.i); });
        on('mHit', (client) => { const s = this.sessions.get(client.sessionId); if (s) this.race.hit(s); });
        on('mFinish', (client) => { const s = this.sessions.get(client.sessionId); if (s) this.race.finish(s); });
        // QA only (QA=1, never on Legion): give yourself Wins, Gems, levels...
        if (process.env.QA === '1' && !process.env.BLOXITY_GAME_ID) on('qa', this.onQa);
        this.lastTick = Date.now();
        this.secAcc = 0;
        this.setSimulationInterval(() => this.update(), 50);
        this.clock.setInterval(() => this.broadcastBoards(), 10000);
        this.fillBots();
    }

    async onAuth(client, options) {
        const legion = options && options.token ? await verifyBloxityToken(options.token) : null;
        return legion ? { legion } : { guest: true };
    }

    async onJoin(client, options, auth) {
        options = options || {};
        const guest = guestUid(options.uid, client.sessionId);
        let uid = guest, name = cleanName(options.name);
        if (auth && auth.legion) {
            uid = 'legion_' + auth.legion.id;
            name = cleanName(auth.legion.name) || name;
            await adoptGuestProgress(uid, guest, name);
        }
        await loadProfile(uid);
        // (the guest's copy was only loaded to look at: once it's been handed over, it doesn't stay in this server's memory)
        if (uid !== guest && !isOnline(guest)) releaseProfile(guest, isOnline);
        // A fresh server on a temporary disk restores the browser's signed backup (never with a database)
        const restore = !USE_DB && !hasProfile(uid) && openSave(options.save, [uid, guest]);
        const profile = getProfile(uid, name, randomName());
        if (restore) { Object.assign(profile, restore); markDirty(); }
        this.fixProfile(profile);
        kickOthers(uid, null);
        const player = new PlayerState();
        player.name = profile.name;
        player.pid = this.freePid();
        player.av = cleanAvatar(options.av);
        const now = Date.now();
        Object.assign(player, { x: W.spawn.x + rnd(-4, 4), y: 0, z: W.spawn.z, ry: Math.PI, t: now, world: profile.world || 0 });
        this.state.players.set(client.sessionId, player);
        const s = {
            id: client.sessionId, client, profile, player, guest, joinedAt: now, lastChat: 0, playSecs: 0, dirtyAt: 0, sealAt: 0, ack: 0, tokens: 0, tokAt: 0, ttok: 0, ttokAt: 0,
            gifts: {}, last: { x: player.x, y: 0, z: player.z }, lastAt: now, snapAt: 0, warpAt: 0, stepAt: 0, distAcc: 0, fellAt: 0,
            // life: where this life started and the craters escaped since (newLife); deep: the crater you're down in (-1: none)
            life: null, deep: -1, match: null, racer: null, queued: false,
            stats: {
                fresh: now - (profile.firstPlay || 0) < 60000, steps: 0, wins: 0, pads: 0, cleared: 0, best: 0, buys: 0, hatch: 0, lv0: profile.lv, rb0: profile.rebirths, matches: 0, matchWins: 0,
                touch: false, fps: 0, fpsSum: 0, fpsN: 0, fpsMin: 0, q: '', gpu: '', load: 0, dev: null, errs: [], firstPadAt: 0, firstMatchAt: 0,
            },
        };
        this.newLife(s, -1);
        this.sessions.set(client.sessionId, s);
        this.syncPublic(s);
        this.squadChanged();
        client.send('hello', { now, bloxity: uid.startsWith('legion_') });
        profile.lastSeen = now;
        this.sendProfile(s, true);
        this.broadcastBoards(client);
        this.fillBots();
    }
    freePid() {
        const used = new Set([...this.state.players.values()].map((p) => p.pid));
        for (let i = 1; i < 255; i++) if (!used.has(i)) return i;
        return 255;
    }
    // Older saves / hand-edited data: keep every field the right shape
    fixProfile(p) {
        for (const k of ['wins', 'totalWins', 'totalSpeed', 'topSpeed', 'gems', 'xp', 'speed', 'rebirths', 'car', 'trail', 'aura', 'steps', 'megas', 'cleared', 'escapes', 'catches', 'spins', 'spinsUsed', 'pads', 'upgrades', 'hatched', 'playtime', 'lastSeen', 'qi', 'tut', 'x2Until', 'w2Until', 'world', 'matches', 'matchWins', 'podium', 'deaths', 'revives', 'tread', 'freeReviveAt']) if (!finite(p[k]) || p[k] < 0) p[k] = 0;
        p.gems = Math.floor(p.gems);
        p.lv = clamp(Math.floor(num(p.lv, 1)), 1, 999);
        p.qi = clamp(Math.floor(p.qi), 0, QUESTS.length);
        p.world = clamp(Math.floor(p.world), 0, WORLDS.length - 1);
        // (reach: per world, the furthest stage you've been in this rebirth: TELEPORT goes that far)
        for (const k of ['daily', 'codes', 'seen', 'jq', 'padsDone', 'bests', 'ups', 'trails', 'auras', 'posts', 'pals', 'index', 'jbDone', 'times', 'reach', 'cars']) p[k] = obj(p[k]);
        if (!worldOpen(p, p.world)) p.world = 0;
        p.car = clamp(Math.floor(p.car), 0, CARS.length - 1);
        if (!carOwned(p, p.car)) p.car = 0;
        p.trail = clamp(Math.floor(p.trail), 0, TRAILS.length - 1);
        p.aura = clamp(Math.floor(p.aura), 0, AURAS.length - 1);
        p.topSpeed = Math.max(p.topSpeed, p.speed);
        for (const id of Object.keys(p.ups)) { const u = upgradeById[id]; if (!u) delete p.ups[id]; else p.ups[id] = clamp(num(p.ups[id], 0) | 0, 0, u.max); }
        for (const id of Object.keys(p.pals)) { if (!palById[id]) delete p.pals[id]; else p.pals[id] = Math.max(0, num(p.pals[id], 0) | 0); }
        p.team = (Array.isArray(p.team) ? p.team : []).filter((id) => p.pals[id] > 0).slice(0, teamMax(p));
        p.jq = { day: String(p.jq.day || ''), list: Array.isArray(p.jq.list) ? p.jq.list.slice(0, 3).map((q) => ({ k: String(q.k), p: Math.max(0, num(q.p, 0)), c: !!q.c })).filter((q) => TASKS[q.k]) : [] };
        if (!finite(p.firstPlay)) p.firstPlay = Date.now();
        if (!p.padAt || typeof p.padAt !== 'object' || Array.isArray(p.padAt)) p.padAt = {};
        p.spinSecs = Math.max(0, num(p.spinSecs, 0) | 0);
    }

    // A dropped connection has 30 seconds to come back. Meanwhile they aren't shown in the world, and in a race a bot takes over after
    // a few seconds (tick). kickOthers ends the wait if they turn up in a new session instead.
    onDrop(client) {
        const r = this.allowReconnection(client, 30), s = this.sessions.get(client.sessionId);
        r.catch(() => {});
        if (!s) return;
        s.recon = r; s.dropAt = Date.now();
        s.player.world = OFFSTAGE;
    }
    onReconnect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.client = client; s.recon = null;
        kickOthers(s.profile.uid, s);
        this.syncPublic(s);
        client.send('hello', { now: Date.now(), bloxity: s.profile.uid.startsWith('legion_') });
        this.sendProfile(s, true);
        this.broadcastBoards(client);
        // (back in the stage you were in: its checkpoint)
        if (!s.match) {
            const k = stageAt(s.last.z);
            if (k >= 0 && k < WALLS_N) this.toCheckpoint(s, k, 'back');
        }
        this.race.resync(s, { w: s.profile.world, x: s.last.x, z: s.last.z });
    }
    onLeave(client) {
        const s = this.sessions.get(client.sessionId);
        if (s) this.race.leave(s, true);
        this.state.players.delete(client.sessionId);
        this.sessions.delete(client.sessionId);
        markDirty();
        this.fillBots();
        this.squadChanged();
        if (!s) return;
        const p = s.profile, st = s.stats;
        p.lastSeen = Date.now();
        recordSession({
            at: new Date(), secs: Math.round((Date.now() - s.joinedAt) / 1000), fresh: st.fresh, touch: st.touch,
            fps: st.fpsN ? Math.round(st.fpsSum / st.fpsN) : st.fps, fpsMin: st.fpsMin, q: st.q, gpu: st.gpu, load: st.load, dev: st.dev, errs: st.errs,
            steps: st.steps, cleared: st.cleared, wins: st.wins, pads: st.pads, best: st.best, buys: st.buys, hatch: st.hatch, lv0: st.lv0, lv: p.lv, rb0: st.rb0, rb: p.rebirths, matches: st.matches, matchWins: st.matchWins,
            skips: st.skips || 0, squad: this.sessions.size,
            firstPad: st.firstPadAt ? Math.round((st.firstPadAt - s.joinedAt) / 1000) : -1, firstMatch: st.firstMatchAt ? Math.round((st.firstMatchAt - s.joinedAt) / 1000) : -1, qi: p.qi,
        }).catch((e) => console.warn('[stats]', e.message));
        if (!isOnline(p.uid)) releaseProfile(p.uid, isOnline);
    }
    onDispose() {
        liveRooms.delete(this);
        for (const s of this.sessions.values()) s.profile.lastSeen = Date.now();
        markDirty();
        return saveProfiles();
    }

    // ----- helpers -----
    sendTo(s, type, msg) { try { if (s) s.client.send(type, msg); } catch (e) { /* gone */ } }
    syncPublic(s) {
        const p = s.profile, pl = s.player;
        pl.name = p.name; pl.lv = p.lv; pl.wins = p.totalWins; pl.world = s.recon ? OFFSTAGE : p.world;
        pl.car = p.car; pl.trail = p.trail; pl.aura = p.aura;
        pl.team = (p.team || []).join(',');
        pl.title = titleOf(p.cleared);
    }
    x2On(p, now) { return (p.x2Until || 0) > (now || Date.now()); }
    w2On(p, now) { return (p.w2Until || 0) > (now || Date.now()); }
    // The player's private progress: straight away for anything they clicked on; while running, four times a second, only
    // what changes then (the rest of it isn't sent over and over)
    sendProfile(s, seal) {
        const p = s.profile, now = Date.now();
        s.dirtyAt = 0;
        this.jqOf(p, now);
        this.checkQuests(s);
        const m = {
            wins: Math.floor(p.wins), totalWins: Math.floor(p.totalWins), totalSpeed: Math.floor(p.totalSpeed), topSpeed: Math.floor(p.topSpeed), gems: p.gems, xp: r1(p.xp), speed: p.speed, lv: p.lv, need: xpNeed(p.lv), ack: s.ack,
            rebirths: p.rebirths, car: p.car, cars: p.cars, trail: p.trail, aura: p.aura, trails: p.trails, auras: p.auras, posts: p.posts, ups: p.ups, upgrades: p.upgrades,
            steps: p.steps, megas: p.megas, cleared: p.cleared, escapes: p.escapes, catches: p.catches, bests: p.bests, padsDone: p.padsDone, pals: p.pals, team: p.team, hatched: p.hatched, index: p.index,
            spins: p.spins, spinIn: Math.max(0, CFG.spinMins * 60 - p.spinSecs), spinsUsed: p.spinsUsed, pads: p.pads, world: p.world, matches: p.matches, matchWins: p.matchWins, podium: p.podium,
            x2Until: p.x2Until, w2Until: p.w2Until, sq: this.squad(),
            qi: p.qi, qv: p.qi < QUESTS.length ? this.questValue(p, QUESTS[p.qi].kind) : 0, jq: p.jq, daily: p.daily, codes: p.codes,
            gifts: s.gifts, sessionSecs: s.playSecs, playtime: p.playtime, tut: p.tut, seen: p.seen, firstPlay: p.firstPlay, now,
            candies: p.candies, candyN: p.candyN,
            tread: p.tread, reach: p.reach, out: s.life ? s.life.out : 0,
        };
        if (!USE_DB && (seal || now - s.sealAt > 10000)) { s.sealAt = now; m.save = sealProfile(p); }
        this.sendTo(s, 'profile', m);
    }
    sendLite(s) {
        const p = s.profile;
        s.dirtyAt = 0;
        this.checkQuests(s);
        // a quest or task just came good: there's more to tell than the short message holds
        if (s.jqDirty) { s.jqDirty = false; this.sendProfile(s); return; }
        const m = { xp: r1(p.xp), speed: p.speed, lv: p.lv, need: xpNeed(p.lv), ack: s.ack, steps: p.steps, tread: p.tread, cleared: p.cleared, wins: Math.floor(p.wins), totalSpeed: Math.floor(p.totalSpeed), bests: p.bests };
        if (p.qi < QUESTS.length) m.qv = this.questValue(p, QUESTS[p.qi].kind);
        m.sq = this.squad();
        this.sendTo(s, 'lite', m);
    }
    dirty(s) { if (!s.dirtyAt) s.dirtyAt = Date.now(); markDirty(); }
    changed(s) { this.syncPublic(s); this.sendProfile(s); saveSoon(); }
    toast(s, text, color) { this.sendTo(s, 'toast', { text, color: color || '#ffffff' }); }
    broke(s, need, name, cur) { this.sendTo(s, 'broke', { need: Math.ceil(need), name, cur }); }
    payWins(s, n, name) { const p = s.profile; if (p.wins < n) { this.broke(s, n - p.wins, name, 'wins'); return false; } p.wins -= n; s.stats.buys++; return true; }
    payGems(s, n, name) { const p = s.profile; if (p.gems < n) { this.broke(s, n - p.gems, name, 'gems'); return false; } p.gems -= n; s.stats.buys++; return true; }
    giveReward(s, r, why) {
        const p = s.profile, speed = rewardSpeed(r, p.lv);
        // (a reward's Speed comes with as much XP)
        if (speed) { this.addSpeed(s, speed); this.addXp(s, speed); }
        if (r.wins) this.addWins(s, r.wins);
        if (r.gems) p.gems += r.gems;
        if (r.spins) p.spins += r.spins;
        if (r.x2) p.x2Until = Math.max(Date.now(), p.x2Until || 0) + r.x2 * 60000;
        const shown = { ...r, speed };
        if (why) this.sendTo(s, 'reward', { text: rewardText(shown), why, gems: r.gems || 0 });
        return shown;
    }
    addWins(s, n) {
        const p = s.profile;
        p.wins += n; p.totalWins += n; s.stats.wins += n;
        this.task(s, 'wins', n);
    }
    // Speed: the big number (and the leaderboard's)
    addSpeed(s, n) {
        const p = s.profile;
        p.speed += n; p.totalSpeed += n;
        if (p.speed > p.topSpeed) p.topSpeed = p.speed;
    }
    // XP fills the Level bar (no cap; what's over carries on into the next Level)
    addXp(s, n) {
        const p = s.profile;
        p.xp += n;
        let ups = 0;
        while (p.lv < 999 && p.xp >= xpNeed(p.lv)) { p.xp -= xpNeed(p.lv); p.lv++; ups++; }
        if (ups) {
            this.task(s, 'levels', ups);
            this.sendTo(s, 'levelup', { lv: p.lv, xp: r1(p.xp), need: xpNeed(p.lv), walk: r1(maxWalk(p)), cap: false });
            s.player.lv = p.lv;
        }
    }

    // ----- daily tasks, quests -----
    jqOf(p, now) {
        const d = dayKey(now);
        if (p.jq.day !== d) p.jq = { day: d, list: tasksFor(d).map((k) => ({ k, p: 0, c: false })) };
        return p.jq;
    }
    task(s, k, n) {
        const jq = this.jqOf(s.profile, Date.now());
        for (const q of jq.list) {
            if (q.k !== k || q.c) continue;
            const was = q.p;
            q.p = Math.min(TASKS[k].n, q.p + n);
            if (was < TASKS[k].n && q.p >= TASKS[k].n) { this.sendTo(s, 'taskdone', { k }); s.jqDirty = true; }
        }
        this.dirty(s);
    }
    questValue(p, kind) {
        if (kind === 'spins') return p.spinsUsed;
        if (kind === 'best') return (p.bests && p.bests[0]) || 0;
        if (kind === 'hatch') return p.hatched;
        if (kind === 'cars') return Object.keys(p.cars || {}).length;
        return Math.floor(p[kind] || 0);
    }
    // a quest done pays at once, and the next one comes up
    checkQuests(s) {
        const p = s.profile;
        for (let k = 0; k < 4 && p.qi < QUESTS.length; k++) {
            const Q = QUESTS[p.qi];
            if (this.questValue(p, Q.kind) < Q.n) break;
            p.qi++;
            this.giveReward(s, Q);
            this.sendTo(s, 'questdone', { text: Q.text, reward: rewardText(Q), wins: Q.wins || 0 });
            s.jqDirty = true;
        }
    }
    onTaskClaim(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const q = this.jqOf(s.profile, Date.now()).list[m.i | 0];
        if (!q || q.c || q.p < TASKS[q.k].n) return;
        q.c = true;
        this.giveReward(s, TASKS[q.k], 'Daily task done!');
        this.changed(s);
    }

    // ----- 20 times a second: the bots, the races, the revive offers; every second: playtime, free spins -----
    update() {
        const now = Date.now(), dt = Math.min(0.1, (now - this.lastTick) / 1000);
        this.lastTick = now;
        this.state.now = now;
        // (whatever goes wrong in one tick, the room and everyone in it carry on)
        try {
            for (const b of this.bots) this.driveBot(b, now, dt);
            this.race.update(now, dt);
            this.secAcc += dt;
            if (this.secAcc >= 1) { this.secAcc -= 1; this.tick(now); }
            for (const s of this.sessions.values()) if (s.dirtyAt && now - s.dirtyAt > 250) { this.syncPublic(s); if (s.jqDirty) { s.jqDirty = false; this.sendProfile(s); } else this.sendLite(s); }
        } catch (e) { console.warn('[update]', e.message); }
    }
    tick(now) {
        for (const s of this.sessions.values()) {
            const p = s.profile;
            // gone for now: their clocks wait; in a race, a bot carries on for them after a few seconds
            if (s.recon) { if (s.match && now - s.dropAt > DROP_MATCH_MS) this.sendHome(s); continue; }
            p.playtime = (p.playtime || 0) + 1;
            p.lastSeen = now;
            s.playSecs++;
            if (p.spins < CFG.spinMax) { p.spinSecs++; if (p.spinSecs >= CFG.spinMins * 60) { p.spinSecs = 0; p.spins++; this.toast(s, '🎡 A free spin is ready!', GOLD); this.changed(s); } } else p.spinSecs = 0;
            const g = GIFTS.findIndex((x, i) => !s.gifts[i] && s.playSecs >= x.min * 60 && s.playSecs < x.min * 60 + 1);
            if (g >= 0) this.toast(s, '🎁 A FREE gift is ready!', GOLD);
        }
        markDirty();
    }

    // ----- lives: where you (re)started and which craters you've come up out of since (their north gates are open for you) -----
    // a new life from stage k (-1: Base Camp)
    newLife(s, k) { s.life = { from: k, out: 0 }; s.deep = -1; }
    // the furthest stage this life lets you into: the first one, from where you started, whose crater you haven't escaped
    lifeMax(s) { let k = Math.max(0, s.life.from); while (k < WALLS_N && (s.life.out & (1 << k))) k++; return k; }
    // the stage you're in is one you've reached this rebirth (TELEPORT goes that far)
    lifeMove(s, z) {
        const p = s.profile, k = Math.min(WALLS_N - 1, stageAt(z));
        if (k > (finite(p.reach[p.world]) ? p.reach[p.world] : -1)) p.reach[p.world] = k;
    }
    // somewhere new by the server's word: the moves still on their way from where you were are dropped (no snap) until one arrives from
    // there, and the move guard starts afresh
    placeAt(s, x, y, z) { const now = Date.now(); s.last = { x, y, z }; s.homeAt = now; s.lastAt = now; s.moveB = undefined; }
    // to the top of stage k's bridge (a SKIP, back from a dropped connection), a new life from there
    toCheckpoint(s, k, why) {
        const cp = checkpoint(k);
        this.placeAt(s, cp.x, cp.y, cp.z);
        this.newLife(s, k);
        this.sendTo(s, 'warped', { x: cp.x, y: cp.y, z: cp.z, k, why });
    }

    // ----- moving -----
    // where a player says they are: checked against how far their Level's top speed could have taken them (and what a crater's
    // depth adds on the way down), the ground's height there, the world's edges, and the gates (no further than the first crater
    // they haven't come up out of in this life)
    onMove(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.x) || !finite(m.y) || !finite(m.z)) return;
        const now = Date.now(), p = s.profile, L = s.last;
        const dt = (now - s.lastAt) / 1000;
        s.lastAt = now;
        if (s.match) {
            if (!this.race.move(s, m, dt)) { L.x = m.x; L.y = m.y; L.z = m.z; this.setPublicMove(s, m, now); }
            return;
        }
        // just sent somewhere (a warp, a rebirth, a world): the moves still on their way from where they were are dropped (no snap)
        // until they arrive
        if (s.homeAt) {
            if (now - s.homeAt < 30000 && Math.hypot(m.x - L.x, m.z - L.z) > 9) return;
            s.homeAt = 0;
        }
        const v = maxWalk(p), w = p.world, k = stageAt(m.z), fy = heightAt(w, m.x, m.z), dist = Math.hypot(m.x - L.x, m.z - L.z), inK = k >= 0 && k < WALLS_N;
        const bad = !moveBudget(s, dist, moveRate(v, k), dt) || m.y > fy + 60 + (inK ? islandOf(k).H : 0) || m.y < fy - 5 || !inWorld(m.x, m.z, 4) || k > this.lifeMax(s);
        if (bad) {
            if (now - s.snapAt > 300) { s.snapAt = now; this.sendTo(s, 'snap', { x: L.x, y: L.y, z: L.z }); if (process.env.QA === '1') console.log('[snap]', p.name, 'from', [L.x, L.y, L.z].map((x) => +x.toFixed(1)), 'to', [m.x, m.y, m.z].map((x) => +x.toFixed(1)), 'dt', +dt.toFixed(2), 'k', k, 'max', this.lifeMax(s)); }
            return;
        }
        // strides for steps (a step needs the ground under the wheels)
        if (m.y - fy < 1.5 || m.a === 1) s.distAcc = Math.min(60, s.distAcc + dist);
        if (inK) { this.lifeMove(s, m.z); if (inBowl(k, m.x, m.z)) s.deep = k; }
        L.x = m.x; L.y = m.y; L.z = m.z;
        this.setPublicMove(s, m, now);
        const post = finite(m.post) ? m.post | 0 : -1;
        s.player.post = m.a === 3 && post >= 0 && post < POSTS.length && postOpen(p, post) && nearPost(post, m.x, m.z, 7) ? post : 255;
        s.player.spd = clamp(finite(m.v) ? m.v : v, 0, v * 3);
    }
    setPublicMove(s, m, now) {
        const pl = s.player;
        pl.x = m.x; pl.y = m.y; pl.z = m.z; pl.ry = finite(m.ry) ? m.ry : 0; pl.anim = finite(m.a) ? clamp(m.a | 0, 0, 3) : 0;
        pl.t = finite(m.ts) ? clamp(m.ts, now - 1500, now + 50) : now;
    }
    // ----- steps: from your screen, counted here. n of them, on a treadmill (post) or on the ground -----
    token(s, now, tread) {
        if (tread) {
            const rate = CFG.treadSprint * 1.12, cap = 14;
            s.ttok = Math.min(cap, (s.ttokAt ? s.ttok : cap) + (now - (s.ttokAt || now)) / 1000 * rate);
            s.ttokAt = now;
            if (s.ttok < 1) return false;
            s.ttok -= 1;
            return true;
        }
        s.tokens = Math.min(CFG.stepBurst, (s.tokAt ? s.tokens : CFG.stepBurst) + (now - (s.tokAt || now)) / 1000 * CFG.stepRate);
        s.tokAt = now;
        if (s.tokens < 1) return false;
        s.tokens -= 1;
        return true;
    }
    // every step: Speed (stepGain) and XP (xpGain), a treadmill's multipliers on top (mult for Speed, xp for XP)
    onStep(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.n)) return;
        if (finite(m.s)) s.ack = Math.max(s.ack, m.s | 0);
        if (s.match) return;
        const now = Date.now(), p = s.profile, w = p.world, L = s.last, n = clamp(m.n | 0, 0, 30), x2 = this.x2On(p, now);
        let post = finite(m.post) ? m.post | 0 : -1;
        if (post >= 0 && (post >= POSTS.length || !postOpen(p, post) || !nearPost(post, L.x, L.z, 7))) post = -1;
        // (a stride at the pace you're going, never more than your Level's)
        const sq = this.squad(), pm = post >= 0 ? POSTS[post].mult : 1, px = post >= 0 ? postXp(post) : 1, stride = strideOf(clamp(s.player.spd || 0, CFG.walk, maxWalk(p))) * 0.7;
        let got = 0;
        for (let i = 0; i < n; i++) {
            if (!this.token(s, now, post >= 0)) break;
            if (post < 0) { if (s.distAcc < stride) break; s.distAcc -= stride; }
            got++;
            p.steps++; s.stats.steps++;
            this.addSpeed(s, stepGain(p, x2, w, sq) * pm);
            this.addXp(s, xpGain(p) * px);
        }
        if (got) { this.task(s, 'steps', got); s.stepAt = now; if (post >= 0) { p.tread += got; this.task(s, 'tread', got); } }
        this.dirty(s);
    }
    // up out of crater k onto its deck: your position (the server's) on the deck, having been down in its bowl since you were last
    // up there, and a top speed that could hold its rim at all (NITRO and a boost chevron counted in). Its north gate opens for
    // you; Wins (x3 the first time each rebirth), and again only after a cool-down
    onPadTouch(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match || !finite(m.k)) return;
        const p = s.profile, k = m.k | 0, L = s.last, now = Date.now(), w = p.world;
        if (k < 0 || k >= WALLS_N || s.deep !== k || !onExit(k, L.x, L.z, 5)) return;
        if (reachU(islandOf(k), maxWalk(p) * BURST * 1.06) < 0.985) return;
        s.deep = -1;
        s.life.out |= 1 << k;
        const key = w + ':' + k;
        if (now - (p.padAt[key] || 0) < CFG.padCool * 1000) { this.sendTo(s, 'padok', { k, wins: 0, n: 0, first: false, cool: CFG.padCool, again: true }); return; }
        p.padAt[key] = now;
        const first = !p.padsDone[key];
        p.padsDone[key] = 1;
        const n = padPay(p, w, k, first, this.w2On(p, now));
        this.addWins(s, n);
        p.pads++; s.stats.pads++;
        p.cleared++; s.stats.cleared++;
        this.task(s, 'cleared', 1);
        if (k >= 4) this.task(s, 'pads', 1);
        if (k + 1 > (p.bests[w] || 0)) { p.bests[w] = k + 1; s.stats.best = Math.max(s.stats.best, k + 1); }
        if (!s.stats.firstPadAt) s.stats.firstPadAt = now;
        this.sendTo(s, 'padok', { k, wins: n, n, first, cool: CFG.padCool });
        this.changed(s);
    }
    // the quick ways round: Base Camp, your best open dyno, any stage you've reached this rebirth
    onWarp(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match) return;
        const now = Date.now(), p = s.profile;
        if (now - s.warpAt < 700) return;
        s.warpAt = now;
        let to = { x: W.spawn.x + rnd(-4, 4), y: 0, z: W.spawn.z }, k = -1;
        if (m.to === 'post') {
            let best = 0;
            for (let i = 0; i < POSTS.length; i++) if (postOpen(p, i) && POSTS[i].mult >= POSTS[best].mult) best = i;
            const sp = postSpot(best);
            to = { x: sp.x, y: 0, z: sp.z + BELT.l / 2 + 5 };
        } else if (m.to === 'stage') {
            const top = Math.min(WALLS_N - 1, finite(p.reach[p.world]) ? p.reach[p.world] : 0);
            k = clamp(m.k | 0, 0, Math.max(0, top));
            const cp = checkpoint(k);
            to = { x: cp.x, y: cp.y, z: cp.z };
        }
        this.placeAt(s, to.x, to.y, to.z);
        this.newLife(s, k);
        this.sendTo(s, 'warped', { ...to, k });
    }


    // ----- spending: upgrades, trails, auras, treadmills, Eggs, rebirths, worlds -----
    // a car: bought once (Wins, or Gems for the special ones), then yours to drive whenever you like
    onCar(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, i = m.i | 0, C = CARS[i];
        if (!C || !finite(m.i)) return;
        if (!carOwned(p, i)) {
            if (C.gems ? !this.payGems(s, C.gems, C.name) : !this.payWins(s, C.wins, C.name)) return;
            p.cars[C.id] = 1;
            this.sendTo(s, 'bought', { what: 'car', i });
        }
        p.car = i;
        this.changed(s);
    }
    onUpgrade(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, u = upgradeById[m.id];
        if (!u) return;
        const n = p.ups[u.id] || 0;
        if (n >= u.max) return;
        if (!this.payWins(s, upgradeCost(u, n), u.name)) return;
        p.ups[u.id] = n + 1; p.upgrades++;
        if (u.id === 'den' && !p.teamSet) this.bestTeam(p);
        this.sendTo(s, 'bought', { what: 'upgrade', id: u.id, n: n + 1 });
        this.changed(s);
    }
    onTrail(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, i = m.i | 0, X = TRAILS[i];
        if (!X) return;
        if (!p.trails[X.id] && i > 0) { if (!this.payWins(s, X.wins, X.name)) return; p.trails[X.id] = 1; this.sendTo(s, 'bought', { what: 'trail', i }); }
        p.trail = i;
        this.changed(s);
    }
    onAura(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, i = m.i | 0, X = AURAS[i];
        if (!X) return;
        if (!p.auras[X.id] && i > 0) { if (!this.payGems(s, X.gems, X.name)) return; p.auras[X.id] = 1; this.sendTo(s, 'bought', { what: 'aura', i }); }
        p.aura = i;
        this.changed(s);
    }
    onBuyPost(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, c = POSTS[m.i | 0];
        if (!c || !c.gems || p.posts[c.id]) return;
        if (!this.payGems(s, c.gems, c.name)) return;
        p.posts[c.id] = 1;
        this.sendTo(s, 'bought', { what: 'post', i: m.i | 0 });
        this.changed(s);
    }
    // a Rift Core: Wins for one or three, its odds say who's inside
    onHatch(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, j = m.j | 0, J = JAWBREAKERS[j], n = m.n === 3 ? 3 : 1;
        if (!J) return;
        if (!this.payWins(s, J.wins * n, J.name)) return;
        const list = palsOf(j), got = [], total = list.reduce((a, x) => a + x.odds, 0);
        for (let i = 0; i < n; i++) {
            let r = Math.random() * total, a = list[0];
            for (const x of list) { r -= x.odds; if (r < 0) { a = x; break; } }
            p.pals[a.id] = (p.pals[a.id] || 0) + 1;
            p.hatched++; s.stats.hatch++;
            got.push({ id: a.id, fresh: !p.index[a.id] });
            p.index[a.id] = 1;
        }
        this.task(s, 'hatch', n);
        // the best of what you own goes on your team by itself until you've chosen for yourself
        if (!p.teamSet) this.bestTeam(p);
        let done = 0;
        if (!p.jbDone[J.id] && list.every((x) => p.index[x.id])) { p.jbDone[J.id] = 1; done = jbGems(j); p.gems += done; }
        this.sendTo(s, 'hatched', { j, got, done, mult: teamMult(p.team) });
        this.changed(s);
    }
    bestTeam(p) {
        const owned = PALS.filter((a) => p.pals[a.id] > 0).sort((a, b) => b.mult - a.mult), team = [];
        for (const a of owned) for (let c = 0; c < p.pals[a.id] && team.length < teamMax(p); c++) team.push(a.id);
        p.team = team;
    }
    onTeam(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, id = String(m.id || ''), i = p.team.indexOf(id);
        if (!palById[id] || !p.pals[id]) return;
        if (m.on === false) { if (i >= 0) p.team.splice(i, 1); } else {
            const have = p.team.filter((x) => x === id).length;
            if (p.team.length >= teamMax(p) || have >= p.pals[id]) { this.toast(s, 'Your team is full', RED); return; }
            p.team.push(id);
        }
        p.teamSet = 1;
        this.changed(s);
    }
    onTeamBest(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.profile.teamSet = 0;
        this.bestTeam(s.profile);
        this.changed(s);
    }
    // rebirth: at Level 10 the first time, 5 more each time after (it costs nothing). Speed, Level and XP back to the start (and the
    // gates' first-time x3 again); Wins, Gems, pets, upgrades, trails, auras and worlds kept; every step x0.5 more for good
    onRebirth(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match) return;
        const p = s.profile, need = rebirthLv(p.rebirths);
        if (p.lv < need) { this.toast(s, 'Rebirth needs Level ' + need, RED); return; }
        p.rebirths++; p.lv = 1; p.xp = 0; p.speed = 0;
        p.padsDone = {};
        p.padAt = {};
        p.reach = {};
        s.player.lv = 1;
        const sx = W.spawn.x + rnd(-4, 4);
        this.placeAt(s, sx, 0, W.spawn.z);
        this.newLife(s, -1);
        this.task(s, 'rebirth', 1);
        this.sendTo(s, 'reborn', { r: p.rebirths, x: sx, z: W.spawn.z, next: rebirthLv(p.rebirths) });
        this.changed(s);
    }
    onWorld(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match) return;
        const p = s.profile, w = clamp(m.w | 0, 0, WORLDS.length - 1);
        if (w === p.world) return;
        if (!worldOpen(p, w)) {
            const cleared = ((p.bests && p.bests[w - 1]) || 0) >= WALLS_N, reb = worldReb(w);
            this.toast(s, '🔒 ' + WORLDS[w].name + ': ' + (cleared ? 'needs ' + reb + ' rebirths (you have ' + (p.rebirths || 0) + ')' : 'escape the last crater of ' + WORLDS[w - 1].name + (reb > (p.rebirths || 0) ? ' and rebirth ' + reb + ' times' : '')), RED);
            return;
        }
        p.world = w;
        const sx = W.spawn.x + rnd(-4, 4);
        this.placeAt(s, sx, 0, W.spawn.z);
        this.newLife(s, -1);
        this.sendTo(s, 'warp', { w, x: sx, z: W.spawn.z });
        this.changed(s);
    }
    onSpin(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.spins < 1) return;
        p.spins--; p.spinsUsed++;
        let r = Math.random() * SPIN.reduce((a, x) => a + x.w, 0), i = 0;
        for (; i < SPIN.length - 1; i++) { r -= SPIN[i].w; if (r < 0) break; }
        const prize = spinPrize(SPIN[i], p);
        if (prize.speed) { this.addSpeed(s, prize.speed); this.addXp(s, prize.speed); }
        if (prize.wins) this.addWins(s, prize.wins);
        if (prize.gems) p.gems += prize.gems;
        if (prize.x2) p.x2Until = Math.max(Date.now(), p.x2Until || 0) + prize.x2 * 60000;
        this.task(s, 'spins', 1);
        this.sendTo(s, 'spun', { i, text: rewardText(prize) });
        this.changed(s);
    }
    onPack(client, m) {
        const s = this.sessions.get(client.sessionId), k = s && PACKS.find((x) => x.id === m.id);
        if (!k || !this.payGems(s, k.gems, k.wins + ' Wins')) return;
        const n = Math.round(k.wins * WORLDS[s.profile.world].wins);
        this.addWins(s, n);
        this.toast(s, '+' + n + ' Wins!', GOLD);
        this.changed(s);
    }
    // the squad boost: every other real player in this server (bots don't count) adds Speed to every step
    squad() { return squadOf(this.sessions.size - 1); }
    squadChanged() { this.broadcast('sq', { sq: this.squad() }); }
    // a Speed pack for Gems (the +SPEED buttons): a few Levels' worth of Speed at your Level, with as much XP
    onSpeedPack(client, m) {
        const s = this.sessions.get(client.sessionId), i = finite(m.i) ? m.i | 0 : -1, k = SPEED_PACKS[i];
        if (!s || !k || s.match) return;
        const now = Date.now();
        if (now - (s.spackAt || 0) < 400) return;
        s.spackAt = now;
        if (!this.payGems(s, k.gems, 'a Speed pack')) return;
        this.giveReward(s, { speed: k.sp }, '⚡ Speed pack!');
        this.changed(s);
    }
    // SKIP: the stage you're in (where the server has you), for Gems: you land just inside the next arch. The skipped arch pays
    // nothing; it does count as reached (TO STAGE can take you there). Not the last stage, not in a race, not while out
    onSkip(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match) return;
        const now = Date.now(), p = s.profile, k = stageAt(s.last.z);
        if (now - (s.skipAt || 0) < 900) return;
        if (k < 0 || k >= WALLS_N - 1) { this.toast(s, k < 0 ? 'Drive to a crater to skip it' : "The last crater can't be skipped!", RED); return; }
        if (!this.payGems(s, CFG.skipGems, 'a skip')) return;
        s.skipAt = now;
        const w = p.world;
        if (!finite(p.reach[w]) || p.reach[w] < k + 1) p.reach[w] = k + 1;
        s.stats.skips = (s.stats.skips || 0) + 1;
        this.toCheckpoint(s, k + 1, 'skip');
        this.toast(s, '⏩ Skipped to Crater ' + (k + 2) + '!', GOLD);
        this.changed(s);
    }
    onX2(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !this.payGems(s, CFG.boostP2Gems, 'x2 Speed')) return;
        const p = s.profile;
        p.x2Until = Math.max(Date.now(), p.x2Until || 0) + CFG.boostP2Mins * 60000;
        this.toast(s, 'x2 Speed for ' + CFG.boostP2Mins + ' minutes!', GOLD);
        this.changed(s);
    }
    onW2(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !this.payGems(s, CFG.boostW2Gems, 'x2 Wins')) return;
        const p = s.profile;
        p.w2Until = Math.max(Date.now(), p.w2Until || 0) + CFG.boostW2Mins * 60000;
        this.toast(s, 'x2 Wins for ' + CFG.boostW2Mins + ' minutes!', GOLD);
        this.changed(s);
    }
    // ----- a race's end, on the room's side: what the player gets -----
    onMatchEnd(s, r, prize, rows, mt) {
        const p = s.profile;
        p.matches++; s.stats.matches++;
        if (!s.stats.firstMatchAt) s.stats.firstMatchAt = Date.now();
        if (r.place === 0) { p.matchWins++; s.stats.matchWins++; }
        if (r.place <= 2) p.podium++;
        this.addWins(s, prize.wins);
        p.gems += prize.gems;
        this.addSpeed(s, prize.speed); this.addXp(s, prize.speed);
        this.task(s, 'matches', 1);
        const sx = W.spawn.x + rnd(-4, 4);
        this.placeAt(s, sx, 0, W.spawn.z);
        this.newLife(s, -1);
        this.sendTo(s, 'mEnd', { place: r.place, prize, rows, spot: r.spot, lv: mt.lv, w: p.world, x: sx, z: W.spawn.z, placeName: PLACES[r.place] });
        this.changed(s);
    }
    onQuit(client) {
        const s = this.sessions.get(client.sessionId);
        // (the clock's run out already: the prize is a moment away, there's nothing to leave)
        if (!s || !s.match || s.match.phase === 'done') return;
        this.sendHome(s);
    }
    // out of the race, a bot in their place, back on the plaza
    sendHome(s) {
        this.race.leave(s, true);
        const sx = W.spawn.x + rnd(-4, 4), p = s.profile;
        this.placeAt(s, sx, 0, W.spawn.z);
        this.newLife(s, -1);
        this.sendTo(s, 'mBack', { w: p.world, x: sx, z: W.spawn.z });
        this.changed(s);
    }
    // the race takes you: no revive waiting
    toRace(s) { this.newLife(s, -1); }

    // ----- rewards -----
    onDaily(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, now = Date.now(), st = dailyStatus(p.daily, now);
        if (!st.can) return;
        p.daily = { last: dayKey(now), streak: st.streak + 1 };
        this.giveReward(s, DAILY[st.day], 'Daily reward: day ' + (st.day + 1) + '!');
        this.changed(s);
    }
    onGift(client, m) {
        const s = this.sessions.get(client.sessionId), i = m.i | 0, g = GIFTS[i];
        if (!s || !g || s.gifts[i] || s.playSecs < g.min * 60 - 2) return;
        s.gifts[i] = true;
        this.giveReward(s, g, 'FREE gift!');
        this.changed(s);
    }
    onCode(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const code = String(m.code || '').trim().toUpperCase().slice(0, 20), r = CODES[code];
        if (!r) { this.sendTo(s, 'code', { ok: false, text: 'That code doesn\'t work' }); return; }
        if (s.profile.codes[code]) { this.sendTo(s, 'code', { ok: false, text: 'You already used that code' }); return; }
        s.profile.codes[code] = true;
        const shown = this.giveReward(s, r);
        this.sendTo(s, 'code', { ok: true, text: 'Code redeemed: ' + rewardText(shown, true) });
        this.changed(s);
    }
    onTut(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        if (finite(m.tut)) s.profile.tut = clamp(Math.max(s.profile.tut, m.tut | 0), 0, 99);
        // (only the worlds' "new" flags are ever kept)
        if (typeof m.seen === 'string' && /^w\d$/.test(m.seen)) s.profile.seen[m.seen] = 1;
        markDirty();
    }
    onMeta(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const st = s.stats;
        if (typeof m.touch === 'boolean') st.touch = m.touch;
        if (finite(m.fps)) { const f = clamp(Math.round(m.fps), 0, 240); st.fps = f; st.fpsSum += f; st.fpsN++; st.fpsMin = st.fpsN === 1 ? f : Math.min(st.fpsMin, f); }
        if (typeof m.q === 'string') st.q = m.q.slice(0, 8);
        if (typeof m.gpu === 'string' && !st.gpu) st.gpu = m.gpu.slice(0, 90);
        if (finite(m.load) && !st.load) st.load = clamp(Math.round(m.load * 10) / 10, 0, 600);
        if (!st.dev && finite(m.w)) st.dev = { w: clamp(m.w | 0, 0, 9999), h: clamp(m.h | 0, 0, 9999), dpr: clamp(num(m.dpr, 1), 0, 8), cores: clamp(m.cores | 0, 0, 256), mem: clamp(num(m.mem, 0), 0, 1024) };
        if (Array.isArray(m.errs)) for (const e of m.errs.slice(0, 5)) if (typeof e === 'string' && st.errs.length < 8) st.errs.push(e.slice(0, 220));
    }
    broadcastBoards(client) {
        const row = (key, v) => topProfiles(key).filter((p) => v(p) > 0).map((p) => ({ n: p.name, v: v(p) }));
        const m = { wins: row('totalWins', (p) => Math.floor(p.totalWins || 0)), speed: row('topSpeed', (p) => Math.floor(p.topSpeed || 0)), race: row('matchWins', (p) => Math.floor(p.matchWins || 0)) };
        if (client) client.send('boards', m); else this.broadcast('boards', m);
    }

    onQa(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (finite(m.wins)) { p.wins += m.wins; p.totalWins += Math.max(0, m.wins); }
        if (finite(m.gems)) p.gems += m.gems;
        if (finite(m.lv)) { p.lv = clamp(m.lv | 0, 1, 999); p.xp = 0; }
        if (finite(m.speed)) { p.speed = Math.max(0, m.speed); p.topSpeed = Math.max(p.topSpeed, p.speed); }
        if (finite(m.rebirths)) p.rebirths = clamp(m.rebirths | 0, 0, 99);
        if (m.allCars) for (const c of CARS) p.cars[c.id] = 1;
        if (finite(m.car)) p.car = clamp(m.car | 0, 0, CARS.length - 1);
        if (m.ups && typeof m.ups === 'object') for (const id of Object.keys(m.ups)) { const u = upgradeById[id]; if (u) p.ups[id] = clamp(m.ups[id] | 0, 0, u.max); }
        if (finite(m.steps)) p.steps = Math.max(0, m.steps | 0);
        if (finite(m.spins)) p.spins = clamp(m.spins | 0, 0, 99);
        if (finite(m.qi)) p.qi = clamp(m.qi | 0, 0, QUESTS.length);
        if (finite(m.playSecs)) s.playSecs = m.playSecs | 0;
        if (m.tasks) { const jq = this.jqOf(p, Date.now()); for (const q of jq.list) q.p = TASKS[q.k].n; }
        if (finite(m.best)) { p.bests[p.world] = clamp(m.best | 0, 0, WALLS_N); }
        if (finite(m.reach)) p.reach[p.world] = clamp(m.reach | 0, 0, WALLS_N - 1);
        if (m.openWorlds) { for (let w = 0; w < WORLDS.length; w++) p.bests[w] = WALLS_N; p.rebirths = Math.max(p.rebirths, worldReb(WORLDS.length - 1)); }
        if (m.allPals) { for (const a of PALS) { p.pals[a.id] = (p.pals[a.id] || 0) + 1; p.index[a.id] = 1; } this.bestTeam(p); }
        if (finite(m.lv)) s.player.lv = p.lv;
        if (m.padCool) p.padAt = {};
        // every bot off to the craters now (to watch them drive)
        if (m.botsRun) for (const b of this.bots) if (!b.run) { b.hang = 0; b.post = -1; b.pl.post = 255; b.goal = { x: rnd(-3, 3), z: W.plaza.z0 + 4, run: true }; b.until = Date.now() + 60000; }
        // a QA teleport: where the next move is checked from (a new life from where it lands, like a warp: every gate behind it open)
        if (Array.isArray(m.tp) && m.tp.every(finite)) {
            s.last = { x: m.tp[0], y: m.tp[1], z: m.tp[2] }; s.lastAt = Date.now(); s.homeAt = 0; s.moveB = undefined;
            const k = clamp(stageAt(m.tp[2]), -1, WALLS_N - 1);
            this.newLife(s, k);
            if (m.tpOpen) s.life.out = (1 << WALLS_N) - 1;
        }
        this.changed(s);
    }


    // ----- the bots: a few drivers about when it's quiet (each real player sends one home): on a dyno a while, a drive round Base
    // Camp, and off up the craters. In a crater a bot rides on rails: laps round the wall as high as its Level's speed holds, and
    // if that's as high as the rim, out over it, round the deck and on to the next. They level up as they go. -----
    fillBots() {
        // (QA: no bots at all, for a clean shot)
        const want = process.env.NO_BOTS && !process.env.BLOXITY_GAME_ID ? 0 : Math.max(0, CFG.bots - this.sessions.size);
        while (this.bots.length > want) { const b = this.bots.pop(); this.state.players.delete(b.id); }
        const used = new Set([...this.state.players.values()].map((p) => p.name));
        while (this.bots.length < want) {
            const id = 'bot' + Math.floor(Math.random() * 1e9);
            let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
            for (let i = 0; used.has(name) && i < 20; i++) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + (i > 10 ? i : '');
            used.add(name);
            const lv = Math.floor(rnd(2, 20)), pl = new PlayerState(), x = rnd(-40, 40), z = rnd(84, 128);
            const team = Array.from({ length: Math.floor(rnd(0, 3)) }, () => (Math.random() < 0.6 ? 'rookie' : 'lunar') + Math.floor(rnd(0, 5))).join(',');
            Object.assign(pl, { name, bot: true, pid: this.freePid(), lv, wins: Math.floor(rnd(5, 600)), x, y: 0, z, ry: Math.PI, t: Date.now(), world: 0, car: botCar(lv), team, title: titleOf(lv), trail: Math.random() < 0.4 ? 1 + Math.floor(Math.random() * 3) : 0 });
            pl.av = botAvatar();
            this.state.players.set(id, pl);
            this.bots.push({ id, pl, lv, v: maxWalk({ lv }), x, z, ry: Math.PI, sp: 0, skill: rnd(0.9, 0.99), lvAt: Date.now() + rnd(30000, 80000), goal: null, until: 0, post: -1, hang: 0, run: null });
        }
    }
    driveBot(b, now, dt) {
        const pl = b.pl;
        // a Level every minute or so (its top speed with it)
        if (now > b.lvAt) { b.lvAt = now + rnd(45000, 90000); if (b.lv < 40) { b.lv++; b.v = maxWalk({ lv: b.lv }); pl.lv = b.lv; } }
        pl.t = now;
        if (b.run) { this.botRun(b, now, dt); return; }
        // on a dyno: wheels spinning on the rollers
        if (b.hang > now) { pl.anim = 3; pl.post = b.post; pl.spd = 34; return; }
        if (b.post >= 0) { b.post = -1; pl.post = 255; b.goal = null; }
        if (!b.goal || now > b.until) {
            const r = Math.random();
            // (a dyno nobody else is on; off to the craters; or a drive round the square)
            const taken = new Set(); for (const o of this.bots) if (o !== b && o.goal && o.goal.post !== undefined) taken.add(o.goal.post);
            const free = [0, 1, 2, 3, 4].filter((i) => !taken.has(i));
            if (r < 0.25 && free.length) { const pi = free[Math.floor(rnd(0, free.length))], sp = postSpot(pi); b.goal = { x: sp.x, z: sp.z + 1, post: pi, via: sp.z + BELT.l / 2 + 8 }; }
            else if (r < 0.75) b.goal = { x: rnd(-3, 3), z: W.plaza.z0 + 4, run: true };
            else b.goal = { x: rnd(-60, 30), z: rnd(84, 126) };
            b.until = now + (b.goal.run || b.goal.post !== undefined ? 30000 : 10000);
        }
        // (onto a dyno from its open end, to the bridge up the middle)
        let gx = b.goal.x, gz = b.goal.z;
        if (b.goal.via !== undefined && (b.z > b.goal.via + 1 || Math.abs(b.x - gx) > 2.5) && b.z > gz + 3) gz = b.goal.via;
        if (b.goal.run && b.z > W.plaza.z0 + 26 && Math.abs(b.x) > 6) { gx = 0; gz = W.plaza.z0 + 22; }
        const dx = gx - b.x, dz = gz - b.z, d = Math.hypot(dx, dz);
        if (d > 1.6) {
            const turn = angTo(b.ry, Math.atan2(dx, dz)), face = Math.cos(turn);
            b.ry += clamp(turn, -2.6 * dt, 2.6 * dt);
            b.sp += ((face > 0.2 ? Math.min(b.v, 30, 6 + d * 1.5) * face : 5) - b.sp) * Math.min(1, dt * 2.5);
            b.x += Math.sin(b.ry) * b.sp * dt; b.z += Math.cos(b.ry) * b.sp * dt;
        } else if (b.goal.post !== undefined && gz === b.goal.z) { b.post = b.goal.post; b.hang = now + rnd(4000, 9000); b.ry = Math.PI; b.x = b.goal.x; b.z = b.goal.z; b.sp = 0; }
        else if (b.goal.run && gz === b.goal.z) { this.botStart(b); return; }
        else if (gz === b.goal.z) { b.goal = null; b.sp *= 0.5; }
        pl.x = b.x; pl.y = 0; pl.z = b.z; pl.ry = b.ry;
        pl.anim = b.sp > 1.5 ? 1 : 0; pl.spd = b.sp; pl.post = 255;
    }
    // off up the craters: as far as its Level takes it
    botStart(b) { b.run = { k: 0, ph: 0, t: 0, a: 0, u: 0, r: 0, dir: Math.random() < 0.5 ? 1 : -1, lapFor: 0, y: 0 }; b.x = clamp(b.x, -4, 4); }
    // back at Base Camp (a run's end)
    botHome(b) {
        const pl = b.pl;
        b.run = null; b.goal = null; b.until = 0; b.sp = 0;
        b.x = W.spawn.x + rnd(-14, 14); b.z = W.spawn.z + rnd(-6, 10); b.ry = Math.PI;
        pl.x = b.x; pl.y = 0; pl.z = b.z; pl.anim = 0; pl.ry = b.ry; pl.spd = 0;
    }
    // a bot's run, one tick. ph: 0 up the bridge, 1 over the rim and down the wall, 2 laps, 3 out over the rim, 4 round the deck
    botRun(b, now, dt) {
        const r = b.run, pl = b.pl, I = islandOf(r.k), v = b.v;
        pl.post = 255; pl.anim = 1;
        r.t += dt;
        if (r.ph === 0) {
            // up the bridge and straight along the road, to where it runs off the rim
            const sp = Math.min(v, 40);
            b.z -= sp * dt; b.x += (0 - b.x) * Math.min(1, dt * 2); b.ry = Math.PI;
            pl.x = b.x; pl.z = b.z; pl.y = heightAt(0, b.x, b.z); pl.ry = b.ry; pl.spd = sp;
            if (b.z <= I.cz + I.R + 0.5) { r.ph = 1; r.t = 0; r.a = I.a0; r.u = 1; r.dir = Math.random() < 0.5 ? 1 : -1; r.dip = clamp(Math.min(1, reachU(I, v)) * 0.6, 0.25, 0.7); }
            return;
        }
        const rimY = I.E, span = I.R - I.r0;
        const put = (a, rad, y, air) => { pl.x = I.cx + Math.sin(a) * rad; pl.z = I.cz + Math.cos(a) * rad; pl.y = y; pl.ry = a + r.dir * Math.PI / 2; pl.anim = air ? 2 : 1; b.x = pl.x; b.z = pl.z; };
        if (r.ph === 1) {
            // off the rim and down onto the wall, half along it: the carve in
            const k = Math.min(1, r.t / 1.3);
            r.u = 1 - (1 - r.dip) * Math.sin(k * Math.PI / 2);
            const rad = I.r0 + span * r.u;
            r.a += r.dir * v * 0.85 / rad * dt;
            put(r.a, rad, I.E - I.H + I.H * r.u * r.u, false);
            pl.ry = r.a + r.dir * (Math.PI / 2 + (1 - k) * 0.7);
            pl.spd = v;
            if (k >= 1) { r.ph = 2; r.t = 0; r.lapFor = rnd(12, 26); }
            return;
        }
        if (r.ph === 2) {
            // round the wall: as high as its speed holds (a little under: nobody's line is perfect); with NITRO as it comes up to
            // the far crescent. Up on the chevrons along the top of the wall there, it's thrown out
            const toBand = Math.abs(angDiff(I.aX, r.a)) - exitArc(I), nitro = toBand < 0.5;
            const top = reachU(I, v * (nitro ? BURST : 1)), want = Math.min(1, top) * (top >= 1 ? 1 : b.skill) + Math.sin(now / 900 + b.skill * 40) * 0.015;
            r.u += clamp(want - r.u, -0.25 * dt, 0.12 * dt);
            const rad = I.r0 + span * r.u;
            r.a += r.dir * v / rad * dt;
            put(r.a, rad, I.E - I.H + I.H * r.u * r.u, false);
            pl.spd = v;
            if (r.u >= exitU(I) && toBand < -0.03) { r.ph = 3; r.t = 0; r.u0 = r.u; }
            else if (r.t > r.lapFor && reachU(I, v * BURST) < exitU(I) + 0.02) this.botHome(b);
            return;
        }
        if (r.ph === 3) {
            // thrown up over the lip: a hop onto the crescent
            const k = Math.min(1, r.t / 0.7), rad0 = I.r0 + span * r.u0, rad = rad0 + (I.R + 7 - rad0) * k, y0 = I.E - I.H + I.H * r.u0 * r.u0;
            r.a += r.dir * v / I.R * dt * (1 - 0.6 * k);
            put(r.a, rad, y0 + (rimY - y0) * k + Math.sin(k * Math.PI) * 3.5, k < 0.9);
            pl.spd = v;
            if (k >= 1) { r.ph = 4; r.t = 0; pl.wins += padWins(0, r.k); }
            return;
        }
        // along the crescent to where the road goes on, and on over the next bridge
        const rad = I.R + 7, sp = Math.min(v, 40), left = angDiff(r.a, I.aX);
        if (Math.abs(left) > 0.05 && Math.abs(b.x) > 2) {
            const way = left > 0 ? 1 : -1;
            r.a += way * Math.min(Math.abs(left), sp / rad * dt);
            put(r.a, rad, rimY, false);
            pl.ry = r.a + way * Math.PI / 2;
            pl.spd = sp;
            return;
        }
        if (r.k + 1 >= WALLS_N || recLevel(0, r.k + 1) > b.lv + 3) { this.botHome(b); return; }
        b.ry = Math.PI;
        r.k++; r.ph = 0; r.t = 0; r.dir = Math.random() < 0.5 ? 1 : -1;
    }

    // ----- Bloxity -----
    async onBloxityLogin(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || s.authing) return;
        s.authing = true;
        const legion = await verifyBloxityToken(m.token);
        s.authing = false;
        if (!legion || !this.sessions.has(client.sessionId)) return;
        const uid = 'legion_' + legion.id;
        if (s.profile.uid === uid) return;
        const name = cleanName(legion.name) || s.profile.name;
        const guestProfile = s.profile, world0 = guestProfile.world;
        guestProfile.lastSeen = Date.now();
        await adoptGuestProgress(uid, guestProfile.uid, name);
        await loadProfile(uid);
        if (!this.sessions.has(client.sessionId)) return;
        kickOthers(uid, s);
        s.profile = getProfile(uid, name, randomName());
        this.fixProfile(s.profile);
        s.profile.lastSeen = Date.now();
        if (!isOnline(guestProfile.uid)) releaseProfile(guestProfile.uid, isOnline);
        s.player.name = s.profile.name;
        if (!s.match) {
            const w1 = s.profile.world;
                if (w1 !== world0 || s.last.z < W.plaza.z0) {
                const sx = W.spawn.x + rnd(-4, 4), to = { x: sx, y: 0, z: W.spawn.z };
                this.placeAt(s, to.x, 0, to.z);
                this.newLife(s, -1);
                if (w1 !== world0) this.sendTo(s, 'warp', { w: w1, x: sx, z: W.spawn.z }); else this.sendTo(s, 'warped', to);
            }
        }
        this.changed(s);
        client.send('authed', { name: s.profile.name });
        this.toast(s, 'Logged in as ' + s.profile.name, GREEN);
        this.broadcastBoards();
    }
    onAvatar(client, m) {
        const s = this.sessions.get(client.sessionId), now = Date.now();
        if (!s || !m || now - (s.avAt || 0) < 500) return;
        s.avAt = now;
        s.player.av = cleanAvatar(m.av);
    }
    onEmote(client, m) {
        const s = this.sessions.get(client.sessionId);
        const now = Date.now();
        if (!s || !m || typeof m.id !== 'string' || m.id.length > 40 || now - (s.emoteAt || 0) < 700) return;
        s.emoteAt = now;
        this.broadcast('emote', { s: client.sessionId, id: m.id }, { except: client });
    }
    onChat(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.text !== 'string') return;
        const now = Date.now();
        if (now - s.lastChat < 800) return;
        s.lastChat = now;
        const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (text) this.broadcast('chat', { s: client.sessionId, name: s.profile.name, text });
    }
}

// a dropped player's "world": nobody's in it, so nobody draws them
const OFFSTAGE = 99;
const DROP_MATCH_MS = 6000;
const botAvatar = () => JSON.stringify({ e: { skinId: String(Math.floor(Math.random() * 21)) }, p: { height: Math.round(rnd(0.92, 1.08) * 100) / 100 } });
// the car a bot of this Level would have bought by now
const botCar = (lv) => clamp(Math.floor(lv / 5 + rnd(-0.6, 0.9)), 0, 7);
const TAU = Math.PI * 2;
const angTo = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
// the same player somewhere else (another tab, another server): they leave there
function kickOthers(uid, keep) {
    // (one waiting to reconnect has no socket to close: its wait is over)
    for (const room of liveRooms) for (const o of room.sessions.values()) if (o.profile.uid === uid && o !== keep) { try { if (o.recon) o.recon.reject(false); else o.client.leave(4000); } catch (e) { /* gone */ } }
}
function isOnline(uid) {
    for (const room of liveRooms) for (const s of room.sessions.values()) if (s.profile.uid === uid) return true;
    return false;
}
