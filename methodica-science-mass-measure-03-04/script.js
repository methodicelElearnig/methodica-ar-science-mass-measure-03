'use strict';

/* =========================================================
   מנוע גלובלי — canvas scaling, ניווט מסכים, סטייט גלובלי
   ========================================================= */

const TOTAL_SCREENS = 4;
let currentScreen = 0;

/* הדמות שנבחרה בסיין 1 נשמרה ב-localStorage תחת אותו מפתח בדיוק
   ('lomda_selectedCharacter') — כאן היא נקראת מחדש (גשר בין סינים). */
let savedCharacter = null;
try {
  savedCharacter = localStorage.getItem('lomda_selectedCharacter');
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
  requestAnimationFrame(function () {
    target.querySelectorAll('.tbl-content').forEach(initFakeScrollbar);
  });
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
  window.location.href = '../methodica-science-mass-measure-03-02/index.html#screen=9';
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
    correct: { title: 'נכון.', body: 'הנתונים תומכים בכדורים שנבדקו, אך לא בכלל הייצור.' },
    wrong1: { title: 'התשובה אינה נכונה.', body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?' },
    wrong2: { title: 'התשובה אינה נכונה.\nהתשובה הנכונה מסומנת.', body: 'הנתונים תומכים בכדורים שנבדקו, אך לא בכלל הייצור.' }
  }
};

let s1Selected = null;
let s1Attempts = 0;
let s1Done = false;
let s1Phase = 'before';

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
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = false;
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

  if (s1Selected === S1.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s1Phase = 'correct';
    s1Done = true;
    s1LockOptions();
    s1ShowFeedback('correct', true);
    stationProgress.q1 = 'success';
    updateQuestionNav('s1');
    s1SetBarDone('המשך', function () { goTo(2); });
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s1Attempts < S1.maxAttempts) {
    s1Phase = 'wrong1';
    s1ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s1-check');
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = true;
    checkBtn.onclick = s1Check;
    const hintBtn = document.getElementById('s1-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s1OptEl(S1.correctId).classList.add('correct');
    s1Phase = 'wrong-final';
    s1Done = true;
    s1LockOptions();
    s1ShowFeedback('wrong2', false);
    stationProgress.q1 = 'fail';
    updateQuestionNav('s1');
    s1SetBarDone('המשך', function () { goTo(2); });
  }
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
  s1UnlockOptions();
  document.querySelectorAll('#s1 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s1-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s1-check');
  checkBtn.textContent = 'צדקתי?';
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
    correct: { title: 'נכון.', body: 'שילוב של מכשיר מדויק (אנליטי) עם חזרות הוא המתכון המדעי האמין ביותר.' },
    wrong1: { title: 'התשובה אינה נכונה.', body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?' },
    wrong2: { title: 'התשובה אינה נכונה.\nהתשובה הנכונה מסומנת.', body: 'שילוב של מכשיר מדויק (אנליטי) עם חזרות הוא המתכון המדעי האמין ביותר.' }
  }
};

let s2Selected = null;
let s2Attempts = 0;
let s2Done = false;
let s2Phase = 'before';

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
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = false;
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

  if (s2Selected === S2.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s2Phase = 'correct';
    s2Done = true;
    s2LockOptions();
    s2ShowFeedback('correct', true);
    stationProgress.q2 = 'success';
    updateQuestionNav('s2');
    s2SetBarDone('המשך', function () { goTo(3); });
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s2Attempts < S2.maxAttempts) {
    s2Phase = 'wrong1';
    s2ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s2-check');
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = true;
    checkBtn.onclick = s2Check;
    const hintBtn = document.getElementById('s2-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s2OptEl(S2.correctId).classList.add('correct');
    s2Phase = 'wrong-final';
    s2Done = true;
    s2LockOptions();
    s2ShowFeedback('wrong2', false);
    stationProgress.q2 = 'fail';
    updateQuestionNav('s2');
    s2SetBarDone('המשך', function () { goTo(3); });
  }
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
  s2UnlockOptions();
  document.querySelectorAll('#s2 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s2-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s2-check');
  checkBtn.textContent = 'צדקתי?';
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
      title: 'תשובה נכונה ומלאה. כל הכבוד.',
      body: 'כאשר שתי מדידות שונות זו מזו, מדידה שלישית יכולה לעזור לזהות אם אחת המדידות חריגה.\nביצוע כמה מדידות מאפשר לחשב ממוצע אמין יותר ולהגדיל את הביטחון בתוצאה.'
    },
    wrong1: { title: 'התשובה אינה נכונה במלואה.', body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?' },
    wrong2: {
      title: 'התשובה אינה נכונה במלואה. התשובה המלאה מוצגת.',
      body: 'כאשר שתי מדידות שונות זו מזו, מדידה שלישית יכולה לעזור לזהות אם אחת המדידות חריגה.\nביצוע כמה מדידות מאפשר לחשב ממוצע אמין יותר ולהגדיל את הביטחון בתוצאה.'
    }
  }
};

let s3Selected = { r1: null, r2: null, r3: null, r4: null };
let s3Attempts = 0;
let s3Done = false;
let s3Phase = 'before';

function s3AllSelected() {
  return s3Selected.r1 !== null && s3Selected.r2 !== null &&
         s3Selected.r3 !== null && s3Selected.r4 !== null;
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
  checkBtn.disabled = !s3AllSelected();
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

  if (allCorrect) {
    s3Phase = 'correct';
    s3Done = true;
    s3LockRows(false);
    s3ShowFeedback('correct', true);
    stationProgress.q3 = 'success';
    updateQuestionNav('s3');
    /* קישור בין סינים: מסך אחרון בסיין 4 -> מסך ראשון בסיין 5 (נתיב יחסי,
       אותה מוסכמה בדיוק כמו בפרויקט הקודם, Methodica-science-mass
       -measure-02-linked). */
    s3SetBarDone('המשך', function () { window.location.href = '../methodica-science-mass-measure-03-05/index.html'; });
    return;
  }

  if (s3Attempts < S3.maxAttempts) {
    s3Phase = 'wrong1';
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
    s3LockRows(true);
    s3ShowFeedback('wrong2', false);
    stationProgress.q3 = 'fail';
    updateQuestionNav('s3');
    /* קישור בין סינים: מסך אחרון בסיין 4 -> מסך ראשון בסיין 5 (נתיב יחסי,
       אותה מוסכמה בדיוק כמו בפרויקט הקודם, Methodica-science-mass
       -measure-02-linked). */
    s3SetBarDone('המשך', function () { window.location.href = '../methodica-science-mass-measure-03-05/index.html'; });
  }
}

function s3OpenHint() {
  if (s3Done) return;
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
  checkBtn.textContent = 'צדקתי?';
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

/* אתחול */
scaleApp();
scqFbMakeDraggable('s1-feedbox');
scqFbMakeDraggable('s2-feedbox');
scqFbMakeDraggable('s3-feedbox');
/* קישור בין סינים — חזרה: אם הגענו לכאן עם #screen=N (מכפתור "חזרה"
   בסיין הבא), קופצים ישר למסך הזה במקום למסך הראשון. */
(function () {
  const m = /^#screen=(\d+)$/.exec(location.hash);
  if (m) goTo(parseInt(m[1], 10));
  else resetScreenState(0);
})();
