'use strict';

/* =========================================================
   מנוע גלובלי — canvas scaling, ניווט מסכים, סטייט גלובלי
   ========================================================= */

const TOTAL_SCREENS = 4;
let currentScreen = 0;

/* הדמות שנבחרה בסיין 1 נשמרה ב-localStorage תחת אותו מפתח בדיוק
   ('methodica_ar_science_mass_measure_03_selectedCharacter') — כאן היא נקראת מחדש (גשר בין סינים). */
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

/* Fake scrollbar (2026-09-09) — replaces the native styled scrollbar on every overflow-y:auto
   container. Root cause: current Chrome no longer honors ::-webkit-scrollbar-button{display:none}
   (verified live: the up/down arrows render regardless, even with !important + a full reload) —
   only hiding the native scrollbar entirely works, so we do that and draw our own track+thumb here,
   matching the Figma spec colors (see .fake-scrollbar-track/-thumb in styles.css) with no arrow
   buttons because nothing native is left to render them. */
function initFakeScrollbar(el) {
  if (!el || el.dataset.fakeScrollbarInit) return;
  el.dataset.fakeScrollbarInit = 'true';
  el.classList.add('native-scrollbar-hidden');
  const parent = el.parentElement;
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  const track = document.createElement('div');
  track.className = 'fake-scrollbar-track';
  const thumb = document.createElement('div');
  thumb.className = 'fake-scrollbar-thumb';
  track.appendChild(thumb);
  parent.appendChild(track);

  function scale() { return Math.min(window.innerWidth / 1280, window.innerHeight / 710); }

  function layout() {
    const s = scale();
    const elRect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const height = elRect.height / s;
    track.style.top = ((elRect.top - parentRect.top) / s) + 'px';
    track.style.height = height + 'px';
    track.style.left = ((elRect.right - parentRect.left) / s - 12) + 'px';
    const needsScroll = el.scrollHeight > el.clientHeight + 1;
    track.style.display = needsScroll ? 'block' : 'none';
    if (!needsScroll) return;
    const ratio = el.clientHeight / el.scrollHeight;
    const thumbHeight = Math.max(24, height * ratio);
    const maxThumbTop = height - thumbHeight;
    const scrollRatio = el.scrollTop / (el.scrollHeight - el.clientHeight);
    thumb.style.height = thumbHeight + 'px';
    thumb.style.top = (maxThumbTop * scrollRatio) + 'px';
  }
  el.addEventListener('scroll', layout);
  window.addEventListener('resize', layout);

  let dragging = false, startY = 0, startScrollTop = 0;
  thumb.addEventListener('mousedown', function (e) {
    dragging = true; startY = e.clientY; startScrollTop = el.scrollTop;
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    const s = scale();
    const elRect = el.getBoundingClientRect();
    const height = elRect.height / s;
    const ratio = el.clientHeight / el.scrollHeight;
    const thumbHeight = Math.max(24, height * ratio);
    const maxThumbTop = height - thumbHeight;
    const deltaY = (e.clientY - startY) / s;
    const scrollableDist = el.scrollHeight - el.clientHeight;
    el.scrollTop = startScrollTop + (deltaY / maxThumbTop) * scrollableDist;
  });
  document.addEventListener('mouseup', function () { dragging = false; document.body.style.userSelect = ''; });
  layout();
  new MutationObserver(layout).observe(el, { childList: true, subtree: true, characterData: true });
}

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
  /* resume: לצייר מסך שכבר נענה. ⚠️ בכל ניווט, לא רק בנחיתת השחזור —
     applyResumeVars מחזיר את משתני **כל** השאלות בסין, ובלי הציור הזה מסך
     שנענה היה נראה פתוח אך אינו מגיב ללחיצות (sNSelect פותח ב-if (sNDone)
     return, והכפתור מושבת מה-markup). */
  try { repaintScreen(n); } catch (e) { console.error('[resume] repaint', e); }
  /* xAPI: אחרי classList.add('active') במכוון — קריאת רשת לא מעכבת ציור.
     עטוף בנפרד כדי שדיווח שנכשל לעולם לא ישבור ניווט. */
  try { xapiOnScreen(n); } catch (e) {}
  requestAnimationFrame(function () {
    target.querySelectorAll('.tbl-content').forEach(initFakeScrollbar);
  });
  /* resume: נקודת השמירה. debounce של 800ms — תוחם את האובדן למסך אחד. */
  try { scheduleResumeSave(); } catch (e) {}
}

function resetScreenState(n) {
  if (n === 0) resetScreenState0();
  if (n === 1) resetScreenState1();
  if (n === 2) resetScreenState2();
  if (n === 3) resetScreenState3();
}

/* =========================================================
   פונקציית עזר גלובלית — Companion character system
   ========================================================= */
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
   מסך 1 — מעבר: זמן ל-3 שאלות מתקדמות. שוכפל ממסך 1 בסיין 2.
   דמות: וידאו (MP4 בלופ, בלי קול/סרגל שליטה — בקשת הלקוח, לא GIF).
   שקף 114 ציין "הגיף שנבחר בעמוד הראשון בריצה" — עכשיו ממומש בפועל.
   נבחר דינמית לפי Companion character system
   (window.lomdaState.selectedCharacter), לעולם לא מוקשח.
   ========================================================= */

const S0_AVATAR_ASSETS = {
  pink: 'assets/gifs/pink-avatar-running.mp4',
  boy: 'assets/gifs/boy-avatar-running.mp4'
};

function resetScreenState0() {
  resolveCharBubbleVideo('s0-avatar-video', S0_AVATAR_ASSETS);
}

function s0Continue() { goTo(1); }

/* קישור בין סינים: מסך ראשון בסיין 4 -> מסך אחרון בסיין 2 (s9, המסך
   האחרון בפועל שם). עודכן 2026-09-08: סיין 3 הוצא מרצף הלומדה ואוחסן
   בארכיון (../../archive/methodica-science-mass-measure-03-03), לכן
   הקישור מדלג עליו ישירות לסיין 2 — אותו יעד שסיין 3 עצמו הפנה אליו
   לפני ההוצאה מהרצף. נתיב יחסי + #screen=N. */
function s0BackToPreviousSain() {
  window.location.href = '../methodica-ar-science-mass-measure-03-02/index.html#screen=9';
}

/* =========================================================
   stationProgress — תחנת qnav חדשה לסיין הזה (3 שאלות, מסכים 2-4).
   ========================================================= */

let stationProgress = { q1: null, q2: null, q3: null };

function updateQuestionNav(prefix) {
  const qs = [stationProgress.q1, stationProgress.q2, stationProgress.q3];
  const currentIdx = qs.indexOf(null);
  for (let i = 0; i < 3; i++) {
    const icon = document.getElementById(prefix + '-qnav-icon-' + (i + 1));
    const label = document.getElementById(prefix + '-qnav-label-' + (i + 1));
    if (!icon) continue;
    icon.className = 'qnav-icon';
    if (label) label.className = 'qnav-label';
    if (qs[i] === 'success') {
      icon.classList.add('qnav-success');
      if (label) label.classList.add('qnav-label-active');
    } else if (qs[i] === 'fail') {
      icon.classList.add('qnav-fail');
      if (label) label.classList.add('qnav-label-active');
    } else if (i === currentIdx) {
      icon.classList.add('qnav-current');
      if (label) label.classList.add('qnav-label-active');
    } else {
      icon.classList.add('qnav-future');
    }
  }
  for (let j = 1; j <= 2; j++) {
    const line = document.getElementById(prefix + '-qnav-line-' + j);
    if (!line) continue;
    line.className = 'qnav-line';
    if (qs[j - 1] !== null) line.classList.add('line-done');
  }
}

/* =========================================================
   מסך 2 — שאלה 1 מתוך 3: SCQ עם תמונה. שוכפל ממסך 3 בסיין 2.
   ========================================================= */

const S1 = {
  correctId: 'c',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'صحيح.', body: 'المعطيات تدعم الاستنتاج بشأن الكرات التي تم فحصها، لكنها لا تنطبق على الإنتاج بأكمله.' },
    wrong1: { title: 'الإجابة غير صحيحة.', body: 'لا بأس، نتعلّم من الأخطاء أيضًا.\nهل نحاول مرة أخرى؟' },
    wrong2: { title: 'الإجابة غير صحيحة.\nالإجابة الصحيحة مُشار إليها.', body: 'المعطيات تدعم الاستنتاج بشأن الكرات التي تم فحصها، لكنها لا تنطبق على الإنتاج بأكمله.' }
  }
};

let s1Selected = null;
let s1Attempts = 0;
let s1Done = false;
let s1Phase = 'before';
/* Retry gate (720 spec; דיווח MOE 23.09.26): התשובה שסומנה שגויה בניסיון
   שאינו אחרון. כל עוד הבחירה הנוכחית זהה לה — "צדקתי?" מושבת. */
let s1LastWrong = null;

function s1OptEl(id) { return document.querySelector('#s1 .scq-opt[data-id="' + id + '"]'); }

function s1Select(id) {
  if (s1Done) return;
  const wasWrong1 = (s1Phase === 'wrong1');
  document.querySelectorAll('#s1 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const selectedEl = s1OptEl(id);
  selectedEl.classList.add('selected');
  selectedEl.setAttribute('aria-checked', 'true');
  s1Selected = id;
  s1Phase = 'selected';
  if (wasWrong1) document.getElementById('s1-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s1-check');
  checkBtn.textContent = 'هل إجابتي صحيحة؟';
  /* Retry gate: אותה תשובה שכבר סומנה שגויה אינה ניתנת להגשה שוב. */
  checkBtn.disabled = (s1Selected === s1LastWrong);
  checkBtn.onclick = s1Check;
}

function s1ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s1-feedbox');
  const data = S1.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s1SetBarDone(label, handler) {
  const checkBtn = document.getElementById('s1-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  checkBtn.onclick = handler;
  document.getElementById('s1-hint').hidden = true;
}

function s1Check() {
  if (!s1Selected || s1Done) return;
  s1Attempts++;
  const optEl = s1OptEl(s1Selected);
  /* xAPI: לפני ההסתעפות, כדי שירוץ בדיוק פעם אחת לכל לחיצה בשני המסלולים.
     isLast הוא "נכון, או שנגמרו הניסיונות" — רק answered.last נכנס למכנה. */
  xapiAnswered('001', 'q1', s1Selected === S1.correctId,
    s1Selected === S1.correctId || s1Attempts >= S1.maxAttempts, xapiAnswerText(optEl));

  if (s1Selected === S1.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s1Phase = 'correct';
    s1Done = true;
    s1LastWrong = null;
    s1LockOptions();
    s1ShowFeedback('correct', true);
    stationProgress.q1 = 'success';
    updateQuestionNav('s1');
    s1SetBarDone('متابعة', function () { goTo(2); });
    /* resume: סנכרוני, לא debounce — התשובה כבר מחויבת, ולשונית שנסגרת
       לפני הניווט הבא לא תאבד אותה. ⚠️ לפני ה-return, לא אחריו. */
    try { flushResumeSave(); } catch (e) {}
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s1Attempts < S1.maxAttempts) {
    s1Phase = 'wrong1';
    s1LastWrong = s1Selected; /* Retry gate */
    s1ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s1-check');
    checkBtn.textContent = 'هل إجابتي صحيحة؟';
    checkBtn.disabled = true;
    checkBtn.onclick = s1Check;
    const hintBtn = document.getElementById('s1-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s1OptEl(S1.correctId).classList.add('correct');
    s1Phase = 'wrong-final';
    s1Done = true;
    s1LastWrong = null;
    s1LockOptions();
    s1ShowFeedback('wrong2', false);
    stationProgress.q1 = 'fail';
    updateQuestionNav('s1');
    s1SetBarDone('متابعة', function () { goTo(2); });
  }
  try { flushResumeSave(); } catch (e) {}
}

function s1LockOptions() {
  document.querySelectorAll('#s1 .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}
function s1UnlockOptions() {
  document.querySelectorAll('#s1 .scq-opt').forEach(function (el) {
    el.classList.remove('disabled');
    el.onclick = function () { s1Select(el.dataset.id); };
  });
}

function s1OpenHint() {
  if (s1Done) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל.
     הפונקציה פותחת בלבד (hidden=false) ולא toggle, ולכן אין דיווח כפול. */
  xapiRequestedHint('001', 'q1');
  document.getElementById('s1-hint-overlay').hidden = false;
}
function s1CloseHint() { document.getElementById('s1-hint-overlay').hidden = true; }
document.getElementById('s1-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s1CloseHint();
});

function resetScreenState1() {
  updateQuestionNav('s1');
  if (s1Done || s1Attempts > 0 || s1Selected) return; // resume-state guard
  s1Selected = null;
  s1Attempts = 0;
  s1Phase = 'before';
  s1LastWrong = null; /* איפוס טרי בלבד — כניסה חוזרת לשאלה פתוחה נעצרת בגארד ושומרת אותו */
  s1UnlockOptions();
  document.querySelectorAll('#s1 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s1-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s1-check');
  checkBtn.textContent = 'هل إجابتي صحيحة؟';
  checkBtn.disabled = true;
  checkBtn.onclick = s1Check;
  const hintBtn = document.getElementById('s1-hint');
  hintBtn.hidden = true;
  hintBtn.disabled = false;
  document.getElementById('s1-hint-overlay').hidden = true;
}

document.querySelectorAll('#s1 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s1Select(opt.dataset.id);
    }
  });
});

/* =========================================================
   מסך 3 — שאלה 2 מתוך 3: מסך גלילה (טבלה + SCQ בלי תמונה).
   אפקט הגלילה הועתק בדיוק ממסך 2 של Methodica-science-mass-measure
   -02-04 (זהה למה שכבר שוכפל למסך 17 בסיין 1).
   ========================================================= */

/* SELF-QA.md §7 "Cursor shape" — the hand-shaped (grab) cursor over a scrollable container must only
   show near the actual scrollbar strip, not across the whole content box (client feedback, 2026-09-08:
   the grab cursor covering the entire screen was confusing). Toggles `.near-scrollbar` on `el` based
   on how close the mouse is to its right edge (where the scrollbar physically sits, since these
   containers force direction:ltr — see CLAUDE.md). thresholdPx is generous on purpose (wider than the
   8px scrollbar itself) so it's easy to hit without pixel-perfect aim. */
function initScrollbarHoverCursor(el, thresholdPx) {
  if (!el || el.dataset.scrollbarCursorInit) return;
  el.dataset.scrollbarCursorInit = 'true';
  const threshold = thresholdPx || 20;
  el.addEventListener('mousemove', function (e) {
    const rect = el.getBoundingClientRect();
    const distFromRight = rect.right - e.clientX;
    el.classList.toggle('near-scrollbar', distFromRight >= 0 && distFromRight <= threshold);
  });
  el.addEventListener('mouseleave', function () { el.classList.remove('near-scrollbar'); });
}

/* עודכן (2026-09-08, בקשה מפורשת): בוטל מנגנון "קפיצת העמוד"
   (s2GoToPage/s2InitScrollJump/wheel+keydown page-snap) — התוכן זורם
   עכשיו כזרימה רגילה (ראו .tbl-page ב-styles.css), הגלילה הטבעית של
   הדפדפן מספיקה בלי JS מיוחד. initScrollbarHoverCursor (אפקט היד ליד
   פס הגלילה) נשאר ונקרא ישירות מ-resetScreenState2 — לא נגעתי בפס
   הגלילה עצמו כלל, לפי בקשה מפורשת. */

const S2 = {
  correctId: 'd',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'صحيح.', body: 'الدمج بين الجهاز الدقيق (ميزان تحليلي) وبين القياسات المتكررة هو الطريقة العلمية الأكثر موثوقية.' },
    wrong1: { title: 'الإجابة غير صحيحة.', body: 'لا بأس، نتعلّم من الأخطاء أيضًا.\nهل نحاول مرة أخرى؟' },
    wrong2: { title: 'الإجابة غير صحيحة.\nالإجابة الصحيحة مُشار إليها.', body: 'الدمج بين الجهاز الدقيق (ميزان تحليلي) وبين القياسات المتكررة هو الطريقة العلمية الأكثر موثوقية.' }
  }
};

let s2Selected = null;
let s2Attempts = 0;
let s2Done = false;
let s2Phase = 'before';
/* Retry gate (720 spec; דיווח MOE 23.09.26) — ראו s1LastWrong. */
let s2LastWrong = null;

function s2OptEl(id) { return document.querySelector('#s2 .scq-opt[data-id="' + id + '"]'); }

function s2Select(id) {
  if (s2Done) return;
  const wasWrong1 = (s2Phase === 'wrong1');
  document.querySelectorAll('#s2 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const selectedEl = s2OptEl(id);
  selectedEl.classList.add('selected');
  selectedEl.setAttribute('aria-checked', 'true');
  s2Selected = id;
  s2Phase = 'selected';
  if (wasWrong1) document.getElementById('s2-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s2-check');
  checkBtn.textContent = 'هل إجابتي صحيحة؟';
  /* Retry gate: אותה תשובה שכבר סומנה שגויה אינה ניתנת להגשה שוב. */
  checkBtn.disabled = (s2Selected === s2LastWrong);
  checkBtn.onclick = s2Check;
}

function s2ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s2-feedbox');
  const data = S2.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s2SetBarDone(label, handler) {
  const checkBtn = document.getElementById('s2-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  checkBtn.onclick = handler;
  document.getElementById('s2-hint').hidden = true;
}

function s2Check() {
  if (!s2Selected || s2Done) return;
  s2Attempts++;
  const optEl = s2OptEl(s2Selected);
  xapiAnswered('002', 'q1', s2Selected === S2.correctId,
    s2Selected === S2.correctId || s2Attempts >= S2.maxAttempts, xapiAnswerText(optEl));

  if (s2Selected === S2.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s2Phase = 'correct';
    s2Done = true;
    s2LastWrong = null;
    s2LockOptions();
    s2ShowFeedback('correct', true);
    stationProgress.q2 = 'success';
    updateQuestionNav('s2');
    s2SetBarDone('متابعة', function () { goTo(3); });
    /* resume: סנכרוני, לא debounce — התשובה כבר מחויבת, ולשונית שנסגרת
       לפני הניווט הבא לא תאבד אותה. ⚠️ לפני ה-return, לא אחריו. */
    try { flushResumeSave(); } catch (e) {}
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s2Attempts < S2.maxAttempts) {
    s2Phase = 'wrong1';
    s2LastWrong = s2Selected; /* Retry gate */
    s2ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s2-check');
    checkBtn.textContent = 'هل إجابتي صحيحة؟';
    checkBtn.disabled = true;
    checkBtn.onclick = s2Check;
    const hintBtn = document.getElementById('s2-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s2OptEl(S2.correctId).classList.add('correct');
    s2Phase = 'wrong-final';
    s2Done = true;
    s2LastWrong = null;
    s2LockOptions();
    s2ShowFeedback('wrong2', false);
    stationProgress.q2 = 'fail';
    updateQuestionNav('s2');
    s2SetBarDone('متابعة', function () { goTo(3); });
  }
  try { flushResumeSave(); } catch (e) {}
}

function s2LockOptions() {
  document.querySelectorAll('#s2 .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}
function s2UnlockOptions() {
  document.querySelectorAll('#s2 .scq-opt').forEach(function (el) {
    el.classList.remove('disabled');
    el.onclick = function () { s2Select(el.dataset.id); };
  });
}

function s2OpenHint() {
  if (s2Done) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל.
     הפונקציה פותחת בלבד (hidden=false) ולא toggle, ולכן אין דיווח כפול. */
  xapiRequestedHint('002', 'q1');
  document.getElementById('s2-hint-overlay').hidden = false;
}
function s2CloseHint() { document.getElementById('s2-hint-overlay').hidden = true; }
document.getElementById('s2-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s2CloseHint();
});

function resetScreenState2() {
  updateQuestionNav('s2');
  initScrollbarHoverCursor(document.getElementById('s2-scroll-area'));
  if (s2Done || s2Attempts > 0 || s2Selected) return; // resume-state guard
  const scrollArea = document.getElementById('s2-scroll-area');
  if (scrollArea) scrollArea.scrollTop = 0;
  s2Selected = null;
  s2Attempts = 0;
  s2Phase = 'before';
  s2LastWrong = null; /* איפוס טרי בלבד */
  s2UnlockOptions();
  document.querySelectorAll('#s2 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s2-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s2-check');
  checkBtn.textContent = 'هل إجابتي صحيحة؟';
  checkBtn.disabled = true;
  checkBtn.onclick = s2Check;
  const hintBtn = document.getElementById('s2-hint');
  hintBtn.hidden = true;
  hintBtn.disabled = false;
  document.getElementById('s2-hint-overlay').hidden = true;
}

document.querySelectorAll('#s2 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s2Select(opt.dataset.id);
    }
  });
});

/* =========================================================
   מסך 4 — שאלה 3 מתוך 3: TrueFalseQuestion (4 טענות). הועתק ממסך 5
   של Methodica-science-mass-measure-02-02 (שם: 4 טענות, זהה בדיוק).
   ========================================================= */

const TF_S3_CORRECT = { r1: 'false', r2: 'true', r3: 'true', r4: 'false' };
const S3 = {
  maxAttempts: 2,
  feedback: {
    correct: {
      title: 'إجابة صحيحة وكاملة. كل الاحترام.',
      body: 'عندما يختلف قياسان عن بعضهما البعض، قد يساعد القياس الثالث في تحديد ما إذا كان أحد القياسين شاذًا.\nكما أن إجراء عدة قياسات يتيح إمكانية حساب معدل أكثر موثوقية وزيادة الثقة في النتيجة.'
    },
    wrong1: { title: 'الإجابة ليست صحيحة بالكامل.', body: 'لا بأس، نتعلّم من الأخطاء أيضًا.\nهل نحاول مرة أخرى؟' },
    wrong2: {
      title: 'الإجابة ليست صحيحة بالكامل. الإجابة الكاملة تظهر الآن.',
      body: 'عندما يختلف قياسان عن بعضهما البعض، قد يساعد القياس الثالث في تحديد ما إذا كان أحد القياسين شاذًا.\nكما أن إجراء عدة قياسات يتيح إمكانية حساب معدل أكثر موثوقية وزيادة الثقة في النتيجة.'
    }
  }
};

let s3Selected = { r1: null, r2: null, r3: null, r4: null };
let s3Attempts = 0;
let s3Done = false;
let s3Phase = 'before';
/* Retry gate (720 spec; דיווח MOE 23.09.26): חתימת הטבלה שסומנה שגויה
   בניסיון שאינו אחרון. s3Selected נשמר אחרי טעות, ולכן בלי השער הזה
   הלומד יכול להגיש את אותה טבלה בדיוק כניסיון שני. */
let s3LastWrong = null;

function s3AllSelected() {
  return s3Selected.r1 !== null && s3Selected.r2 !== null &&
         s3Selected.r3 !== null && s3Selected.r4 !== null;
}

/* חתימה בסדר מפתחות קבוע — לא JSON.stringify(s3Selected) ישירות, כי
   applyResumeVars ממלא את האובייקט לפי סדר המפתחות במטען השמור. */
function s3Sig() {
  return JSON.stringify([s3Selected.r1, s3Selected.r2, s3Selected.r3, s3Selected.r4]);
}

function s3Select(rowNum, val) {
  if (s3Done) return;
  if (s3Phase === 'wrong1') {
    [1, 2, 3, 4].forEach(function (n) {
      const row = document.getElementById('s3-row-' + n);
      if (row) row.classList.remove('row-wrong');
      ['true', 'false'].forEach(function (v) {
        const btn = document.getElementById('s3-r' + n + '-' + v);
        if (btn) btn.classList.remove('btn-correct', 'btn-wrong');
      });
    });
    document.getElementById('s3-feedbox').classList.remove('visible');
    s3Phase = 'before';
  }
  const rowKey = 'r' + rowNum;
  s3Selected[rowKey] = val;
  const trueBtn = document.getElementById('s3-r' + rowNum + '-true');
  const falseBtn = document.getElementById('s3-r' + rowNum + '-false');
  if (trueBtn) trueBtn.classList.remove('selected');
  if (falseBtn) falseBtn.classList.remove('selected');
  const activeBtn = document.getElementById('s3-r' + rowNum + '-' + val);
  if (activeBtn) activeBtn.classList.add('selected');
  const checkBtn = document.getElementById('s3-check');
  /* Retry gate: השוואה חיה בכל שינוי — חזרה לטבלה השגויה משביתה שוב. */
  checkBtn.disabled = !s3AllSelected() || s3Sig() === s3LastWrong;
}

function s3ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s3-feedbox');
  const data = S3.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s3LockRows(revealCorrect) {
  ['r1', 'r2', 'r3', 'r4'].forEach(function (r, idx) {
    const rowNum = idx + 1;
    const row = document.getElementById('s3-row-' + rowNum);
    const trueBtn = document.getElementById('s3-r' + rowNum + '-true');
    const falseBtn = document.getElementById('s3-r' + rowNum + '-false');
    if (row) row.classList.add('row-locked');
    if (trueBtn) trueBtn.disabled = true;
    if (falseBtn) falseBtn.disabled = true;
    if (revealCorrect) {
      const correctVal = TF_S3_CORRECT[r];
      const selectedVal = s3Selected[r];
      const correctBtn = document.getElementById('s3-r' + rowNum + '-' + correctVal);
      const wrongBtn = (selectedVal && selectedVal !== correctVal)
        ? document.getElementById('s3-r' + rowNum + '-' + selectedVal)
        : null;
      if (correctBtn) correctBtn.classList.add('btn-correct');
      if (wrongBtn) wrongBtn.classList.add('btn-wrong');
    }
  });
}

function s3SetBarDone(label, handler) {
  const checkBtn = document.getElementById('s3-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  checkBtn.onclick = handler;
  document.getElementById('s3-hint').hidden = true;
}

function s3Check() {
  if (s3Done || !s3AllSelected()) return;
  s3Attempts++;
  const allCorrect = ['r1', 'r2', 'r3', 'r4'].every(function (r) {
    return s3Selected[r] === TF_S3_CORRECT[r];
  });

  /* xAPI: פריט 003 נושא ארבע שאלות נכון/לא-נכון על מסך אחד, והקוד יודע את
     נכונות כל שורה בנפרד — לכן כל אחת מדווחת בנפרד ולא כתוצאה הכל-או-כלום.
     isLast **משותף** לארבעתן: הוא מתאר את מצב המסך, לא את השורה. */
  const _s3Last = allCorrect || s3Attempts >= S3.maxAttempts;
  ['r1', 'r2', 'r3', 'r4'].forEach(function (r, i) {
    xapiAnswered('003', 'q' + (i + 1),
      s3Selected[r] === TF_S3_CORRECT[r],
      _s3Last,
      xapiAnswerText(document.getElementById('s3-r' + (i + 1) + '-' + s3Selected[r])));
  });

  if (allCorrect) {
    s3Phase = 'correct';
    s3Done = true;
    s3LastWrong = null;
    s3LockRows(false);
    s3ShowFeedback('correct', true);
    stationProgress.q3 = 'success';
    updateQuestionNav('s3');
    s3SetBarDone('متابعة', s3Finish);
    /* resume: סנכרוני, לא debounce — התשובה כבר מחויבת, ולשונית שנסגרת
       לפני הניווט הבא לא תאבד אותה. ⚠️ לפני ה-return, לא אחריו. */
    try { flushResumeSave(); } catch (e) {}
    return;
  }

  if (s3Attempts < S3.maxAttempts) {
    s3Phase = 'wrong1';
    s3LastWrong = s3Sig(); /* Retry gate */
    ['r1', 'r2', 'r3', 'r4'].forEach(function (r, idx) {
      const rowNum = idx + 1;
      const selectedVal = s3Selected[r];
      const selectedBtn = document.getElementById('s3-r' + rowNum + '-' + selectedVal);
      if (selectedVal === TF_S3_CORRECT[r]) {
        if (selectedBtn) selectedBtn.classList.add('btn-correct');
      } else {
        const row = document.getElementById('s3-row-' + rowNum);
        if (row) row.classList.add('row-wrong');
        if (selectedBtn) selectedBtn.classList.add('btn-wrong');
      }
    });
    s3ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s3-check');
    checkBtn.disabled = true;
    const hintBtn = document.getElementById('s3-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s3Phase = 'wrong-final';
    s3Done = true;
    s3LastWrong = null;
    s3LockRows(true);
    s3ShowFeedback('wrong2', false);
    stationProgress.q3 = 'fail';
    updateQuestionNav('s3');
    s3SetBarDone('متابعة', s3Finish);
  }
  try { flushResumeSave(); } catch (e) {}
}

/* מספר השאלות שנענו נכון מתוך השלוש שהלומד הובטח להן ("3 שאלות מתקדמות",
   מסך 0). המסך של ארבע השורות נספר כשאלה אחת, הכל-או-כלום — בדיוק כפי
   ש-stationProgress.q3 כבר עובד. */
function getStation04Score() {
  return ['q1', 'q2', 'q3'].filter(function (k) {
    return stationProgress[k] === 'success';
  }).length;
}

/* סוף הרכיב — הלחיצה האחרונה של הלומד, בשני המסלולים (הצלחה וכישלון).
   ⚠️ הרכיב עצמו אינו מנווט: Kata מסירה אותו מהמסך ברגע שה-completed מגיע,
   ומחליטה מהקטלוג מה הרכיב הבא. הניווט הבין-סיני נשאר רק ל-walkthrough
   מקומי (DEV_NAV ב-10-identity.js). */
function s3Finish() {
  const _n = getStation04Score();
  xapiEndComponent({ success: _n === 3, score: { scaled: _n / 3 } },
    document.getElementById('s3-check'));
  if (DEV_NAV) window.location.href = '../methodica-ar-science-mass-measure-03-05/index.html';
}

function s3OpenHint() {
  if (s3Done) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל.
     הפונקציה פותחת בלבד (hidden=false) ולא toggle, ולכן אין דיווח כפול. */
  xapiRequestedHint('003', 'q1');
  document.getElementById('s3-hint-overlay').hidden = false;
}
function s3CloseHint() { document.getElementById('s3-hint-overlay').hidden = true; }
document.getElementById('s3-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s3CloseHint();
});

function resetScreenState3() {
  updateQuestionNav('s3');
  if (s3Done || s3Attempts > 0 || s3AllSelected()) return; // resume-state guard
  s3Selected = { r1: null, r2: null, r3: null, r4: null };
  s3Attempts = 0;
  s3Phase = 'before';
  s3LastWrong = null; /* איפוס טרי בלבד */
  [1, 2, 3, 4].forEach(function (n) {
    const row = document.getElementById('s3-row-' + n);
    if (row) row.classList.remove('row-locked', 'row-wrong');
    ['true', 'false'].forEach(function (v) {
      const btn = document.getElementById('s3-r' + n + '-' + v);
      if (btn) { btn.classList.remove('selected', 'btn-correct', 'btn-wrong'); btn.disabled = false; }
    });
  });
  document.getElementById('s3-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s3-check');
  checkBtn.textContent = 'هل إجابتي صحيحة؟';
  checkBtn.disabled = true;
  checkBtn.onclick = s3Check;
  const hintBtn = document.getElementById('s3-hint');
  hintBtn.hidden = true;
  hintBtn.disabled = false;
  document.getElementById('s3-hint-overlay').hidden = true;
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
   פופ-אפ משוב גריר — לפי "Feedback popup system" (720-templates skill)
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
   הגדלת תמונה (img-zoom) — רכיב גלובלי יחיד
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

/* ═══════════════════ resume — ארבעת ה-hooks של הסין ═══════════════════
   ../unit-js/40-resume.js קורא להם; הם חייבים לשבת כאן ולא שם, כי כל מצב
   הלומד מוגדר כ-let/const ברמת הקובץ — כלומר בסקופ הלקסיקלי הגלובלי, שאינו
   נגיש דרך window.

   הציירים מחקים **רק** את כתיבות ה-DOM של ענפי ההגשה: בלי שינוי מצב, בלי
   xapiAnswered ובלי stationProgress — כל אלה כבר קרו בפעם הראשונה, ושכפולם
   כאן היה מדווח תשובה שנייה. updateQuestionNav נקרא ממילא מ-resetScreenState
   לפני הגארד, ולכן ה-qnav מצויר מ-stationProgress המשוחזר בלי שהצייר יגע בו.
   ═══════════════════════════════════════════════════════════════════ */

function capturePartPayload() {
  var st = { currentScreen: currentScreen };
  /* ציון וניתוב. מפה פר-סין שלא ניתן להגיע אליה מהשכבה המשותפת. */
  st.qResults = Object.assign({}, XAPI_Q_RESULTS);
  st.stations = Object.assign({}, stationProgress);
  st.scq = {
    /* lw = Retry gate (התשובה שסומנה שגויה) — בלעדיו חידוש היה פותח אותה מחדש. */
    s1: { sel: s1Selected, att: s1Attempts, done: s1Done, phase: s1Phase, lw: s1LastWrong },
    s2: { sel: s2Selected, att: s2Attempts, done: s2Done, phase: s2Phase, lw: s2LastWrong }
  };
  /* טבלת נכון/לא-נכון. כל סימון שהצייר מצייר נגזר מהמפה הזאת מול
     TF_S3_CORRECT — s3Select לעולם לא מאפס אותה, ולכן (בניגוד לרב-ברירה
     בסיין 2) אין כאן שום ערך שיושב רק ב-DOM. */
  st.s3 = { sel: Object.assign({}, s3Selected), att: s3Attempts, done: s3Done, phase: s3Phase, lw: s3LastWrong };
  return st;
}

function applyResumeVars(st) {
  if (!st) return;
  /* מוטציה לפי מפתח ולא השמה: הקוד כותב ל-stationProgress.qN ישירות,
     ו-updateQuestionNav קורא דרך אותה הצמדה חיה. */
  if (st.qResults) Object.keys(st.qResults).forEach(function (k) { XAPI_Q_RESULTS[k] = st.qResults[k]; });
  if (st.stations) Object.keys(st.stations).forEach(function (k) { stationProgress[k] = st.stations[k]; });
  if (st.scq) {
    if (st.scq.s1) {
      s1Selected = st.scq.s1.sel || null; s1Attempts = st.scq.s1.att || 0;
      s1Done = !!st.scq.s1.done; s1Phase = st.scq.s1.phase || 'before';
      s1LastWrong = st.scq.s1.lw || null;
    }
    if (st.scq.s2) {
      s2Selected = st.scq.s2.sel || null; s2Attempts = st.scq.s2.att || 0;
      s2Done = !!st.scq.s2.done; s2Phase = st.scq.s2.phase || 'before';
      s2LastWrong = st.scq.s2.lw || null;
    }
  }
  if (st.s3) {
    if (st.s3.sel) Object.keys(st.s3.sel).forEach(function (k) { s3Selected[k] = st.s3.sel[k]; });
    s3Attempts = st.s3.att || 0; s3Done = !!st.s3.done; s3Phase = st.s3.phase || 'before';
    /* מסמך ישן בלי lw (נשמר לפני תיקון ה-retry gate): גוזרים מהתשובה השמורה, כדי
       שהכפתור לא ייפתח על אותה תשובה שגויה. */
    s3LastWrong = st.s3.lw || ((s3Attempts > 0 && !s3Done) ? s3Sig() : null);
  }
}

/* ריק, וזה נכון: אין בסין הזה ערך שחי רק ב-DOM. */
function applyResumeDom(st) {}

function restoreScreenUI(n) {
  try {
    if (n === 1) restoreScqUI({
      screenSel: '#s1', cfg: S1, selected: s1Selected, attempts: s1Attempts, lastWrong: s1LastWrong,
      done: s1Done, phase: s1Phase, optEl: s1OptEl, lock: s1LockOptions,
      showFeedback: s1ShowFeedback, setBarDone: s1SetBarDone, check: s1Check,
      checkBtnId: 's1-check', hintBtnId: 's1-hint',
      onContinue: function () { goTo(2); }
    });
    if (n === 2) restoreScqUI({
      screenSel: '#s2', cfg: S2, selected: s2Selected, attempts: s2Attempts, lastWrong: s2LastWrong,
      done: s2Done, phase: s2Phase, optEl: s2OptEl, lock: s2LockOptions,
      showFeedback: s2ShowFeedback, setBarDone: s2SetBarDone, check: s2Check,
      checkBtnId: 's2-check', hintBtnId: 's2-hint',
      onContinue: function () { goTo(3); }
    });
    if (n === 3) restoreTfTableUI();
  } catch (e) { console.error('[resume] restoreScreenUI', e); }
}

/* צייר אחד לכל שאלות החד-ברירה בסין. ⚠️ ה-cfg מגיע כפרמטר ולעולם לא נקרא
   כגלובל לפי שם — טעות כזאת נבלעת ב-try/catch שעוטף את הצייר ונעלמת. */
function restoreScqUI(o) {
  /* מסך נקי — לא נוגעים. גם מבטיח שהצייר אינו מאפס כלום. */
  if (!o.done && o.attempts === 0 && !o.selected) return;

  if (o.done) {
    if (o.phase === 'correct') {
      var okEl = o.optEl(o.selected);
      if (okEl) { okEl.classList.add('correct'); okEl.classList.remove('selected'); }
      o.showFeedback('correct', true);
    } else {
      /* אותו סדר כמו ב-sNCheck: קודם הטעות של הלומד, אחר כך הנכונה —
         כך חפיפה מסתיימת בירוק. */
      var badEl = o.optEl(o.selected);
      if (badEl && o.selected !== o.cfg.correctId) {
        badEl.classList.add('wrong'); badEl.classList.remove('selected');
      }
      var corrEl = o.optEl(o.cfg.correctId);
      if (corrEl) corrEl.classList.add('correct');
      o.showFeedback('wrong2', false);
    }
    o.lock();
    o.setBarDone('متابعة', o.onContinue);
    return;
  }

  var checkBtn = document.getElementById(o.checkBtnId);
  if (o.phase === 'wrong1') {
    var wEl = o.optEl(o.selected);
    if (wEl) { wEl.classList.add('wrong'); wEl.classList.remove('selected'); }
    o.showFeedback('wrong1', false);
    var hintBtn = document.getElementById(o.hintBtnId);
    if (hintBtn) { hintBtn.hidden = false; hintBtn.disabled = false; }
    /* מושבת עד בחירה חדשה — בדיוק כמו בקוד החי; sNSelect מפעיל מחדש,
       ולכן הלומד אינו תקוע. */
    if (checkBtn) { checkBtn.textContent = 'هل إجابتي صحيحة؟'; checkBtn.onclick = o.check; checkBtn.disabled = true; }
    return;
  }

  /* נבחרה אפשרות אך טרם נבדקה. הכפתור מחושב מאותו פרדיקט שבו sNSelect
     משתמש — בלי זה מסך משוחזר עם בחירה היה מציג כפתור מושבת לנצח. */
  var selEl = o.optEl(o.selected);
  if (selEl) { selEl.classList.add('selected'); selEl.setAttribute('aria-checked', 'true'); }
  /* Retry gate (720 spec; דיווח MOE 23.09.26): הצייר רץ בכל goTo — בלי
     ההשוואה ל-lastWrong הוא היה פותח מחדש את התשובה שכבר סומנה שגויה. */
  if (checkBtn) {
    checkBtn.textContent = 'هل إجابتي صحيحة؟'; checkBtn.onclick = o.check;
    checkBtn.disabled = !o.selected || o.selected === o.lastWrong;
  }
}

/* טבלת נכון/לא-נכון (מסך 3). מחקה את כתיבות ה-DOM של s3Check בלבד. */
function restoreTfTableUI() {
  /* "מסך נקי" = אף שורה לא נבחרה. ⚠️ לא s3AllSelected(): לומד שסימן שתיים
     מארבע השורות ועזב אמנם לא יכול עדיין ללחוץ "צדקתי?", אבל הבחירות שלו
     כן צריכות לחזור — גארד שמסתמך על "כולן נבחרו" היה מוחק אותן בשקט. */
  var anyRowChosen = ['r1', 'r2', 'r3', 'r4'].some(function (r) { return !!s3Selected[r]; });
  if (!s3Done && s3Attempts === 0 && !anyRowChosen) return;

  if (s3Done) {
    /* s3LockRows(true) מצייר בעצמו btn-correct/btn-wrong לכל שורה, ולכן
       בענף הכישלון אין צורך בלולאה שנייה. בענף ההצלחה מעבירים false,
       בדיוק כמו הקוד החי — טבלה נכונה לגמרי אינה מסומנת. */
    s3LockRows(s3Phase !== 'correct');
    s3ShowFeedback(s3Phase === 'correct' ? 'correct' : 'wrong2', s3Phase === 'correct');
    s3SetBarDone('متابعة', s3Finish);
    return;
  }

  /* אחרי ניסיון שגוי, הסימון והמשוב מצוירים רק כשהטבלה היא עדיין זו שהוגשה.
     שינוי שורה בזמן אמת מנקה את כל הסימונים (s3Select), ולכן טבלה ששונתה חוזרת
     כבחירה רגילה — אחרת יציאה וחזרה "בדקה" שורות שלא הוגשו (בדיקת QA, 23.09.26). */
  var showMarks = s3Attempts > 0 && (s3LastWrong == null || s3Sig() === s3LastWrong);
  /* הצייר רץ בכל goTo, ולכן מתחיל מלוח נקי — סימון שנשאר מציור קודם היה נשאר
     גם על שורה ששונתה. ו-s3Phase חוזר ל-'wrong1' כשהסימונים מצוירים: לפיו
     s3Select יודע לנקות אותם בשינוי הבא, בדיוק כמו אחרי s3Check. */
  [1, 2, 3, 4].forEach(function (n) {
    var row = document.getElementById('s3-row-' + n);
    if (row) row.classList.remove('row-wrong');
    ['true', 'false'].forEach(function (v) {
      var b = document.getElementById('s3-r' + n + '-' + v);
      if (b) b.classList.remove('btn-correct', 'btn-wrong', 'selected');
    });
  });
  if (!showMarks) document.getElementById('s3-feedbox').classList.remove('visible');
  if (s3Attempts > 0) s3Phase = showMarks ? 'wrong1' : 'before';
  [1, 2, 3, 4].forEach(function (rowNum) {
    var r = 'r' + rowNum;
    var val = s3Selected[r];
    if (!val) return;
    var btn = document.getElementById('s3-r' + rowNum + '-' + val);
    if (btn) btn.classList.add('selected');
    if (!showMarks) return;
    /* אחרי ניסיון שגוי: אותה לולאה בדיוק כמו ב-s3Check. */
    if (val === TF_S3_CORRECT[r]) {
      if (btn) btn.classList.add('btn-correct');
    } else {
      var row = document.getElementById('s3-row-' + rowNum);
      if (row) row.classList.add('row-wrong');
      if (btn) btn.classList.add('btn-wrong');
    }
  });

  if (s3Attempts > 0) {
    if (showMarks) s3ShowFeedback('wrong1', false);
    var hintBtn = document.getElementById('s3-hint');
    if (hintBtn) { hintBtn.hidden = false; hintBtn.disabled = false; }
  }
  /* אותו פרדיקט שבו s3Select משתמש, כולל Retry gate (720 spec; דיווח MOE
     23.09.26) — הצייר רץ בכל goTo ובלעדיו היה פותח מחדש את הטבלה השגויה. */
  var checkBtn = document.getElementById('s3-check');
  if (checkBtn) {
    checkBtn.textContent = 'هل إجابتي صحيحة؟'; checkBtn.onclick = s3Check;
    checkBtn.disabled = !s3AllSelected() || s3Sig() === s3LastWrong;
  }
}

/* ═══════════════════ xAPI (720) — קונפיגורציה של הסין ═══════════════════
   נתונים בלבד. השכבה המשותפת ב-../unit-js/ קוראת אותם בזמן call. */

/* מסך → [סיומת הפריט בקטלוג, עמוד בתוך הפריט].
   null = מסך בלי פריט בקטלוג (מעבר/נרטיב).
   ⚠️ חייב להחזיק בדיוק TOTAL_SCREENS מפתחות (4), 0..3, בלי חורים. מפתח חסר
   אינו ניתן להבחנה מ-null, כלומר מסך שלא מדווח בשקט. _test/verify-report.js
   אוכף את זה, וקורא את הבלוק הזה כטקסט מקור — לשמור אותו אובייקט ליטרלי עם
   מפתחות מספריים וסיומות במרכאות. */
var SCREEN_TO_SUBCONTENT = {
  0: null,          /* מעבר: "זמן ל-3 שאלות מתקדמות" */
  1: ['001', 1],    /* שאלה 1/3 — חד-ברירה עם תמונה */
  2: ['002', 1],    /* שאלה 2/3 — מסך גלילה: טבלה + חד-ברירה */
  3: ['003', 1]     /* שאלה 3/3 — נכון/לא נכון, ארבע שורות = q1..q4 */
};

var XAPI_COMP_SLUG = 'methodica-ar-science-mass-measure-03-04';
var XAPI_COMP_ID   = XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/';

/* פריטים שנושאים שאלה **מדורגת בקוד**. שלושתם כאלה בסין הזה. */
var XAPI_EVAL_ITEMS = { '001': 1, '002': 1, '003': 1 };

var XAPI_METADATA_FILE = '../metadata/methodica-ar-science-mass-measure-03-04.json';

/* אתחול */
scaleApp();
scqFbMakeDraggable('s1-feedbox');
scqFbMakeDraggable('s2-feedbox');
scqFbMakeDraggable('s3-feedbox');
/* נחיתה ראשונית, סינכרונית.
   ⚠️ ה-#screen=N (מכפתור "חזרה" בסיין הבא) בוחר כאן **רק את המסך**, והוא
   אינו מבטל שחזור: כשיש מסמך, 50-loader.js מעביר אותו מאוחר יותר
   כ-screenOverride ל-applyExecutionState, שמנווט שוב לאותו מסך — הפעם עם
   המצב משוחזר. עד שתוקן, דילוג על השחזור כשהיה hash איבד את
   XAPI_Q_RESULTS ואת stationProgress, ולומד שכבר עמד בסף נותב לתרגול מתקן.
   כשאין מסמך (לומד חדש) הלואדר לא מנווט כלל, ולכן הנחיתה הזאת היא מה שמכבד
   את ה-hash. */
(function () {
  const m = /^#screen=(\d+)$/.exec(location.hash);
  if (m) goTo(parseInt(m[1], 10));
  else resetScreenState(0);
})();
