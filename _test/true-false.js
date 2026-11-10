/* נכון/לא נכון מדווחים 'true' / 'false', אף פעם לא את תווית הכפתור
   (Documentation/reporting-and-resume/ADDING-REPORTING-AND-RESUME.md §6.3b, 2026-11-04).
   Kata משווה את result.response ל-correctXapiResponsesPattern של השאלה, שהוא ["true"] / ["false"];
   "صحيح" / "غير صحيح" לעולם לא תואמים. הספרייה החיה (xapi-720-k / -l) שולחת את student_answer
   כ-result.response כשהעמוד לא נותן response, ולכן student_answer הוא מה שנבדק כאן.

   שאלות ה-true-false במטא-דאטה: 02-004 q3 (s8, כפתור בודד) ו-04-003 q1..q4 (s3, טבלה של ארבע שורות).
   כל אחת נענית נכון, שגוי פעמיים (הניסיון השני שונה — ה-Retry gate — והוא answered.last) ומעורב,
   דרך ה-handlers האמיתיים (s8Select / s8Check, s3Select / s3Check). לכל answered: הערך 'true' / 'false',
   הוא הבחירה, והוא שווה לתשובה הנכונה במטא-דאטה בדיוק כש-success.

   אותו אתחול jsdom כמו retry-gate.js, אבל sendStatement720 רושם את הקריאות.
     NODE_PATH=/tmp/lomda-test/node_modules node _test/true-false.js
*/
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || path.join(__dirname, '..');
const UNIT_SLUG = 'methodica-ar-science-mass-measure-03';

let JSDOM = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) {
  console.log('SKIPPED - jsdom not resolvable.');
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

/* the metadata's true/false questions per component, keyed '<item>/<qKey>', correct as 'true' / 'false' */
const TRUE_WORDS = ['true', 'נכון', 'כן', 'صحيح', 'نعم'];
function tfOf(c) {
  const out = {};
  const meta = readJson(path.join(BASE, 'metadata', UNIT_SLUG + '-' + c + '.json'));
  for (const it of meta.subContent) for (const qq of it.questions || []) {
    if (qq.questionType !== 'true-false') continue;
    const parts = qq.questionId.replace(/\/+$/, '').split('/');
    out[parts[parts.length - 2].slice(-3) + '/' + parts[parts.length - 1]] =
      TRUE_WORDS.indexOf(String(qq.correctAnswers[0]).trim()) !== -1 ? 'true' : 'false';
  }
  return { meta, tf: out };
}

function boot(c, meta) {
  const dir = path.join(BASE, UNIT_SLUG + '-' + c);
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ').slice(0, 200)));
  const dom = new JSDOM(read(path.join(dir, 'index.html')), {
    url: 'http://localhost:8777/' + UNIT_SLUG + '-' + c + '/index.html',
    runScripts: 'dangerously',
    virtualConsole: vc,
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
  const inject = (code) => { const s = w.document.createElement('script'); s.textContent = code; w.document.body.appendChild(s); };
  for (const f of ['10-identity', '20-xapi', '25-report', '30-pointer-dnd', '40-resume']) inject(read(path.join(BASE, 'unit-js', f + '.js')));
  inject(read(path.join(dir, 'script.js')));
  inject('window.METADATA = ' + JSON.stringify(meta) + '; window.XAPI_USING_G = true; window.__S = [];' +
    'window.sendStatement720 = function (verb, type, result, opts) { window.__S.push({ verb: verb, result: result, opts: opts }); };');
  return { w, run: inject, errors, close: () => w.close() };
}

/* one walk per screen: picks per attempt ('true' / 'false' per question key) */
const SCREENS = [
  { c: '02', screen: 8, keys: ['004/q3'],
    pick: (P, vals) => { P.run('s8Select(' + JSON.stringify(vals[0]) + '); s8Check();'); } },
  { c: '04', screen: 3, keys: ['003/q1', '003/q2', '003/q3', '003/q4'],
    pick: (P, vals) => { P.run(vals.map((v, i) => 's3Select(' + (i + 1) + ',' + JSON.stringify(v) + ');').join('') + 's3Check();'); } },
];
const flip = (v) => (v === 'true' ? 'false' : 'true');

for (const S of SCREENS) {
  const { meta, tf } = tfOf(S.c);
  ok(S.c, 'the metadata declares ' + S.keys.join(' ') + ' as true-false', S.keys.every((k) => k in tf), JSON.stringify(tf));
  const key = S.keys.map((k) => tf[k]);
  /* the second wrong attempt differs from the first (the Retry gate refuses the same answer twice) */
  const walks = {
    right: [key],
    wrong: [key.map(flip), S.keys.length > 1 ? key.map((v, i) => (i ? flip(v) : v)) : key.map(flip)],
    mixed: [key.map((v, i) => (i % 2 ? flip(v) : v))],
  };
  if (S.keys.length === 1) delete walks.mixed;
  for (const name of Object.keys(walks)) {
    const P = boot(S.c, meta);
    P.run('goTo(' + S.screen + ');');
    const scope = S.c + ' s' + S.screen + ' ' + name;
    const n0 = P.w.__S.length;
    walks[name].forEach((vals) => S.pick(P, vals));
    const ans = P.w.__S.slice(n0).filter((s) => /^answered/.test(s.verb));
    const sent = walks[name].reduce((a, vals) => a.concat(vals), []);
    ok(scope, 'one answered per question per attempt', ans.length === sent.length, ans.length + ' vs ' + sent.length);
    ans.forEach((s, j) => {
      const k = S.keys[j % S.keys.length];
      const v = s.result.response != null ? String(s.result.response) : ((s.result.extensions || {}).student_answer || []).join(' | ');
      ok(scope, k + ' (' + s.verb + '): reports "true" / "false"', v === 'true' || v === 'false', JSON.stringify(v));
      ok(scope, k + ': reports the pick', v === sent[j], 'sent ' + v + ', picked ' + sent[j]);
      ok(scope, k + ': the value matches the correct answer exactly when success', (v === tf[k]) === (s.result.success === true),
        'sent ' + v + ', correct ' + tf[k] + ', success ' + s.result.success);
    });
    ok(scope, 'no page error', P.errors.length === 0, P.errors.slice(0, 2).join(' | '));
    P.close();
  }
}

console.log('\ntrue-false: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { console.log(failures.join('\n')); process.exitCode = 1; }
