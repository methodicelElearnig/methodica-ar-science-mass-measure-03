/* 03-02 — העצירה אחרי שאלה 3: "ענו נכון על 2 שאלות ומעלה כדי להתקדם" (מסך 0).
 *
 * דיווח MOE 05-06.10: גם כשעונים שגוי על שלוש השאלות, "המשך" של שאלה 3 הוביל למסך 4
 * ("יופי של עבודה! ...שאלה ברמת קושי גבוהה יותר"). מעכשיו: כשכל שלוש השאלות הוכרעו
 * ופחות משתיים נכונות, "המשך" מסיים את הרכיב על מסך 3 — completed success:false פעם
 * אחת, הכפתור מושבת — ונשאר מסתיים אחרי ריענון.
 *
 * הכול דרך הכפתורים האמיתיים (sN-check.click()), לא דרך קריאות ישירות ל-goTo.
 *
 *   NODE_PATH=/tmp/lomda-test/node_modules node _test/basic-stop.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || path.join(__dirname, '..');
const UNIT_SLUG = fs.readdirSync(BASE).find(d => /-03-02$/.test(d)).replace(/-02$/, '');
const C = '02';

let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('SKIPPED - jsdom not resolvable (see _test/README.md).');
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

function boot() {
  const dir = path.join(BASE, UNIT_SLUG + '-' + C);
  const dom = new JSDOM(read(path.join(dir, 'index.html')), {
    url: 'http://localhost:8777/' + UNIT_SLUG + '-' + C + '/index.html',
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
  for (const f of ['10-identity', '20-xapi', '25-report', '40-resume']) {
    inject(read(path.join(BASE, 'unit-js', f + '.js')));
  }
  inject(read(path.join(dir, 'script.js')));
  const meta = readJson(path.join(BASE, 'metadata', UNIT_SLUG + '-' + C + '.json'));
  inject(
    'window.METADATA = ' + JSON.stringify(meta) + ';' +
    'window.XAPI_USING_G = true;' +
    'window.__log = [];' +
    'window.sendStatement720 = function (verb, objType, result, ctx) {' +
    '  window.__log.push({ verb: verb, objectId: (ctx && (ctx.objectId || ctx.questionId)) || null, result: result || null });' +
    '};'
  );
  const val = (expr) => {
    inject('window.__V = (function(){ try { return (' + expr + '); } catch (e) { return "__THREW__" + e.message; } })();');
    return w.__V;
  };
  const run = (code) => inject(code);
  const errors = [];
  w.addEventListener('error', (e) => errors.push(e.message));
  return { w, val, run, errors, close: () => w.close() };
}

const click = (P, id) => P.run("document.getElementById('" + id + "').click();");
/* Component-level completed: no item objectId. */
const compCompleted = (P) => JSON.parse(P.val('JSON.stringify(window.__log)'))
  .filter(s => s.verb === 'completed' && !s.objectId);

/* answer: 'R' right, 'W' wrong (two attempts, two different wrong answers — the retry gate
   refuses the same wrong answer twice). */
function answer(P, q, how) {
  if (q === 1) {
    if (how === 'R') { P.run("s1Toggle('b'); s1Toggle('c');"); click(P, 's1-check'); }
    else { P.run("s1Toggle('a'); s1Toggle('d');"); click(P, 's1-check'); P.run("s1Toggle('a'); s1Toggle('b');"); click(P, 's1-check'); }
  } else if (q === 2) {
    if (how === 'R') { P.run("s2Select('a');"); click(P, 's2-check'); }
    else { P.run("s2Select('b');"); click(P, 's2-check'); P.run("s2Select('d');"); click(P, 's2-check'); }
  } else {
    if (how === 'R') { P.run("s3Select('c');"); click(P, 's3-check'); }
    else { P.run("s3Select('a');"); click(P, 's3-check'); P.run("s3Select('b');"); click(P, 's3-check'); }
  }
}

/* Walk s0 -> s3 through the real buttons, answering as `pattern` says ('WWW', 'RRW', ...). */
function walk(P, pattern) {
  click(P, 's0-continue');
  answer(P, 1, pattern[0]); click(P, 's1-check');   // after the answer, the same button is "continue"
  answer(P, 2, pattern[1]); click(P, 's2-check');
  answer(P, 3, pattern[2]);
}

const screen = (P) => P.val('currentScreen');
const s3dis = (P) => P.val("document.getElementById('s3-check').disabled");

// ── static: the promise is still on screen 0 ──
{
  const html = read(path.join(BASE, UNIT_SLUG + '-' + C, 'index.html'));
  ok('static', 's0 promises 2 of 3 (the rule this test enforces)',
     /ענו נכון על 2 שאלות ומעלה כדי להתקדם|أجيبوا بشكل صحيح عن سؤالين فما فوق لتتمكّنوا من التقدّم/.test(html));
}

for (const pattern of ['WWW', 'WWR', 'WRW', 'RWW']) {
  const scope = pattern + ' (' + pattern.split('').filter(c => c === 'R').length + '/3)';
  const P = boot();
  walk(P, pattern);
  ok(scope, 'reaches screen 3 with Q3 resolved', screen(P) === 3 && P.val('s3Done') === true, 'screen=' + screen(P));
  ok(scope, 'before "continue": button live, nothing completed', s3dis(P) === false && compCompleted(P).length === 0);
  click(P, 's3-check');
  ok(scope, '"continue" stays on screen 3 (no "יופי של עבודה")', screen(P) === 3, 'screen=' + screen(P));
  const c1 = compCompleted(P);
  ok(scope, 'one component completed, success:false', c1.length === 1 && c1[0].result && c1[0].result.success === false, JSON.stringify(c1));
  ok(scope, 'button disabled', s3dis(P) === true);
  P.run("document.getElementById('s3-check').disabled = false;"); click(P, 's3-check');
  ok(scope, 'a second click sends nothing more', compCompleted(P).length === 1);
  P.run('goTo(4);');
  ok(scope, 'goTo(4) from the stop does not pass it', screen(P) === 3, 'screen=' + screen(P));

  // reload after the end, off-platform (empty ledger): stays ended
  const st = P.val('JSON.stringify(capturePartPayload())');
  ok(scope, 'resume document carries basicStopEnded', JSON.parse(st).basicStopEnded === true);
  const R = boot();
  R.run('applyExecutionState(' + st + ', 3);');
  ok(scope, 'reload: on screen 3, button still disabled', screen(R) === 3 && s3dis(R) === true);
  R.run('goTo(2); goTo(3);');
  ok(scope, 'reload + back and forward: still disabled', s3dis(R) === true);
  ok(scope, 'reload sends no completed', compCompleted(R).length === 0);
  ok(scope, 'no page errors', P.errors.length === 0 && R.errors.length === 0, P.errors.concat(R.errors).join(' | '));
  P.close(); R.close();
}

// answered all three, not clicked yet, then reload: the button is live and ends the component
{
  const scope = 'WWW reload before click';
  const P = boot();
  walk(P, 'WWW');
  const st = P.val('JSON.stringify(capturePartPayload())');
  const R = boot();
  R.run('applyExecutionState(' + st + ', 3);');
  ok(scope, 'button live after reload', s3dis(R) === false);
  click(R, 's3-check');
  const c = compCompleted(R);
  ok(scope, 'its click ends the component (success:false), stays on 3',
     screen(R) === 3 && c.length === 1 && c[0].result.success === false && s3dis(R) === true, JSON.stringify(c));
  P.close(); R.close();
}

for (const pattern of ['RRW', 'RWR', 'WRR', 'RRR']) {
  const scope = pattern + ' (pass)';
  const P = boot();
  walk(P, pattern);
  click(P, 's3-check');
  ok(scope, '"continue" goes to screen 4', screen(P) === 4, 'screen=' + screen(P));
  ok(scope, 'nothing completed at the stop', compCompleted(P).length === 0);
  P.close();
}

console.log('\n' + (failures.length ? failures.join('\n') + '\n' : ''));
console.log(failures.length ? `=== basic stop: ${pass} passed, ${failures.length} failed ===` : `All ${pass} basic-stop checks passed.`);
process.exit(failures.length ? 1 : 0);
