/* תחליף מקומי ל-xapi-720-k.js שב-CDN, לאימות resume וניווט בין סינים בלי LRS.
   **לא נפרס.** נטען רק דרך ?xapiLib=../_test/xapi-720-k.js, ש-50-loader.js מכבד
   על localhost בלבד.

   ⚠️ שם הקובץ חייב להישאר עם הסיומת "xapi-720-k.js": 50-loader.js קובע את
   window.XAPI_USING_G ע"י regex על שם הקובץ (`/xapi-720-[ghijk]\.js/`), ושם
   שלא תואם משתיק את כל ה-statements ברמת הפריט — בלי שום שגיאה גלויה.
   שונה מ--j ל--k ב-2026-08-17 יחד עם מעבר היחידה לספרייה החדשה.

   ה-state ויומן ה-statements יושבים ב-sessionStorage, כדי ששניהם ישרדו את
   המעברים בין סינים שההרנס הזה נועד לתרגל. המסמך ממופתח לפי ה-stateId
   (v5: 'execution-state::<slug>') — מסמך לכל סין, כמו ב-Kata. saveState720Debounced באמת משהה
   800ms, ולכן מרוץ ה-timer המיושן שהמעבר מתגונן מפניו ניתן לשחזור כאן.

   מחקה גם את שכבת האבחון של -k: stateLastResult720() מחזיר
   {op,status,ok,reason}, ו-__failWrites מקבל status כדי שכל ענף reason יהיה
   ניתן להגעה מקומית — למשל __failWrites(413) לתקרת ה-1MB.

   עוזרי קונסול: __stmts() __state() __dupes() __reset() __failWrites(bool|status) */
(function () {
  'use strict';

  var STATE_KEY = '__test_state';
  var LOG_KEY   = '__test_statements';
  var FAIL_KEY  = '__test_fail_writes';

  /* ── שכבת האבחון של -k ──
     מחזיק את אותו חוזה כמו הספרייה: {op,status,ok,reason}. מפת ה-reason זהה
     לזו שב-720-common-lib/xapi-720-k.js, כדי שבדיקה שעוברת מול ה-stub תתאר
     את מה שיקרה מול Kata האמיתי ולא משהו אחר. */
  var _lastResult = null;
  function reasonFor(op, status) {
    if (status >= 200 && status < 300) return 'ok';
    switch (status) {
      case 0:   return 'network';
      case 400: return 'bad-address';
      case 401: return 'auth';
      case 404: return (op === 'load') ? 'absent' : 'no-launch';
      case 412: return 'stale';
      case 413: return 'too-large';
      case 422: return 'validation';
      default:  return 'http-' + status;
    }
  }
  function record(op, status, ok, reason) {
    _lastResult = {
      op: op, status: status, ok: !!ok,
      reason: reason || reasonFor(op, status),
      at: new Date().toISOString()
    };
    return _lastResult;
  }
  window.stateLastResult720 = function () { return _lastResult; };

  /* הכשל המדומה. bool נשמר לתאימות לאחור עם קריאות קיימות; מספר מאפשר לכוון
     status מסוים ולהגיע לכל ענף reason — למשל __failWrites(413). */
  function forcedStatus() {
    try {
      var v = sessionStorage.getItem(FAIL_KEY);
      if (v === null || v === '0' || v === 'false') return 0;
      if (v === '1' || v === 'true') return 500;
      var n = parseInt(v, 10);
      return isNaN(n) ? 500 : n;
    } catch (e) { return 0; }
  }

  function readLog() {
    try { return JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]'); } catch (e) { return []; }
  }
  function writeLog(a) {
    try { sessionStorage.setItem(LOG_KEY, JSON.stringify(a)); } catch (e) {}
  }
  function currentPart() {
    return window.location.pathname.split('/').filter(Boolean).slice(-2)[0] || '';
  }

  /* מפת הפריטים שכבר נענו בטעינת הדף הזו — בדיוק מה שהספרייה האמיתית
     מחזיקה, ומה ש-xapiSeedAnsweredFromResume() ב-20-xapi.js זורע מחדש אחרי
     שחזור. חייב להיות על window — הזריעה נגשת אליו בדיוק כך. */
  window.xapiItemAnswered = window.xapiItemAnswered || {};

  /* חייב להיות נגיש כ-window property: applyExecutionState ב-40-resume.js
     דורך עליו ב-no-op לרוחב ה-goTo של השחזור, וקריאות ב-20-xapi.js הן bare
     ולכן נפתרות דרך ה-window. אם הספרייה האמיתית תעבור ל-const/let, ה-stub
     הזה יישבר בשקט וה-resume ידווח מחדש הכול. */
  window.sendStatement720 = function (verb, objectType, result, opts) {
    /* הספרייה האמיתית מסירה את הסיומת לפני כל בדיקה:
       sttmType = sttmRowType.split(".")[0]. לכן 'answered.last' נספר גם הוא. */
    var sttmType = String(verb).split('.')[0];
    if (sttmType === 'answered' && opts && opts.parentId) {
      window.xapiItemAnswered[opts.parentId] = true;
    }

    /* ── שער הדחייה של הספרייה האמיתית ──
       פריט שמצפה לתשובה ולא נענה בטעינה הזו — ה-'completed' שלו נזרק. אין
       תור ואין ניסיון חוזר: ה-return הזה הוא איבוד לצמיתות. בלי חיקוי השער
       כאן ה-stub סלחני מהספרייה, והחבילה עיוורת לבאג הזה לגמרי — כך הוא
       חמק מכל הטענות עד שנמצא בבדיקה חיה מול Kata ב-07.09.26. */
    if (sttmType === 'completed' && opts && opts.objectId != null &&
        opts.expectsAnswer && !window.xapiItemAnswered[opts.objectId]) {
      console.log('[stub] item left unanswered — deferring completed ' + opts.objectId);
      return;
    }

    var log = readLog();
    log.push({
      verb: verb,
      objectType: objectType,
      part: currentPart(),
      objectId: (opts && opts.objectId) || null,
      result: result || null
    });
    writeLog(log);
    console.log('[stub] ' + verb + ' ' + objectType +
      (opts && opts.objectId ? ' ' + opts.objectId : ''));
  };

  function stateKey(id) { return STATE_KEY + '::' + (id || 'execution-state'); }

  window.loadState720 = function (id) {
    try {
      var raw = sessionStorage.getItem(stateKey(id));
      /* absent אינו כשל — זו הקריאה הראשונה של registration חדש, וזה בדיוק
         המקרה ש--j לא ידע להבדיל מ-401 או מ-500. */
      record('load', raw ? 200 : 404, true, raw ? 'ok' : 'absent');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { record('load', 0, false, 'threw'); return null; }
  };

  /* מחזיר false בכשל מדומה — בדיוק מה ש-persistUnitState בודק (!== false),
     ומה שמאפשר לתרגל את הענף שבו כפתור החזרה נשאר במקום.
     חוזה ההחזרה זהה ל--k: true/false בלבד, והפירוט ב-stateLastResult720(). */
  window.saveState720 = function (id, doc) {
    try {
      var forced = forcedStatus();
      if (forced) {
        var r = record('save', forced, false);
        console.warn('[stub] save FORCED FAIL status', forced, 'reason', r.reason);
        return false;
      }
      sessionStorage.setItem(stateKey(id), JSON.stringify(doc));
      record('save', 204, true);
      return true;
    } catch (e) { record('save', 0, false, 'threw'); return false; }
  };

  var _t = null;
  window.saveState720Debounced = function (id, doc) {
    /* ⚠️ מחזיק את ה**הפניה** ומסדר אותה ל-JSON בזמן **הירי**, בדיוק כמו
       הספרייה האמיתית: `setTimeout(function(){ saveState720(stateId, obj); })`.
       גרסה קודמת של ה-stub צילמה את המסמך בזמן החימוש, וזה לא רק פרט —
       זה המציא מרוץ שלא קיים: טיימר שחומש ב-goTo היה דורס בהמשך את השמירה
       הסינכרונית של מחויבות התשובה עם מצב מלפני התשובה, וגרם ל-resume
       להיראות שבור. מכיוון ש-captureUnitState מחזיר תמיד את אותו אובייקט
       (_unitState), הירי המאוחר כותב את המצב **המעודכן**. */
    if (_t) clearTimeout(_t);
    _t = setTimeout(function () {
      /* -k: עובר דרך saveState720 עצמו, כך שהכשל נרשם ונראה — ב--j התוצאה
         נזרקה כאן, והכתיבה שהסיכוי לאבד אותה הגדול ביותר הייתה גם היחידה
         שאף אחד לא ראה. */
      var ok = window.saveState720(id, doc);
      if (ok === false) {
        var r = window.stateLastResult720();
        console.warn('[stub] deferred write FAILED reason', r && r.reason);
      } else {
        console.log('[stub] debounced write landed');
      }
    }, 800);
  };

  /* המטא-דאטה נטענת באמת מהדיסק, כדי שבדיקת ה-ID-mismatch ב-50-loader.js
     תרוץ מול המקור האמיתי ולא תזעק שווא בזמן ההליכה בדפדפן. */
  window.getXAPIParameters = function (file) {
    fetch(file)
      .then(function (r) { return r.json(); })
      .then(function (j) { window.METADATA = j; })
      .catch(function (e) { console.warn('[stub] metadata fetch failed', file, e); })
      .then(function () { window.jsXAPI_MetadataReady = true; });
  };

  window.ADL = window.ADL || { XAPIWrapper: { changeConfig: function () {} } };
  window.slxapi = window.slxapi || { endpoint: 'stub', auth: 'stub', actor: {} };

  /* ── עוזרי קונסול ── */
  window.__stmts = readLog;
  window.__state = function () {
    return window.loadState720(typeof RESUME_STATE_ID !== 'undefined' ? RESUME_STATE_ID : undefined);
  };
  window.__reset = function () {
    try {
      Object.keys(sessionStorage).filter(function (k) { return k.indexOf(STATE_KEY) === 0; })
        .forEach(function (k) { sessionStorage.removeItem(k); });
      sessionStorage.removeItem(LOG_KEY);
      sessionStorage.removeItem(FAIL_KEY);
      sessionStorage.removeItem('lomda_nav_edges::methodica-ar-science-mass-measure-03');
    } catch (e) {}
    /* v4: הדמות ותוצאות המועד עברו למסמך ה-state, ו-localStorage הוא קאש
       בלבד. מנקים גם אותו — אחרת __reset() משאיר את הדמות ואת שערי המועד
       מהריצה הקודמת בחיים בחלון שלפני קריאת המסמך, וזה בדיוק סוג המצב
       שהעוזר הזה קיים כדי לחסל. אותו ניקוי כמו ב-initResumeResetHatch. */
    try {
      localStorage.removeItem('methodica_ar_science_mass_measure_03_selectedCharacter');
      ['lomda_moedA_partA_result', 'lomda_moedA_partB_result',
       'lomda_moedB_partA_step1_result', 'lomda_moedB_partA_step2_result',
       'lomda_moedB_partB_result'].forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    return 'cleared';
  };
  /* on עשוי להיות boolean (תאימות לאחור) או status מספרי, כדי להגיע לכל ענף
     reason: __failWrites(413) לתקרת הגודל, (401) לטוקן, (0) ל-CORS/רשת. */
  window.__failWrites = function (on) {
    var v = (on === true) ? '1' : (on === false || on == null) ? '0' : String(on);
    try { sessionStorage.setItem(FAIL_KEY, v); } catch (e) {}
    return 'failWrites=' + v;
  };
  window.__lastState = function () { return window.stateLastResult720(); };

  /* סופר completed כפולים — התכונה שהיומן קיים כדי להבטיח.
     המפתח כולל את הסין, כי אותו objectType חוזר בכל סין. */
  window.__dupes = function () {
    var seen = {}, dupes = [];
    readLog().forEach(function (s) {
      if (s.verb !== 'completed') return;
      var k = s.part + '|' + s.objectType + '|' + (s.objectId || '');
      if (seen[k]) dupes.push(k); else seen[k] = 1;
    });
    return dupes;
  };
})();
