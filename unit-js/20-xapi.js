'use strict';
/* ═══════════════════ xAPI (720) — item scope + question ids ═══════════════════
   משותף לששת הסינים. Definition-only: אין כאן שום side effect ברמת top-level,
   והאתחול מונע מבלוק ה"אתחול" שבתחתית כל script.js (שקורא ל-bootXAPI() אחרון).

   מקור: methodica-math-scale-01-vadimr-1/unit-js/20-xapi.js. הועתק verbatim,
   פרט לסלקטורים ב-xapiAnswerText שהותאמו למחלקות של הפרויקט הזה.

   התפרים הפר-סיניים, כולם נקראים בזמן CALL ולא בזמן טעינה (וזו הסיבה
   ש-script.js יכול להיטען אחרי הקבצים המשותפים):
     SCREEN_TO_SUBCONTENT   מסך -> [סיומת פריט, עמוד-בפריט]; null = אין פריט בקטלוג
     XAPI_COMP_SLUG         למשל 'methodica-ar-science-mass-measure-03-02'
     XAPI_COMP_ID           XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/'
     XAPI_EVAL_ITEMS        פריטים שנושאים שאלה מדורגת בקוד (לא רק במטא-דאטה)
     XAPI_ITEM_RESULT       אופציונלי; סיומת פריט -> פונקציה שמחזירה result מפורש
   כל קריאה מגודרת ב-typeof, כדי שסין שלא הגדיר אחד מהאופציונליים יתדרדר
   לערך הנייטרלי במקום לזרוק בתוך מסלול של statement — שם ה-try/catch העוטף
   היה מחניק את השגיאה וה-statement היה נעלם בשקט. */

/* מוסכמת ה-slash של היחידה הזאת, כפי שאומתה מול metadata/ (ראו 10-identity.js):
   יחידה, רכיב ופריט נושאים trailing slash; שאלה לא. XAPI_COMP_ID כבר מסתיים
   ב-'/', ולכן הפריט הוא <רכיב><slug>-NNN/ .
   xapiQ() מנרמל slashes לפני ההשוואה בכל מקרה, כך שהתאמת הפריטים עמידה
   לשינוי מוסכמה; מה שלא עמיד לכך הוא ה-id שנשלח בפועל, ולכן הוא חייב להתאים
   ל-metadata/ בית-לבית. */
function xapiItemId(suffix) { return XAPI_COMP_ID + XAPI_COMP_SLUG + '-' + suffix + '/'; }
function _xapiTrim(u) { return String(u == null ? '' : u).replace(/\/+$/, ''); }

/* טקסט התשובה הגלוי, ל-result.response. משכפל קודם כדי לא לגעת ב-DOM החי,
   ומסיר את צמתי ה-tooltip שאחרת textContent היה משרבב לאמצע התווית.
   הסלקטורים כאן הם של הפרויקט הזה (.scq-*), לא של המתמטיקה. */
function xapiAnswerText(el) {
  if (!el) return '';
  var c = el.cloneNode(true);
  var drop = c.querySelectorAll('.scq-info, .scq-tooltip, .scq-hint-popup, .img-zoom-btn, .methodica-zoom-trigger');
  for (var i = 0; i < drop.length; i++) { drop[i].remove(); }
  return c.textContent.replace(/\s+/g, ' ').trim();
}

/* הקשר השאלה. metadata/<component>.json הוא מקור האמת היחיד למזהי שאלות:
   מאתרים subContent[<suffix>].questions[<qKey>] ומחזירים את אותו questionId
   כמו שהוא כשהוא כבר אבסולוטי. התאמת הפריט היא לפי סיומת '-NNN' כשה-slashes
   מנורמלים, כך שסנכרון מחדש של המטא-דאטה מ-Kata יכול לשנות את התחילית בלי
   לגעת בקוד. */
function xapiQ(suffix, qKey) {
  var itemId = xapiItemId(suffix);
  var qid = null;
  try {
    var sc = (window.METADATA && window.METADATA.subContent) || [];
    for (var i = 0; i < sc.length; i++) {
      if (_xapiTrim(sc[i].id).slice(-(suffix.length + 1)) !== '-' + suffix) continue;
      var qs = sc[i].questions || [];
      for (var j = 0; j < qs.length; j++) {            // התאמת המפתח, חשוף או בצורת URL
        var v = _xapiTrim(qs[j].questionId);
        if (v === qKey || v.slice(-(qKey.length + 1)) === '/' + qKey) { qid = qs[j].questionId; break; }
      }
      if (qid == null) {                               // נפילה לאחור: מיקומי, 'q3' -> אינדקס 2
        var n = parseInt(String(qKey).replace(/\D/g, ''), 10);
        if (n >= 1 && n <= qs.length) qid = qs[n - 1].questionId;
      }
      break;
    }
  } catch (e) {}
  if (qid == null) { console.warn('[xAPI] no metadata question', suffix, qKey); qid = qKey; }
  /* itemId מסתיים ב-'/', ולכן ההצמדה היא ישירה — בלי מפריד נוסף. */
  return { questionId: /^https?:\/\//.test(qid) ? qid : itemId + qid, parentId: itemId };
}

/* תוצאה פר-שאלה, במפתח '<item>/<q>'. נכתבת בכל אתר answered — תמיד מחוץ
   ל-try/catch שלו, כדי שכשל דיווח לא יקלקל את הניקוד — ונקראת כשמורכב
   ה-completed של הרכיב. הצבירה של הספרייה עצמה היא AND של "כל התשובות
   נכונות", מה שהיה מדווח success:false על כל מעבר חלקי, ולכן רכיב שצריך
   ניקוד חלקי מספק את ה-result שלו במפורש. */
var XAPI_Q_RESULTS = {};
function xapiCorrectCount() {
  return Object.keys(XAPI_Q_RESULTS).filter(function (k) { return XAPI_Q_RESULTS[k]; }).length;
}

var xapiCurrentItem = null;

/* result מפורש ל-completed של פריט, כשה-AND של הספרייה שגוי עבורו.
   סין שלא מגדיר XAPI_ITEM_RESULT מקבל null — בדיוק מה שהיה מועבר literal. */
/* ── O-8 (QA 2026-10-02): every evaluated item supplies its own result ──
   Without one the library scored an item's 'completed' from its in-memory per-item aggregate, which
   a reload wipes: live, ar-mass-measure-03 06 item 001, answered 3/3 before a reload, closed with no
   result; an item answered partly before and partly after a reload got a score counted from the
   post-reload answers only. XAPI_Q_RESULTS is saved and restored by every part (st.qResults), so the
   result is rebuilt from it: success = every declared question correct, scaled = correct / declared
   (declared = this item's questions in metadata/). A part may override an item through
   XAPI_ITEM_RESULT (the single-item parts mirror their component result). Nothing answered and
   nothing restored -> null, as before. Pattern of methodica-math-ratio-04 unit-js/70-platform.js. */
function _xapiDeclaredQs(item) {
  try {
    var sc = (window.METADATA && window.METADATA.subContent) || [];
    for (var i = 0; i < sc.length; i++) {
      if (_xapiTrim(sc[i].id).slice(-(item.length + 1)) !== '-' + item) continue;
      return (sc[i].questions || []).map(function (q) { return _xapiTrim(q.questionId).split('/').pop(); });
    }
  } catch (e) {}
  return [];
}
function _xapiDefaultItemResult(item) {
  var mine = Object.keys(XAPI_Q_RESULTS).filter(function (k) { return k.split('/')[0] === item; })
                   .map(function (k) { return k.slice(item.length + 1); });
  if (!mine.length) return null;
  var qs = _xapiDeclaredQs(item);
  if (!qs.length) qs = mine;
  var ok = qs.filter(function (q) { return XAPI_Q_RESULTS[item + '/' + q] === true; }).length;
  return { success: ok === qs.length, score: { scaled: ok / qs.length } };
}
function xapiItemResult(item) {
  var map = (typeof XAPI_ITEM_RESULT !== 'undefined') ? XAPI_ITEM_RESULT : null;
  var f = map && map[item];
  if (f) return f();
  return _xapiIsEval(item) ? _xapiDefaultItemResult(item) : null;
}

function _xapiIsEval(item) {
  return (typeof XAPI_EVAL_ITEMS !== 'undefined') && !!XAPI_EVAL_ITEMS[item];
}

/* ── חימוש מחדש של זיכרון ה-'answered' של הספרייה אחרי שחזור ────────────────
   xapi-720-k.js חוסמת 'completed' של פריט על סמך xapiItemAnswered[itemId] — מפה
   שהיא ממלאת רק מ-'answered' שעבר דרכה באותה טעינת דף:

       if (sttmContext?.expectsAnswer && !xapiItemAnswered[_cid]) {
           console.log("[XAPI] item left unanswered — deferring 'completed': " + _cid);
           return;          // "deferring" הוא זריקה — אין תור, אין flush, אין ניסיון חוזר

   בתוך אותה הפעלה השער נכון: הוא מונע מלומד שיוצא משאלה אחורה דרך goBack() לשדר
   'completed' חסר תוצאה, שהיה חוסם אחר כך את האמיתי והמנוקד. אבל שחזור מכוון לא
   משדר מחדש את התשובות שהוא משחזר, ולכן בלי הזריעה שלמטה הספרייה מתייחסת לכל
   פריט שנענה בעבר כאילו לא נענה ומוחקת את ה-'completed' שלו — בזמן
   ש-sendStatementOnce, שכבר קרא לשולח, מסמן ביומן שנשלח. הלומדה לא תשאל שוב,
   הספרייה לא תנסה שוב, וה-statement אבד לתמיד.

   אומת חי מול Kata ב-07.09.26 ביחידת הייחוס methodica-math-ratio-01: היומן אמר
   "נשלח" בזמן ש-xapiCompletedObjects של הספרייה עדיין היה ריק.

   הזריעה מחזירה את הספרייה למצב שבו הייתה אילו הלומד לא היה יוצא. היא לא משדרת
   כלום בעצמה — רק פותחת את השער, וה-'completed' שנשלח אחריה נושא את התוצאה
   המפורשת ש-xapiItemResult() מספק, כך ששום דבר לא תלוי בניקוד של הספרייה עצמה.

   רק פריטים עם תשובה רשומה נזרעים, כך שפריט שהלומד לא ענה עליו עדיין נדחה
   וההגנה של goBack נשמרת.

   ⚠️ חייב לרוץ אחרי applyResumeVars (שממלא מחדש את XAPI_Q_RESULTS) ולפני שאפשר
   לחצות גבול פריט. applyExecutionState קורא לזה כפעולה האחרונה שלו. */
function xapiSeedAnsweredFromResume(){
  if (!window.XAPI_USING_G) return;
  /* no-op שקט כאן היה מחזיר את הבאג בלי שאיש ישים לב, ולכן אומרים זאת: המפה היא
     גלובל רגיל היום, והייתה מפסיקה להיות נגישה אילו הספרייה תעביר אותה ל-const/let. */
  if (!window.xapiItemAnswered) {
    console.warn('[xAPI] xapiItemAnswered unreachable - item "completed" will be dropped after a resume');
    return;
  }
  Object.keys(XAPI_Q_RESULTS).forEach(function(k){
    var item = k.split('/')[0];
    if (item) window.xapiItemAnswered[xapiItemId(item)] = true;
  });
}

/* ── B-1 (QA 2026-10-02; port of methodica-science-mass-weight-01 5ad764d) ──
   The library DROPS an evaluated item's 'completed' when that item has no 'answered' in this page
   load (its "deferring" return: no queue, no retry). sendCompletedOnce cannot see that: it marks the
   ledger anyway, and the real, scored 'completed' after the learner comes back and answers is then
   suppressed forever. Live 2026-10-02: Back through an unanswered item (ar-mass-measure-02 01
   S6 -> S5, item 004; ar-mass-measure-03 01 S10 -> S9, item 007; ar-math-ratio-02 01 S3 -> S2,
   item 002) and Kata never received that item's 'completed'.
   So the close asks the library's own question first and, when the library would drop the
   statement, sends nothing and leaves the ledger untouched. Fallback when the map is unreachable:
   an answer recorded in XAPI_Q_RESULTS (restored by resume, the same predicate as the seed). */
function _xapiLibWouldDrop(item) {
  if (!_xapiIsEval(item)) return false;
  var m = window.xapiItemAnswered;
  if (m) return !m[xapiItemId(item)];
  return !Object.keys(XAPI_Q_RESULTS).some(function (k) { return k.split('/')[0] === item; });
}
function _xapiCloseItem(item) {
  if (_xapiLibWouldDrop(item)) return;
  try { sendCompletedOnce('doneItems', itemLedgerKey(item), 'question', xapiItemResult(item), { objectId: xapiItemId(item), expectsAnswer: _xapiIsEval(item) }); } catch (e) {}
}

/* זוגות initialized/completed ברמת הפריט, מונעים מ-goTo(). דפדוף בתוך אותו
   פריט לא משדר כלום; הפריט נסגר כשהלומד נכנס למסך ששייך לפריט אחר. */
function xapiOnScreen(screen) {
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  var map = (typeof SCREEN_TO_SUBCONTENT !== 'undefined') ? SCREEN_TO_SUBCONTENT[screen] : null;
  var item = map ? map[0] : null;
  if (item === xapiCurrentItem) return;
  if (xapiCurrentItem) _xapiCloseItem(xapiCurrentItem);
  xapiCurrentItem = item;
  if (item) {
    try { sendStatement720('initialized', 'question', null, { objectId: xapiItemId(item), isEvaluationItem: _xapiIsEval(item) }); } catch (e) {}
  }
}

/* סוגר את הפריט הפתוח האחרון — נקרא מיד לפני כל completed של רכיב. */
function xapiFinishItems() {
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  if (xapiCurrentItem) {
    _xapiCloseItem(xapiCurrentItem);
    /* מתאפס בין אם ה-statement דוכא ובין אם לא: latch שנשאר דלוק היה גורם
       ל-xapiOnScreen הבא לנסות לסגור את אותו פריט שוב. */
    xapiCurrentItem = null;
  }
}

/* ═══════════════════ שלושת העוזרים שאתרי הקריאה משתמשים בהם ═══════════════════
   בלומדת המתמטיקה כל אתר answered הוא בלוק של 6–8 שורות, משוכפל 26 פעמים על
   פני חמישה קבצים. בלומדה הזאת יש 26 אתרים בעלי מבנה כמעט זהה
   (sNNCheck עם ענף נכון / שגוי-ראשון / שגוי-סופי), ולכן העוזרים האלה הופכים כל
   אתר לשורה אחת. פחות שכפול פירושו פחות מקומות שבהם אפשר לטעות — וזו בדיוק
   מחלקת הטעויות שה-try/catch השקטים היו מסתירים.

   ⚠️ הכתיבה ל-XAPI_Q_RESULTS קורית **לפני** ה-try/catch ומחוצה לו, לא בתוכו.
   זו אינווריאנטה מ-REPORT-XAPI.md §2: כשל דיווח לא יכול לקלקל את הניקוד.
   כאן היא נאכפת במקום אחד במקום להסתמך על 26 אתרי קריאה שיזכרו אותה. */

/* ═══════════════════ result.response — per the xAPI interaction-type formats ═══════════════════
   MOE runbook checks 10.11.26 (QA/2026-11-10_moe-runbook-checks, Phase 6 lane 3): Kata compares
   result.response with the question's correctXapiResponsesPattern character by character. The old
   helpers here (xapiZoneAnswer → 'kitchen: … | lab: …', xapiFieldsAnswer → 's5-input=0.1',
   xapiMultiAnswer → click order joined with ', ') never matched. This layer is copied from
   methodica-science-mass-density-01/unit-js/20-xapi.js:269–494 (first written for body-matter-01,
   MOE mail 19.10.26), with the Arabic bidi strip of methodica-ar-science-volume-liquid-01
   (unit-js/20-xapi.js:304–308) plus U+200B and U+061C.

     • the METADATA TEXT is the identifier. Every builder resolves what the UI hands it to the
       metadata entry (normalised comparison) and emits the metadata string byte-for-byte, in
       metadata order, with the xAPI delimiters. Never a DOM id, never click order.
     • choice      → 'A' or 'A[,]B'           pieces from answers[], in answers order
       matching    → 'S1[.]T1[,]S2[.]T2'       the placed pairs, right ones in correctAnswers order
       performance → 'step1[.]v1[,]step2[.]v2' one per steps[], in steps order (learner text)
       fill-in / numeric / true-false / sequencing / other → plain / '12.5' / 'true' / 'A[,]B' / free text
     • '[,]' '[.]' '[:]' are reserved: learner-typed free text has them blanked; metadata-sourced
       pieces are never altered.
     • lookup normalisation only: NFC, bidi marks / ZWSP / ALM dropped, collapsed whitespace,
       ׳ ’ ʼ → ' . An unresolvable UI text is warned about and emitted normalised.

   The library (xapi-720-l.js, answered block) passes sttmResult.response through verbatim, so the
   whole layer is unit-side. The retired xapiZoneAnswer / xapiFieldsAnswer / xapiMultiAnswer must
   not come back — _test/verify-report.js greps for them. */

/* The metadata question object for (item suffix, qKey) — or null. Same matching as xapiQ. */
function _xapiFindQuestion(suffix, qKey) {
  try {
    var sc = (window.METADATA && window.METADATA.subContent) || [];
    for (var i = 0; i < sc.length; i++) {
      if (_xapiTrim(sc[i].id).slice(-(suffix.length + 1)) !== '-' + suffix) continue;
      var qs = sc[i].questions || [];
      for (var j = 0; j < qs.length; j++) {
        var v = _xapiTrim(qs[j].questionId);
        if (v === qKey || v.slice(-(qKey.length + 1)) === '/' + qKey) return qs[j];
      }
      var n = parseInt(String(qKey).replace(/\D/g, ''), 10);
      return (n >= 1 && n <= qs.length) ? qs[n - 1] : null;
    }
  } catch (e) {}
  return null;
}

/* performance steps as [{name, correctAnswer}]. Two metadata shapes: an explicit steps[], or the
   Kata shape (2026-10-21, 03-004/q1 as Kata stores it): answers null, correctAnswers
   [{stepId, response}] — the stepId is the step name, in correctAnswers order. */
function _xapiSteps(q) {
  if (q.steps) return q.steps;
  var ca = q.correctAnswers || [];
  if (!ca.length || !ca.every(function (c) { return c && c.stepId != null; })) return null;
  return ca.map(function (c) { return { name: c.stepId, correctAnswer: c.response }; });
}

/* {questionId, parentId, questionType, answers, correctAnswers, steps} — one lookup. */
function xapiQMeta(suffix, qKey) {
  var ids = xapiQ(suffix, qKey), q = _xapiFindQuestion(suffix, qKey) || {};
  return { questionId: ids.questionId, parentId: ids.parentId,
           questionType: q.questionType || null,
           answers: q.answers == null ? null : q.answers,
           correctAnswers: q.correctAnswers || null,
           steps: _xapiSteps(q) };
}

var XAPI_SEP_LIST = '[,]', XAPI_SEP_PAIR = '[.]';
var _XAPI_DELIMS = /\[,\]|\[\.\]|\[:\]/g;

/* Bidi marks (LRM / RLM / ALM / embeddings / isolates) and ZWSP are invisible layout hints: the Arabic
   labels carry them around numbers and after a final '.', the metadata does not. Lookup and
   learner text only — a metadata string is always emitted as it is. ׳ (Hebrew geresh) is escaped. */
var _XAPI_BIDI = /[\u200B\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;
function _xapiNorm(s) {
  s = String(s == null ? '' : s);
  if (s.normalize) s = s.normalize('NFC');
  return s.replace(_XAPI_BIDI, '').replace(/[\u05F3’ʼ]/g, "'").replace(/\s+/g, ' ').trim();
}
/* learner-typed text: the delimiters cannot be escaped in xAPI, so they are blanked */
function _xapiFree(s) { return _xapiNorm(s).replace(_XAPI_DELIMS, ' ').replace(/\s+/g, ' ').trim(); }

/* Resolve one UI value to the metadata entry it names. pool = array of metadata strings.
   value: a string (matched by _xapiNorm) or a number (index into the pool).
   Returns {text, idx} — text is the METADATA string, byte for byte, when found. */
function _xapiPick(value, pool, item, qKey, where) {
  pool = pool || [];
  if (typeof value === 'number') {
    if (pool[value] != null) return { text: String(pool[value]), idx: value };
    console.warn('[xAPI] response: index ' + value + ' outside metadata ' + where, item, qKey);
    return { text: '', idx: 1e9 };
  }
  var n = _xapiNorm(value);
  for (var i = 0; i < pool.length; i++) if (_xapiNorm(pool[i]) === n) return { text: String(pool[i]), idx: i };
  if (n !== '') console.warn('[xAPI] response: "' + n + '" not in metadata ' + where, item, qKey);
  return { text: n, idx: 1e9 };
}

/* choice: selected → [text | index]; emitted in answers order, whatever the click order */
function xapiChoiceResponse(item, qKey, selected) {
  var m = xapiQMeta(item, qKey), pool = Array.isArray(m.answers) ? m.answers : [];
  var picks = (selected || []).map(function (v) { return _xapiPick(v, pool, item, qKey, 'answers'); });
  picks.sort(function (a, b) { return a.idx - b.idx; });
  var texts = picks.map(function (p) { return p.text; }).filter(function (t) { return t !== ''; });
  return { response: texts.join(XAPI_SEP_LIST), readable: texts.join(', ') };
}

/* matching: pairs → [{source, target}] (strings or indexes). Only the pairs the learner PLACED are
   emitted — a source left unmatched (a distractor, a spare option) is not reported at all (MOE QA
   2026-10-25, monday: 02-001, 06-001 q2/q4 — a 'S[.]' entry made a right answer differ from the
   catalogue). Order: the pairs that are in correctAnswers first, in correctAnswers order — the order
   Kata builds correctXapiResponsesPattern in, so a right answer is byte-identical to it — then the
   wrong pairs in answers.source, answers.target order.
   mass-liquid-02 (2026-10-22): one entry per placed pair, not one per source. This unit's catalogue
   repeats a source — a value that is right for two targets (02/005: "ליטר" for אמבטיה and for
   דלי) — and the donor's one-slot-per-source map silently dropped the second placement. */
function xapiMatchingResponse(item, qKey, pairs) {
  var m = xapiQMeta(item, qKey);
  var src = (m.answers && m.answers.source) || [], tgt = (m.answers && m.answers.target) || [];
  var placed = [];   // [{s: {text, idx}, t: {text, idx}}]
  (pairs || []).forEach(function (p) {
    var s = _xapiPick(p.source, src, item, qKey, 'answers.source');
    var t = _xapiPick(p.target, tgt, item, qKey, 'answers.target');
    /* direction guard: the call site handed us the pair target-first */
    if (s.idx === 1e9 && t.idx === 1e9) {
      var s2 = _xapiPick(p.target, src, item, qKey, 'answers.source'), t2 = _xapiPick(p.source, tgt, item, qKey, 'answers.target');
      if (s2.idx !== 1e9 && t2.idx !== 1e9) { console.warn('[xAPI] matching pair reversed — swapped', item, qKey); s = s2; t = t2; }
    }
    if (s.text !== '') placed.push({ s: s, t: t });   // an empty slot / an unplaced card is not a pair
  });
  /* rank = position in correctAnswers (each entry claimed once); wrong pairs rank after every right one */
  var ca = Array.isArray(m.correctAnswers) ? m.correctAnswers : [], claimed = {};
  placed.forEach(function (p) {
    p.rank = 1e9;
    for (var j = 0; j < ca.length; j++) {
      if (claimed[j] || !ca[j] || String(ca[j].source) !== p.s.text || String(ca[j].target) !== p.t.text) continue;
      claimed[j] = true; p.rank = j; break;
    }
  });
  /* a pair whose source is not in the metadata (idx 1e9) sorts last, so nothing the learner did is lost */
  placed.sort(function (a, b) { return (a.rank - b.rank) || (a.s.idx - b.s.idx) || (a.t.idx - b.t.idx); });
  var out = [], readable = [];
  placed.forEach(function (p) { out.push(p.s.text + XAPI_SEP_PAIR + p.t.text); readable.push((p.s.text || '—') + ' → ' + (p.t.text || '—')); });
  return { response: out.join(XAPI_SEP_LIST), readable: readable.join(' | ') };
}

/* performance: values → { <step name>: text } or [text, …] in steps order */
function xapiPerformanceResponse(item, qKey, values) {
  var m = xapiQMeta(item, qKey), steps = m.steps || [];
  if (!steps.length) console.warn('[xAPI] performance: no steps[] / correctAnswers[].stepId in metadata', item, qKey);
  var out = [], readable = [];
  steps.forEach(function (st, i) {
    var name = String(st.name == null ? i + 1 : st.name);
    var v = values == null ? '' : (Array.isArray(values) ? values[i] : (values[name] != null ? values[name] : values[i]));
    out.push(name + XAPI_SEP_PAIR + _xapiFree(v)); readable.push(name + ': ' + (_xapiFree(v) || '—'));
  });
  return { response: out.join(XAPI_SEP_LIST), readable: readable.join(' | ') };
}

function xapiFillInResponse(item, qKey, values) {
  var vs = (Array.isArray(values) ? values : [values]).map(_xapiFree);
  return { response: vs.join(XAPI_SEP_LIST), readable: vs.join(' | ') };
}
function xapiNumericResponse(item, qKey, value) {
  var n = Number(String(value == null ? '' : value).replace(',', '.'));
  var s = isNaN(n) ? _xapiFree(value) : String(n);
  return { response: s, readable: s };
}
function xapiTrueFalseResponse(item, qKey, value) {
  var s = (value === true || value === 'true') ? 'true' : 'false';
  return { response: s, readable: s };
}
function xapiSequencingResponse(item, qKey, ordered) {
  var m = xapiQMeta(item, qKey), pool = Array.isArray(m.answers) ? m.answers : [];
  var texts = (ordered || []).map(function (v) { return _xapiPick(v, pool, item, qKey, 'answers').text; });
  return { response: texts.join(XAPI_SEP_LIST), readable: texts.join(' > ') };
}
function xapiOtherResponse(item, qKey, text) {
  var s = _xapiFree(text);
  return { response: s, readable: s };
}
function _xapiNoShape(item, qKey, want) {
  console.warn('[xAPI] response: metadata type needs "' + want + '" but the call site passed none', item, qKey);
  return [];
}

/* Dispatcher. spec = string | { type?, choices | pairs | steps | values | value | order | text }.
   The METADATA type governs (Kata reads the metadata); spec.type is only a cross-check. */
function xapiResponse(item, qKey, spec) {
  var m = xapiQMeta(item, qKey), type = m.questionType;
  if (typeof spec === 'string' || spec == null) spec = { text: spec == null ? '' : spec };
  if (spec.type && type && spec.type !== type)
    console.warn('[xAPI] response: call site says "' + spec.type + '", metadata says "' + type + '"', item, qKey);
  if (!type) { type = spec.type || 'other'; console.warn('[xAPI] response: no questionType in metadata, using "' + type + '"', item, qKey); }
  try {
    switch (type) {
      case 'choice':      return xapiChoiceResponse(item, qKey, spec.choices != null ? spec.choices : [spec.text]);
      case 'matching':    return xapiMatchingResponse(item, qKey, spec.pairs || _xapiNoShape(item, qKey, 'pairs'));
      case 'performance': return xapiPerformanceResponse(item, qKey, spec.steps != null ? spec.steps : spec.values);
      case 'fill-in':     return xapiFillInResponse(item, qKey, spec.values != null ? spec.values : spec.text);
      case 'numeric':     return xapiNumericResponse(item, qKey, spec.value != null ? spec.value : spec.text);
      case 'true-false':  return xapiTrueFalseResponse(item, qKey, spec.value != null ? spec.value : spec.text);
      case 'sequencing':  return xapiSequencingResponse(item, qKey, spec.order || spec.choices);
      default:            return xapiOtherResponse(item, qKey, spec.text != null ? spec.text : JSON.stringify(spec));
    }
  } catch (e) {
    console.error('[xAPI] response formatting failed', item, qKey, e);
    return { response: _xapiFree(spec.text), readable: _xapiFree(spec.text) };
  }
}

/* דיווח תשובה מדורגת אחת.
     item      סיומת הפריט, למשל '003'
     qKey      מפתח השאלה, למשל 'q1'
     correct   האם התשובה נכונה
     isLast    האם זו התשובה האחרונה על השאלה (נכונה, או שנגמרו הניסיונות).
               רק 'answered.last' נכנס למכנה של ניקוד הרכיב.
     answer    spec object for xapiResponse ({choices} | {pairs} | {steps} | {text} …), or a plain
               string for a single-value type. Same signature as every live unit. */
function xapiAnswered(item, qKey, correct, isLast, answer) {
  XAPI_Q_RESULTS[item + '/' + qKey] = !!correct;
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  try {
    var r = xapiResponse(item, qKey, answer);
    sendStatement720(isLast ? 'answered.last' : 'answered', 'question',
      { success: !!correct,
        score: { scaled: correct ? 1 : 0 },
        response: r.response,
        extensions: { student_answer: [r.readable] } },   /* fallback for library letters < k */
      xapiQ(item, qKey));
  } catch (e) { console.error('[xAPI] answered ' + item + '/' + qKey, e); }
}

/* מפתחות ה-(item/qKey) שכבר נשלח עבורם 'requested.1' בטעינת העמוד הזאת.
   אותו מפתח בדיוק ש-xapiAnswered משתמש בו ל-XAPI_Q_RESULTS. */
var XAPI_HINTS_SENT = {};

/* בקשת רמז. ⚠️ להציב רק בענף "הרמז נפתח כרגע". רמזים כאן הם לרוב overlay
   ש-hidden שלו מתהפך, ומיקום הקריאה על ה-toggle היה מדווח בקשה שנייה בכל
   סגירה. ראו REPORT-XAPI.md §4.

   ── דה-דופליקציה: פעם אחת לכל שאלה ──
   ההערה הישנה כאן טענה ש"הפונקציה פותחת בלבד ולכן אין סיכון לדיווח כפול".
   זה כיסה רק כניסה חוזרת מנתיב הסגירה. ה-overlay נסגר בשלוש דרכים (כפתור
   הסגירה, קליק על הרקע, ו-Escape), וכולן משאירות את כפתור הרמז חי — ובפאבריקה
   המשותפת הוא אפילו מופעל מחדש במפורש ב-closeHint. לכן לומד שפותח רמז פעמיים
   דיווח 'requested.1' פעמיים.
   הבדיקה כאן ולא באתרי הקריאה: יש 23 אתרים בחמישה סינים, וכולם עוברים דרך
   הפונקציה הזאת.
   ── היקף: טעינת עמוד ──
   המפה נמחקת ברענון, ולכן לומד שמרענן ופותח שוב את אותו רמז ידווח שוב. זו
   החלטה מכוונת (החלופה היא להחזיק את המפתחות במסמך ה-state). בשחזור עצמו אין
   סיכון: applyExecutionState מחליף את sendStatement720 ב-no-op כל עוד
   _restoring דלוק. */
function xapiRequestedHint(item, qKey) {
  var _k = item + '/' + qKey;
  if (XAPI_HINTS_SENT[_k]) return;
  XAPI_HINTS_SENT[_k] = true;
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  try { sendStatement720('requested.1', 'question', null, xapiQ(item, qKey)); } catch (e) {}
}

/* ה-completed של הרכיב. סוגר קודם את הפריט הפתוח, ואז מדווח דרך היומן.
   ⚠️ יש לקרוא לזה גם במסלולי כשל. רכיב שהלומד לא צלח חייב להיות מדווח, אחרת
   כל הניסיון שלו לא נרשם — ניתוב לומד שנכשל הוא תפקיד הפלטפורמה, דרך
   recommendedAfterFail של הרכיב. ראו REPORT-XAPI.md §5. */
function xapiCompleteComponent(result) {
  try { xapiFinishItems(); } catch (e) {}
  try {
    sendCompletedOnce('done', currentPartSlug(), 'onlinelesson', result || null);
  } catch (e) { console.error('[xAPI] completed component', e); }
}

/* סיום הרכיב מהכפתור האחרון: מדווח, ואז עוצר. Kata מסירה את הרכיב מהמסך
   כשמגיע ה-completed (הנחיות 2.7 עמ' 23 — "הפלטפורמה מסירה את הרכיב מהמסך"),
   ולכן ה-completed חייב להיות **הפעולה האחרונה** של הלומד ברכיב, אחרי כל
   משוב וכל מסך מסכם. מחוץ ל-Kata (QA על ה-CDN, הרצה מקומית) אין מי שיסיר את
   הרכיב, והכפתור המושבת הוא הסימן היחיד שהלחיצה נרשמה. ללומד לא מוצג טקסט
   חדש — כך הוכרע (16.09.26).
   הניווט לסין הבא שהיה כאן עד 2026-09-16 חי רק תחת DEV_NAV (10-identity.js).

   ⚠️ אין יותר completed ברמת היחידה. xapiCompleteUnit הוסר ב-2026-09-16: הנחיות
   2.5/2.7 מגדירות את object כ"ID של הפריט או רכיב התוכן" בלבד, והפלטפורמה
   גוזרת את מצב היחידה בעצמה. ראו REPORT-XAPI.md §10. */
function xapiEndComponent(result, btn) {
  xapiCompleteComponent(result);
  if (btn) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
}

/* played/paused ל-<video> של HTML5 — **רק לווידאו תוכן**, לפי סימון מפורש.
   ── למה allowlist ולא כל ה-<video> ──
   הגרסה הקודמת בחרה querySelectorAll('video') בלי שום סינון. כל 18 קובצי ה-mp4
   ביחידה הזאת הם avatar-* — קליפים של הדמות המלווה, כלומר עיטור ולא תוכן —
   ותשעה מהם (סינים 01/02/05/06) חוברו ודיווחו. סינים 03/04 שתקו רק כי אין בהם
   <video> כלל, לא בגלל סינון.
   זה גם לא היה דיווח שקט: כל מסך דמות מריץ video.load() + play() בכניסה
   (למשל -01/script.js:940), וה-load() על אלמנט מתנגן מפיק אירוע pause ואחריו
   play — כלומר זוג paused/played מזויף בכל כניסה למסך, כולל חזרה ושחזור.
   מעכשיו מחוברים רק אלמנטים שנושאים data-xapi-report, וערכו הוא סיומת הפריט
   (למשל data-xapi-report="003"). כרגע אין ביחידה אף אלמנט
   כזה, ולכן הדיווח כבוי בפועל — המנגנון נשאר מוכן לווידאו תוכן אמיתי.
   ── objectId: הפריט, לא השאלה (15.09.26) ──
   דווח על ידי צוות הבדיקות: האמירות האלה נשלחו מול הסין. נשיאת xapiQ() מעולם
   לא הספיקה. הספרייה בונה את object.id מ-sttmContext.objectId, אחרת מ-questionId
   אבל רק ל-answered/selected/requested, ואחרת מ-window.METADATA.id. played/paused
   אינם באף אחת מהרשימות, ולכן ה-questionId וה-parentId נזרקו ונשלח מזהה הרכיב
   (xapi-720-k.js, בלוק ה-object). מעכשיו מועבר objectId: xapiItemId(item) — אותו
   helper שמעגן item initialized/completed.
   xapiQ() ו-data-xapi-q ירדו מהמסלול הזה: האובייקט הוא הפריט, ופריט וידאו לא חייב
   לשאת שאלה בכלל (לפריט 006 של mass-measure-01 אין).
   ⚠️ ב"דוגמאות XAPI" של משרד החינוך, §6 ו-§7, מופיע ב-object מזהה רכיב. אנחנו
   הולכים לפי צוות הבדיקות, כי אמירת וידאו ברמת רכיב לא יכולה לומר איזה סרטון.
   אישור בכתב מ-MOE עדיין פתוח — לשאול אותו יחד עם אותה שאלה לגבי 'requested'. */
function xapiWireVideos() {
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  document.querySelectorAll('video[data-xapi-report]').forEach(function (v) {
    if (v.__xapiWired) return; v.__xapiWired = true;
    var item = v.getAttribute('data-xapi-report');
    var ctx  = { objectId: xapiItemId(item) };   // הפריט שהווידאו שייך לו
    var pausedOnce = false;
    v.addEventListener('pause', function () { if (v.ended || v.currentTime === 0) return; pausedOnce = true; try { sendStatement720('paused', 'question', null, Object.assign({ time: v.currentTime }, ctx)); } catch (e) {} });
    v.addEventListener('play', function () { if (!pausedOnce) return; try { sendStatement720('played', 'question', null, Object.assign({ time: v.currentTime }, ctx)); } catch (e) {} });
  });
}

/* played/paused לסרטוני YouTube — onStateChange של IFrame Player API.
   ── למה (23.09.26) ──
   דווח ע"י בודק MOE: "אין בכלל דיווחים של played/paused על הסרטון". בסין 01 יש
   שלושה סרטוני YouTube (מסכים s1/s3/s7), וה-handler שלהם האזין רק ל-ENDED כדי
   לפתוח את כפתור "המשך". xapiWireVideos למעלה לא רואה אותם — iframe אינו <video>.
   ── מכונת מצבים, לא latch ── (הועתק מ-mass-measure-01/unit-js/20-xapi.js)
   דגל אחד לכל נגן: __xapiPlaying == "יש played פתוח שעוד לא נסגר ב-paused".
   played נשלח רק כשהדגל כבוי, paused רק כשהוא דלוק. לכן:
     - ה-played הראשון בכל צפייה נשלח (latch מסוג pausedOnce היה בולע אותו —
       זה בדיוק הפגם ש-MOE דיווח ב-mass-measure-01 ב-17.09.26);
     - paused יתום בלתי אפשרי מבנית;
     - BUFFERING -> PLAYING באמצע ניגון (seek) שקט — PLAYING שני כשכבר מנגן.
   ENDED מאפס את הדגל ולא מדווח כלום: כך ניגון חוזר ישלח played שוב, ו-paused
   סינתטי בסוף הסרטון היה מדווח פעולת לומד שלא קרתה.
   ── objectId ──
   הפריט, כמו ב-xapiWireVideos: xapiItemId(item). ה-caller מעביר את סיומת הפריט
   (s1/s3 -> 002, s7 -> 006; ראו SCREEN_TO_SUBCONTENT ב-01/script.js). הדגל יושב על
   מופע הנגן ולא על הפריט — s1 ו-s3 חולקים את פריט 002, ודגל לפי פריט היה מתערבב. */
function xapiYouTubeState(e, item) {
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  if (!item) { console.warn('[xAPI] youtube state with no item suffix -- not reporting'); return; }
  var p = e && e.target;
  if (!p) return;
  var t = (typeof p.getCurrentTime === 'function') ? p.getCurrentTime() : undefined;
  var ctx = { time: t, objectId: xapiItemId(item) };
  if (e.data === YT.PlayerState.PLAYING) {
    if (p.__xapiPlaying) return;          // seek באמצע ניגון — כבר פתוח
    p.__xapiPlaying = true;
    try { sendStatement720('played', 'question', null, ctx); } catch (_) {}
  } else if (e.data === YT.PlayerState.PAUSED) {
    if (!p.__xapiPlaying) return;         // אין played פתוח — לא שולחים יתום
    p.__xapiPlaying = false;
    try { sendStatement720('paused', 'question', null, ctx); } catch (_) {}
  } else if (e.data === YT.PlayerState.ENDED) {
    p.__xapiPlaying = false;              // re-arm לניגון חוזר; ENDED עצמו לא מדווח
  }
}
