'use strict';

/* =========================================================
   מנוע גלובלי — canvas scaling, ניווט מסכים, סטייט גלובלי
   ========================================================= */

const TOTAL_SCREENS = 4;
let currentScreen = 0;

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
   (סיין 5). part1=סעיף א, part2=סעיף ב, part3=סעיף ג. הסעיפים
   המקדימים (סקשן 1+2, טקסט+תמונה/טבלה) הם מידע בלבד, לא נבדקים.
   שקפים 169-170 מאשרים: "מינימום 3 סעיפים נכונים" להצלחה — בפועל
   שלושת הסעיפים היחידים שיש (א/ב/ג), כלומר כולם. ⚠️ שקף 151 (מסך
   ההזנקה) מזכיר "4 סעיפים, לפחות 3" — אי-התאמה בתסריט (מוצג כפי
   שכתוב, לא תוקן, ראו ARCHITECTURE.md), אך הבדיקה בפועל מסתמכת על
   שקפים 169-170 שמתארים את הלוגיקה נכון.
   ========================================================= */

function saveMoedBResult(part, passed) {
  try { localStorage.setItem('lomda_moedB_part' + part + '_result', passed ? 'pass' : 'fail'); } catch (e) {}
}

function moedBFullyPassed() {
  let p1 = null, p2 = null, p3 = null;
  try {
    p1 = localStorage.getItem('lomda_moedB_part1_result');
    p2 = localStorage.getItem('lomda_moedB_part2_result');
    p3 = localStorage.getItem('lomda_moedB_part3_result');
  } catch (e) {}
  return p1 === 'pass' && p2 === 'pass' && p3 === 'pass';
}

/* =========================================================
   מסך 1 — מעבר: הקדמה למשימת השיא (מועד ב)
   ========================================================= */

const S0_AVATAR_ASSETS = {
  pink: 'assets/gifs/pink-avatar-v-fingers.mp4',
  boy: 'assets/gifs/boy-avatar-v-fingers.mp4'
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
  window.location.href = '../methodica-science-mass-measure-03-05/index.html#screen=4';
}

/* =========================================================
   מסך 2 — מסך גלילה, 5 סקשנים. פס הפעולה התחתון משותף לכל הסקשנים
   (#s1-check/#s1-hint) — מתעדכן (label/disabled/onclick/hidden) בכל
   מעבר עמוד ע"י s1SyncBar(n), לפי אותו עיקרון שכל סקשן "משתלט" על
   הכפתור המשותף כשהוא בתצוגה. סקשנים 1+2 (מידע בלבד) בלי כפתור כלל —
   ההתקדמות ביניהם היא גלילה חופשית בלבד, כמו בכל מסכי הגלילה
   המידעיים האחרים בפרויקט.
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

let s1CurrentPage = 0;

/* המרה לזרימה רגילה (2026-09-08, לפי בקשת המשתמשת — "זרימה רגילה + מעקב גלילה", כמו שתוקן
   בסיין 4/5): אין יותר "קפיצת עמוד" שחוטפת wheel/keydown ומגלגלת מסך-מלא בכל פעם. הגלילה
   חופשית לגמרי; s1GoToPage נשאר קיים רק בשביל כפתורי "המשך" (קפיצה יזומה לסקשן הבא), לא בשביל
   קלט משתמש/ת רגיל. פס הפעולה המשותף (#s1-check/#s1-hint) עוקב אחרי מיקום הגלילה בפועל דרך
   s1UpdateCurrentPageFromScroll() במקום דרך אינדקס-עמוד נפרד. */
function s1GoToPage(index) {
  const pages = document.querySelectorAll('#s6-scroll-area .tbl-page');
  if (index < 0 || index >= pages.length) return;
  s1CurrentPage = index;
  /* .scq-fb-box ממוקם ביחס למסך כולו (position:absolute), לא ביחס
     לסקשן הגלילה — אם משוב פתוח נשאר פתוח בגלילה לסקשן אחר, הוא
     "נתקע" בפינה השמאלית-תחתונה מעל התוכן החדש. סוגרים את כל תיבות
     המשוב של המסך הזה בכל מעבר סקשן, לפי בקשה מפורשת. */
  ['s6a-feedbox', 's6b-feedbox', 's6c-feedbox'].forEach(function (id) {
    const box = document.getElementById(id);
    if (box) box.classList.remove('visible');
  });
  s1SyncBar(index);
  document.getElementById('s6-scroll-area').scrollTo({ top: pages[index].offsetTop, behavior: 'smooth' });
}

/* מעקב גלילה חופשית: בכל אירוע scroll, מאתרים איזה סקשן (.tbl-page) נמצא הכי קרוב למרכז
   האזור הגלוי כרגע, ומסנכרנים אליו את פס הפעולה המשותף — כל sync-function פנימית (s6aSyncBar
   וכו') כבר קוראת את המצב הפנימי-שלה-עצמה, כך שקריאה חוזרת/מרובה בטוחה (אידמפוטנטית), כולל
   dqSectionC.reset() שבודק hasProgress לפני שהוא מאפס משהו (ר' makeDragQuestion). */
function s1UpdateCurrentPageFromScroll() {
  const scrollArea = document.getElementById('s6-scroll-area');
  const pages = document.querySelectorAll('#s6-scroll-area .tbl-page');
  if (!scrollArea || !pages.length) return;
  const viewportMid = scrollArea.scrollTop + scrollArea.clientHeight / 2;
  let closest = 0;
  let closestDist = Infinity;
  pages.forEach(function (page, i) {
    const pageMid = page.offsetTop + page.offsetHeight / 2;
    const dist = Math.abs(pageMid - viewportMid);
    if (dist < closestDist) { closestDist = dist; closest = i; }
  });
  if (closest !== s1CurrentPage) {
    s1CurrentPage = closest;
    s1SyncBar(closest);
  }
}

function s1InitScrollJump() {
  const scrollArea = document.getElementById('s6-scroll-area');
  if (!scrollArea || scrollArea.dataset.jumpInit) return;
  scrollArea.dataset.jumpInit = 'true';
  initScrollbarHoverCursor(scrollArea);
  scrollArea.addEventListener('scroll', s1UpdateCurrentPageFromScroll);
}

/* דריסה בטוחה — אף פעם לא אמורה להיקרא בפועל: ברגע שהמשתמש/ת נוחתים
   על עמוד, s1SyncBar כבר קבעה .onclick אמיתי על הכפתור המשותף (זה
   דורס את התכונה הזו). נשמרת רק כדי שלא תיזרק שגיאה אם עדיין לא בוצע
   sync (למשל טעינה ראשונית לפני resetScreenState1). */
function s1CheckDispatch() {}
function s1OpenHintDispatch() {}

/* מתאם את פס הפעולה המשותף (#s1-check/#s1-hint) לסקשן הנוכחי */
function s1SyncBar(n) {
  const checkBtn = document.getElementById('s1-check');
  const hintBtn = document.getElementById('s1-hint');
  if (n === 0 || n === 1) {
    checkBtn.hidden = true;
    hintBtn.hidden = true;
  } else if (n === 2) {
    s6aSyncBar();
  } else if (n === 3) {
    s6bSyncBar();
  } else if (n === 4) {
    dqSectionC.reset();
  }
}

/* Gesture Hint — Cursor Scroll (SELF-QA.md §7). Ported from Sain 1, missed here in the first pass.
   Shown once per screen visit, hidden the instant a real scroll is attempted (wheel/keydown). */
let s1ScrollGestureShown = false;
function s1MaybeShowScrollGesture() {
  if (s1ScrollGestureShown) return;
  s1ScrollGestureShown = true;
  const gesture = document.getElementById('s1-scroll-gesture');
  const scrollArea = document.getElementById('s6-scroll-area');
  if (!gesture || !scrollArea) return;
  gesture.hidden = false;
  function dismiss() {
    gesture.hidden = true;
    scrollArea.removeEventListener('wheel', dismiss);
    scrollArea.removeEventListener('keydown', dismiss);
  }
  scrollArea.addEventListener('wheel', dismiss);
  scrollArea.addEventListener('keydown', dismiss);
}

function resetScreenState1() {
  const scrollArea = document.getElementById('s6-scroll-area');
  if (scrollArea) scrollArea.scrollTop = 0;
  s1CurrentPage = 0;
  s1InitScrollJump();
  s1MaybeShowScrollGesture();
  s1SyncBar(0);
}

/* =========================================================
   סקשן 3 — סעיף א: חד-ברירה + טבלה ליד המסיחים. correctId='b'.
   בהצלחה/כשלון סופי: saveMoedBResult(1,...), ואז "המשך" מקדם
   ל-s1GoToPage(3) (סעיף ב).
   ========================================================= */

const S6A = {
  correctId: 'b',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'תשובה נכונה.', body: 'בואו נמשיך ונבין מדוע.' },
    wrong1: { title: 'התשובה אינה נכונה.', body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?' },
    wrong2: { title: 'זו טעות. התשובה הנכונה מסומנת.', body: 'בואו נמשיך ונבין מדוע.' }
  }
};

let s6aSelected = null;
let s6aAttempts = 0;
let s6aDone = false;

function s6aOptEl(id) { return document.querySelector('#s1 .tbl-page:nth-of-type(3) .scq-opt[data-id="' + id + '"]'); }

function s6aSelect(id) {
  if (s6aDone) return;
  const wasWrong = (s6aAttempts > 0 && !s6aDone);
  document.querySelectorAll('#s1 .tbl-page:nth-of-type(3) .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const el = s6aOptEl(id);
  el.classList.add('selected');
  el.setAttribute('aria-checked', 'true');
  s6aSelected = id;
  if (wasWrong) document.getElementById('s6a-feedbox').classList.remove('visible');
  s6aSyncBar();
}

function s6aShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s6a-feedbox');
  const data = S6A.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s6aLockOptions() {
  document.querySelectorAll('#s1 .tbl-page:nth-of-type(3) .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}

function s6aCheck() {
  if (!s6aSelected || s6aDone) return;
  s6aAttempts++;
  const optEl = s6aOptEl(s6aSelected);

  if (s6aSelected === S6A.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s6aDone = true;
    s6aLockOptions();
    s6aShowFeedback('correct', true);
    saveMoedBResult(1, true);
  } else if (s6aAttempts >= S6A.maxAttempts) {
    optEl.classList.add('wrong');
    optEl.classList.remove('selected');
    s6aOptEl(S6A.correctId).classList.add('correct');
    s6aDone = true;
    s6aLockOptions();
    s6aShowFeedback('wrong2', false);
    saveMoedBResult(1, false);
  } else {
    optEl.classList.add('wrong');
    optEl.classList.remove('selected');
    s6aShowFeedback('wrong1', false);
  }
  s6aSyncBar();
}

function s6aOpenHint() {
  if (s6aDone) return;
  document.getElementById('s6a-hint-overlay').hidden = false;
}
function s6aCloseHint() { document.getElementById('s6a-hint-overlay').hidden = true; }
document.getElementById('s6a-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s6aCloseHint();
});

/* קובעת label/disabled/onclick/hidden על הכפתור המשותף לפי המצב
   הפנימי הנוכחי של סעיף א — נקראת גם בכניסה ראשונה לעמוד וגם
   בכל שינוי מצב (בחירה/בדיקה), כדי שהכפתור המשותף תמיד ישקף נכון
   את הסעיף שבתצוגה. */
function s6aSyncBar() {
  const checkBtn = document.getElementById('s1-check');
  const hintBtn = document.getElementById('s1-hint');
  checkBtn.hidden = false;
  if (s6aDone) {
    checkBtn.textContent = 'המשך';
    checkBtn.disabled = false;
    checkBtn.onclick = function () { s1GoToPage(3); };
    hintBtn.hidden = true;
  } else {
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = !s6aSelected;
    checkBtn.onclick = s6aCheck;
    hintBtn.hidden = (s6aAttempts === 0);
    hintBtn.disabled = false;
    hintBtn.onclick = s6aOpenHint;
  }
}

/* =========================================================
   סקשן 4 — סעיף ב: חד-ברירה + טבלה ליד המסיחים. correctId='c'.
   בהצלחה/כשלון סופי: saveMoedBResult(2,...), ואז "המשך" מקדם
   ל-s1GoToPage(4) (סעיף ג).
   ========================================================= */

const S6B = {
  correctId: 'c',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'התשובה נכונה.', body: 'כלי מתאים ותוצאות עקביות מספקים ראיות חזקות יותר לקבלת החלטה.' },
    wrong1: { title: 'התשובה אינה נכונה.', body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?' },
    wrong2: { title: 'התשובה אינה נכונה. התשובה הנכונה מסומנת.', body: 'כלי מתאים ותוצאות עקביות מספקים ראיות חזקות יותר לקבלת החלטה.' }
  }
};

let s6bSelected = null;
let s6bAttempts = 0;
let s6bDone = false;

function s6bOptEl(id) { return document.querySelector('#s1 .tbl-page:nth-of-type(4) .scq-opt[data-id="' + id + '"]'); }

function s6bSelect(id) {
  if (s6bDone) return;
  const wasWrong = (s6bAttempts > 0 && !s6bDone);
  document.querySelectorAll('#s1 .tbl-page:nth-of-type(4) .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const el = s6bOptEl(id);
  el.classList.add('selected');
  el.setAttribute('aria-checked', 'true');
  s6bSelected = id;
  if (wasWrong) document.getElementById('s6b-feedbox').classList.remove('visible');
  s6bSyncBar();
}

function s6bShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s6b-feedbox');
  const data = S6B.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s6bLockOptions() {
  document.querySelectorAll('#s1 .tbl-page:nth-of-type(4) .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}

function s6bCheck() {
  if (!s6bSelected || s6bDone) return;
  s6bAttempts++;
  const optEl = s6bOptEl(s6bSelected);

  if (s6bSelected === S6B.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s6bDone = true;
    s6bLockOptions();
    s6bShowFeedback('correct', true);
    saveMoedBResult(2, true);
  } else if (s6bAttempts >= S6B.maxAttempts) {
    optEl.classList.add('wrong');
    optEl.classList.remove('selected');
    s6bOptEl(S6B.correctId).classList.add('correct');
    s6bDone = true;
    s6bLockOptions();
    s6bShowFeedback('wrong2', false);
    saveMoedBResult(2, false);
  } else {
    optEl.classList.add('wrong');
    optEl.classList.remove('selected');
    s6bShowFeedback('wrong1', false);
  }
  s6bSyncBar();
}

function s6bOpenHint() {
  if (s6bDone) return;
  document.getElementById('s6b-hint-overlay').hidden = false;
}
function s6bCloseHint() { document.getElementById('s6b-hint-overlay').hidden = true; }
document.getElementById('s6b-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s6bCloseHint();
});

function s6bSyncBar() {
  const checkBtn = document.getElementById('s1-check');
  const hintBtn = document.getElementById('s1-hint');
  checkBtn.hidden = false;
  if (s6bDone) {
    checkBtn.textContent = 'המשך';
    checkBtn.disabled = false;
    checkBtn.onclick = function () { s1GoToPage(4); };
    hintBtn.hidden = true;
  } else {
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = !s6bSelected;
    checkBtn.onclick = s6bCheck;
    hintBtn.hidden = (s6bAttempts === 0);
    hintBtn.disabled = false;
    hintBtn.onclick = s6bOpenHint;
  }
}

/* =========================================================
   סקשן 5 — סעיף ג: שאלת גרירה (makeDragQuestion factory, זהה לזו
   שכבר קיימת בסינים 3+5). הסעיף האחרון של מועד ב' — בסיומו נבדקת
   moedBFullyPassed() והניתוב בהתאם.
   ========================================================= */

/* Gesture Hint — Cursor Drag (SELF-QA.md §7, Figma node 2915:35185). Ported from Sain 1
   (methodica-science-mass-measure-03-01, which this family's SELF-QA.md governs) — missed here in
   the first pass. One hint for the *first* draggable element only. `slotEl` must already be
   `position:relative` (see .dq-source-slot). Uses `slotEl.dataset.gestureShown` (lives on the
   slot's own stable DOM node, survives the inner draggable card being recreated on every render()).
   Dismissal listens on the slot (not the card) because drag events bubble and the card gets
   replaced on re-render. */
function showDragGestureHint(slotEl) {
  /* Guards on "was this actually dismissed" (set inside dismiss() below), not "was this function
     ever called" — reset() on this screen's section can legitimately run twice back-to-back for one
     arrival (found 2026-09-10, on section 5's "התקן" hint never appearing in practice): s1GoToPage(n)
     sets s1CurrentPage=n and calls s1SyncBar(n) synchronously, THEN starts a smooth scrollTo(); while
     that scroll animates, s1UpdateCurrentPageFromScroll's own "closest page" tracking briefly sees an
     intermediate page as current (since the target scrollTop hasn't been reached yet), overwrites
     s1CurrentPage back down, and then calls s1SyncBar(n) a second time once the scroll actually lands
     — so dqSectionC.reset() (and therefore render(), which rebuilds the slot's card from scratch) runs
     twice for a single ordinary "continue" click. A slotEl.dataset.gestureShown flag set up front here
     survived that fine on its own — the guard still returned early the second time — but render()
     doesn't know a hint div existed and rebuilds the slot's children without it, so the SECOND
     showDragGestureHint() call, now guarded away by the stale "already shown" flag, never puts it
     back: the hint silently vanishes despite firing on every navigation into this section. Checking
     for an existing .gesture-hint child (not just the flag) lets a redundant call safely re-add it
     when render() has wiped it out from under an untouched, never-dismissed hint. */
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
     offsetWidth) — reported 2026-09-10 (ported fix from Sain 1, methodica-science-mass-measure-03-01,
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

    const allFilled = targetIds.every(function (tId) {
      return dragIds.some(function (dId) { return placement[dId] === tId; });
    });
    const btn = document.getElementById(cfg.checkBtnId);
    if (btn && !done) btn.disabled = !allFilled;
  }

  function dragStart(e, dragId) {
    if (checked) { e.preventDefault(); return; }
    dragActive = dragId;
    dropHandled = false;
    e.dataTransfer.setData('text/plain', dragId);
    e.dataTransfer.effectAllowed = 'move';
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

  function saveResult(passed) {
    if (!cfg.resultKey) return;
    try { localStorage.setItem(cfg.resultKey, passed ? 'pass' : 'fail'); } catch (e) {}
  }

  function toggleReveal() {
    const revealBtn = cfg.revealBtnId ? document.getElementById(cfg.revealBtnId) : null;
    if (!revealed) {
      revealCorrect();
      showFeedback('wrongFinal');
      revealed = true;
      if (revealBtn) revealBtn.textContent = 'התשובה שלי';
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
      if (revealBtn) revealBtn.textContent = 'התשובה הנכונה';
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

    const btn = document.getElementById(cfg.checkBtnId);
    if (allCorrect) {
      done = true;
      saveResult(true);
      showFeedback('correct');
      if (btn) { btn.textContent = 'המשך'; btn.disabled = false; btn.onclick = cfg.onContinue; }
    } else if (attempts >= maxAttempts) {
      done = true;
      saveResult(false);
      if (cfg.revealBtnId) {
        answerSnapshot = Object.assign({}, placement); // לפני כל reveal
        revealed = false;
        showFeedback('pending');
        const revealBtn = document.getElementById(cfg.revealBtnId);
        if (revealBtn) { revealBtn.hidden = false; revealBtn.textContent = 'התשובה הנכונה'; }
      } else {
        revealCorrect();
        showFeedback('wrongFinal');
      }
      if (btn) { btn.textContent = 'המשך'; btn.disabled = false; btn.onclick = cfg.onContinue; }
    } else {
      showFeedback('wrong1');
      checked = false;
      render();
      const hintBtn = cfg.hintBtnId ? document.getElementById(cfg.hintBtnId) : null;
      if (hintBtn) hintBtn.hidden = false;
      if (btn) { btn.textContent = 'צדקתי?'; btn.disabled = true; btn.onclick = check; }
    }
  }

  function openHint() {
    if (!cfg.hintBtnId) return;
    const hintBtn = document.getElementById(cfg.hintBtnId);
    if (hintBtn) hintBtn.disabled = true;
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
    answerSnapshot = null; revealed = false;
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
      if (revealBtn) { revealBtn.hidden = true; revealBtn.textContent = 'התשובה הנכונה'; }
    }
    const btn = document.getElementById(cfg.checkBtnId);
    if (btn) { btn.hidden = false; btn.textContent = 'צדקתי?'; btn.disabled = true; btn.onclick = check; }
    const panel = document.getElementById(cfg.panelId);
    if (panel) panel.scrollTop = panel.scrollTop; /* לא מאפסים גלילה — עמוד זה מנוהל ע"י s1GoToPage */
    render();
  }

  function restoreFinal() {
    const btn = document.getElementById(cfg.checkBtnId);
    if (btn) { btn.hidden = false; btn.textContent = 'המשך'; btn.disabled = false; btn.onclick = cfg.onContinue; }
    if (cfg.hintBtnId) {
      const hintBtn = document.getElementById(cfg.hintBtnId);
      if (hintBtn) hintBtn.hidden = true;
    }
    if (cfg.revealBtnId && answerSnapshot) {
      const revealBtn = document.getElementById(cfg.revealBtnId);
      if (revealBtn) { revealBtn.hidden = false; revealBtn.textContent = revealed ? 'התשובה שלי' : 'התשובה הנכונה'; }
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

  return { reset: reset };
}

function s1SectionCDecision() {
  if (moedBFullyPassed()) {
    goTo(3); // מסך 4 — סיכום הצלחה (משותף עם סיין 5)
  } else {
    goTo(2); // מסך 3 — סיכום כשלון
  }
}

const TEXTS_S6C_DQ = {
  correct: {
    title: 'התשובה נכונה. כל הכבוד!',
    body: 'חזרות וחישוב ממוצע עוזרים לצמצם את השפעת אי הוודאות ולהגיע להחלטה אמינה יותר.'
  },
  wrong1: {
    title: 'התשובה אינה נכונה במלואה.',
    body: 'ננסה שוב?'
  },
  wrongFinal: {
    title: 'התשובה אינה נכונה.\nהתשובה הנכונה מסומנת.',
    body: 'חזרות וחישוב ממוצע עוזרים לצמצם את השפעת אי הוודאות ולהגיע להחלטה אמינה יותר.'
  },
  pending: {
    title: 'התשובה אינה נכונה.',
    body: 'רוצים לראות את הפתרון הנכון?'
  }
};

const dqSectionC = makeDragQuestion({
  prefix: 's6c',
  screenSelector: '#s1',
  panelId: 's6-scroll-area',
  checkBtnId: 's1-check',
  hintBtnId: 's1-hint',
  hintOverlayId: 's6c-hint-overlay',
  feedboxId: 's6c-feedbox',
  revealBtnId: 's6c-reveal-btn',
  resultKey: 'lomda_moedB_part3_result',
  onContinue: s1SectionCDecision,
  labels: {
    's6c-drag-medayekim': 'המדייקים',
    's6c-drag-teken': 'התקן',
    's6c-drag-hazarot': 'חזרות',
    's6c-drag-memutza': 'ממוצע',
    's6c-drag-vadaut': 'אי הודאות',
    's6c-drag-diyuk': 'דיוק'
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

/* =========================================================
   מסך 3 — סיכום כשלון (לא הצליח במועד ב')
   ========================================================= */

const S2_AVATAR_ASSETS = {
  pink: 'assets/gifs/pink-avatar-thanks.mp4',
  boy: 'assets/gifs/boy-avatar-thanks.mp4'
};

function resetScreenState2() {
  resolveCharBubbleVideo('s2-avatar-video', S2_AVATAR_ASSETS);
}

function s2Finish() {
  /* TODO: לחבר לפעולת סיום הלומדה/היחידה כשתיבנה (LMS) — זהה למוסכמה
     בפרויקט הקודם (s13Finish ב-Methodica-02-06). */
  console.log('TODO: כפתור "סיימתי" (סיכום כשלון) — לחבר לפעולת סיום הלומדה כשתיבנה.');
}

/* =========================================================
   מסך 4 — סיכום הצלחה (משותף עם מסך הסיום של סיין 5)
   ========================================================= */

const S3_AVATAR_ASSETS = {
  pink: 'assets/gifs/pink-avatar-dancing.mp4',
  boy: 'assets/gifs/boy-avatar-dancing.mp4'
};

function resetScreenState3() {
  resolveCharBubbleVideo('s3-avatar-video', S3_AVATAR_ASSETS);
}

function s3Finish() {
  /* TODO: לחבר לפעולת סיום הלומדה/היחידה כשתיבנה (LMS) — זהה למוסכמה
     בפרויקט הקודם (s14Finish ב-Methodica-02-06). */
  console.log('TODO: כפתור "סיימתי" (סיכום הצלחה) — לחבר לפעולת סיום הלומדה כשתיבנה.');
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

/* אתחול */
scaleApp();
scqFbMakeDraggable('s6a-feedbox');
scqFbMakeDraggable('s6b-feedbox');
scqFbMakeDraggable('s6c-feedbox');
document.querySelectorAll('#s1 .tbl-page:nth-of-type(3) .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s6aSelect(opt.dataset.id); }
  });
});
document.querySelectorAll('#s1 .tbl-page:nth-of-type(4) .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s6bSelect(opt.dataset.id); }
  });
});
resetScreenState(0);
