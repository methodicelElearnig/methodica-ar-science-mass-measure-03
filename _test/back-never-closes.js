#!/usr/bin/env node
/* Back never closes an item (B-2) — monday 13454123722, 2026-11-13.
   A Back from a half-answered item used to send its 'completed' with the failed result at that moment
   (unit-js/20-xapi.js xapiOnScreen closed the item on ANY move to another item), and the doneItems ledger
   then swallowed the real 'completed' after the learner came back and answered right.

   Per part: the first graded item E that has another item before it and after it. Wrong answer recorded,
   Back (goTo the previous screen) -> no completed for E; return, right answer, forward -> exactly one,
   carrying the item result of that moment. Parts that declare XAPI_HUB_SCREENS: a move into a hub screen
   still closes the item it leaves. Unit-agnostic: the slug is the repo folder name, the parts are the
   folders <slug>-NN that have an index.html and a metadata file.

   Drives the real parts in jsdom (index.html scripts from disk, the CDN library replaced by an inline
   recorder that marks an item answered the way the library does).
     mkdir -p /tmp/lomda-test && cd /tmp/lomda-test && npm install jsdom
     NODE_PATH=/tmp/lomda-test/node_modules node _test/back-never-closes.js [package dir]
   Exit 1 on any failure. */
'use strict';
const fs = require('fs'), path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('SKIPPED: jsdom not on NODE_PATH'); process.exit(0); }

const REPO = path.resolve(__dirname, '..');
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : REPO;
const SLUG = path.basename(REPO);
const PARTS = fs.readdirSync(ROOT).map((d) => (new RegExp('^' + SLUG + '-(\\d\\d)$').exec(d) || [])[1]).filter(Boolean)
  .filter((p) => fs.existsSync(path.join(ROOT, SLUG + '-' + p, 'index.html')) && fs.existsSync(path.join(REPO, 'metadata', SLUG + '-' + p + '.json'))).sort();
let fails = 0, passes = 0;
const ok = (cond, msg, detail) => { if (cond) passes++; else { fails++; console.log('✗ ' + msg + (detail ? '\n    -> ' + detail : '')); } };

function load(part) {
  const dir = path.join(ROOT, SLUG + '-' + part);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const stripped = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, '<!--script:$1-->').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(stripped, { runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'http://localhost:8765/' + SLUG + '-' + part + '/index.html?registration=BNC-TEST' });
  const w = dom.window;
  for (const m of ['play', 'pause', 'load']) w.HTMLMediaElement.prototype[m] = function () { return m === 'play' ? Promise.resolve() : undefined; };
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  const errors = [];
  w.console.error = (...a) => errors.push(a.map(String).join(' '));
  w.addEventListener('error', (e) => errors.push('page error: ' + (e.error && e.error.stack || e.message)));
  const sent = []; let doc = null;
  w.XAPI_USING_G = true; w.xapiItemAnswered = {}; w.xapiCompletedObjects = {};
  w.METADATA = JSON.parse(fs.readFileSync(path.join(REPO, 'metadata', SLUG + '-' + part + '.json'), 'utf8').replace(/^﻿/, ''));
  w.sendStatement720 = (verb, type, result, ctx) => {
    if (verb.split('.')[0] === 'answered' && ctx && ctx.parentId) w.xapiItemAnswered[ctx.parentId] = true;   // as the library does
    sent.push({ verb, result: result || null, ctx: ctx || null });
  };
  w.loadState720 = () => doc;
  w.saveState720 = (id, o) => { doc = JSON.parse(JSON.stringify(o)); return true; };
  w.saveState720Debounced = (id, o) => { doc = JSON.parse(JSON.stringify(o)); };
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)) {
    const u = m[1];
    if (/^https?:/.test(u)) continue;
    const f = path.join(dir, u.split('?')[0]);
    if (!fs.existsSync(f)) continue;
    const s = w.document.createElement('script');
    s.textContent = fs.readFileSync(f, 'utf8') + '\n//# sourceURL=' + u;
    try { w.document.body.appendChild(s); } catch (e) { errors.push(u + ': ' + (e && e.stack || e)); }
  }
  const suffix = (id) => (/-(\d{3})\/?$/.exec(id) || [])[1];
  const itemDone = (item) => sent.filter((s) => s.verb === 'completed' && s.ctx && s.ctx.objectId && suffix(s.ctx.objectId) === item);
  return { w, sent, errors, itemDone };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
async function start(r) {
  await tick();
  try { r.w.readUnitState(); } catch (e) {}
  r.w._resumeReady = true;
  r.w.eval('typeof _resumeReady !== "undefined" && (_resumeReady = true)');
}
const val = (w, expr) => w.eval('(function(){ try { return JSON.stringify(' + expr + '); } catch (e) { return "null"; } })()');

(async () => {
  console.log(SLUG + ' — parts ' + PARTS.join(', ') + (ROOT !== REPO ? ' (package ' + ROOT + ')' : ''));
  let covered = 0;
  for (const part of PARTS) {
    const r = load(part); await start(r);
    const w = r.w;
    const map = JSON.parse(val(w, 'SCREEN_TO_SUBCONTENT')) || {};
    const evalItems = JSON.parse(val(w, 'typeof XAPI_EVAL_ITEMS !== "undefined" ? XAPI_EVAL_ITEMS : {}')) || {};
    const hubs = JSON.parse(val(w, 'typeof XAPI_HUB_SCREENS !== "undefined" ? XAPI_HUB_SCREENS : {}')) || {};
    const screens = Object.keys(map).map(Number).filter((n) => w.document.querySelector('[data-screen="' + n + '"]')).sort((a, b) => a - b);
    const itemOf = (n) => (map[n] ? map[n][0] : null);
    const go = (n) => w.eval('goTo(' + n + ')');
    const tag0 = part;

    /* hubs: a move into a hub screen from a later screen of another item closes that item */
    for (const h of Object.keys(hubs).map(Number)) {
      const from = screens.find((m) => m > h && itemOf(m) && itemOf(m) !== itemOf(h));
      if (from == null) { ok(false, tag0 + ' hub ' + h + ': no later screen of another item'); continue; }
      const rh = load(part); await start(rh);
      const F = itemOf(from);
      rh.w.xapiItemAnswered[rh.w.xapiItemId(F)] = true;
      rh.w.eval('goTo(' + from + ')'); rh.w.eval('goTo(' + h + ')');
      ok(rh.itemDone(F).length === 1, tag0 + ' hub ' + h + ': the move ' + from + ' -> ' + h + ' still closes item ' + F, String(rh.itemDone(F).length));
    }

    /* path switches: a part with XAPI_LEARNING_PATHS whose paths are separate items — switching from the later
       path into the earlier one (a lower screen) is a choice, not a Back, so it must still close the item it
       leaves; that needs the earlier path's first screen in XAPI_HUB_SCREENS */
    const paths = JSON.parse(val(w, 'typeof XAPI_LEARNING_PATHS !== "undefined" ? XAPI_LEARNING_PATHS : null'));
    if (paths) {
      const firsts = [...new Set(Object.values(paths).map((p) => p.item))]
        .map((item) => ({ item, n: screens.find((m) => itemOf(m) === item) })).filter((x) => x.n != null).sort((a, b) => a.n - b.n);
      for (let i = 1; i < firsts.length; i++) {
        const lo = firsts[0], hi = firsts[i];
        const rp = load(part); await start(rp);
        rp.w.xapiItemAnswered[rp.w.xapiItemId(hi.item)] = true;
        rp.w.eval('goTo(' + hi.n + ')'); rp.w.eval('goTo(' + lo.n + ')');
        ok(rp.itemDone(hi.item).length === 1, tag0 + ' path switch ' + hi.n + ' -> ' + lo.n + ' closes the path item ' + hi.item + ' (hub)', String(rp.itemDone(hi.item).length));
      }
    }

    const iE = screens.findIndex((n, i) => i > 0 && evalItems[itemOf(n)] && itemOf(screens[i - 1]) && itemOf(screens[i - 1]) !== itemOf(n)
      && !hubs[screens[i - 1]] && screens.slice(i + 1).some((m) => itemOf(m) && itemOf(m) !== itemOf(n)));
    if (iE < 0) { console.log('  part ' + part + ': no graded item with neighbours — skipped'); continue; }
    covered++;
    const E = itemOf(screens[iE]), prev = screens[iE - 1], here = screens[iE];
    const after = screens.slice(iE + 1).find((m) => itemOf(m) && itemOf(m) !== E);
    const tag = part + ' item ' + E + ' (s' + here + ')';
    const meta = w.METADATA;
    const it = (meta.subContent || []).find((s) => s.id.replace(/\/$/, '').slice(-3) === E);
    const qs = ((it && it.questions) || []).map((q) => E + '/' + q.questionId.split('/').pop());
    const setAll = (v) => { for (const k of qs) w.XAPI_Q_RESULTS[k] = v; w.xapiItemAnswered[w.xapiItemId(E)] = true; };
    go(prev); go(here);
    setAll(false);
    go(prev);                                         /* the Back */
    ok(Number(val(w, 'currentScreen')) === prev, tag + ': Back lands on the previous screen', val(w, 'currentScreen'));
    ok(r.itemDone(E).length === 0, tag + ': Back after a wrong answer sends no completed', JSON.stringify(r.itemDone(E).map((s) => s.result)));
    go(here);
    setAll(true);
    go(after);
    const cl = r.itemDone(E);
    ok(cl.length === 1, tag + ': the forward move after the right answer sends exactly one completed', String(cl.length));
    ok(!!cl[0] && JSON.stringify(cl[0].result) === val(w, 'xapiItemResult("' + E + '")'), tag + ': it carries the item result of the moment it closes', JSON.stringify(cl[0] && cl[0].result));
    ok(r.errors.length === 0, tag + ': no console.error', r.errors.slice(0, 2).join(' | '));
  }
  ok(covered >= Math.min(2, PARTS.length), 'B-2 covered in at least ' + Math.min(2, PARTS.length) + ' parts', String(covered));
  console.log('\n' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})();
