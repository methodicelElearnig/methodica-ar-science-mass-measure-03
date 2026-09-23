/* בדיקת רגרסיה: Retry gate — אי אפשר להגיש שוב את אותה תשובה שגויה.

   הרקע
   דיווח MOE מ-23.09.26: בשאלות עם שני ניסיונות הלומד יכול היה ללחוץ "צדקתי?"
   בניסיון השני על אותה תשובה בדיוק שסומנה שגויה בראשון, ו"לבזבז" את הניסיון.
   מפרט 720 ("Retry gate") קובע: אחרי ניסיון שגוי שאינו אחרון, "צדקתי?" מושבת
   כל עוד התשובה הנוכחית שקולה לתשובה השגויה האחרונה. ההשוואה חיה — תשובה
   אחרת פותחת, חזרה לשגויה נועלת שוב — והנעילה שורדת ניווט (goTo) וחידוש
   (capturePartPayload → applyExecutionState, נשמרת כ-`lw`).

   למה דווקא זה, ולמה אוטומטית
   כל שאלה מממשת את השער לבד (sNLastWrong / viqLastWrong / lastWrong של הפקטורי),
   ויש לכל אחת **שלושה** מקומות שכותבים disabled: הבחירה החיה, הצייר של goTo
   (restoreScqUI / restoreUI / ...), ומסלול החידוש. שכחה באחד מהם שקטה לגמרי:
   הכפתור נראה תקין, רק נפתח ברגע הלא-נכון. בדפדפן זה דורש לעבור על כל שאלה
   שלוש פעמים; כאן זה רץ בשנייה.

   לכל שאלה, בחלון jsdom נקי:
     1. תשובה שגויה מלאה → "צדקתי?" פעיל (בלי זה ה"מושבת" שאחריו חסר משמעות)
     2. בדיקה → מושבת
     3. אותה תשובה שוב → מושבת          ← הבאג שדווח
     4. תשובה אחרת → פעיל                ← השער לא נועל יותר מדי
     5. חזרה לשגויה → מושבת              ← ההשוואה חיה, לא "נפתח פעם אחת ודי"
     6. goTo החוצה ובחזרה → מושבת        ← הצייר של goTo עובר דרך השער
        ואם שינה לפני שיצא → פעיל           ← הצייר לא נועל לנצח (כך היה בגרירה)
     7. capturePartPayload נושא lw; JSON הלוך-חזור; חלון **חדש**;
        applyExecutionState → מושבת, וגם אחרי goTo החוצה ובחזרה
     8. אחרי החידוש, תשובה אחרת → פעיל
     9. התשובה הנכונה → בדיקה → הכפתור הופך לכפתור התקדמות פעיל ("המשך" /
        "סיימתי") — השער לא חוסם סיום
     10. אף שגיאה לא נזרקה בדף לאורך כל המהלך
   ובנוסף, לפי סוג: שקילות מספרית בשדה ערך ("0.20" ≡ "0.2", "5.0" ≡ "5"), סדר בחירה
   ברב-ברירה, לוח חלקי בגרירה, ומסמך resume ישן בלי lw (dq11).

   מה **לא** נבדק כאן
   שאלות עם ניסיון אחד (01 s10) — אין להן ניסיון חוזר, ולכן אין שער. וגם לא
   המראה: שהכפתור המושבת נראה מושבת נבדק בדפדפן.

   אמינות
   הבדיקה הורצה במוטציה מול עותקי script.js שלפני התיקון (ראו README) ונכשלה
   שם ברוב הבדיקות של כל שאלה — כלומר היא באמת מבחינה בין קוד מתוקן ללא-מתוקן.

   דורש jsdom מחוץ לעץ (ראו _test/verify-report.js):
     NODE_PATH=/tmp/lomda-test/node_modules node _test/retry-gate.js
   ומקבל נתיב אופציונלי, כדי לרוץ מול חבילה בנויה:
     NODE_PATH=... node _test/retry-gate.js ../../deployments/2026-09-22
*/
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || path.join(__dirname, '..');
const UNIT_SLUG = 'methodica-science-mass-measure-03';

let JSDOM = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) {
  console.log('SKIPPED - jsdom not resolvable.');
  console.log('  mkdir -p /tmp/lomda-test && cd /tmp/lomda-test && npm install jsdom');
  console.log('  NODE_PATH=/tmp/lomda-test/node_modules node _test/retry-gate.js');
  process.exit(0);
}

const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p).replace(/^﻿/, ''));
const q = JSON.stringify;

let pass = 0;
const failures = [];
function ok(scope, name, cond, detail) {
  if (cond) { pass++; return; }
  failures.push('  [' + scope + '] ' + name + (detail ? '\n      -> ' + detail : ''));
}
function section(title) { console.log('\n' + title); }

/* placedDragStart של הפקטורי מעביר את הקלף לבנק בתוך setTimeout(0), כמו בדפדפן
   בין dragstart ל-drop. כדי לשחזר את הסדר הזה צריך לתת ללולאת האירועים לרוץ. */
const tick = () => new Promise((r) => setTimeout(r, 5));

/* ═══════════════════════════ jsdom ═══════════════════════════
   אותו אתחול כמו statement-flow.js: בלי 50-loader ו-90-boot (שמושכים את ספריית
   ה-CDN ומריצים את האתחול האמיתי), ו-sendStatement720 מוחלף ב-no-op. */
function boot(c) {
  const dir = path.join(BASE, UNIT_SLUG + '-' + c);
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    /* jsdom לא מממש layout/ניווט — אלה רעש של הסביבה, לא של הקוד. */
    if (/Not implemented/.test(e.message)) return;
    errors.push(e.message + (e.detail ? ' ' + String(e.detail).split('\n')[0] : ''));
  });
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
  const inject = (code) => {
    const s = w.document.createElement('script');
    s.textContent = code;
    w.document.body.appendChild(s);
  };
  for (const f of ['10-identity', '20-xapi', '25-report', '40-resume']) {
    inject(read(path.join(BASE, 'unit-js', f + '.js')));
  }
  inject(read(path.join(dir, 'script.js')));
  const meta = readJson(path.join(BASE, 'metadata', UNIT_SLUG + '-' + c + '.json'));
  inject(
    'window.METADATA = ' + JSON.stringify(meta) + ';' +
    'window.XAPI_USING_G = true;' +
    'window.sendStatement720 = function () {};' +
    /* אירוע גרירה מדומה: מספיק ל-dragStart/drop של הפקטורי ושל s17. */
    'window.__ev = function (data) { return { preventDefault: function () {}, stopPropagation: function () {},' +
    '  dataTransfer: { setData: function () {}, getData: function () { return data || ""; }, effectAllowed: "", dropEffect: "" } }; };'
  );
  const val = (expr) => {
    inject('window.__V = (function(){ try { return (' + expr + '); } catch (e) { return "__THREW__" + e.message; } })();');
    return w.__V;
  };
  const run = (code) => inject(code);
  const btn = (id) => val('(function(){ var b = document.getElementById(' + q(id) + ');' +
    ' return b ? { disabled: b.disabled, text: b.textContent.trim() } : null; })()') || { disabled: null, text: null };
  return { w, val, run, btn, errors, close: () => w.close() };
}

/* ═══════════════════════ מתאמים לפי סוג שאלה ═══════════════════════
   כל שאלה מוגדרת ע"י: איך קובעים לה תשובה (wrong / other / correct), איך
   בודקים, איזה כפתור, ולאיזה מסך יוצאים. המהלך עצמו (runGate) משותף לכולן. */

/* בחירה יחידה: sNSelect(id) / sNCheck(). התשובות נגזרות מה-DOM ומ-correctId
   בזמן ריצה, כך שהחלפת תוכן לא דורשת לגעת כאן. */
function scq(c, screen, o) {
  const p = o.prefix || 's' + screen;
  const opts = (P) => {
    const ids = P.val('[].slice.call(document.querySelectorAll(' + q(o.sel || '#s' + screen) + ' + " [data-id]"))' +
      '.map(function (e) { return e.getAttribute("data-id"); })' +
      '.filter(function (x, i, a) { return a.indexOf(x) === i && ' + p + 'OptEl(x); })');
    const correct = P.val(o.correct);
    const wrongs = ids.filter((x) => x !== correct);
    return { correct, wrong: wrongs[0], other: wrongs[1] || correct };
  };
  return {
    c, name: p + ' (' + (o.kind || 'בחירה יחידה') + ')', screen, away: o.away != null ? o.away : screen - 1,
    btn: o.btn || 's' + screen + '-check', check: p + 'Check()',
    set: async (P, which) => P.run(p + 'Select(' + q(opts(P)[which]) + ');'),
    lw: o.lw, extra: o.extra,
  };
}

/* נכון/לא נכון בודד (02 s8): שני ערכים בלבד, ולכן "אחרת" = "נכונה". */
function tf(c, screen, o) {
  const p = 's' + screen;
  return {
    c, name: p + ' (נכון/לא נכון)', screen, away: o.away, btn: p + '-check', check: p + 'Check()',
    set: async (P, which) => {
      const correct = P.val(o.correct);
      const wrong = correct === 'true' ? 'false' : 'true';
      P.run(p + 'Select(' + q(which === 'wrong' ? wrong : correct) + ');');
    },
    lw: o.lw,
  };
}

/* שדה ערך: קובעים value ומפעילים את handler ה-input, כמו הקלדה. */
function viq(c, screen, o) {
  return {
    c, name: 's' + screen + ' (שדה ערך)', screen, away: o.away, btn: 's' + screen + '-check', check: o.check,
    set: async (P, which) => {
      const v = which === 'correct' ? String(P.val(o.correct)) : o[which];
      P.run('(function(){ var i = document.getElementById(' + q(o.input) + '); i.value = ' + q(v) + '; ' + o.onInput + '; })();');
    },
    typeRaw: (P, v) => P.run('(function(){ var i = document.getElementById(' + q(o.input) + '); i.value = ' + q(v) + '; ' + o.onInput + '; })();'),
    lw: o.lw, extra: o.extra,
  };
}

/* רב-ברירה (02 s1): קובעים את **הקבוצה** — מכבים את מה שמסומן ומדליקים את
   המבוקש. s1Check מאפס את s1Selected במסלול הטעות, ולכן אין להניח מצב קודם. */
function mcq(c, screen, o) {
  return {
    c, name: 's' + screen + ' (רב-ברירה)', screen, away: o.away, btn: 's' + screen + '-check', check: 's' + screen + 'Check()',
    set: async (P, which) => P.run('s1Selected.slice().forEach(function (x) { s1Toggle(x); });' +
      q(o[which]) + '.forEach(function (x) { s1Toggle(x); });'),
    lw: o.lw, extra: o.extra,
  };
}

/* טבלת נכון/לא נכון (04 s3): sNSelect(row, val) לכל שורה. */
function tfTable(c, screen, o) {
  return {
    c, legacy: true, name: 's' + screen + ' (טבלת נכון/לא נכון)', screen, away: o.away, btn: 's' + screen + '-check', check: 's' + screen + 'Check()',
    set: async (P, which) => o[which].forEach((v, i) => P.run('s' + screen + 'Select(' + (i + 1) + ',' + q(v) + ');')),
    lw: o.lw,
  };
}

/* גרירה, פקטורי makeDragQuestion. לוח = { target: dragId }. קלף בבנק נגרר דרך
   ondragstart שלו; קלף שכבר מוצב — דרך dragstart על ה-.dq-placed-card, ואז
   tick כדי שה-setTimeout יחזיר אותו לבנק לפני ה-drop, בדיוק כמו בדפדפן. */
function dq(c, screen, o) {
  const sc = o.sel || '#s' + screen;
  async function move(P, dragId, targetId) {
    const where = P.val('(function(){ var c = document.getElementById(' + q(dragId) + ');' +
      ' if (c && c.ondragstart && !c.classList.contains("ghost")) { c.ondragstart(__ev()); return "bank"; }' +
      ' var lbl = c ? c.textContent : null;' +
      ' var pc = [].slice.call(document.querySelectorAll(' + q(sc + ' .dq-placed-card') + ')).filter(function (x) { return x.textContent === lbl; })[0];' +
      ' if (!pc) return "missing";' +
      ' var e = new Event("dragstart"); e.dataTransfer = __ev().dataTransfer; pc.dispatchEvent(e); return "placed"; })()');
    if (where === 'missing') throw new Error('card ' + dragId + ' not found');
    if (where === 'placed') await tick();
    P.run(o.drop + '(__ev(), ' + q(targetId) + ');');
  }
  const cur = (P, t) => P.val('(function(){ var z = document.getElementById(' + q(t) + ');' +
    ' var pc = z && z.querySelector(".dq-placed-card"); return pc ? pc.textContent : null; })()');
  const label = (P, d) => P.val('document.getElementById(' + q(d) + ').textContent');
  return {
    c, legacy: true, name: (o.name || 's' + screen) + ' (גרירה)', screen, away: o.away, btn: o.btn || 's' + screen + '-check', check: o.check,
    set: async (P, which) => {
      const board = o[which];
      let moved = false;
      for (let pass = 0; pass < 2; pass++) {
        for (const t of Object.keys(board)) {
          if (cur(P, t) !== label(P, board[t])) { await move(P, board[t], t); moved = true; }
        }
      }
      /* הלוח כבר זהה: הלומד גורר קלף מוצב חזרה לאותו יעד. בלי זה "אותה תשובה
         שוב" לא היה מריץ render בכלל, והבדיקה הייתה עוברת גם בלי שער. */
      if (!moved) { const t0 = Object.keys(board)[0]; await move(P, board[t0], t0); }
    },
    move, lw: o.lw, extra: o.extra,
  };
}

/* 01 s17: מנגנון גרירה נפרד (לא הפקטורי). s17Drop קורא את המזהה מ-getData. */
function s17(c) {
  const drop = (P, item, zone) => P.run('s17Drop(__ev(' + q(item) + '), ' + q(zone) + ');');
  const boards = {
    wrong:   { 's17i-rice': 'lab', 's17i-gold': 'kitchen', 's17i-drug': 'analytic' },
    other:   { 's17i-rice': 'analytic', 's17i-gold': 'kitchen', 's17i-drug': 'lab' },
    correct: { 's17i-rice': 'kitchen', 's17i-gold': 'lab', 's17i-drug': 'analytic' },
  };
  return {
    c, legacy: true, name: 's17 (גרירה לאזורים)', screen: 17, away: 16, btn: 's17-check', check: 's17Check()',
    set: async (P, which) => {
      for (let pass = 0; pass < 2; pass++) {
        for (const [item, zone] of Object.entries(boards[which])) drop(P, item, zone);
      }
    },
    drop,
    lw: (st) => st.s17 && st.s17.lw === q(boards.wrong),
    extra: async (P, Q, scope) => {
      /* ⚠️ בסדר מפתחות של S17_ITEM_IDS — החתימה היא JSON של s17SnapshotPlacement. */
      P.run("s17ItemClick('s17i-rice');");
      ok(scope, 'board made partial -> disabled', P.btn('s17-check').disabled === true);
      drop(P, 's17i-rice', 'lab');
      ok(scope, 'partial board refilled to the same wrong board -> disabled', P.btn('s17-check').disabled === true);
    },
  };
}

/* ═══════════════════════════ הרשימה ═══════════════════════════ */
const QUESTIONS = [
  /* ── 01 ── */
  viq('01', 5, {
    away: 4, input: 's5-input', onInput: 'viqOnInput(5)', check: 'viqCheck(5)',
    wrong: '0.2', other: '0.3', correct: 'VIQ_SCREENS[5].correct',
    lw: (st) => st.viq && st.viq.lw && st.viq.lw[5] === 'n:0.2',
    extra: async (P, Q, scope) => {
      Q.typeRaw(P, '0.20');
      ok(scope, '"0.20" is the same number as the wrong "0.2" -> disabled', P.btn('s5-check').disabled === true);
      Q.typeRaw(P, ' 0.2 ');
      ok(scope, 'surrounding whitespace does not make it a new answer -> disabled', P.btn('s5-check').disabled === true);
    },
  }),
  viq('01', 6, {
    away: 5, input: 's6-input', onInput: 'viqOnInput(6)', check: 'viqCheck(6)',
    wrong: '0.04', other: '0.05', correct: 'VIQ_SCREENS[6].correct',
    lw: (st) => st.viq && st.viq.lw && st.viq.lw[6] === 'n:0.04',
  }),
  scq('01', 8, { away: 9, correct: 'S8.correctId', lw: (st) => st.scq && st.scq.s8 && !!st.scq.s8.lw }),
  dq('01', 11, {
    away: 10, drop: 's11Drop', check: 's11Check()',
    wrong:   { 's11-target-1': 's11-drag-hafhatot', 's11-target-2': 's11-drag-sikum' },
    other:   { 's11-target-1': 's11-drag-hafhatot', 's11-target-2': 's11-drag-mimutza' },
    correct: { 's11-target-1': 's11-drag-hazarot', 's11-target-2': 's11-drag-mimutza' },
    lw: (st) => st.dq11 && st.dq11.lw === '1=הפחתות | 2=סיכום',
    extra: async (P, Q, scope, payload) => {
      /* מסמך resume מלפני התיקון (בלי lw): setState גוזר את השער מההצבה השמורה,
         כדי לא לשחרר לומד שהיה נעול לפני העדכון. */
      P.run('(function(){ var o = ' + q(payload.dq11) + '; delete o.lw; dq11.setState(o); dq11.restoreUI(); })();');
      ok(scope, 'legacy resume doc without lw -> still disabled on the saved wrong board', P.btn('s11-check').disabled === true);
      await Q.move(P, 's11-drag-mimutza', 's11-target-2');
      ok(scope, 'legacy doc, then a different board -> enabled', P.btn('s11-check').disabled === false);
      await Q.move(P, 's11-drag-sikum', 's11-target-2');
    },
  }),
  scq('01', 14, { away: 13, correct: 'S14.correctId', lw: (st) => st.scq && st.scq.s14 && !!st.scq.s14.lw }),
  scq('01', 15, { away: 14, correct: 'S15.correctId', lw: (st) => st.scq && st.scq.s15 && !!st.scq.s15.lw }),
  dq('01', 16, {
    away: 15, drop: 's16Drop', check: 's16Check()',
    wrong:   { 's16-target-1': 's16-drag-510', 's16-target-2': 's16-drag-hariga', 's16-target-3': 's16-drag-590' },
    other:   { 's16-target-1': 's16-drag-1532', 's16-target-2': 's16-drag-hariga', 's16-target-3': 's16-drag-590' },
    correct: { 's16-target-1': 's16-drag-590', 's16-target-2': 's16-drag-hariga', 's16-target-3': 's16-drag-510' },
    lw: (st) => st.dq16 && st.dq16.lw === '1=5.10 | 2=תוצאה חריגה | 3=5.90',
  }),
  s17('01'),
  scq('01', 19, { away: 18, correct: 'S19.correctId', lw: (st) => st.scq && st.scq.s19 && !!st.scq.s19.lw }),
  scq('01', 21, { away: 20, correct: 'S21.correctId', lw: (st) => st.scq && st.scq.s21 && !!st.scq.s21.lw }),

  /* ── 02 ── */
  mcq('02', 1, {
    away: 2, wrong: ['d', 'a'], other: ['a', 'b', 'd'], correct: ['b', 'c'],
    lw: (st) => st.s1 && st.s1.lw === 'a,d',
    extra: async (P, Q, scope) => {
      P.run("s1Selected.slice().forEach(function (x) { s1Toggle(x); }); s1Toggle('a'); s1Toggle('d');");
      ok(scope, 'same set picked in a different order -> disabled', P.btn('s1-check').disabled === true);
      P.run("s1Toggle('d');");
      ok(scope, 'subset of the wrong set -> enabled', P.btn('s1-check').disabled === false);
      P.run("s1Toggle('d');");
    },
  }),
  scq('02', 2, { away: 3, correct: 'S2.correctId', lw: (st) => st.scq && st.scq.s2 && !!st.scq.s2.lw }),
  scq('02', 3, { away: 4, correct: 'S3.correctId', lw: (st) => st.scq && st.scq.s3 && !!st.scq.s3.lw }),
  scq('02', 6, { away: 7, correct: 'S6.correctId', lw: (st) => st.scq && st.scq.s6 && !!st.scq.s6.lw }),
  viq('02', 7, {
    away: 8, input: 's7-input', onInput: 's7OnInput()', check: 's7Check()',
    wrong: '5', other: '6', correct: 'S7.correct',
    lw: (st) => st.s7 && st.s7.lw === 'n:5',
    extra: async (P, Q, scope) => {
      Q.typeRaw(P, '5.0');
      ok(scope, '"5.0" is the same number as the wrong "5" -> disabled', P.btn('s7-check').disabled === true);
    },
  }),
  tf('02', 8, { away: 9, correct: 'S8.correctVal', lw: (st) => st.s8 && !!st.s8.lw }),
  scq('02', 9, { away: 8, correct: 'S9.correctId', lw: (st) => st.scq && st.scq.s9 && !!st.scq.s9.lw }),

  /* ── 04 ── */
  scq('04', 1, { away: 2, correct: 'S1.correctId', lw: (st) => st.scq && st.scq.s1 && !!st.scq.s1.lw }),
  scq('04', 2, { away: 1, correct: 'S2.correctId', lw: (st) => st.scq && st.scq.s2 && !!st.scq.s2.lw }),
  tfTable('04', 3, {
    away: 2,
    wrong: ['true', 'true', 'true', 'true'],
    other: ['false', 'true', 'true', 'true'],
    correct: ['false', 'true', 'true', 'false'],
    lw: (st) => st.s3 && st.s3.lw === '["true","true","true","true"]',
  }),

  /* ── 05 ── */
  scq('05', 2, { away: 3, correct: 'S2.correctId', lw: (st) => st.scq && st.scq.s2 && !!st.scq.s2.lw }),
  scq('05', 3, { away: 2, correct: 'S3.correctId', lw: (st) => st.scq && st.scq.s3 && !!st.scq.s3.lw }),
  dq('05', 4, {
    away: 3, drop: 's4Drop', check: 's4Check()',
    wrong: { 's4-target-1': 's4-drag-4', 's4-target-2': 's4-drag-memutza', 's4-target-3': 's4-drag-hityatzev',
             's4-target-4': 's4-drag-3', 's4-target-5': 's4-drag-vadaut', 's4-target-6': 's4-drag-hazarot' },
    other: { 's4-target-1': 's4-drag-4', 's4-target-2': 's4-drag-memutza', 's4-target-3': 's4-drag-hityatzev',
             's4-target-4': 's4-drag-3', 's4-target-5': 's4-drag-vadaut', 's4-target-6': 's4-drag-shguya' },
    correct: { 's4-target-1': 's4-drag-4', 's4-target-2': 's4-drag-memutza', 's4-target-3': 's4-drag-hityatzev',
               's4-target-4': 's4-drag-3', 's4-target-5': 's4-drag-vadaut', 's4-target-6': 's4-drag-amina' },
    lw: (st) => st.dqG && typeof st.dqG.lw === 'string' && /6=חזרות/.test(st.dqG.lw),
  }),

  /* ── 06 ── (המסכים ממוספרים 2/3/4, השאלות s6a/s6b/s6c) */
  scq('06', 2, { prefix: 's6a', sel: '#s2', away: 1, btn: 's2-check', correct: 'S6A.correctId',
                 lw: (st) => st.s6a && !!st.s6a.lw }),
  scq('06', 3, { prefix: 's6b', sel: '#s3', away: 2, btn: 's3-check', correct: 'S6B.correctId',
                 lw: (st) => st.s6b && !!st.s6b.lw }),
  dq('06', 4, {
    name: 's6c', away: 3, btn: 's4-check', drop: 's6cDrop', check: 's6cCheck()',
    wrong: { 's6c-target-1': 's6c-drag-teken', 's6c-target-2': 's6c-drag-medayekim', 's6c-target-3': 's6c-drag-hazarot',
             's6c-target-4': 's6c-drag-memutza', 's6c-target-5': 's6c-drag-vadaut', 's6c-target-6': 's6c-drag-diyuk' },
    other: { 's6c-target-1': 's6c-drag-teken', 's6c-target-2': 's6c-drag-medayekim', 's6c-target-3': 's6c-drag-memutza',
             's6c-target-4': 's6c-drag-hazarot', 's6c-target-5': 's6c-drag-vadaut', 's6c-target-6': 's6c-drag-diyuk' },
    correct: { 's6c-target-1': 's6c-drag-medayekim', 's6c-target-2': 's6c-drag-teken', 's6c-target-3': 's6c-drag-hazarot',
               's6c-target-4': 's6c-drag-memutza', 's6c-target-5': 's6c-drag-vadaut', 's6c-target-6': 's6c-drag-diyuk' },
    lw: (st) => st.dqC && typeof st.dqC.lw === 'string' && st.dqC.lw.indexOf('1=התקן') === 0,
    extra: async (P, Q, scope) => {
      /* לוח מלא בלי קלף רזרבי: הזזת קלף מוצב משאירה חור — חלקי → מושבת. */
      P.run('(function(){ var pc = document.querySelector("#s6c-target-3 .dq-placed-card");' +
        ' var e = new Event("dragstart"); e.dataTransfer = __ev().dataTransfer; pc.dispatchEvent(e); })();');
      await tick();
      P.run('s6cDropToBank(__ev());');
      ok(scope, 'full board made partial -> disabled', P.btn('s4-check').disabled === true);
      await Q.move(P, 's6c-drag-hazarot', 's6c-target-3');
      ok(scope, 'refilled to the same wrong board -> disabled', P.btn('s4-check').disabled === true);
    },
  }),
];

/* ═══════════════════════════ המהלך ═══════════════════════════ */
async function runGate(Q) {
  const scope = Q.c + ' ' + Q.name;
  let P;
  try { P = boot(Q.c); } catch (e) { ok(scope, 'component boots in jsdom', false, e.message); return; }
  const dis = () => P.btn(Q.btn).disabled;
  const errs = [];
  try {
    P.run('goTo(' + Q.screen + ');');
    await Q.set(P, 'wrong');
    ok(scope, 'complete wrong answer -> check enabled (precondition)', dis() === false, JSON.stringify(P.btn(Q.btn)));
    P.run(Q.check);
    ok(scope, 'wrong attempt 1 -> disabled', dis() === true);

    await Q.set(P, 'wrong');
    ok(scope, 'same wrong answer re-entered -> disabled', dis() === true);
    await Q.set(P, 'other');
    ok(scope, 'different answer -> enabled', dis() === false);
    await Q.set(P, 'wrong');
    ok(scope, 'back to the wrong answer -> disabled', dis() === true);

    P.run('goTo(' + Q.away + '); goTo(' + Q.screen + ');');
    ok(scope, 'goTo away and back -> still disabled', dis() === true);
    /* הכיוון ההפוך: הצייר לא נועל לומד שכבר שינה את התשובה לפני שיצא. */
    await Q.set(P, 'other');
    P.run('goTo(' + Q.away + '); goTo(' + Q.screen + ');');
    ok(scope, 'changed answer, goTo away and back -> enabled (no over-locking)', dis() === false);
    await Q.set(P, 'wrong');

    if (Q.extra) await Q.extra(P, Q, scope, JSON.parse(P.val('JSON.stringify(capturePartPayload())')));

    /* resume: JSON הלוך-חזור, חלון חדש לגמרי, ואותו מסלול שהלואדר מריץ. */
    const json = P.val('JSON.stringify(capturePartPayload())');
    let st = null;
    try { st = JSON.parse(json); } catch (e) { /* נרשם בבדיקה הבאה */ }
    ok(scope, 'capturePartPayload() carries lw', !!st && !!Q.lw(st), String(json).slice(0, 160));
    errs.push(...P.errors); P.close();

    /* מסמך resume מלפני התיקון (בלי lw), שנשמר באמצע שאלה אחרי ניסיון שגוי. בשאלות
       שבהן התשובה השמורה היא הלוח עצמו (גרירה, טבלת נכון/לא נכון), השער נגזר ממנה —
       אחרת הכפתור היה נפתח על אותה תשובה שגויה אצל מי שהיה באמצע בזמן הפריסה. */
    if (Q.legacy) {
      const legacyJson = JSON.stringify(JSON.parse(json, (k, v) => (k === 'lw' ? undefined : v)));
      P = boot(Q.c);
      P.run('applyExecutionState(' + legacyJson + ', ' + Q.screen + ');');
      ok(scope, 'legacy resume doc without lw -> disabled on the saved wrong answer', dis() === true);
      P.run('goTo(' + Q.away + '); goTo(' + Q.screen + ');');
      ok(scope, 'legacy resume doc, goTo away and back -> disabled', dis() === true);
      errs.push(...P.errors); P.close();
    }

    P = boot(Q.c);
    P.run('applyExecutionState(' + json + ', ' + Q.screen + ');');
    ok(scope, 'resume (fresh page, applyExecutionState) -> disabled', dis() === true);
    P.run('goTo(' + Q.away + '); goTo(' + Q.screen + ');');
    ok(scope, 'resume, then goTo away and back -> disabled', dis() === true);
    await Q.set(P, 'other');
    ok(scope, 'resume, then a different answer -> enabled', dis() === false);

    await Q.set(P, 'correct');
    P.run(Q.check);
    const b = P.btn(Q.btn);
    /* "המשך", או "סיימתי" בשאלה האחרונה של הסין (06 s6c) — העיקר שהוא כבר לא "צדקתי?". */
    ok(scope, 'correct answer after the gated retry finishes (button -> enabled advance button)',
       b.disabled === false && !!b.text && b.text !== 'צדקתי?', JSON.stringify(b));
  } catch (e) {
    ok(scope, 'walk completes without a harness error', false, e.message);
  }
  errs.push(...P.errors); P.close();
  ok(scope, 'no uncaught page errors during the walk', errs.length === 0, errs.slice(0, 3).join(' || '));
}

(async function main() {
  let last = null;
  for (const Q of QUESTIONS) {
    if (Q.c !== last) { section(Q.c + ' — ' + UNIT_SLUG + '-' + Q.c); last = Q.c; }
    const before = pass + failures.length;
    const failedBefore = failures.length;
    await runGate(Q);
    const n = pass + failures.length - before;
    const f = failures.length - failedBefore;
    console.log('  ' + (f ? 'FAIL ' : 'ok   ') + Q.name + '  (' + (n - f) + '/' + n + ')');
  }

  console.log('\n' + '='.repeat(64));
  if (failures.length) {
    console.log(failures.length + ' FAILED, ' + pass + ' passed\n');
    failures.forEach((f) => console.log(f));
    console.log('');
    process.exit(1);
  }
  console.log('All ' + pass + ' retry-gate checks passed.');
})();
