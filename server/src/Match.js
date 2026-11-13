// Eruption on the server: the queue (everyone who presses RACE at about the same time goes in one race; it says how many were found),
// the start line (a late RACE still takes a bot's place until the gun), the race itself (six buggies on a volcano's floor, everyone's
// engine the same and stronger every second, the lava rising: whoever it reaches is out, first over the rim wins), the prizes. Bots
// only fill the empty places, and take over from a player who leaves.
import { PlayerState } from './schema.js';
import { CFG, WORLDS, PLACES, MATCH, matchLv, matchPower, matchPrize, clamp, BOT_NAMES } from '../../shared/config.js';
import { moveBudget } from '../../shared/physics.js';
import { arenaPlan, startSpot, surgeY, topAt, arenaReach, arenaNeed, arenaPoint, arenaPct } from '../../shared/arena.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const BOT_SKIN = () => JSON.stringify({ e: { skinId: String(Math.floor(Math.random() * 21)) }, p: { height: Math.round(rnd(0.92, 1.08) * 100) / 100 } });
// how close to the gun a late RACE can still take a bot's place (the fade into the race has to finish first)
const JOIN_MARGIN = 1500;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// a boost and NITRO together
const BURST = MATCH.boostK * CFG.dashK;

export class Match {
    constructor(room) {
        this.room = room;
        this.queue = null;
        this.matches = new Map();
        this.nextId = 1;
        // the maps take turns, so even a new player gets to see the later worlds' volcanoes
        this.nextMap = Math.floor(Math.random() * WORLDS.length);
    }
    send(s, type, m) { this.room.sendTo(s, type, m); }

    // ----- the queue -----
    press(s, m) {
        if (s.match) return;
        const now = Date.now();
        // waiting already: nothing changes (pressing again can't hold the queue open)
        if (this.queue && this.queue.list.includes(s)) { this.tellQueue(); return; }
        // a race on its start line takes you at once, in a bot's place
        for (const mt of this.matches.values()) if (mt.phase === 'ready' && mt.humans.size < mt.spots && now < mt.goAt - JOIN_MARGIN) { this.joinMatch(mt, s); return; }
        if (!this.queue) {
            const qa = process.env.QA === '1' && !process.env.BLOXITY_GAME_ID;
            const w = m && Number.isInteger(m.map) && qa ? clamp(m.map, 0, WORLDS.length - 1) : (this.nextMap++) % WORLDS.length;
            this.queue = this.newQueue(now, w, m && finite(m.lv) && qa ? m.lv | 0 : 0);
        }
        const q = this.queue;
        q.list.push(s);
        s.queued = true;
        if (q.list.length >= CFG.matchSpots) q.startAt = Math.min(q.startAt, now + CFG.matchFull * 1000);
        // someone new gets a moment to see who else turns up, but it opens for so long at most
        else if (q.list.length > 1) q.startAt = Math.min(q.lastAt, Math.max(q.startAt, now + 3000));
        // (QA: no waiting about)
        if (m && m.now && process.env.QA === '1' && !process.env.BLOXITY_GAME_ID) q.startAt = Math.min(q.startAt, now + 200);
        this.tellQueue();
    }
    newQueue(now, w, lvQa) { return { list: [], startAt: now + CFG.matchQueue * 1000, lastAt: now + (CFG.matchQueue + 12) * 1000, w, sec: 0, lvQa }; }
    cancel(s) {
        const q = this.queue;
        if (!q || !q.list.includes(s)) return;
        q.list.splice(q.list.indexOf(s), 1);
        s.queued = false;
        this.send(s, 'mQueue', { off: true });
        if (!q.list.length) this.queue = null; else this.tellQueue();
    }
    tellQueue() {
        const q = this.queue;
        if (!q) return;
        const lv = this.matchLevel(q.list, q), plan = arenaPlan(1, lv), msg = { found: q.list.length, spots: CFG.matchSpots, at: q.startAt, lv, segs: plan.n, map: q.w };
        for (const s of q.list) this.send(s, 'mQueue', msg);
    }
    matchLevel(list, q) {
        if (q && q.lvQa) return q.lvQa;
        if (!list.length) return 1;
        return Math.max(1, Math.round(list.reduce((a, s) => a + matchLv(s.profile), 0) / list.length));
    }

    // ----- a race -----
    startMatch(q) {
        const now = Date.now(), lv = this.matchLevel(q.list, q), id = this.nextId++, seed = 1 + Math.floor(Math.random() * 2e9);
        const plan = arenaPlan(seed, lv);
        const mt = { id, seed, lv, w: q.w, plan, spots: CFG.matchSpots, phase: 'ready', goAt: now + CFG.matchReady * 1000, endAt: 0, wrapAt: 0, racers: [], humans: new Set(), scoreAt: 0, finished: 0, firstAt: 0 };
        // the soonest anyone's engine could hold the rim (a boost and NITRO counted in): nobody is over it before then
        for (mt.tMin = 0; mt.tMin < plan.secs && topAt(plan.D, mt.tMin, 1.06) * BURST * 1.05 < arenaNeed(plan, 1); mt.tMin += 0.25);
        this.matches.set(id, mt);
        // the players on the line first, bots in every empty place
        q.list.forEach((s, i) => this.addHuman(mt, s, i));
        for (let i = q.list.length; i < mt.spots; i++) this.addBot(mt, i, null);
        for (const r of mt.racers) if (r.s) { r.s.queued = false; this.sendStart(mt, r); }
        return mt;
    }
    lane() { return { doneAt: 0, place: -1, out: false, outAt: 0, items: {}, pct: 0 }; }
    addHuman(mt, s, spot) {
        const pos = startSpot(spot, mt.plan), p = s.profile;
        const r = { s, spot, power: matchPower(p), x: pos.x, y: pos.y, z: pos.z, id: s.id, boostUntil: 0, ...this.lane() };
        mt.racers.push(r);
        mt.humans.add(s);
        s.match = mt; s.racer = r;
        this.room.toRace(s);
        s.player.match = mt.id; s.player.post = 255;
        s.last = { x: pos.x, y: pos.y, z: pos.z }; s.lastAt = Date.now(); s.homeAt = Date.now(); s.moveB = undefined;
        return r;
    }
    addBot(mt, spot, from) {
        const id = 'mb' + mt.id + '_' + spot + '_' + Math.floor(Math.random() * 1e6), pl = new PlayerState(), B = mt.plan.B;
        const taken = new Set(mt.racers.map((r) => r.name || (r.s && r.s.profile.name)));
        let name = from ? from.name : BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        for (let i = 0; !from && taken.has(name) && i < 20; i++) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        const pos = startSpot(spot, mt.plan), x = from ? from.x : pos.x, z = from ? from.z : pos.z, y = from ? from.y : pos.y, q = Math.hypot(x, z);
        Object.assign(pl, { name, bot: true, pid: this.room.freePid(), lv: from ? from.lv : Math.max(1, mt.lv + Math.round(rnd(-3, 3))), wins: from ? from.wins : rnd(5, 900), x, y, z, ry: pos.ry, t: Date.now(), world: mt.w, match: mt.id, car: from ? from.car : clamp(Math.floor(rnd(0, 3) + mt.lv / 6), 0, 9), trail: Math.random() < 0.4 ? 1 + Math.floor(Math.random() * 6) : 0, aura: 0, team: from ? from.team : '' });
        pl.av = from && from.av ? from.av : BOT_SKIN();
        this.room.state.players.set(id, pl);
        const b = {
            s: null, id, pl, spot, name, power: from ? from.power : rnd(1, 1.05), x, y, z,
            // (on rails: where round the volcano, how far out; on the wall its u follows what its speed holds)
            a: Math.atan2(x, z), rad: Math.max(4, Math.min(q, B.R)), u: clamp((q - B.r0) / (B.R - B.r0), 0, 1),
            pace: mt.plan.D.botPace * rnd(0.96, 1.02), trip: mt.plan.D.botTrip * rnd(0.7, 1.3), slipUntil: 0, boostUntil: 0, nextTrip: 0, nextPad: 0,
            ...this.lane(),
        };
        if (from) b.items = from.items;
        mt.racers.push(b);
        return b;
    }
    // a late RACE: the race hasn't started, so you take a bot's place on the line
    joinMatch(mt, s) {
        const bot = mt.racers.find((r) => !r.s);
        if (!bot) return;
        this.removeBot(mt, bot);
        if (this.queue && this.queue.list.includes(s)) this.cancel(s);
        const r = this.addHuman(mt, s, bot.spot);
        this.sendStart(mt, r);
        for (const o of mt.humans) if (o !== s) this.send(o, 'mJoined', { name: s.profile.name, found: mt.humans.size, spot: r.spot });
    }
    removeBot(mt, b) {
        this.room.state.players.delete(b.id);
        mt.racers.splice(mt.racers.indexOf(b), 1);
    }
    sendStart(mt, r) {
        this.send(r.s, 'mStart', this.startMsg(mt, r));
        this.send(r.s, 'mQueue', { off: true });
    }
    startMsg(mt, r) {
        const pos = startSpot(r.spot, mt.plan);
        return { id: mt.id, seed: mt.seed, lv: mt.lv, w: mt.w, n: mt.spots, spot: r.spot, x: pos.x, y: pos.y, z: pos.z, ry: pos.ry, goAt: mt.goAt, power: r.power, found: mt.humans.size, names: mt.racers.map((o) => ({ spot: o.spot, n: o.s ? o.s.profile.name : o.name })) };
    }
    // back from a dropped connection: what's going on now (whatever was said meanwhile never arrived)
    resync(s, home) {
        const mt = s.match, r = s.racer;
        if (this.queue && this.queue.list.includes(s)) this.tellQueue(); else this.send(s, 'mQueue', { off: true });
        if (!mt || !r) { this.send(s, 'mNone', home); return; }
        this.send(s, 'mSync', { start: this.startMsg(mt, r), phase: mt.phase, goAt: mt.goAt, endAt: mt.endAt, lanes: this.rows(mt) });
    }
    // a human leaves (quits or drops): a bot carries on from where they were, under their name
    leave(s, quit) {
        const mt = s.match, r = s.racer;
        if (this.queue && this.queue.list.includes(s)) this.cancel(s);
        if (!mt) return;
        mt.humans.delete(s);
        s.match = null; s.racer = null;
        if (s.player) s.player.match = 0;
        if (r) {
            mt.racers.splice(mt.racers.indexOf(r), 1);
            // (even in the race's last moment: their row stays on the board, under their name)
            const b = this.addBot(mt, r.spot, { name: s.profile.name, x: r.x, y: r.y, z: r.z, lv: s.profile.lv, wins: s.profile.totalWins, power: r.power, car: s.player ? s.player.car : 0, team: s.player ? s.player.team : '', av: s.player && s.player.av, items: r.items });
            b.doneAt = r.doneAt; b.place = r.place; b.out = r.out; b.outAt = r.outAt; b.pct = r.pct;
        }
        if (!mt.humans.size) this.closeMatch(mt);
        else if (quit) for (const o of mt.humans) this.send(o, 'mLeft', { name: s.profile.name });
    }
    closeMatch(mt) {
        for (const r of [...mt.racers]) if (!r.s) this.room.state.players.delete(r.id);
        this.matches.delete(mt.id);
    }

    // where a player says they are: in the volcano, never faster than the race's engine (and what sliding down its wall adds);
    // before the gun, on their start spot
    move(s, m, dt) {
        const mt = s.match, r = s.racer, L = s.last, now = Date.now(), plan = mt.plan, B = plan.B;
        if (s.homeAt) {
            if (now - s.homeAt < 5000 && Math.hypot(m.x - L.x, m.z - L.z) > 9) return true;
            s.homeAt = 0;
        }
        if (r.out || r.doneAt) { if (r.doneAt && Math.hypot(m.x - L.x, m.z - L.z) < 60) return false; return true; }
        const secs = (now - mt.goAt) / 1000, q = Math.hypot(m.x, m.z);
        let bad = !moveBudget(s, Math.hypot(m.x - L.x, m.z - L.z), topAt(plan.D, secs, r.power) * BURST * 1.25 + 12 + Math.sqrt(2 * CFG.grav * B.H) * 0.6, dt) || q > B.Ro + 3 || m.y > 60 || m.y < -B.H - 6;
        // before the gun you can shuffle about your spot, no further
        if (mt.phase === 'ready') { const p0 = startSpot(r.spot, plan); if (Math.hypot(m.x - p0.x, m.z - p0.z) > 9) bad = true; }
        if (bad) {
            if (now - s.snapAt > 300) {
                s.snapAt = now;
                this.send(s, 'snap', { x: L.x, y: L.y, z: L.z });
                if (process.env.QA === '1') console.log('[match snap]', s.profile.name, 'from', [L.x, L.y, L.z].map((v) => +v.toFixed(1)), 'to', [m.x, m.y, m.z].map((v) => +v.toFixed(1)));
            }
            return true;
        }
        r.x = m.x; r.y = m.y; r.z = m.z;
        r.pct = Math.max(r.pct, arenaPct(plan, m.y));
        // over the rim, onto the deck: escaped (never sooner than the race's engine could hold the rim)
        if (mt.phase === 'play' && q > B.R + 1 && m.y > -4 && secs >= mt.tMin) this.finishRacer(mt, r, now);
        return false;
    }
    // a boost chevron: you have to be at it, and each only now and then
    item(s, i) {
        const mt = s.match, r = s.racer, now = Date.now();
        if (!mt || !r || mt.phase !== 'play') return;
        const it = mt.plan.pads[i | 0];
        if (!it || now - (r.items[i | 0] || 0) < 3000) return;
        const p = arenaPoint(mt.plan, it.a, it.u);
        if (Math.hypot(s.last.x - p.x, s.last.z - p.z) > MATCH.r + 12) return;
        r.items[i | 0] = now;
        r.boostUntil = now + MATCH.boostSecs * 1000;
    }
    fell() { /* nothing to fall into: the lava is the server's to judge */ }
    hit() { /* a boulder's knock happens on the screen; the server only sees where you went */ }
    // over the rim: you're on the deck
    finish(s) {
        const mt = s.match, r = s.racer, now = Date.now();
        if (!mt || !r || mt.phase !== 'play' || r.doneAt || r.out) return;
        if (Math.hypot(s.last.x, s.last.z) < mt.plan.B.R - 2 || (now - mt.goAt) / 1000 < mt.tMin) return;
        this.finishRacer(mt, r, now);
    }
    finishRacer(mt, r, now) {
        if (r.doneAt || r.out) return;
        r.doneAt = now; r.pct = 1;
        r.place = mt.finished++;
        if (!mt.firstAt) {
            mt.firstAt = now;
            // the rest get a last few seconds
            mt.endAt = Math.min(mt.endAt, now + 12000);
        }
        for (const s of mt.humans) this.send(s, 'mDone', { spot: r.spot, place: r.place, endAt: mt.endAt, name: r.s ? r.s.profile.name : r.name });
    }
    // the lava reached someone: out where they are
    outRacer(mt, r, now) {
        r.out = true; r.outAt = now;
        for (const s of mt.humans) this.send(s, 'mOut', { spot: r.spot, name: r.s ? r.s.profile.name : r.name });
    }

    // 20 times a second
    update(now, dt) {
        const q = this.queue;
        if (q) {
            if (now >= q.startAt) {
                this.queue = null;
                const rest = q.list.splice(CFG.matchSpots);
                if (q.list.length) this.startMatch(q);
                if (rest.length) { this.queue = this.newQueue(now, (this.nextMap++) % WORLDS.length, 0); this.queue.list = rest; this.tellQueue(); }
            } else {
                q.sec += dt;
                if (q.sec >= 1) { q.sec = 0; this.tellQueue(); }
            }
        }
        for (const mt of this.matches.values()) this.tick(mt, now, dt);
    }
    tick(mt, now, dt) {
        if (mt.phase === 'ready') {
            if (now >= mt.goAt) {
                mt.phase = 'play'; mt.endAt = now + mt.plan.secs * 1000;
                for (const s of mt.humans) this.send(s, 'mGo', { at: now, secs: mt.plan.secs });
            }
            return;
        }
        if (mt.phase === 'done') {
            if (now >= mt.wrapAt) this.endMatch(mt);
            return;
        }
        for (const r of mt.racers) if (!r.s) this.driveBot(mt, r, now, dt);
        // the lava: a player's last word on where they are is a moment old, so it's judged a moment back
        const secs = (now - mt.goAt) / 1000;
        for (const r of mt.racers) {
            if (r.out || r.doneAt) continue;
            if (r.y < surgeY(mt.plan, r.s ? secs - 0.35 : secs) - 0.6) this.outRacer(mt, r, now);
        }
        this.flush(mt, now);
        if (now >= mt.endAt || mt.racers.every((r) => r.doneAt || r.out)) { mt.phase = 'done'; mt.wrapAt = now + 1400; this.flush(mt, now, true); for (const s of mt.humans) this.send(s, 'mTime', {}); }
    }
    rows(mt) { return mt.racers.map((r) => [r.spot, Math.round(r.pct * 100), r.place, r.out ? 1 : 0]); }
    // how far up everyone is
    flush(mt, now, force) {
        if (force || now - mt.scoreAt > 400) {
            mt.scoreAt = now;
            const list = this.rows(mt);
            for (const s of mt.humans) this.send(s, 'mScore', { s: list });
        }
    }
    // a bot: laps the volcano as high as the race's engine holds (a little under: nobody's line is perfect), now and then a slip
    // (a boulder, a slide) or a boost chevron
    driveBot(mt, b, now, dt) {
        const pl = b.pl, plan = mt.plan, B = plan.B, span = B.R - B.r0;
        pl.t = now;
        if (b.doneAt) { pl.anim = 0; pl.spd = 0; return; }
        if (b.out) { pl.anim = 0; pl.spd = 0; pl.y = b.y; return; }
        const secs = (now - mt.goAt) / 1000, boost = now < b.boostUntil, slip = now < b.slipUntil;
        const v = topAt(plan.D, secs, b.power) * b.pace * (boost ? MATCH.boostK : 1);
        if (now > b.nextTrip) { b.nextTrip = now + rnd(3500, 7500); if (b.u > 0.3 && Math.random() < b.trip) b.slipUntil = now + rnd(500, 900); }
        if (now > b.nextPad) { b.nextPad = now + rnd(2500, 5500); if (b.u > 0.25 && Math.random() < 0.55) b.boostUntil = now + MATCH.boostSecs * 1000; }
        // off the floor onto the wall, then up it as its speed allows
        if (b.rad < B.r0) { b.rad = Math.min(B.r0, b.rad + v * 0.35 * dt); b.u = 0; }
        else {
            const top = arenaReach(plan, v), want = top >= 1 ? 1.04 : top * 0.975;
            b.u = slip ? Math.max(0.08, b.u - 0.2 * dt) : b.u + clamp(want - b.u, -0.3 * dt, 0.1 * dt);
            b.rad = B.r0 + span * Math.min(1, b.u);
        }
        b.a += (slip ? v * 0.5 : v) / Math.max(6, b.rad) * dt;
        const u = Math.min(1, b.u);
        b.x = Math.sin(b.a) * b.rad; b.z = Math.cos(b.a) * b.rad; b.y = b.rad < B.r0 ? -B.H : -B.H + B.H * u * u;
        b.pct = Math.max(b.pct, arenaPct(plan, b.y));
        if (b.u >= 1 && secs >= mt.tMin) {
            // over the rim, onto the deck
            b.rad = B.R + 7; b.x = Math.sin(b.a) * b.rad; b.z = Math.cos(b.a) * b.rad; b.y = 0;
            this.finishRacer(mt, b, now);
        }
        pl.x = b.x; pl.y = b.y; pl.z = b.z; pl.ry = b.a + Math.PI / 2;
        pl.anim = 1; pl.spd = v;
    }
    endMatch(mt) {
        // first the ones who got out, in order; then how far up the rest got
        const order = mt.racers.slice().sort((a, b) => {
            if (a.doneAt && b.doneAt) return a.place - b.place;
            if (a.doneAt) return -1;
            if (b.doneAt) return 1;
            return b.pct - a.pct;
        });
        order.forEach((r, i) => { r.place = i; });
        const rows = order.map((r) => ({ n: r.s ? r.s.profile.name : r.name, place: r.place, pct: Math.round(clamp(r.pct, 0, 1) * 100), done: !!r.doneAt, out: !!r.out, bot: !r.s, spot: r.spot }));
        for (const s of [...mt.humans]) {
            const r = s.racer, prize = matchPrize(r.place, r.pct, mt.lv, s.profile);
            this.room.onMatchEnd(s, r, prize, rows, mt);
            s.match = null; s.racer = null;
            s.player.match = 0;
        }
        this.closeMatch(mt);
    }
    info() { return { queue: this.queue ? this.queue.list.length : 0, matches: this.matches.size }; }
}
void PLACES;
