/* result.response = Kata's correctXapiResponsesPattern, character by character (MOE runbook checks
   10.11.26, QA/2026-11-10_moe-runbook-checks/REPORT.md; Phase 6 lane 3).

   Kata compares the `response` of an `answered` with the question's pattern exactly: '[,]' between
   items / pairs, '[.]' between source and target, the metadata text and nothing else. Live (11.11) this
   unit sent 's5-input=0.1', '1=4 | 2=ממוצע | …', 'kitchen: … | lab: …', a multi-select in click
   order joined with ', ', the card text of 009/q2 and a geresh where Kata has an apostrophe.

   Every graded question of every component is answered here through its REAL screen handlers (the
   adapters of _test/retry-gate.js), in a fresh jsdom page, and:
     1. the correct answer → one answered.last per question, success:true, response ∈ Kata's pattern;
        02 s1 (multi-select) also in the reverse click order;
     2. a wrong answer → the response is still metadata text in the xAPI form (no DOM id, no ' | '),
        and not the pattern;
     3. no '[xAPI]' warning (an unresolvable UI text warns) and no page error.
   And the Ctrl+Arrow screen jump (a developer shortcut) works only with ?dev=1 and no registration.

     NODE_PATH=/tmp/lomda-test/node_modules node _test/responses.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const RG = require('./retry-gate.js');

const { UNIT_SLUG, BASE } = RG;
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const q = JSON.stringify;

let pass = 0;
const failures = [];
function ok(scope, name, cond, detail) {
  if (cond) { pass++; return; }
  failures.push('  [' + scope + '] ' + name + (detail ? '\n      -> ' + detail : ''));
}

/* the metadata question for '<item>/<qKey>' of a component */
const META = {};
function metaQ(c, key) {
  META[c] = META[c] || readJson(path.join(BASE, 'metadata', UNIT_SLUG + '-' + c + '.json'));
  for (const it of META[c].subContent) for (const qq of it.questions || []) {
    if (qq.questionId.replace(/\/+$/, '').endsWith('-' + key)) return qq;
  }
  return null;
}

/* retry-gate's question list (keyed by component + screen) → the metadata questions it answers */
const KEYS = {
  '01 5': ['004/q1'], '01 6': ['005/q1'], '01 8': ['006/q1'], '01 10': ['007/q1'], '01 11': ['008/q1'],
  '01 14': ['009/q1'], '01 15': ['009/q2'], '01 16': ['010/q1'], '01 17': ['011/q1'], '01 19': ['012/q1'],
  '01 21': ['013/q1'],
  '02 1': ['001/q1'], '02 2': ['002/q1'], '02 3': ['003/q1'], '02 6': ['004/q1'], '02 7': ['004/q2'],
  '02 8': ['004/q3'], '02 9': ['004/q4'],
  '04 1': ['001/q1'], '04 2': ['002/q1'], '04 3': ['003/q1', '003/q2', '003/q3', '003/q4'],
  '05 2': ['001/q1'], '05 3': ['001/q2'], '05 4': ['001/q3'],
  '06 2': ['001/q1'], '06 3': ['001/q2'], '06 4': ['001/q3'],
};
/* 01 s10 (007) has one attempt and no Retry gate, so retry-gate.js does not list it */
const QUESTIONS = RG.QUESTIONS.concat([RG.scq('01', 10, { away: 9, correct: 'S10.correctId' })]);

function capture(P) {
  P.run('window.__S = []; window.sendStatement720 = function (verb, type, result, opts) { __S.push({ verb: verb, result: result, opts: opts }); };' +
        'window.__W = []; var __w = console.warn; console.warn = function () { __W.push([].slice.call(arguments).join(" ")); __w.apply(console, arguments); };');
}
const answered = (P) => P.val('JSON.stringify(__S.filter(function (s) { return /^answered/.test(s.verb); }))');
/* what Kata receives: the library (xapi-720-l.js) sends extensions.student_answer as the response when
   the page gives none — so the old code is judged by what it really sent, not by a missing field */
const sent = (s) => (s.result.response != null ? String(s.result.response) : ((s.result.extensions || {}).student_answer || []).join(' | '));
const forKey = (list, key) => list.filter((s) => String((s.opts || {}).questionId || '').replace(/\/+$/, '').endsWith('-' + key));

/* a wrong answer is still in the xAPI form: metadata text joined with [,] / [.] */
function wellFormed(qq, resp) {
  if (/\S=\S|\s\|\s|->|s\d+-/.test(resp)) return false;
  const t = qq.questionType;
  if (t === 'choice') return resp.split('[,]').every((x) => qq.answers.includes(x));
  if (t === 'true-false') return resp === 'true' || resp === 'false';
  if (t === 'numeric') return resp !== '' && !isNaN(Number(resp));
  if (t === 'matching') return resp.split('[,]').every((p) => { const [s, g] = p.split('[.]'); return qq.answers.source.includes(s) && qq.answers.target.includes(g); });
  return true;
}

async function walk(Q) {
  const keys = KEYS[Q.c + ' ' + Q.screen];
  const scope = Q.c + ' ' + Q.name;
  if (!keys) { ok(scope, 'question is mapped to metadata keys', false); return; }
  const qs = keys.map((k) => metaQ(Q.c, k));
  ok(scope, 'metadata has ' + keys.join(' ') + ' with a Kata pattern', qs.every((x) => x && Array.isArray(x.correctXapiResponsesPattern) && x.correctXapiResponsesPattern.length > 0));
  if (!qs.every(Boolean)) return;

  /* 1. the correct answer */
  const orders = [null];
  if (Q.c === '02' && Q.screen === 1) orders.push(['c', 'b']);   // the same set, the other click order
  for (const order of orders) {
    const P = RG.boot(Q.c);
    try {
      P.run('goTo(' + Q.screen + ');');
      capture(P);
      if (order) P.run('s1Selected.slice().forEach(function (x) { s1Toggle(x); });' + q(order) + '.forEach(function (x) { s1Toggle(x); });');
      else await Q.set(P, 'correct');
      P.run(Q.check);
      const list = JSON.parse(answered(P));
      const sc = scope + (order ? ' (click order ' + order.join(',') + ')' : '');
      keys.forEach((k, i) => {
        const got = forKey(list, k);
        const pat = qs[i].correctXapiResponsesPattern;
        ok(sc, k + ': one answered.last, success', got.length === 1 && got[0].verb === 'answered.last' && got[0].result.success === true, JSON.stringify(got.map((s) => [s.verb, s.result.success])));
        const resp = got.length ? sent(got[0]) : undefined;
        ok(sc, k + ': response is Kata\'s pattern exactly', pat.includes(resp), q(resp) + ' vs ' + q(pat));
      });
      const warns = P.val('JSON.stringify(__W)');
      ok(sc, 'no [xAPI] warning', !/\[xAPI\]/.test(warns), warns);
      ok(sc, 'no page error', P.errors.length === 0, P.errors.slice(0, 2).join(' | '));
    } catch (e) { ok(scope, 'walk completes', false, e.message); }
    P.close();
  }

  /* 2. a wrong answer */
  const P = RG.boot(Q.c);
  try {
    P.run('goTo(' + Q.screen + ');');
    capture(P);
    await Q.set(P, 'wrong');
    P.run(Q.check);
    const list = JSON.parse(answered(P));
    keys.forEach((k, i) => {
      const got = forKey(list, k);
      if (!got.length) return;                              // a right row of the true/false table on a wrong board is fine either way
      const resp = sent(got[0]);
      ok(scope + ' wrong', k + ': response in the xAPI form, metadata text', wellFormed(qs[i], resp), q(resp));
      if (got[0].result.success === false) ok(scope + ' wrong', k + ': a wrong answer is not the pattern', !qs[i].correctXapiResponsesPattern.includes(resp), q(resp));
    });
    const warns = P.val('JSON.stringify(__W)');
    ok(scope + ' wrong', 'no [xAPI] warning', !/\[xAPI\]/.test(warns), warns);
  } catch (e) { ok(scope, 'wrong walk completes', false, e.message); }
  P.close();
}

/* every graded question of the metadata is covered by a walk (02-002 q1 of 01 is the opinion question
   with no answered by design; 01-004 / 01-005 are the two alternative paths, both walked here) */
function coverage() {
  const walked = new Set();
  for (const k of Object.keys(KEYS)) for (const key of KEYS[k]) walked.add(k.split(' ')[0] + ' ' + key);
  for (const c of ['01', '02', '04', '05', '06']) {
    const meta = readJson(path.join(BASE, 'metadata', UNIT_SLUG + '-' + c + '.json'));
    for (const it of meta.subContent) for (const qq of it.questions || []) {
      const parts = qq.questionId.replace(/\/+$/, '').split('/');
      const key = parts[parts.length - 2].slice(-3) + '/' + parts[parts.length - 1];
      if (c === '01' && key === '002/q1') continue;
      ok(c, 'question ' + key + ' is walked', walked.has(c + ' ' + key));
    }
  }
}

/* Ctrl+ArrowLeft / Ctrl+ArrowRight jump screens only for a developer: ?dev=1 and no registration */
function devNav() {
  for (const c of ['01', '02', '04', '05', '06']) {
    for (const [query, moves] of [['', false], ['?dev=1', true], ['?dev=1&registration=x', false], ['?registration=x', false]]) {
      const P = RG.boot(c, query);
      P.run('goTo(2);');
      P.run('document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", ctrlKey: true, bubbles: true }));');
      const fwd = P.val('currentScreen');
      P.run('goTo(2);');
      P.run('document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true, bubbles: true }));');
      const back = P.val('currentScreen');
      ok(c + ' dev-nav', 'Ctrl+Arrow ' + (moves ? 'moves' : 'does nothing') + ' with "' + query + '"',
         moves ? (fwd === 3 && back === 1) : (fwd === 2 && back === 2), 'fwd ' + fwd + ', back ' + back);
      P.close();
    }
  }
}

(async function main() {
  for (const Q of QUESTIONS) {
    const f0 = failures.length;
    await walk(Q);
    console.log('  ' + (failures.length > f0 ? 'FAIL ' : 'ok   ') + Q.c + ' ' + Q.name);
  }
  coverage();
  devNav();
  console.log('\nresponses: ' + pass + ' passed, ' + failures.length + ' failed');
  if (failures.length) { console.log(failures.join('\n')); process.exitCode = 1; }
})();
