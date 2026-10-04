/* Statement-flow verification: does walking the screens emit the right xAPI
   statements, in the right order?

   Everything here is driven from SCREEN_TO_SUBCONTENT, so it needs no knowledge
   of what any individual screen contains, which is what makes it portable.

   ⚠️ KNOW WHAT THIS CANNOT TELL YOU. Expectations are derived from the same map
   the code reads, so the two agree by construction. This verifies that
   xapiOnScreen faithfully IMPLEMENTS the map — it cannot tell you the map is
   RIGHT. Give a narrative screen an item it should not have and everything here
   still passes, because the code dutifully reports what the map now says.
   Whether a screen deserves an item is a content judgement, checked by reading
   the screen; verify-report.js separately checks the map against metadata in
   both directions, which catches items that exist nowhere or are unreachable.

   What it does catch, demonstrated by mutation:
     - goTo losing its xapiOnScreen call (3 failures)
     - an item split across non-adjacent screens, so it opens twice
     - a boundary emitting in the wrong order, or emitting when it should be
       silent

   The CDN library is not involved. sendStatement720 is replaced with a recorder,
   which is exactly the seam every send path in 20-xapi.js is gated on, so this
   exercises our own item-scope logic rather than the library's.

   Needs jsdom, installed outside this tree (see _test/verify-report.js):
     NODE_PATH=/tmp/lomda-test/node_modules node _test/statement-flow.js
*/
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || path.join(__dirname, '..');
const UNIT_SLUG = 'methodica-ar-science-mass-measure-03';
const COMPONENTS = ['01', '02', '04', '05', '06'];

let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('SKIPPED - jsdom not resolvable.');
  console.log('  mkdir -p /tmp/lomda-test && cd /tmp/lomda-test && npm install jsdom');
  console.log('  NODE_PATH=/tmp/lomda-test/node_modules node _test/statement-flow.js');
  process.exit(0);
}

const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p).replace(/^﻿/, ''));

let pass = 0;
const failures = [];
function ok(scope, name, cond, detail) {
  if (cond) { pass++; return; }
  failures.push('  [' + scope + '] ' + name + (detail ? '\n      -> ' + detail : ''));
}

function boot(c) {
  const dir = path.join(BASE, UNIT_SLUG + '-' + c);
  const dom = new JSDOM(read(path.join(dir, 'index.html')), {
    url: 'http://localhost:8777/' + UNIT_SLUG + '-' + c + '/index.html',
    runScripts: 'dangerously',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      w.HTMLMediaElement.prototype.play = () => Promise.resolve();
      w.HTMLMediaElement.prototype.load = () => {};
      w.requestAnimationFrame = (cb) => { cb(0); return 0; };
      w.cancelAnimationFrame = () => {};
      const zeroRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() { return this; } });
      w.Range.prototype.getBoundingClientRect = zeroRect;
      w.Range.prototype.getClientRects = () => Object.assign([], { item: () => null });
    },
  });
  const w = dom.window;
  const inject = (code) => {
    const s = w.document.createElement('script');
    s.textContent = code;
    w.document.body.appendChild(s);
  };
  /* 50-loader.js and 90-boot.js are deliberately omitted: they would try to pull
     the CDN library and run the real boot sequence. This suite is about item
     scope, which lives in 20-xapi.js. */
  for (const f of ['10-identity', '20-xapi', '25-report', '40-resume']) {
    inject(read(path.join(BASE, 'unit-js', f + '.js')));
  }
  inject(read(path.join(dir, 'script.js')));

  /* Stand in for what the loader would have set up. XAPI_USING_G is the gate
     every item-level statement is checked against. */
  const meta = readJson(path.join(BASE, 'metadata', UNIT_SLUG + '-' + c + '.json'));
  inject(
    'window.METADATA = ' + JSON.stringify(meta) + ';' +
    'window.XAPI_USING_G = true;' +
    'window.__log = [];' +
    'window.sendStatement720 = function (verb, objType, result, ctx) {' +
    '  window.__log.push({ verb: verb, objectId: (ctx && (ctx.objectId || ctx.questionId)) || null });' +
    '};'
  );
  const val = (expr) => {
    inject('window.__V = (function(){ try { return (' + expr + '); } catch (e) { return "__THREW__" + e.message; } })();');
    return w.__V;
  };
  const run = (code) => inject(code);
  const drain = () => { const l = JSON.parse(val('JSON.stringify(window.__log)')); run('window.__log = [];'); return l; };
  return { w, val, run, drain, meta, close: () => w.close() };
}

/* Short, readable form of a statement: verb plus the item suffix it points at. */
const fmt = (s) => s.verb + ':' + (String(s.objectId || '').replace(/\/$/, '').split('-').pop() || 'component');

for (const c of COMPONENTS) {
  let ctx;
  try { ctx = boot(c); }
  catch (e) { ok(c, 'component boots in jsdom', false, e.message); continue; }
  const { val, run, drain, close } = ctx;

  const map = JSON.parse(val('JSON.stringify(SCREEN_TO_SUBCONTENT)'));
  const total = val('TOTAL_SCREENS');
  const suffixOf = (n) => (map[n] ? map[n][0] : null);

  run('xapiCurrentItem = null;');
  /* The walk checks the MAP, so the library's answered map says yes for every item: with B-1's guard
     (QA 2026-10-02) an unanswered evaluated item closes nothing, which is checked on its own below. */
  run('window.xapiItemAnswered = new Proxy({}, { get: function () { return true; } });');
  run('goTo(0);');
  drain();

  /* Walk the component one screen at a time and check each transition against
     what the map says should happen. */
  for (let n = 1; n < total; n++) {
    const from = suffixOf(n - 1);
    const to = suffixOf(n);
    run('goTo(' + n + ');');
    const got = drain().map(fmt);
    const label = 'screen ' + (n - 1) + ' -> ' + n + ' (' + (from || 'null') + ' -> ' + (to || 'null') + ')';

    if (from === to) {
      /* Paging inside one item. Anything emitted here would be a duplicate
         initialized or an early completed. */
      ok(c, label + ': emits nothing', got.length === 0, got.join(', '));
    } else if (from && to) {
      ok(c, label + ': closes then opens, in order',
         got.length === 2 && got[0] === 'completed:' + from && got[1] === 'initialized:' + to,
         got.join(', '));
    } else if (from && !to) {
      ok(c, label + ': closes the open item and opens nothing',
         got.length === 1 && got[0] === 'completed:' + from, got.join(', '));
    } else {
      ok(c, label + ': opens the new item only',
         got.length === 1 && got[0] === 'initialized:' + to, got.join(', '));
    }
  }

  /* An item must occupy ONE unbroken run of screens. If it is interrupted and
     resumed — 006, null, 006 — the item is closed and reopened, emitting a
     second initialized and leaving the first stretch looking abandoned.
     ⚠️ nulls have to participate in the run-building. Skipping them would make
     006,null,006 collapse into a single 006 and hide exactly the case this is
     here to catch. */
  const runs = [];
  let prev;
  for (let n = 0; n < total; n++) {
    const s = suffixOf(n);
    if (s !== prev) { runs.push(s); prev = s; }
  }
  const itemRuns = runs.filter(Boolean);
  ok(c, 'each item occupies one contiguous run of screens',
     itemRuns.length === new Set(itemRuns).size,
     'runs in order: ' + runs.map((r) => r || 'null').join(' -> '));

  /* Screen 0 carries .active in markup, so the loader — not goTo — opens the
     landing item. If screen 0 has an item, entering screen 1 must not be what
     first opens it. */
  ok(c, 'screen 0 mapping is consistent with loader-driven landing',
     map[0] === null || Array.isArray(map[0]),
     JSON.stringify(map[0]));

  close();
}

/* ── B-1 (QA 2026-10-02): Back through an unanswered item ──
   Live (ar-mass-measure-03 01): S10 (item 007) left unanswered with Back to S9 (no item). The
   library dropped 007's 'completed' (no 'answered' yet) while the ledger marked it sent, so the real
   one after the learner answered was suppressed forever. */
{
  const { val, run, drain, close } = boot('01');
  run('_resumeReady = true; _unitState = emptyUnitState(); window.xapiItemAnswered = {}; xapiCurrentItem = null; goTo(9); goTo(10);');
  drain();
  run('goTo(9);');
  let got = drain().map(fmt);
  ok('B-1', '01 Back S10 → S9 from unanswered 007 sends no completed', !got.some((g) => g.startsWith('completed')), got.join(', '));
  ok('B-1', '01 …and leaves 007 out of the ledger', val("alreadySent('doneItems', itemLedgerKey('007'))") === false);
  run("goTo(10); xapiAnswered('007', 'q1', true, true, 'x'); window.xapiItemAnswered[xapiItemId('007')] = true; goTo(11);");
  got = drain().map(fmt);
  ok('B-1', '01 once answered, leaving 007 sends its completed exactly once', got.filter((g) => g === 'completed:007').length === 1, got.join(', '));
  close();
}

console.log('='.repeat(64));
if (failures.length) {
  console.log(failures.length + ' FAILED, ' + pass + ' passed\n');
  failures.forEach((f) => console.log(f));
  console.log('');
  process.exit(1);
}
console.log('All ' + pass + ' statement-flow checks passed.');
