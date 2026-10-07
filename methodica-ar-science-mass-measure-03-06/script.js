'use strict';

/* =========================================================
   מנוע גלובלי — canvas scaling, ניווט מסכים, סטייט גלובלי
   ========================================================= */

const TOTAL_SCREENS = 5;
let currentScreen = 0;

let savedCharacter = null;
try {
  savedCharacter = localStorage.getItem('methodica_ar_science_mass_measure_03_selectedCharacter');
} catch (e) { /* localStorage חסום (opaque origin/פרטיות) — נמשיך בלי שמירה */ }
window.lomdaState = {
  selectedCharacter: savedCharacter || null
};

function scaleApp() {
  const app = document.getElementById('app');
  const CANVAS_W = 1280;
  const CANVAS_H = 710;
  const scale = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H);
  const left = (window.innerWidth - CANVAS_W * scale) / 2;
  const top = (window.innerHeight - CANVAS_H * scale) / 2;
  app.style.transform = 'scale(' + scale + ')';
  app.style.left = left + 'px';
  app.style.top = top + 'px';
}
window.addEventListener('resize', scaleApp);

function goTo(n) {
  if (n < 0 || n >= TOTAL_SCREENS) return;
  document.querySelectorAll('.screen').forEach(function (el) {
    el.classList.remove('active');
  });
  const target = document.querySelector('.screen[data-screen="' + n + '"]');
  if (!target) return;
  currentScreen = n;
  resetScreenState(n);
  target.classList.add('active');
  /* resume: לצייר מסך שכבר נענה — בכל ניווט, לא רק בנחיתת השחזור. */
  try { repaintScreen(n); } catch (e) { console.error('[resume] repaint', e); }
  /* xAPI: אחרי classList.add('active') במכוון — קריאת רשת לא מעכבת ציור.
     עטוף בנפרד כדי שדיווח שנכשל לעולם לא ישבור ניווט. */
  try { xapiOnScreen(n); } catch (e) {}
  try { scheduleResumeSave(); } catch (e) {}
}

function resetScreenState(n) {
  if (n === 0) resetScreenState0();
  if (n === 2) resetScreenState2();
  if (n === 3) resetScreenState3();
  if (n === 4) resetScreenState4();
}

function resolveCharBubbleImg(imgId, assetMap) {
  const img = document.getElementById(imgId);
  if (!img) return;
  const char = window.lomdaState.selectedCharacter;
  img.src = (char && assetMap[char]) ? assetMap[char] : '';
}

/* מקבילה ל-resolveCharBubbleImg עבור <video> — וידאו לא "נטען"/מתחיל
   לנגן רק מהצבת src כמו <img>, צריך גם .load() ו-.play() במפורש. */
function resolveCharBubbleVideo(videoId, assetMap) {
  const video = document.getElementById(videoId);
  if (!video) return;
  const char = window.lomdaState.selectedCharacter;
  const src = (char && assetMap[char]) ? assetMap[char] : '';
  if (!src || video.getAttribute('data-src') === src) return;
  video.setAttribute('data-src', src);
  video.src = src;
  video.load();
  video.play().catch(function () {});
}

/* =========================================================
   מועד ב — מעקב 3 סעיפים (localStorage), אותה מוסכמה כמו מועד א
   (סיין 5). part1=סעיף א (מסך 3), part2=סעיף ב (מסך 4), part3=סעיף ג
   (מסך 5). עודכן (2026-09-17, בקשה מפורשת): מסכי הסיכום (הצלחה/כשלון)
   ומעקב moedBFullyPassed() שניתב אליהם הוסרו — סעיף ג הוא פשוט סוף
   הלומדה. saveMoedBResult נשאר (מעקב תוצאה לכל סעיף, ללא ניתוב). */

/* ⚠️ עובר דרך setUnitResult ולא ישירות ל-localStorage, כמו saveMoedAResult
   בסיין 5. getMoedBScore גוזר מהמפתחות האלה את success ואת
   score.scaled של הרכיב, ו-localStorage אינו עובר בין מכשירים — לומד
   שממשיך את אותו registration במחשב אחר (או אחרי ניקוי אחסון) היה
   מדווח success:false ו-scaled:0 למרות שענה נכון על הכול.
   setUnitResult כותב לשניהם: למסמך ה-state ולקאש המקומי.
   (D-12, קמפיין 2026-09-21.) */
function saveMoedBResult(part, passed) {
  var key = 'lomda_moedB_part' + part + '_result';
  if (typeof setUnitResult === 'function') { setUnitResult(key, passed ? 'pass' : 'fail'); return; }
  try { localStorage.setItem(key, passed ? 'pass' : 'fail'); } catch (e) {}
}

/* =========================================================
   מסך 1 — מעבר: הקדמה למשימת השיא (מועד ב). עודכן (2026-09-17, בקשה
   מפורשת): זהה 1:1 למסך 1 בסיין 5 — אותו וידאו בדיוק (muscle, לא
   v-fingers), אותם קבצים הועתקו פיזית ל-assets/gifs/ של הסיין הזה.
   ========================================================= */

const S0_AVATAR_ASSETS = {
  pink: 'assets/gifs/pink-avatar-muscle.mp4',
  boy: 'assets/gifs/boy-avatar-muscle.mp4'
};

function resetScreenState0() {
  resolveCharBubbleVideo('s0-avatar-video', S0_AVATAR_ASSETS);
}

function s0Continue() { goTo(1); }

/* קישור בין סינים: מסך ראשון בסיין 6 -> סיין 5 (מועד א'), ספציפית
   למסך s4 ("סעיף ג") — זו נקודת הכישלון שממנה בפועל מגיעים לכאן
   (s4SectionGDecision, לא מסך ההצלחה s5 שנכשלים לעולם לא מגיעים אליו).
   נתיב יחסי + #screen=N, אותה מוסכמה בדיוק כמו בפרויקט הקודם,
   Methodica-science-mass-measure-02-linked. */
function s0BackToPreviousSain() {
  window.location.href = '../methodica-ar-science-mass-measure-03-05/index.html#screen=4';
}

/* =========================================================
   מסך 3 — סעיף א: חד-ברירה + טבלה ליד המסיחים. correctId='b'.
   עודכן (2026-09-17, בקשה מפורשת): פוצל למסך עצמאי משלו (לא עוד
   סקשן בתוך מסך-גלילה משותף) — לכפתורי הבר התחתון ids ייחודיים
   למסך הזה (s2-check/s2-hint/s2-back), אין יותר "בר משותף" בין
   סעיפים. בהצלחה/כשלון סופי: saveMoedBResult(1,...), ואז "המשך"
   מקדם ל-goTo(3) (סעיף ב).
   ========================================================= */

const S6A = {
  correctId: 'b',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'إجابة صحيحة.', body: 'هيّا نتابع ونفهم لماذا.' },
    wrong1: { title: 'الإجابة غير صحيحة.', body: 'لا بأس، نتعلّم من الأخطاء أيضًا.\nهل نحاول مرة أخرى؟' },
    wrong2: { title: 'هذا خطأ. الإجابة الصحيحة مُشار إليها.', body: 'هيّا نتابع ونفهم لماذا.' }
  }
};

let s6aSelected = null;
let s6aAttempts = 0;
let s6aDone = false;
/* Retry gate (720 spec; דיווח MOE 23.09.26): התשובה שסומנה שגויה בניסיון
   שאינו אחרון. הבחירה נשמרת אחרי טעות, ולכן בלי השער הזה "צדקתי?" נשאר
   פעיל ואפשר להגיש את אותה תשובה בדיוק כניסיון שני. */
let s6aLastWrong = null;

function s6aOptEl(id) { return document.querySelector('#s2 .scq-opt[data-id="' + id + '"]'); }

function s6aSelect(id) {
  if (s6aDone) return;
  const wasWrong = (s6aAttempts > 0 && !s6aDone);
  document.querySelectorAll('#s2 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const el = s6aOptEl(id);
  el.classList.add('selected');
  el.setAttribute('aria-checked', 'true');
  s6aSelected = id;
  if (wasWrong) document.getElementById('s2-feedbox').classList.remove('visible');
  s6aSyncBar();
}

function s6aShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s2-feedbox');
  const data = S6A.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s6aLockOptions() {
  document.querySelectorAll('#s2 .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}

function s6aCheck() {
  if (!s6aSelected || s6aDone) return;
  s6aAttempts++;
  const optEl = s6aOptEl(s6aSelected);
  /* xAPI: בראש הפונקציה, לפני ההסתעפות. המבנה כאן הוא else-if בלי return
     מוקדם, ולכן הצבה בתוך אחד הענפים הייתה מפספסת את השאר. */
  xapiAnswered('001', 'q1', s6aSelected === S6A.correctId,
    s6aSelected === S6A.correctId || s6aAttempts >= S6A.maxAttempts, xapiAnswerText(optEl));

  if (s6aSelected === S6A.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s6aDone = true;
    s6aLastWrong = null;
    s6aLockOptions();
    s6aShowFeedback('correct', true);
    saveMoedBResult(1, true);
  } else if (s6aAttempts >= S6A.maxAttempts) {
    optEl.classList.add('wrong');
    optEl.classList.remove('selected');
    s6aOptEl(S6A.correctId).classList.add('correct');
    s6aDone = true;
    s6aLastWrong = null;
    s6aLockOptions();
    s6aShowFeedback('wrong2', false);
    saveMoedBResult(1, false);
  } else {
    optEl.classList.add('wrong');
    optEl.classList.remove('selected');
    s6aShowFeedback('wrong1', false);
    /* Retry gate: s6aSyncBar שמיד אחרי משבית כל עוד הבחירה זהה לזו. */
    s6aLastWrong = s6aSelected;
  }
  s6aSyncBar();
  /* resume: סנכרוני. כאן, בניגוד לשאר הסינים, הזנב משותף לשלושת הענפים
     ולכן flush אחד מכסה כל מסלול. */
  try { flushResumeSave(); } catch (e) {}
}

function s6aOpenHint() {
  if (s6aDone) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל.
     הפונקציה פותחת בלבד (hidden=false) ולא toggle, ולכן אין דיווח כפול. */
  xapiRequestedHint('001', 'q1');
  document.getElementById('s2-hint-overlay').hidden = false;
}
function s6aCloseHint() { document.getElementById('s2-hint-overlay').hidden = true; }
document.getElementById('s2-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s6aCloseHint();
});

/* קובעת label/disabled/onclick/hidden על הבר התחתון של המסך לפי
   המצב הפנימי הנוכחי של סעיף א — נקראת גם בכניסה ראשונה למסך וגם
   בכל שינוי מצב (בחירה/בדיקה). */
function s6aSyncBar() {
  const checkBtn = document.getElementById('s2-check');
  const hintBtn = document.getElementById('s2-hint');
  if (s6aDone) {
    checkBtn.textContent = 'متابعة';
    checkBtn.disabled = false;
    checkBtn.onclick = function () { goTo(3); };
    hintBtn.hidden = true;
  } else {
    checkBtn.textContent = 'هل إجابتي صحيحة؟';
    /* Retry gate: השוואה חיה — גם בחירה, גם בדיקה, גם צייר ה-resume עוברים כאן. */
    checkBtn.disabled = !s6aSelected || s6aSelected === s6aLastWrong;
    checkBtn.onclick = s6aCheck;
    hintBtn.hidden = (s6aAttempts === 0);
    hintBtn.disabled = false;
    hintBtn.onclick = s6aOpenHint;
  }
}

function resetScreenState2() {
  /* resume-state guard. ⚠️ לא רק Done: לומד שניסה פעם אחת, טעה ועזב הוא
     במצב not-done-but-attempted, ואיפוס כאן היה מוחק את בחירתו לפני
     ש-repaintScreen מספיק לצייר אותה. אותה מוסכמה בדיוק כמו בשאר
     הסינים (סיין 4: `if (sNDone || sNAttempts > 0 || sNSelected) return`). */
  if (s6aDone || s6aAttempts > 0 || s6aSelected) { s6aSyncBar(); return; }
  s6aSelected = null;
  s6aAttempts = 0;
  s6aLastWrong = null; /* איפוס טרי בלבד */
  document.querySelectorAll('#s2 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s2-feedbox').classList.remove('visible');
  s6aSyncBar();
}

/* =========================================================
   מסך 4 — סעיף ב: חד-ברירה + טבלה ליד המסיחים. correctId='c'.
   בהצלחה/כשלון סופי: saveMoedBResult(2,...), ואז "המשך" מקדם
   ל-goTo(4) (סעיף ג).
   ========================================================= */

const S6B = {
  correctId: 'c',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'الإجابة صحيحة.', body: 'الأداة الملائمة والنتائج المتناسقة توفّر أدلة أقوى لاتخاذ القرار.' },
    wrong1: { title: 'الإجابة غير صحيحة.', body: 'لا بأس، نتعلّم من الأخطاء أيضًا.\nهل نحاول مرة أخرى؟' },
    wrong2: { title: 'الإجابة غير صحيحة. الإجابة الصحيحة مُشار إليها.', body: 'الأداة الملائمة والنتائج المتناسقة توفّر أدلة أقوى لاتخاذ القرار.' }
  }
};

let s6bSelected = null;
let s6bAttempts = 0;
let s6bDone = false;
/* Retry gate (720 spec; דיווח MOE 23.09.26) — ראו s6aLastWrong. */
let s6bLastWrong = null;

function s6bOptEl(id) { return document.querySelector('#s3 .scq-opt[data-id="' + id + '"]'); }

function s6bSelect(id) {
  if (s6bDone) return;
  const wasWrong = (s6bAttempts > 0 && !s6bDone);
  document.querySelectorAll('#s3 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const el = s6bOptEl(id);
  el.classList.add('selected');
  el.setAttribute('aria-checked', 'true');
  s6bSelected = id;
  if (wasWrong) document.getElementById('s3-feedbox').classList.remove('visible');
  s6bSyncBar();
}

function s6bShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s3-feedbox');
  const data = S6B.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s6bLockOptions() {
  document.querySelectorAll('#s3 .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}

function s6bCheck() {
  if (!s6bSelected || s6bDone) return;
  s6bAttempts++;
  const optEl = s6bOptEl(s6bSelected);
  xapiAnswered('001', 'q2', s6bSelected === S6B.correctId,
    s6bSelected === S6B.correctId || s6bAttempts >= S6B.maxAttempts, xapiAnswerText(optEl));

  if (s6bSelected === S6B.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s6bDone = true;
    s6bLastWrong = null;
    s6bLockOptions();
    s6bShowFeedback('correct', true);
    saveMoedBResult(2, true);
  } else if (s6bAttempts >= S6B.maxAttempts) {
    optEl.classList.add('wrong');
    optEl.classList.remove('selected');
    s6bOptEl(S6B.correctId).classList.add('correct');
    s6bDone = true;
    s6bLastWrong = null;
    s6bLockOptions();
    s6bShowFeedback('wrong2', false);
    saveMoedBResult(2, false);
  } else {
    optEl.classList.add('wrong');
    optEl.classList.remove('selected');
    s6bShowFeedback('wrong1', false);
    /* Retry gate: s6bSyncBar שמיד אחרי משבית כל עוד הבחירה זהה לזו. */
    s6bLastWrong = s6bSelected;
  }
  s6bSyncBar();
  /* resume: סנכרוני. כאן, בניגוד לשאר הסינים, הזנב משותף לשלושת הענפים
     ולכן flush אחד מכסה כל מסלול. */
  try { flushResumeSave(); } catch (e) {}
}

function s6bOpenHint() {
  if (s6bDone) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל.
     הפונקציה פותחת בלבד (hidden=false) ולא toggle, ולכן אין דיווח כפול. */
  xapiRequestedHint('001', 'q2');
  document.getElementById('s3-hint-overlay').hidden = false;
}
function s6bCloseHint() { document.getElementById('s3-hint-overlay').hidden = true; }
document.getElementById('s3-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s6bCloseHint();
});

function s6bSyncBar() {
  const checkBtn = document.getElementById('s3-check');
  const hintBtn = document.getElementById('s3-hint');
  if (s6bDone) {
    checkBtn.textContent = 'متابعة';
    checkBtn.disabled = false;
    checkBtn.onclick = function () { goTo(4); };
    hintBtn.hidden = true;
  } else {
    checkBtn.textContent = 'هل إجابتي صحيحة؟';
    /* Retry gate: השוואה חיה — גם בחירה, גם בדיקה, גם צייר ה-resume עוברים כאן. */
    checkBtn.disabled = !s6bSelected || s6bSelected === s6bLastWrong;
    checkBtn.onclick = s6bCheck;
    hintBtn.hidden = (s6bAttempts === 0);
    hintBtn.disabled = false;
    hintBtn.onclick = s6bOpenHint;
  }
}

function resetScreenState3() {
  /* resume-state guard. ⚠️ לא רק Done: לומד שניסה פעם אחת, טעה ועזב הוא
     במצב not-done-but-attempted, ואיפוס כאן היה מוחק את בחירתו לפני
     ש-repaintScreen מספיק לצייר אותה. אותה מוסכמה בדיוק כמו בשאר
     הסינים (סיין 4: `if (sNDone || sNAttempts > 0 || sNSelected) return`). */
  if (s6bDone || s6bAttempts > 0 || s6bSelected) { s6bSyncBar(); return; }
  s6bSelected = null;
  s6bAttempts = 0;
  s6bLastWrong = null; /* איפוס טרי בלבד */
  document.querySelectorAll('#s3 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s3-feedbox').classList.remove('visible');
  s6bSyncBar();
}

/* =========================================================
   מסך 5 — סעיף ג: שאלת גרירה (makeDragQuestion factory, זהה לזו
   שכבר קיימת בסינים 3+5). הסעיף האחרון של מועד ב'. עודכן
   (2026-09-17, בקשה מפורשת): פשוט סוף הלומדה — אין יותר מסך-סיכום
   או ניתוב אחריו.
   ========================================================= */

/* Gesture Hint — Cursor Drag (SELF-QA.md §7, Figma node 2915:35185). Ported from Sain 1
   (methodica-ar-science-mass-measure-03-01, which this family's SELF-QA.md governs) — missed here in
   the first pass. One hint for the *first* draggable element only. `slotEl` must already be
   `position:relative` (see .dq-source-slot). Uses `slotEl.dataset.gestureShown` (lives on the
   slot's own stable DOM node, survives the inner draggable card being recreated on every render()).
   Dismissal listens on the slot (not the card) because drag events bubble and the card gets
   replaced on re-render. */
function showDragGestureHint(slotEl) {
  /* Guards on "was this actually dismissed" (set inside dismiss() below), not "was this function
     ever called" — a redundant reset() call (e.g. a screen revisit) can re-render the word bank and
     wipe a hint that was never actually seen/dismissed. Checking for an existing .gesture-hint child
     (not just a one-shot flag) lets a redundant call safely re-add it instead of leaving the slot
     hint-less. */
  if (!slotEl || slotEl.dataset.gestureDismissed || slotEl.querySelector('.gesture-hint')) return;
  /* Found the actual text-bearing element BEFORE appending the hint below — slotEl might just be a
     text-holding element itself or a wrapper around one (.dq-source-slot > .dq-drag-card); descending
     into the single child that carries the same full text as its parent finds whichever one actually
     renders the label. Must run before slotEl.appendChild(hint), since that call gives slotEl (and
     every ancestor of the label down to it) a second child — the hint itself — which would immediately
     break the "exactly one child" check below and leave textHost stuck one level too high. */
  let textHost = slotEl;
  while (textHost.children.length === 1 && textHost.children[0].textContent === textHost.textContent) {
    textHost = textHost.children[0];
  }
  const hint = document.createElement('div');
  hint.className = 'gesture-hint';
  hint.innerHTML =
    '<div class="gesture-hint-ring gesture-hint-ring--drag-big"></div>' +
    '<div class="gesture-hint-ring gesture-hint-ring--drag-small"></div>' +
    '<img class="gesture-hint-hand" src="assets/images/gesture-hand-cursor.svg" alt="">';
  slotEl.appendChild(hint);
  /* Positioned past the target's own right edge instead of dead-center on it (2026-09-08, client
     feedback: the hand+rings were sitting directly on top of — and hiding — the dragged element's
     own label text).
     Measured from the actual rendered LABEL TEXT's own right edge (via Range, not slotEl's
     offsetWidth) — reported 2026-09-10 (ported fix from Sain 1, methodica-ar-science-mass-measure-03-01,
     which found the same bug on "התקן" here): offsetWidth-based math assumed the text sits centered
     with a wide, fairly constant margin inside the pill, which doesn't hold for every label/position —
     sizing off the container's width is only ever a proxy for "past the text", and a wrong one
     whenever the real margin is smaller than assumed. Reading the text's own painted extent removes
     the guesswork: the hand can only ever land past where the text actually ends.
     Gap is RING_HALF (21px, half of .gesture-hint-ring--drag-big's 42px width) MINUS 1px, measured
     from the anchor to the text edge — i.e. the ring's own near edge lands 1px before the text, just
     touching it without crossing in. A pass at binding this to the smaller HAND radius instead (+16
     total, on the reasoning "only the opaque hand can really hide a letter, the ring is a translucent
     decoration") was tried and reverted 2026-09-10: checked against the *unpaused, running* animation
     (not a frame frozen mid-cycle) — around 30-40% into its 2s loop the ring is both near full 42px
     scale AND still ~0.6-0.65 opacity (see the `gesture-ring-big` keyframes), which reads as a clearly
     visible pale-blue disc, not a faint outline — at +16 that disc sat squarely over "התקן"'s last
     glyph for a real, visible stretch of the loop, not just a 1px graze. RING_HALF-1 keeps that disc
     off the letters entirely while still landing the cluster closer to/on the card than the original
     RING_HALF+4 (+25) margin did — this project's min-width:90px/padding:0 12px pills (e.g. "התקן",
     ~22px of real margin past the text) only have so much room to spend between clearing the text and
     staying inside the card's own right edge.
     Falls back to the old container-edge math (still +8, safe there) if the range ever comes back empty
     (e.g. a ghost placeholder with no text).
     Deferred to rAF (2026-09-08, still covering text after the above fix): this function always runs
     from inside resetScreenState*(), which goTo() calls BEFORE target.classList.add('active') — so at
     this point the screen is still display:none and any width/rect read is 0. Reading it one frame
     later, after the screen is actually visible, gives real values.
     Divided by the #app scale factor (2026-09-10, reported "hand points at nothing" once tested at a
     real window size instead of exactly 1280×710): getBoundingClientRect()/Range.getBoundingClientRect()
     report SCREEN-space pixels — i.e. already multiplied by whatever scaleApp() set #app's CSS
     transform:scale(...) to for the current window — while hint.style.left is a LOCAL CSS value that
     gets scaled again by that same transform when painted. Subtracting two screen-space rects and
     feeding the raw result straight into a local `left` therefore only came out right by coincidence
     at scale 1 (a 1280×710 viewport, exactly what the dev harness happened to test at); at any other
     window size the on-screen gap this produces is off by the scale factor, landing the hint away from
     the card entirely. `appRect.width / 1280` recovers the current scale the same way it's already
     read elsewhere in this file (see onPointerDown in makeScaleSimulation); dividing the measured
     screen-space distance by it converts it back to the local units style.left expects. The +20 gap
     itself is already a local value (it's derived from the ring's own local 42px width) and must not
     be divided. */
  requestAnimationFrame(function () {
    const range = document.createRange();
    range.selectNodeContents(textHost);
    const textRect = range.getBoundingClientRect();
    const appRect = document.getElementById('app').getBoundingClientRect();
    const scale = appRect.width / 1280;
    if (textRect.width > 0) {
      hint.style.left = ((textRect.right - slotEl.getBoundingClientRect().left) / scale + 20) + 'px';
    } else {
      hint.style.left = 'calc(50% + ' + (slotEl.offsetWidth / 2 + 8) + 'px)';
    }
  });
  function dismiss() {
    slotEl.dataset.gestureDismissed = 'true';
    hint.remove();
    slotEl.removeEventListener('dragstart', dismiss);
    slotEl.removeEventListener('click', dismiss);
  }
  slotEl.addEventListener('dragstart', dismiss);
  slotEl.addEventListener('click', dismiss);
}

/* Drag image (MOE 05.10, 03-01: "בכל שאלות הגרירה בעת הגרירה עצמה התשובה נחתכת").
   The browser builds the native drag image from the element where it sits — inside #app, which is
   transform:scale()d to the window and overflow:hidden. Chrome sizes that image from the unscaled
   box and clips it, so the label shows cut off under the cursor. Fix: hand the browser a copy of
   the card, outside #app, at the size it is actually seen, with its computed look copied over
   (ancestor-scoped CSS would not apply to a copy in <body>). Removed right after the snapshot.
   Any failure leaves the browser's default image — never blocks the drag. */
function setScaledDragImage(e, el) {
  try {
    if (!el || !e.dataTransfer || typeof e.dataTransfer.setDragImage !== 'function') return;
    const r = el.getBoundingClientRect();
    if (!r.width || !el.offsetWidth) return;
    const cs = getComputedStyle(el);
    const clone = el.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('.gesture-hint').forEach(function (h) { h.remove(); });   // the first-drag hint hand is not part of the card
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i];
      clone.style.setProperty(p, cs.getPropertyValue(p));
    }
    clone.style.position = 'fixed';
    clone.style.left = '-10000px';
    clone.style.top = '0';
    clone.style.right = 'auto';
    clone.style.bottom = 'auto';
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.style.transition = 'none';
    clone.style.animation = 'none';
    clone.style.opacity = '1';
    clone.style.pointerEvents = 'none';
    clone.style.zoom = String(r.width / el.offsetWidth);   // the #app scale, laid out (not painted) at size
    document.body.appendChild(clone);
    e.dataTransfer.setDragImage(clone, e.clientX - r.left, e.clientY - r.top);
    setTimeout(function () { clone.remove(); }, 0);
  } catch (err) { /* default drag image */ }
}

function makeDragQuestion(cfg) {
  const labels = cfg.labels;
  const correctMap = cfg.correctMap;
  const maxAttempts = cfg.maxAttempts || 2;
  const dragIds = Object.keys(labels);
  const targetIds = Object.keys(correctMap);
  let placement = {};
  dragIds.forEach(function (id) { placement[id] = 'source'; });

  let dragActive = null;
  let dropHandled = false;
  let checked = false;
  let attempts = 0;
  let done = false;
  let answerSnapshot = null; // הפלייסמנט של הלומד ברגע הניסיון האחרון הכושל, לפני revealCorrect()
  let revealed = false;
  /* resume: ⚠️ נשמר במפורש ואינו נגזר בדיעבד מ-placement. revealCorrect()
     דורס את placement בפתרון הנכון, ומאותו רגע הלוח "נראה" נכון בלי קשר
     למה שהלומד באמת עשה. */
  let passed = false;
  /* Retry gate (720 spec; דיווח MOE 23.09.26): חתימת הלוח (יעד → תווית)
     שסומנה שגויה בניסיון שאינו אחרון. כל עוד הלוח הנוכחי זהה לה —
     "צדקתי?" מושבת. */
  let lastWrong = null;

  function allFilled() {
    return targetIds.every(function (tId) {
      return dragIds.some(function (dId) { return placement[dId] === tId; });
    });
  }

  /* חתימה לפי **תווית** ולא לפי מזהה קלף — אותה מחרוזת בדיוק ש-check()
     מדווח ל-xAPI. check() מתייחס לקלפים בעלי אותה תווית כשקולים, ולכן
     החלפת שני קלפים זהים אינה "תשובה אחרת". */
  function answerSig() {
    return targetIds.map(function (tId) {
      let placed = null;
      dragIds.forEach(function (dId) { if (placement[dId] === tId) placed = dId; });
      return tId.replace(/^.*-target-/, '') + '=' + (placed ? labels[placed] : '—');
    }).join(' | ');
  }

  /* Retry gate: הפרדיקט היחיד ל-disabled של "צדקתי?" — render ו-restoreUI. */
  function checkBlocked() {
    return !allFilled() || answerSig() === lastWrong;
  }

  function render() {
    dragIds.forEach(function (dragId) {
      const slot = document.getElementById('slot-' + dragId);
      if (!slot) return;
      slot.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'dq-drag-card';
      card.id = dragId;
      if (placement[dragId] === 'source') {
        card.textContent = labels[dragId];
        if (!checked) {
          card.draggable = true;
          card.ondragstart = function (e) { dragStart(e, dragId); };
          card.ondragend = dragEnd;
        } else {
          card.classList.add('locked');
        }
      } else {
        card.classList.add('ghost');
        card.textContent = labels[dragId];
      }
      slot.appendChild(card);
    });

    targetIds.forEach(function (targetId) {
      const zone = document.getElementById(targetId);
      if (!zone) return;
      let placedId = null;
      dragIds.forEach(function (dId) { if (placement[dId] === targetId) placedId = dId; });
      zone.innerHTML = '';
      if (placedId) {
        zone.classList.add('occupied');
        const placed = document.createElement('div');
        placed.className = 'dq-placed-card';
        placed.textContent = labels[placedId];
        if (!checked) {
          placed.draggable = true;
          placed.addEventListener('dragstart', function (e) { placedDragStart(e, placedId); });
          placed.addEventListener('dragend', dragEnd);
        } else {
          placed.classList.add('locked');
        }
        zone.appendChild(placed);
      } else {
        zone.classList.remove('occupied');
      }
    });

    const btn = document.getElementById(cfg.checkBtnId);
    if (btn && !done) btn.disabled = checkBlocked();
  }

  function dragStart(e, dragId) {
    if (checked) { e.preventDefault(); return; }
    dragActive = dragId;
    dropHandled = false;
    e.dataTransfer.setData('text/plain', dragId);
    e.dataTransfer.effectAllowed = 'move';
    setScaledDragImage(e, e.currentTarget || e.target);
    setTimeout(function () {
      const card = document.getElementById(dragId);
      if (card) card.classList.add('dragging');
    }, 0);
  }

  function placedDragStart(e, dragId) {
    if (checked) { e.preventDefault(); return; }
    dragActive = dragId;
    dropHandled = false;
    e.dataTransfer.setData('text/plain', dragId);
    e.dataTransfer.effectAllowed = 'move';
    setScaledDragImage(e, e.currentTarget || e.target);
    setTimeout(function () {
      const oldZoneId = placement[dragId];
      placement[dragId] = 'source';
      const oldZone = document.getElementById(oldZoneId);
      if (oldZone) oldZone.classList.remove('correct', 'wrong');
      render();
      const card = document.getElementById(dragId);
      if (card) card.classList.add('dragging');
    }, 0);
  }

  function dragEnd() {
    if (!dropHandled && dragActive) {
      placement[dragActive] = 'source';
      render();
    }
    dragActive = null;
    dropHandled = false;
    document.querySelectorAll(cfg.screenSelector + ' .drag-over').forEach(function (z) {
      z.classList.remove('drag-over');
    });
  }

  function dragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  function dragEnter(e, targetId) {
    e.preventDefault();
    const zone = document.getElementById(targetId);
    if (zone) zone.classList.add('drag-over');
  }
  function dragLeave(e, targetId) {
    const zone = document.getElementById(targetId);
    if (zone) zone.classList.remove('drag-over');
  }

  function drop(e, targetId) {
    e.preventDefault();
    const zone = document.getElementById(targetId);
    if (zone) zone.classList.remove('drag-over', 'correct', 'wrong');
    if (!dragActive) return;
    dropHandled = true;
    dragIds.forEach(function (dId) {
      if (placement[dId] === targetId && dId !== dragActive) placement[dId] = 'source';
    });
    placement[dragActive] = targetId;
    dragActive = null;
    render();
  }

  function dropToBank(e) {
    e.preventDefault();
    if (!dragActive) return;
    dropHandled = true;
    placement[dragActive] = 'source';
    dragActive = null;
    render();
  }

  function showFeedback(kind) {
    const box = document.getElementById(cfg.feedboxId);
    box.querySelector('.scq-fb-title-text').textContent = cfg.texts[kind].title;
    box.querySelector('.scq-fb-body').textContent = cfg.texts[kind].body;
    box.classList.remove('is-correct', 'is-wrong', 'collapsed');
    box.classList.add(kind === 'correct' ? 'is-correct' : 'is-wrong');
    scqFbResetPosition(cfg.feedboxId);
    box.classList.add('visible');
  }
  function hideFeedback() { document.getElementById(cfg.feedboxId).classList.remove('visible'); }

  function revealCorrect() {
    dragIds.forEach(function (dId) { placement[dId] = 'source'; });
    targetIds.forEach(function (tId) {
      const dId = correctMap[tId];
      placement[dId] = tId;
      const zone = document.getElementById(tId);
      if (zone) { zone.classList.remove('wrong'); zone.classList.add('correct'); }
    });
    checked = true;
    render();
  }

  /* ⚠️ setUnitResult קודם — זהה לפקטורי של סיין 5. סעיף ג כותב כאן
     את lomda_moedB_part3_result, ו-getMoedBScore גוזר ממנו את תוצאת
     הרכיב. כתיבה ל-localStorage בלבד הייתה אובדת במעבר מכשיר. (D-12.) */
  function saveResult(passed) {
    if (!cfg.resultKey) return;
    if (typeof setUnitResult === 'function') { setUnitResult(cfg.resultKey, passed ? 'pass' : 'fail'); return; }
    try { localStorage.setItem(cfg.resultKey, passed ? 'pass' : 'fail'); } catch (e) {}
  }

  function toggleReveal() {
    const revealBtn = cfg.revealBtnId ? document.getElementById(cfg.revealBtnId) : null;
    if (!revealed) {
      revealCorrect();
      showFeedback('wrongFinal');
      revealed = true;
      if (revealBtn) revealBtn.textContent = 'إجابتي';
    } else {
      dragIds.forEach(function (dId) { placement[dId] = answerSnapshot[dId]; });
      targetIds.forEach(function (tId) {
        const valid = correctMap[tId];
        let placed = null;
        dragIds.forEach(function (dId) { if (placement[dId] === tId) placed = dId; });
        const ok = (placed === valid) || (placed && labels[placed] === labels[valid]);
        const zone = document.getElementById(tId);
        if (zone) { zone.classList.remove('correct', 'wrong'); zone.classList.add(ok ? 'correct' : 'wrong'); }
      });
      render();
      showFeedback('pending');
      revealed = false;
      if (revealBtn) revealBtn.textContent = 'الإجابة الصحيحة';
    }
  }

  function check() {
    if (done) return;
    checked = true;
    attempts++;

    let allCorrect = true;
    targetIds.forEach(function (tId) {
      const valid = correctMap[tId];
      let placed = null;
      dragIds.forEach(function (dId) { if (placement[dId] === tId) placed = dId; });
      const ok = (placed === valid) || (placed && labels[placed] === labels[valid]);
      if (!ok) allCorrect = false;
      const zone = document.getElementById(tId);
      if (zone) { zone.classList.remove('correct', 'wrong'); zone.classList.add(ok ? 'correct' : 'wrong'); }
    });

    render();

    /* xAPI: **אחרי** לולאת האזורים, כי allCorrect סופי רק בסופה, ולפני
       ההסתעפות כדי שירוץ פעם אחת בכל מסלול.
       ⚠️ xapiZoneAnswer לא מתאים כאן: העוזר בונה מזהי אזור בתבנית
       <prefix>-zone-<id>, בעוד היעדים של הפקטורי הזה הם s6c-target-N.
       לכן בונים את מחרוזת התשובה מקומית מתוך placement. */
    if (cfg.xapiItem) {
      const _ans = answerSig();
      (cfg.xapiQuestions || ['q1']).forEach(function (q) {
        xapiAnswered(cfg.xapiItem, q, allCorrect, allCorrect || attempts >= maxAttempts, _ans);
      });
    }

    const btn = document.getElementById(cfg.checkBtnId);
    if (allCorrect) {
      done = true;
      passed = true;
      lastWrong = null;
      saveResult(true);
      showFeedback('correct');
      if (btn) { if (cfg.onContinue) { btn.textContent = (cfg.continueLabel || 'متابعة'); btn.disabled = false; btn.onclick = cfg.onContinue; } else { btn.hidden = true; } }
    } else if (attempts >= maxAttempts) {
      done = true;
      passed = false;
      lastWrong = null;
      saveResult(false);
      if (cfg.revealBtnId) {
        answerSnapshot = Object.assign({}, placement); // לפני כל reveal
        revealed = false;
        showFeedback('pending');
        const revealBtn = document.getElementById(cfg.revealBtnId);
        if (revealBtn) { revealBtn.hidden = false; revealBtn.textContent = 'الإجابة الصحيحة'; }
      } else {
        revealCorrect();
        showFeedback('wrongFinal');
      }
      if (btn) { if (cfg.onContinue) { btn.textContent = (cfg.continueLabel || 'متابعة'); btn.disabled = false; btn.onclick = cfg.onContinue; } else { btn.hidden = true; } }
    } else {
      lastWrong = answerSig(); /* Retry gate — לפני render(), כדי שהשער יחול מיד */
      showFeedback('wrong1');
      checked = false;
      render();
      const hintBtn = cfg.hintBtnId ? document.getElementById(cfg.hintBtnId) : null;
      if (hintBtn) hintBtn.hidden = false;
      if (btn) { btn.textContent = 'هل إجابتي صحيحة؟'; btn.disabled = true; btn.onclick = check; }
    }

    /* ⚠️ אחרי כל שרשרת ההסתעפות, לא לפניה. done/passed ו-saveResult נקבעים
       בתוך הענפים; flush שרץ לפניהם שמר את השאלה כ"לא נענתה",
       ובטעינה הבאה הכפתור חזר ל"צדקתי?" והלומד דיווח answered.last
       שני על אותה שאלה. (D-13, קמפיין 2026-09-21.) */
    try { flushResumeSave(); } catch (e) {}
  }

  function openHint() {
    if (!cfg.hintBtnId) return;
    const hintBtn = document.getElementById(cfg.hintBtnId);
    if (hintBtn) hintBtn.disabled = true;
    /* xAPI: אחרי הגארד ומיד לפני שהרמז נחשף בפועל. */
    if (cfg.xapiItem) xapiRequestedHint(cfg.xapiItem, (cfg.xapiQuestions || ['q1'])[0]);
    document.getElementById(cfg.hintOverlayId).hidden = false;
  }
  function closeHint() {
    if (!cfg.hintOverlayId) return;
    document.getElementById(cfg.hintOverlayId).hidden = true;
    const hintBtn = cfg.hintBtnId ? document.getElementById(cfg.hintBtnId) : null;
    if (hintBtn) hintBtn.disabled = false;
  }

  function resetInitial() {
    done = false; checked = false; attempts = 0; dragActive = null; dropHandled = false;
    answerSnapshot = null; revealed = false; passed = false;
    lastWrong = null; /* איפוס טרי בלבד — reset() קורא לכאן רק כשאין התקדמות */
    dragIds.forEach(function (dId) { placement[dId] = 'source'; });
    targetIds.forEach(function (tId) {
      const zone = document.getElementById(tId);
      if (zone) zone.classList.remove('correct', 'wrong', 'occupied', 'drag-over');
    });
    hideFeedback();
    if (cfg.hintBtnId) {
      const hintBtn = document.getElementById(cfg.hintBtnId);
      if (hintBtn) { hintBtn.hidden = true; hintBtn.disabled = false; hintBtn.onclick = openHint; }
    }
    if (cfg.hintOverlayId) document.getElementById(cfg.hintOverlayId).hidden = true;
    if (cfg.revealBtnId) {
      const revealBtn = document.getElementById(cfg.revealBtnId);
      if (revealBtn) { revealBtn.hidden = true; revealBtn.textContent = 'الإجابة الصحيحة'; }
    }
    const btn = document.getElementById(cfg.checkBtnId);
    if (btn) { btn.hidden = false; btn.textContent = 'هل إجابتي صحيحة؟'; btn.disabled = true; btn.onclick = check; }
    render();
  }

  function restoreFinal() {
    const btn = document.getElementById(cfg.checkBtnId);
    if (btn) {
      if (cfg.onContinue) { btn.hidden = false; btn.textContent = (cfg.continueLabel || 'متابعة'); btn.disabled = false; btn.onclick = cfg.onContinue; }
      else { btn.hidden = true; }
    }
    if (cfg.hintBtnId) {
      const hintBtn = document.getElementById(cfg.hintBtnId);
      if (hintBtn) hintBtn.hidden = true;
    }
    if (cfg.revealBtnId && answerSnapshot) {
      const revealBtn = document.getElementById(cfg.revealBtnId);
      if (revealBtn) { revealBtn.hidden = false; revealBtn.textContent = revealed ? 'إجابتي' : 'الإجابة الصحيحة'; }
    }
    render();
  }

  function reset() {
    const hasProgress = attempts > 0 || Object.values(placement).some(function (v) { return v !== 'source'; });
    if (done) restoreFinal();
    else if (!hasProgress) resetInitial();
    else { const btn = document.getElementById(cfg.checkBtnId); if (btn) btn.hidden = false; render(); }
    /* הרמז צריך לנחות על הקלף הראשון לפי סדר ה-DOM/חזותי במאגר המילים
       (dragIds[0] הוא רק המפתח הראשון ב-labels, שמשקף את סדר התשובות
       ב-correctMap ולא בהכרח את סדר ה-slots בפועל) — נאתר את מאגר
       המילים דרך ה-slot הראשון (כל slot חי תחתיו) ונבחר משם את ה-slot
       הראשון בפועל. */
    const anySlot = document.getElementById('slot-' + dragIds[0]);
    const wordBankEl = anySlot && anySlot.parentElement;
    const firstSlot = (wordBankEl && wordBankEl.querySelector('.dq-source-slot')) || anySlot;
    showDragGestureHint(firstSlot);
  }

  window[cfg.prefix + 'DragOver'] = dragOver;
  window[cfg.prefix + 'DragEnter'] = dragEnter;
  window[cfg.prefix + 'DragLeave'] = dragLeave;
  window[cfg.prefix + 'Drop'] = drop;
  window[cfg.prefix + 'DropToBank'] = dropToBank;
  window[cfg.prefix + 'Check'] = check;
  window[cfg.prefix + 'OpenHint'] = openHint;
  window[cfg.prefix + 'CloseHint'] = closeHint;
  window[cfg.prefix + 'ToggleReveal'] = toggleReveal;

  /* ── resume: המצב של הפקטורי חי ב-closure, ולכן נדרש שער מפורש ──
     הוחזר קודם { reset } בלבד; ארבעת ה-hooks של הסין אינם יכולים להגיע
     לכאן בשום דרך אחרת. */
  function getState() {
    return {
      placement: Object.assign({}, placement),
      attempts: attempts,
      done: done,
      checked: checked,
      passed: passed,
      revealed: revealed,
      /* התשובה של הלומד עצמו, כפי שהייתה לפני כל reveal. בלעדיה שחזור היה
         מקבע את הפתרון הנכון על המסך כאילו הוא זה שהגיש אותו. */
      answerSnapshot: answerSnapshot ? Object.assign({}, answerSnapshot) : null,
      /* Retry gate — בלעדיו חידוש היה פותח מחדש את הלוח שכבר סומן שגוי. */
      lw: lastWrong
    };
  }

  function setState(s) {
    if (!s) return;
    if (s.placement) dragIds.forEach(function (id) { placement[id] = s.placement[id] || 'source'; });
    attempts = s.attempts || 0;
    done = !!s.done;
    checked = !!s.checked;
    passed = !!s.passed;
    revealed = !!s.revealed;
    answerSnapshot = s.answerSnapshot ? Object.assign({}, s.answerSnapshot) : null;
    /* מסמך ישן בלי lw (נשמר לפני תיקון ה-retry gate): גוזרים מהתשובה השמורה, כדי
       שהכפתור לא ייפתח על אותה תשובה שגויה. */
    lastWrong = s.lw || ((attempts > 0 && !done) ? answerSig() : null);
    /* גרירה חיה — scratch, לעולם לא משוחזר: ערך ישן היה גורם ל-drop לפעול
       על קלף רפאים. */
    dragActive = null;
    dropHandled = false;
  }

  /* מחקה את כתיבות ה-DOM של check() בלבד: בלי שינוי מצב, בלי דיווח. */
  function restoreUI() {
    /* ⚠️ מסך נקי → render() בלבד, לעולם לא resetInitial(): הוא היה מאפס את
       placement ל-'source' ומוחק גרירות שטרם הוגשו — בכל ניווט, לא רק
       בשחזור. */
    if (!done && attempts === 0) { hideFeedback(); render(); return; }

    /* סימוני האזורים — אותה לולאה בדיוק כמו ב-check(). */
    /* אחרי ניסיון שגוי שאינו אחרון, מסמנים רק אזור שעדיין מחזיק את מה שהוגש בו
       (לפי lastWrong) — כמו בזמן אמת, שבו drop מנקה את סימון האזור שנגעו בו.
       קודם כל אזור סומן לפי ההצבה הנוכחית, כך שיציאה וחזרה למסך "בדקה" לוח שלא
       הוגש ודלפה את התשובה בלי לבזבז ניסיון (בדיקת QA, 23.09.26). */
    const submitted = {};
    if (!done && lastWrong) lastWrong.split(' | ').forEach(function (part) {
      const i = part.indexOf('=');
      if (i > 0) submitted[part.slice(0, i)] = part.slice(i + 1);
    });
    targetIds.forEach(function (tId) {
      const valid = correctMap[tId];
      let placed = null;
      dragIds.forEach(function (dId) { if (placement[dId] === tId) placed = dId; });
      const ok = (placed === valid) || (placed && labels[placed] === labels[valid]);
      const zone = document.getElementById(tId);
      if (!zone) return;
      zone.classList.remove('correct', 'wrong');
      if (!done && lastWrong && submitted[tId.replace(/^.*-target-/, '')] !== (placed ? labels[placed] : '—')) return;
      zone.classList.add(ok ? 'correct' : 'wrong');
    });

    if (done) {
      /* שלושת הערכים יחד: מה שמוצג עכשיו (placement), התשובה של הלומד
         (answerSnapshot) ומי מהם על המסך (revealed). */
      if (passed) showFeedback('correct');
      else if (revealed) showFeedback('wrongFinal');
      else showFeedback(cfg.revealBtnId ? 'pending' : 'wrongFinal');
      restoreFinal();
      return;
    }

    /* ניסיון שגוי שאינו אחרון. */
    showFeedback('wrong1');
    render();
    if (cfg.hintBtnId) {
      const hintBtn = document.getElementById(cfg.hintBtnId);
      if (hintBtn) hintBtn.hidden = false;
    }
    /* Retry gate (720 spec; דיווח MOE 23.09.26): לא disabled=true קבוע —
       לומד ששינה את הלוח אחרי הטעות ועזב חוזר לכפתור פעיל; לוח זהה לשגוי
       נשאר מושבת. */
    const btn = document.getElementById(cfg.checkBtnId);
    if (btn) { btn.hidden = false; btn.textContent = 'هل إجابتي صحيحة؟'; btn.disabled = checkBlocked(); btn.onclick = check; }
  }

  return { reset: reset, getState: getState, setState: setState, restoreUI: restoreUI };
}

const TEXTS_S6C_DQ = {
  correct: {
    title: 'الإجابة صحيحة. كل الاحترام!',
    body: 'التكرارات وحساب المعدل يساعدان على تقليل تأثير عدم اليقين والوصول إلى قرار أكثر موثوقية.'
  },
  wrong1: {
    title: 'الإجابة ليست صحيحة بالكامل.',
    body: 'هل نحاول مرة أخرى؟'
  },
  wrongFinal: {
    title: 'الإجابة غير صحيحة. الإجابة الصحيحة مُشار إليها.',
    body: 'التكرارات وحساب المعدل يساعدان على تقليل تأثير عدم اليقين والوصول إلى قرار أكثر موثوقية.'
  },
  pending: {
    title: 'الإجابة غير صحيحة.',
    body: 'ترغبون بعرض الحل الصحيح؟'
  }
};

const dqSectionC = makeDragQuestion({
  prefix: 's6c',
  screenSelector: '#s4',
  checkBtnId: 's4-check',
  hintBtnId: 's4-hint',
  hintOverlayId: 's4-hint-overlay',
  feedboxId: 's4-feedbox',
  revealBtnId: 's4-reveal-btn',
  resultKey: 'lomda_moedB_part3_result',
  /* xAPI: סעיף ג הוא השאלה השלישית של פריט 001. */
  xapiItem: '001',
  xapiQuestions: ['q3'],
  /* סוף הרכיב. עד 2026-09-17 לא היה כאן onContinue כלל, ולכן הפקטורי הסתיר
     את כפתור הבדיקה והמסך הזה נגמר "בלי לחיצה אחרונה". זה לא מספיק מרגע
     שמדווחים completed: Kata מסירה את הרכיב מהמסך ברגע שהדיווח מגיע
     (הנחיות 2.7 עמ' 23), ודיווח בתוך check() היה חוטף מהלומד את המשוב ואת
     כפתור "התשובה הנכונה" באותו רגע. לכן נוסף כפתור סיום מפורש. */
  continueLabel: 'انتهيت',
  onContinue: function () { s6cFinish(); },
  labels: {
    's6c-drag-medayekim': 'المدقّقون',
    's6c-drag-teken': 'المعيار',
    's6c-drag-hazarot': 'التكرارات',
    's6c-drag-memutza': 'المعدل',
    's6c-drag-vadaut': 'عدم اليقين',
    's6c-drag-diyuk': 'الدقة'
  },
  correctMap: {
    's6c-target-1': 's6c-drag-medayekim',
    's6c-target-2': 's6c-drag-teken',
    's6c-target-3': 's6c-drag-hazarot',
    's6c-target-4': 's6c-drag-memutza',
    's6c-target-5': 's6c-drag-vadaut',
    's6c-target-6': 's6c-drag-diyuk'
  },
  texts: TEXTS_S6C_DQ
});

function resetScreenState4() {
  dqSectionC.reset();
}

/* ---------- Dev postMessage bridge (index_dev.html free nav) ---------- */
window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'DEV_GOTO') goTo(e.data.screen);
});
window.addEventListener('load', function () {
  if (window.parent === window) return; // not embedded in index_dev.html
  const screenCount = document.querySelectorAll('.screen').length;
  window.parent.postMessage({ type: 'DEV_READY', total: screenCount }, '*');
});

document.addEventListener('keydown', function (e) {
  if (e.ctrlKey && e.key === 'ArrowLeft') goTo(currentScreen + 1);
  if (e.ctrlKey && e.key === 'ArrowRight') goTo(currentScreen - 1);
});

/* =========================================================
   פופ-אפ משוב גריר
   ========================================================= */

function scqFbResetPosition(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.style.left = '';
  box.style.top = '';
  box.style.bottom = '';
}

function scqFbMakeDraggable(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;

  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  box.addEventListener('mousedown', function (e) {
    if (e.target.closest('.scq-fb-reveal-btn')) return;
    const parent = box.offsetParent || box.parentElement;
    const boxRect = box.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    startLeft = boxRect.left - parentRect.left;
    startTop = boxRect.top - parentRect.top;
    box.style.left = startLeft + 'px';
    box.style.top = startTop + 'px';
    box.style.bottom = 'auto';
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;
    box.classList.add('is-dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    const parent = box.offsetParent || box.parentElement;
    const parentRect = parent.getBoundingClientRect();
    const maxLeft = Math.max(0, parentRect.width - box.offsetWidth);
    const maxTop = Math.max(0, parentRect.height - box.offsetHeight);
    let left = startLeft + (e.clientX - startX);
    let top = startTop + (e.clientY - startY);
    left = Math.min(Math.max(0, left), maxLeft);
    top = Math.min(Math.max(0, top), maxTop);
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  });

  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    box.classList.remove('is-dragging');
  });
}

/* =========================================================
   הגדלת תמונה (img-zoom)
   ========================================================= */

function imgZoomOpen(trigger) {
  const modal = document.getElementById('img-zoom-modal');
  const stage = modal && modal.querySelector('.img-zoom-modal__stage');
  const frame = trigger.parentElement;
  if (!modal || !stage || !frame) return;
  const clone = frame.cloneNode(true);
  const btnInClone = clone.querySelector('.img-zoom-btn');
  if (btnInClone) btnInClone.remove();
  stage.innerHTML = '';
  stage.appendChild(clone);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function imgZoomClose() {
  const modal = document.getElementById('img-zoom-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  const stage = modal.querySelector('.img-zoom-modal__stage');
  if (stage) stage.innerHTML = '';
}

document.addEventListener('click', function (e) {
  const trigger = e.target.closest('[data-zoom-src]');
  if (trigger) { imgZoomOpen(trigger); return; }
  const closeTarget = e.target.closest('[data-zoom-close="true"]');
  if (!closeTarget) return;
  if (closeTarget.id === 'img-zoom-modal' && e.target.closest('.img-zoom-modal__panel')) return;
  imgZoomClose();
});

document.addEventListener('keydown', function (e) {
  const modal = document.getElementById('img-zoom-modal');
  if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) imgZoomClose();
});

/* ═══════════════════ resume — ארבעת ה-hooks של הסין ═══════════════════ */

function capturePartPayload() {
  var st = { currentScreen: currentScreen };
  st.qResults = Object.assign({}, XAPI_Q_RESULTS);
  /* ⚠️ אין בסין הזה משתנה phase. sNCheck מסמן done בשני הענפים המסיימים
     ומבדיל ביניהם רק לפי האפשרות שנבחרה — ולכן הצייר גוזר נכונות מתוך
     **הבחירה השמורה**, ולעולם לא ממספר הניסיונות. */
  /* lw = Retry gate (התשובה שסומנה שגויה) — בלעדיו חידוש היה פותח אותה מחדש. */
  st.s6a = { sel: s6aSelected, att: s6aAttempts, done: s6aDone, lw: s6aLastWrong };
  st.s6b = { sel: s6bSelected, att: s6bAttempts, done: s6bDone, lw: s6bLastWrong };
  st.dqC = dqSectionC.getState();
  return st;
}

function applyResumeVars(st) {
  if (!st) return;
  if (st.qResults) Object.keys(st.qResults).forEach(function (k) { XAPI_Q_RESULTS[k] = st.qResults[k]; });
  if (st.s6a) { s6aSelected = st.s6a.sel || null; s6aAttempts = st.s6a.att || 0; s6aDone = !!st.s6a.done; s6aLastWrong = st.s6a.lw || null; }
  if (st.s6b) { s6bSelected = st.s6b.sel || null; s6bAttempts = st.s6b.att || 0; s6bDone = !!st.s6b.done; s6bLastWrong = st.s6b.lw || null; }
  if (st.dqC) dqSectionC.setState(st.dqC);
}

/* ריק, וזה נכון: אין בסין הזה ערך שחי רק ב-DOM. */
function applyResumeDom(st) {}

function restoreScreenUI(n) {
  try {
    if (n === 2) restoreNoPhaseScqUI({
      screenSel: '#s2', correctId: S6A.correctId, selected: s6aSelected,
      attempts: s6aAttempts, done: s6aDone, optEl: s6aOptEl,
      lock: s6aLockOptions, showFeedback: s6aShowFeedback, sync: s6aSyncBar,
      lastWrong: s6aLastWrong
    });
    if (n === 3) restoreNoPhaseScqUI({
      screenSel: '#s3', correctId: S6B.correctId, selected: s6bSelected,
      attempts: s6bAttempts, done: s6bDone, optEl: s6bOptEl,
      lock: s6bLockOptions, showFeedback: s6bShowFeedback, sync: s6bSyncBar,
      lastWrong: s6bLastWrong
    });
    if (n === 4) dqSectionC.restoreUI();
  } catch (e) { console.error('[resume] restoreScreenUI', e); }
}

/* חד-ברירה בלי משתנה phase, מונע-syncBar. צייר אחד לשני הסעיפים.
   ⚠️ ה-selector מגיע ב-cfg ואינו נגזר מהתחילית: מספרי המסכים ואותיות
   הסעיפים מוסטים באחד כאן (סעיף א יושב ב-#s2, סעיף ב ב-#s3). */
function restoreNoPhaseScqUI(o) {
  if (!o.done && o.attempts === 0 && !o.selected) return;

  if (o.done) {
    var isRight = (o.selected === o.correctId);
    var selEl = o.optEl(o.selected);
    if (isRight) {
      if (selEl) { selEl.classList.add('correct'); selEl.classList.remove('selected'); }
      o.showFeedback('correct', true);
    } else {
      if (selEl) { selEl.classList.add('wrong'); selEl.classList.remove('selected'); }
      var corrEl = o.optEl(o.correctId);
      if (corrEl) corrEl.classList.add('correct');
      o.showFeedback('wrong2', false);
    }
    o.lock();
  } else if (o.attempts > 0 && (o.lastWrong == null || o.selected === o.lastWrong)) {
    /* רק כשהבחירה היא עדיין זו שסומנה שגויה. לומד שבחר אחרת ויצא חוזר לבחירה
       רגילה, בלי X ובלי משוב — בדיוק מה שראה (sNSelect מנקה אותם). קודם הבחירה
       החדשה, גם הנכונה, צוירה כשגויה (בדיקת QA, 23.09.26). lastWrong חסר =
       מסמך ישן, ואז אין ממה לדעת — ההתנהגות הקודמת. */
    var wEl = o.optEl(o.selected);
    if (wEl) { wEl.classList.add('wrong'); wEl.classList.remove('selected'); }
    o.showFeedback('wrong1', false);
  } else if (o.selected) {
    /* גם ענף "ניסיון שגוי + בחירה אחרת": הרמז נשאר גלוי דרך o.sync(). */
    var sEl = o.optEl(o.selected);
    if (sEl) { sEl.classList.add('selected'); sEl.setAttribute('aria-checked', 'true'); }
  }

  /* תמיד לסיים כאן: sNSyncBar הוא בדיוק ה"חישוב מחדש מאותו פרדיקט" —
     הוא קובע את תווית הכפתור, את disabled ואת נראות הרמז. */
  o.sync();
}

/* קריאה תואמה ל-saveMoedBResult: מסמך קודם, קאש מקומי כ-fallback. */
function readMoedBResult(part) {
  var key = 'lomda_moedB_part' + part + '_result';
  if (typeof getUnitResult === 'function') return getUnitResult(key);
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

/* כמה משלושת הסעיפים של מועד ב נפתרו נכון.
   ⚠️ דרך readMoedBResult — זה מה שקובע את success ואת score.scaled של
   הרכיב ב-s6cFinish, ולכן הוא חייב לקרוא מהמסמך ולא מ-localStorage.
   (D-12, קמפיין 2026-09-21.) */
function getMoedBScore() {
  return [1, 2, 3].filter(function (p) { return readMoedBResult(p) === 'pass'; }).length;
}

/* סוף הרכיב — הלחיצה האחרונה של הלומד, בכפתור "סיימתי" של סעיף ג, אחרי
   שהמשוב והפתרון כבר הוצגו. מדווח בשני המסלולים (הצלחה וכישלון).
   ⚠️ הרכיב אינו מנווט: Kata מסירה אותו מהמסך ברגע שה-completed מגיע.
   מסך 0 מבטיח "3 סעיפים, עליכם להצליח בכולם", ולכן success הוא 3 מתוך 3. */
/* The component result (screen 0 promises "3 sections, pass all of them": success is 3 of 3).
   Also the result of item 001, which is the whole component (QA 2026-10-02 O-8). */
function moedBComponentResult() {
  const _n = getMoedBScore();
  return { success: _n === 3, score: { scaled: _n / 3 } };
}
function s6cFinish() {
  xapiEndComponent(moedBComponentResult(), document.getElementById('s4-check'));
}

/* ═══════════════════ xAPI (720) — קונפיגורציה של הסין ═══════════════════
   נתונים בלבד. השכבה המשותפת ב-../unit-js/ קוראת אותם בזמן call. */

/* ⚠️ חייב להחזיק בדיוק TOTAL_SCREENS מפתחות (5), 0..4, בלי חורים.
   כל הרכיב הוא פריט קטלוגי אחד (001) שנושא שלוש שאלות — סעיפים א/ב/ג —
   ולכן מסכים 1..4 חולקים סיומת אחת ולא נשלח ביניהם שום statement. */
var SCREEN_TO_SUBCONTENT = {
  0: null,          /* מעבר: הקדמה למשימת השיא (מועד ב) */
  1: ['001', 1],    /* "מי יזכה במכרז המלכותי?" — הקדמה נרטיבית לשאלת השיא */
  2: ['001', 2],    /* סעיף א — q1 */
  3: ['001', 3],    /* סעיף ב — q2 */
  4: ['001', 4]     /* סעיף ג — q3 (גרירה), ובסופו כפתור "סיימתי" */
};

var XAPI_COMP_SLUG = 'methodica-ar-science-mass-measure-03-06';
var XAPI_COMP_ID   = XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/';

var XAPI_EVAL_ITEMS = { '001': 1 };

/* QA 2026-10-02 O-8: item 001 is the whole component, so its 'completed' carries the component's
   own result (decided 2026-10-04), rebuilt from restored state after a reload. */
var XAPI_ITEM_RESULT = { '001': function () { return moedBComponentResult(); } };

var XAPI_METADATA_FILE = '../metadata/methodica-ar-science-mass-measure-03-06.json';

/* אתחול */
scaleApp();
scqFbMakeDraggable('s2-feedbox');
scqFbMakeDraggable('s3-feedbox');
scqFbMakeDraggable('s4-feedbox');
document.querySelectorAll('#s2 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s6aSelect(opt.dataset.id); }
  });
});
document.querySelectorAll('#s3 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s6bSelect(opt.dataset.id); }
  });
});
resetScreenState(0);
