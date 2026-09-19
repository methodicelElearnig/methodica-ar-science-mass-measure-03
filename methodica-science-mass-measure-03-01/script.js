'use strict';

/* =========================================================
   מנוע גלובלי — canvas scaling, ניווט מסכים, סטייט גלובלי
   TOTAL_SCREENS יעודכן ל-1+ עם הוספת כל מסך בפועל.
   ========================================================= */

const TOTAL_SCREENS = 22;
let currentScreen = 0;

/* הדמות שתיבחר במסך הראשון (אם קיים מסך כזה ביחידה זו) תישמר
   ב-localStorage כי כל סיין הוא מסמך HTML נפרד לחלוטין —
   window.lomdaState לא "עובר" בין הסינים בטעינת עמוד מלאה.
   try/catch: בפתיחה מ-file:// חלק מהדפדפנים (ולמשל jsdom) חוסמים
   גישה ל-localStorage עם SecurityError — בלי ה-try/catch, חריגה
   כאן הייתה עוצרת את טעינת כל script.js */
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
   perfectly matching the Figma spec colors (see .fake-scrollbar-track/-thumb in styles.css) with no
   arrow buttons because nothing native is left to render them.
   `el` must have overflow-y:auto/scroll; its own box (top/height, and right edge for the 12px strip)
   is measured via getBoundingClientRect() and divided by the current canvas scale (same formula as
   scaleApp() above) to convert real/rendered pixels back into the #app-local coordinate space the
   track/thumb are positioned in. */
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
  /* resume: לצייר מסך שכבר נענה — בכל ניווט, לא רק בנחיתת השחזור. */
  try { repaintScreen(n); } catch (e) { console.error('[resume] repaint', e); }
  /* xAPI: אחרי classList.add('active') במכוון — קריאת רשת לא מעכבת ציור.
     עטוף בנפרד כדי שדיווח שנכשל לעולם לא ישבור ניווט. */
  try { xapiOnScreen(n); } catch (e) {}
  try { scheduleResumeSave(); } catch (e) {}
  /* Deferred to next frame: target is still display:none at this exact point (same ordering
     constraint as showDragGestureHint(), see its own comment) — initFakeScrollbar() needs real
     geometry, so it must run after 'active' has actually painted. Centralized here (rather than
     one call per resetScreenStateX()) so no scrollable container in a newly-added screen is ever
     missed. */
  requestAnimationFrame(function () {
    target.querySelectorAll('.dq-question-panel, .s13-content, .s15-content, .s17-content').forEach(initFakeScrollbar);
  });
}

function resetScreenState(n) {
  /* כל מסך שנוסף מקבל כאן שורת if (n === X) resetScreenStateX(); משלו,
     ומגדיר את הפונקציה resetScreenStateX() ליד קטע ה-HTML/JS של המסך. */
  if (n === 0) resetScreenState0();
  if (n === 1) resetScreenState1();
  if (n === 2) resetScreenState2();
  if (n === 3) resetScreenState3();
  if (n === 4) resetScreenState4();
  if (n === 5) { resetScreenStateViq(5); s5GoldSim.reset(); }
  if (n === 6) { resetScreenStateViq(6); s6MedicineSim.reset(); }
  if (n === 7) resetScreenState7();
  if (n === 8) resetScreenState8();
  if (n === 9) resetScreenState9();
  if (n === 10) resetScreenState10();
  if (n === 11) resetScreenState11();
  if (n === 12) resetScreenState12();
  if (n === 13) resetScreenState13();
  if (n === 14) resetScreenState14();
  if (n === 15) resetScreenState15();
  if (n === 16) resetScreenState16();
  if (n === 17) resetScreenState17();
  if (n === 18) resetScreenState18();
  if (n === 19) resetScreenState19();
  if (n === 20) resetScreenState20();
  if (n === 21) resetScreenState21();
}


/* כמה משאלות תחנה ב נענו נכון.
   ⚠️ המכנה הוא 5, לא 6: stationBProgress מוגדר עם שישה תאים והניווט מצייר
   שישה, אבל רק חמש שאלות נבנו בפועל (תא 6 לעולם אינו מתמלא), והקטלוג מסכים —
   פריטים 007..011 הם חמישה. טקסט מסך 12 תוקן ל"5 שאלות" בהתאם. */
function getStationBScore() {
  return [1, 2, 3, 4, 5].filter(function (i) {
    return stationBProgress[i] === 'success';
  }).length;
}

/* סוף הרכיב — הלחיצה האחרונה של הלומד, בשני המסלולים.
   ⚠️ הרכיב אינו מנווט: Kata מסירה אותו מהמסך ברגע שה-completed מגיע
   ומחליטה מהקטלוג מה הבא. הניווט נשאר ל-walkthrough מקומי בלבד. */
function s21Finish() {
  const _n = getStationBScore();
  xapiEndComponent({ success: _n >= 4, score: { scaled: _n / 5 } },
    document.getElementById('s21-check'));
  if (DEV_NAV) window.location.href = '../methodica-science-mass-measure-03-02/index.html';
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
   מסך 1 — בחירת דמות (TwoOptionSelection)
   הועתק במדויק (עיצוב + פונקציונליות) ממסך 1 של
   Methodica-science-mass-measure-02-01. הבחירה נשמרת ב-
   window.lomdaState.selectedCharacter + localStorage (ראו הערה
   למעלה), כדי לשרוד ניווט בין סינים וטעינות מחדש לכל אורך היחידה.
   ========================================================= */

function resetScreenState0() {
  // תמיד מסנכרן את ה-UI מ-window.lomdaState.selectedCharacter (לא "פעם אחת בלבד") —
  // כך שינוי בחירה בחזרה למסך זה ישתקף נכון, לפי חוזה ה-Companion character system
  const chosen = window.lomdaState.selectedCharacter;
  document.querySelectorAll('.option-card').forEach(function (c) {
    const isChosen = c.dataset.value === chosen;
    c.classList.toggle('selected', isChosen);
    c.setAttribute('aria-checked', isChosen ? 'true' : 'false');
  });
  const btn = document.getElementById('s0-continue');
  if (btn) btn.disabled = !chosen;
}

function selectOption(cardEl) {
  document.querySelectorAll('.option-card').forEach(function (c) {
    c.classList.remove('selected');
    c.setAttribute('aria-checked', 'false');
  });
  cardEl.classList.add('selected');
  cardEl.setAttribute('aria-checked', 'true');
  window.lomdaState.selectedCharacter = cardEl.dataset.value;
  /* try/catch: localStorage חסום ב-SecurityError בפתיחה מ-file:// בחלק
     מהדפדפנים/opaque origins — שמירת ההעדפה בין הסינים היא nice-to-have,
     אין להפיל את המסך הראשון אם היא נכשלת */
  try { localStorage.setItem('lomda_selectedCharacter', cardEl.dataset.value); } catch (e) {}
  const btn = document.getElementById('s0-continue');
  if (btn) btn.disabled = false;
}

function handleCardKey(event, cardEl) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectOption(cardEl);
  }
}

function advanceFromS0() {
  if (!window.lomdaState.selectedCharacter) return;
  goTo(1);
}

/* =========================================================
   מסכים 2+4 — VideoIntro (דמות מלווה + בועת דיבור)
   תמונת הדמות בבועה מתעדכנת מ-window.lomdaState.selectedCharacter, לפי
   Companion character system (720-templates) — לעולם לא מוקשחת. כל מסך
   משתמש בפוזה ייעודית משלו (מפת נכסים נפרדת לכל מסך, כמו בדוגמת הסקיל) —
   מסך 2: "שוקלת 1 טון", מסך 4: "חושבת".
   ========================================================= */

/* עודכן (2026-08-11): שלושת פוזות הדמות בבועה (S1/S3 כאן + S12_AVATAR_ASSETS
   במסך 13 למטה) הוחלפו מתמונה סטטית לווידאו בלולאה/מושתק (assets/videos/
   *.mp4, גודל המסגרת נשאר זהה) — לפי בקשת המשתמשת. preloadVideo() מחליף
   את new Image().src בתור מנגנון ה-preload (עדיין לפני שהמסך נהיה גלוי,
   לפי CLAUDE.md כלל #1). */
function preloadVideo(src) {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'video';
  link.href = src;
  document.head.appendChild(link);
}

const CHAR_BUBBLE_ASSETS_S1 = {
  pink: 'assets/videos/pink-avatar-weighting-1-ton.mp4',
  boy: 'assets/videos/boy-avatar-weighting-1-ton.mp4'
};
preloadVideo(CHAR_BUBBLE_ASSETS_S1.pink);
preloadVideo(CHAR_BUBBLE_ASSETS_S1.boy);

const CHAR_BUBBLE_ASSETS_S3 = {
  pink: 'assets/videos/pink-avatar-thinking.mp4',
  boy: 'assets/videos/boy-avatar-thinking.mp4'
};
preloadVideo(CHAR_BUBBLE_ASSETS_S3.pink);
preloadVideo(CHAR_BUBBLE_ASSETS_S3.boy);

/* imgId ליסטורי מהשם — הפונקציה עובדת גם על <video> (הצורה הנוכחית של כל
   קריאה קיימת לה, ראו למעלה) וגם על <img> (אם ייווסף כזה בעתיד), לפי
   tagName בפועל — לא נדרשה פונקציה מקבילה נפרדת. */
function resolveCharBubbleImg(imgId, assetMap) {
  const el = document.getElementById(imgId);
  if (!el) return;
  const char = window.lomdaState.selectedCharacter;
  const src = (char && assetMap[char]) ? assetMap[char] : '';
  if (el.tagName === 'VIDEO') {
    if (el.getAttribute('src') !== src) {
      if (src) el.setAttribute('src', src); else el.removeAttribute('src');
      el.load();
    }
    el.play().catch(function () {});
  } else {
    el.src = src;
  }
}

/* =========================================================
   VideoIntro video-gating (מסכים 2/4/8 — s1/s3/s7) — YouTube IFrame
   Player API. כפתור "המשך" בשלושת המסכים נשאר disabled בקוד הסטטי עד
   שהסרטון המתאים מסתיים (אירוע onStateChange === YT.PlayerState.ENDED),
   לפי תסריט ההפקה: "כפתור המשך פעיל רק אחרי ניגון הסרטון". הפליירים
   נוצרים פעם אחת ב-onYouTubeIframeAPIReady (לא בכל resetScreenStateN —
   resetScreenStateN רץ מחדש בכל כניסה למסך, ויצירת YT.Player חוזרת
   הייתה יוצרת iframe כפול).
   ========================================================= */
const VIDEO_INTRO_PLAYERS = [
  { containerId: 's1-yt-player', videoId: 'g0lcVHET3tI', continueBtnId: 's1-continue' },
  { containerId: 's3-yt-player', videoId: 'QObJvc8ae3k', continueBtnId: 's3-continue' },
  { containerId: 's7-yt-player', videoId: 'ev-yCBqIF7k', continueBtnId: 's7-continue' }
];

function onVideoIntroStateChange(continueBtnId) {
  return function (event) {
    if (event.data === YT.PlayerState.ENDED) {
      const btn = document.getElementById(continueBtnId);
      if (btn) btn.disabled = false;
    }
  };
}

window.onYouTubeIframeAPIReady = function () {
  VIDEO_INTRO_PLAYERS.forEach(function (cfg) {
    new YT.Player(cfg.containerId, {
      videoId: cfg.videoId,
      width: '646',
      height: '363',
      playerVars: { rel: 0, modestbranding: 1, origin: window.location.origin },
      events: { onStateChange: onVideoIntroStateChange(cfg.continueBtnId) }
    });
  });
};

(function loadYouTubeIframeApi() {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
})();

function resetScreenState1() {
  resolveCharBubbleImg('s1-char-img', CHAR_BUBBLE_ASSETS_S1);
}

function resetScreenState3() {
  resolveCharBubbleImg('s3-char-img', CHAR_BUBBLE_ASSETS_S3);
}

/* =========================================================
   מסך 3 — שאלת בחירה יחידה, בלי תמונה (SingleChoiceQuestion)
   הותאם ממסך 2 (SCQ) של Methodica-science-mass-measure-02-01: בלי
   מנגנון בדיקה/ניסיונות/משוב/רמז סטנדרטי — לפי בקשת המשתמשת. בחירה
   מפעילה ישירות את "המשך", בלי שלב "צדקתי?". S2.correctId מתועד
   לפי תסריט ההפקה (שקף 6: "התשובה הנכונה – א") לצורך תיעוד/שימוש
   עתידי בלבד — אינו נבדק/מוצג במשוב במסך הזה.
   ========================================================= */

const S2 = { correctId: 'a' };
let s2Selected = null;

function resetScreenState2() {
  document.querySelectorAll('#s2 .scq-opt').forEach(function (o) {
    const isChosen = o.dataset.id === s2Selected;
    o.classList.toggle('selected', isChosen);
    o.setAttribute('aria-checked', isChosen ? 'true' : 'false');
  });
  const btn = document.getElementById('s2-continue');
  if (btn) btn.disabled = !s2Selected;
}

function s2Select(id) {
  s2Selected = id;
  resetScreenState2();
}

function advanceFromS2() {
  if (!s2Selected) return;
  goTo(3);
}

/* =========================================================
   מסך 5 — בחירת מסלול למידה (TwoOptionSelection)
   שני מסלולים: תרופות → מסך 6 (goTo(5)), זהב → מסך 7 (goTo(6)) —
   שניהם טרם קיימים, goTo מוגן ע"י TOTAL_SCREENS ולא עושה כלום עד שייבנו.
   ========================================================= */

let s4SelectedPath = null; // 'medicine' | 'gold'

function resetScreenState4() {
  document.querySelectorAll('#s4 .option-card').forEach(function (c) {
    const isChosen = c.dataset.value === s4SelectedPath;
    c.classList.toggle('selected', isChosen);
    c.setAttribute('aria-checked', isChosen ? 'true' : 'false');
  });
  const btn = document.getElementById('s4-continue');
  if (btn) btn.disabled = !s4SelectedPath;
}

function s4SelectPath(cardEl) {
  s4SelectedPath = cardEl.dataset.value;
  resetScreenState4();
}

function handleS4CardKey(event, cardEl) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    s4SelectPath(cardEl);
  }
}

function advanceFromS4() {
  /* תוקן: מסך 6 (data-screen=5) מכיל בפועל תוכן "זהב" (שקפים 10-12),
     מסך 7 (data-screen=6) מכיל תוכן "תרופות" (שקפים 13-15) — לפי תיוג
     מפורש בטקסט השקפים עצמם. זה הפוך מהניתוב שנקבע במקור לפני שסופק
     תוכן המסכים (אז: תרופות→6, זהב→7) — דורש אישור מהמשתמשת, ראו סיכום. */
  if (s4SelectedPath === 'gold') goTo(5);
  else if (s4SelectedPath === 'medicine') goTo(6);
}

/* =========================================================
   מסכים 6+7 — ValueInputQuestion, מפוצל עם placeholder סימולציה
   (ראו הערת ה-HTML). שני המסכים חולקים לוגיקה זהה לחלוטין
   (viqCheck/viqOnInput/viqFinish גנריים, לפי מפתח data-screen) —
   רק הערך הנכון/יעד ה-"המשך" שונה בין השניים, לפי VIQ_SCREENS.
   שני ניסיונות; אין רמז (לפי בקשה מפורשת); יש משוב (בניגוד למסך 3).
   ========================================================= */

const VIQ_SCREENS = {
  /* nextScreen: 7 בשניהם — תוקן. מסך 8 (data-screen=7) הוא נקודת התכנסות
     משותפת לשני מסלולי הלמידה; הערך המקורי (5→6, 6→7) היה placeholder
     "המסך הבא ברצף" שנקבע לפני שמסך ההתכנסות נבנה, וגרם בפועל למסלול
     "זהב" (5) להמשיך למסך "תרופות" (6) במקום להתכנס למסך 8. */
  5: { correct: 0.1, inputId: 's5-input', checkBtnId: 's5-check', feedboxId: 's5-feedbox', revealBtnId: 's5-reveal-btn', nextScreen: 7 },
  6: { correct: 0.037, inputId: 's6-input', checkBtnId: 's6-check', feedboxId: 's6-feedbox', revealBtnId: 's6-reveal-btn', nextScreen: 7 }
};
/* xAPI: מסך → סיומת הפריט. שני המסכים הם שני מסלולים חלופיים (בחירה במסך 4),
   והלומד עובר באחד בלבד — הפריט השני פשוט לא מדווח אצלו. */
const VIQ_XAPI_ITEM = { 5: '002', 6: '003' };
const viqAttempts = {};
const viqDone = {};
const viqAnswerSnapshot = {}; // הערך שהלומד הזין בפועל בניסיון השני הכושל, לפני כל reveal
const viqRevealed = {};

function resetScreenStateViq(n) {
  /* resume-state guard. ⚠️ לא רק Done: לומד שניסה פעם אחת, טעה ועזב הוא
     במצב not-done-but-attempted, ואיפוס כאן היה מוחק את הקלט ואת הניסיון
     לפני ש-repaintScreen מספיק לצייר. */
  if (viqDone[n] || viqAttempts[n] > 0) return;
  const cfg = VIQ_SCREENS[n];
  const input = document.getElementById(cfg.inputId);
  const btn = document.getElementById(cfg.checkBtnId);
  const fb = document.getElementById(cfg.feedboxId);
  const revealBtn = document.getElementById(cfg.revealBtnId);
  if (input) {
    input.value = '';
    input.classList.remove('error', 'correct', 'wrong');
    input.disabled = false;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'צדקתי?'; }
  if (fb) { fb.classList.remove('visible', 'is-correct', 'is-wrong', 'collapsed'); }
  if (revealBtn) { revealBtn.hidden = true; revealBtn.textContent = 'התשובה הנכונה'; }
  viqAttempts[n] = 0;
  viqAnswerSnapshot[n] = null;
  viqRevealed[n] = false;
}

function viqOnInput(n) {
  const cfg = VIQ_SCREENS[n];
  const input = document.getElementById(cfg.inputId);
  const btn = document.getElementById(cfg.checkBtnId);
  if (input.classList.contains('error')) {
    input.classList.remove('error');
    const fb = document.getElementById(cfg.feedboxId);
    if (fb) fb.classList.remove('visible');
  }
  if (btn) btn.disabled = !input.value.trim();
}

function viqCheck(n) {
  const cfg = VIQ_SCREENS[n];
  if (viqDone[n]) { goTo(cfg.nextScreen); return; }

  const input = document.getElementById(cfg.inputId);
  const fb = document.getElementById(cfg.feedboxId);
  const titleEl = fb.querySelector('.scq-fb-title-text');
  const bodyEl = fb.querySelector('.scq-fb-body');
  const isCorrect = Number(input.value) === cfg.correct;

  viqAttempts[n] = (viqAttempts[n] || 0) + 1;
  /* xAPI: מסך 5 (זהב) הוא פריט 002 ומסך 6 (תרופה) הוא 003 — הלומד הולך
     במסלול אחד בלבד (בחירה במסך 4), ולכן רק אחד משניהם מדווח אי פעם. */
  xapiAnswered(VIQ_XAPI_ITEM[n], 'q1', isCorrect, isCorrect || viqAttempts[n] >= 2,
    xapiFieldsAnswer([cfg.inputId]));
  fb.classList.remove('collapsed');
  scqFbResetPosition(cfg.feedboxId);

  if (isCorrect) {
    input.classList.add('correct');
    input.disabled = true;
    fb.classList.remove('is-wrong');
    fb.classList.add('is-correct', 'visible');
    titleEl.textContent = 'נכון!';
    bodyEl.textContent = 'מדובר בפער קטן,\nעד כמה לדעתכם הוא משמעותי?';
    viqFinish(n);
  } else if (viqAttempts[n] < 2) {
    input.classList.add('error');
    fb.classList.remove('is-correct');
    fb.classList.add('is-wrong', 'visible');
    titleEl.textContent = 'התשובה אינה נכונה.';
    bodyEl.textContent = 'נסו שוב.';
    const btn = document.getElementById(cfg.checkBtnId);
    if (btn) btn.disabled = true; // נעול עד שהערך השגוי שהוזן משתנה (viqOnInput מפעיל מחדש)
  } else {
    /* אין reveal אוטומטי (per כלל 4) — שומרים snapshot של הערך שהלומד
       הזין בפועל, לפני שכפתור "התשובה הנכונה" דורס אותו, ומציגים משוב
       ממתין + הכפתור, בדיוק כמו בשאלות הגרירה. */
    viqAnswerSnapshot[n] = input.value;
    viqRevealed[n] = false;
    input.classList.add('error'); // מוצג כרגע: ערך הלומד עצמו (שגוי) — border/X אדום, כמו .viqToggleReveal
    input.disabled = true;
    fb.classList.remove('is-correct');
    fb.classList.add('is-wrong', 'visible');
    titleEl.textContent = 'התשובה אינה נכונה.';
    bodyEl.textContent = 'רוצים לראות את הפתרון הנכון?';
    const revealBtn = document.getElementById(cfg.revealBtnId);
    if (revealBtn) { revealBtn.hidden = false; revealBtn.textContent = 'התשובה הנכונה'; }
    viqFinish(n);
  }
  try { flushResumeSave(); } catch (e) {}
}

function viqToggleReveal(n) {
  const cfg = VIQ_SCREENS[n];
  const input = document.getElementById(cfg.inputId);
  const fb = document.getElementById(cfg.feedboxId);
  const titleEl = fb.querySelector('.scq-fb-title-text');
  const bodyEl = fb.querySelector('.scq-fb-body');
  const revealBtn = document.getElementById(cfg.revealBtnId);
  scqFbResetPosition(cfg.feedboxId);

  if (!viqRevealed[n]) {
    input.value = cfg.correct;
    input.classList.remove('error', 'wrong');
    input.classList.add('correct');
    fb.classList.remove('is-wrong');
    fb.classList.add('is-correct', 'visible');
    titleEl.textContent = 'זו טעות. התשובה הנכונה מוצגת.';
    bodyEl.textContent = 'מדובר בפער קטן,\nעד כמה לדעתכם הוא משמעותי?';
    viqRevealed[n] = true;
    if (revealBtn) revealBtn.textContent = 'התשובה שלי';
  } else {
    input.value = viqAnswerSnapshot[n];
    input.classList.remove('correct');
    input.classList.add('error');
    fb.classList.remove('is-correct');
    fb.classList.add('is-wrong', 'visible');
    titleEl.textContent = 'התשובה אינה נכונה.';
    bodyEl.textContent = 'רוצים לראות את הפתרון הנכון?';
    viqRevealed[n] = false;
    if (revealBtn) revealBtn.textContent = 'התשובה הנכונה';
  }
}

function viqFinish(n) {
  viqDone[n] = true;
  const cfg = VIQ_SCREENS[n];
  const btn = document.getElementById(cfg.checkBtnId);
  if (btn) { btn.disabled = false; btn.textContent = 'המשך'; }
}

/* =========================================================
   סימולציית גרירת "משקל" (זהב/תרופה) לשני סוגי מאזניים —
   ממלאת את .dq-sim-placeholder (427×636) במסך 6, ובעתיד 7.
   הפרוטוטייפ נבנה ואומת ויזואלית בנפרד (React/dc-runtime, בתיקיית
   "סימולציה משקל מאזניים דיגטליים" ליד הסיין) — זו שחזור vanilla JS
   טהור של אותה לוגיקה בדיוק, ללא תלות חיצונית. factory אחד
   (makeScaleSimulation) לשימוש חוזר במסך 7 עם תמונות/יעדים שונים —
   שני סוגי המאזניים עצמם (מיקום/מידות/רגישות) משותפים, רק המשקל
   הנגרר ("cfg.blockImg") והיעדים (cfg.regTarget/sensTarget) משתנים.

   חשוב: #app מוגדל/מוקטן דינמית (scaleApp, למעלה) כדי להתאים לחלון —
   לכן דלתת עכבר בפיקסלים אמיתיים (viewport) חייבת להתחלק בגורם
   הקנה-מידה הנוכחי לפני שמוסיפים אותה לקואורדינטות בתוך ה-canvas
   (state.blockX/Y, שהן ביחידות ה-canvas הקבועות 1280×710) — אחרת
   הגרירה "בורחת" מהעכבר בכל מסך שגודלו שונה מ-1280×710 בפועל.

   cfg.block/cfg.idleY ניתנים להתאמה לכל מופע — קופסת התרופה (מסך 7)
   היא בקבוקון זקוף (יחס-רוחב/גובה ~0.53, גבוה בהרבה מגוש הזהב ~1.3),
   ולכן דורשת מידות שונות לגמרי (ראו PROJECT_BRIEF.md). שתי התחנות
   עצמן (GOLD_SIM_STATIONS) משותפות ולא ניתנות להתאמה — אותו מיקום
   מדויק בשני המסכים, לעקביות ויזואלית.
   הנגרר לא מצטמצם/משנה גודל בעת ההנחה על המאזניים — לפי בקשה מפורשת
   (גרסה קודמת כיווצה אותו, GOLD_SIM_RESTING_SCALE, הוסרה לגמרי).
   מיקום המנוחה מעוגן לפי `surfaceY` של כל תחנה — לא top-inset קבוע —
   כי תמונות המאזניים (סימולציה-מאזניים-רגילים/רגישים.png, שתיהן
   1254×1254 ריבועיות, לכן ללא letterbox אנכי בתוך התחנה 190×150:
   קנה-המידה האנכי הוא 1:1 בין פיקסל בתמונה לפיקסל בתחנה) הן צילום
   חזיתי, לא תצוגה מלמעלה — שפת המגש הקדמית (שם האובייקט צריך "לשבת")
   יושבת בגובה שונה בכל תמונה ביחס למסך ה-LCD שמתחתיה: נמדד ישירות
   מהפיקסלים (סריקת עמודה מרכזית) — קו המגש/גוף במאזניים הרגילים
   ב-y≈630/1254≈50.2% (75px מתוך 150), במאזניים הרגישים גבוה יותר,
   ב-y≈570/1254≈45.5% (68px מתוך 150) — לכן שני ה-surfaceY שונים.
   עוגן התחתית (לא העליון) כאן חשוב: הנגרר צריך "לשבת" עם קצהו
   התחתון בדיוק על קו המגש, ולהשתרע כלפי מעלה (לתוך שטח לבן ריק מעל
   התחנה) — לא כלפי מטה אל תוך פאנל ה-LCD.

   cfg.block.visualPad — תיקון עדין נוסף: כל תמונת "משקל" (img בתוך
   .dq-sim-block) מוצגת ב-object-fit:contain בתוך תיבה שהיחס-רוחב/גובה
   שלה שונה מהיחס של קובץ התמונה עצמו, ולכן יש שוליים שקופים אנכיים
   (letterbox) מעל ומתחת לתוכן הנראה בפועל בתוך התיבה — ה"קרש התחתון"
   בפועל אינו תחתית התיבה (BLOCK.h) אלא גבוה ממנה ב-pad הזה. בלי
   visualPad, ה-restFor למטה מעגן את *תחתית התיבה* לקו המגש, כך שהאובייקט
   הנראה בפועל "מרחף" pad פיקסלים מעל הקו. חושב פעם אחת מהיחסים
   הידועים של קבצי המקור (לא נמדד ב-runtime, אין גישה למידות תמונה
   אמיתיות מ-CSS בלבד):
   - גוש הזהב (simulation-gold-block.png, 1536×1024, יחס 1.5): בתיבה
     145×110 (יחס 1.318, צר יותר מהתמונה) — הרוחב הוא המגביל, גובה
     נראה בפועל = 145/1.5 ≈ 96.7 → pad = (110-96.7)/2 ≈ 6.7.
   - קופסת התרופה (simulation-medicine-box.png, 1024×1024, ריבועית):
     בתיבה 61×115 (יחס 0.53, הרבה יותר צר-וגבוה מהתמונה הריבועית) —
     גם כאן הרוחב מגביל, גובה נראה בפועל = 61 (ריבוע) → pad =
     (115-61)/2 = 27 — פער גדול בהרבה מזה של הזהב, ולכן קופסת התרופה
     "צפה" גבוה משמעותית מהמיועד בלי התיקון הזה.
   ========================================================= */
/* הגדלה נוספת של הסימולציה (מסכים 6+7) — בקשה מפורשת נוספת (2026-09-08):
   להגדיל עוד יותר את כל אלמנטי היישומון (מאזניים כולל הצג, הבלוק
   הנגרר), מעבר להגדלה פי 1.4 הקודמת. כל המידות כאן הוגדלו פי 1.2
   נוסף (קנה-מידה אחיד, כדי לשמר את יחסי-הרוחב/גובה ואת חישובי
   ה-visualPad/surfaceY ללא עיוות): תחנה 266×210→319×252, בלוק זהב
   203×154→244×185, פלייסהולדר 600→720px (ראו .dq-sim-placeholder/
   .dq-question-panel ב-styles.css — שניהם עודכנו יחד, וכן ה-"720"
   הקבוע ב-IDLE.x למטה, שמניח את רוחב הפלייסהולדר). surfaceY חושב
   מחדש מהשברים המקוריים (630/1254, 570/1254) על גובה התחנה החדש,
   לא בהכפלה גולמית. IDLE.y הוקטן 90→70 כדי לפנות מקום אנכי לתחנה
   הגבוהה יותר ולטקסט המוגדל מתחתיה (ראו .dq-sim-label/.dq-sim-res
   ב-styles.css, גם הם הוגדלו ל-22px) בתוך גובה הפלייסהולדר הקבוע
   (636px, לא משתנה — זה גובה התוכן הזמין מתחת ל-top-bar ומעל
   ה-bottom-bar, לא חלק מהסקאלה). */
const GOLD_SIM_BLOCK = { w: 244, h: 185, visualPad: 11.2 };
const GOLD_SIM_STATIONS = {
  reg:  { left: 29,  top: 288, w: 319, h: 252, surfaceY: 127 },
  sens: { left: 372, top: 288, w: 319, h: 252, surfaceY: 115 }
};

function makeScaleSimulation(cfg) {
  const root = document.getElementById(cfg.rootId);
  if (!root) return { reset: function () {} };

  const blockEl   = root.querySelector('.dq-sim-block');
  const regValEl  = root.querySelector('.dq-sim-lcd-reg .dq-sim-lcd-val');
  const sensValEl = root.querySelector('.dq-sim-lcd-sens .dq-sim-lcd-val');

  const BLOCK = cfg.block || GOLD_SIM_BLOCK;
  const STATIONS = GOLD_SIM_STATIONS;
  const IDLE = { x: (720 - BLOCK.w) / 2, y: cfg.idleY != null ? cfg.idleY : 70 };

  const state = { blockX: IDLE.x, blockY: IDLE.y, regVal: 0, sensVal: 0, placedOn: null, dragging: false };
  let animTimer = null;
  let jitterTimer = null;

  function cancelAnim() {
    if (animTimer) clearTimeout(animTimer);
    if (jitterTimer) clearTimeout(jitterTimer);
    animTimer = null; jitterTimer = null;
  }

  function restFor(scale) {
    const s = STATIONS[scale];
    return { x: s.left + s.w / 2 - BLOCK.w / 2, y: s.top + s.surfaceY - BLOCK.h + (BLOCK.visualPad || 0) };
  }

  function renderBlock() {
    blockEl.style.transform = 'translate(' + state.blockX + 'px, ' + state.blockY + 'px)';
    blockEl.classList.toggle('dragging', state.dragging);
  }

  function renderLcd() {
    regValEl.textContent  = state.regVal.toFixed(cfg.regDecimals);
    sensValEl.textContent = state.sensVal.toFixed(cfg.sensDecimals);
  }

  function placeOn(scale) {
    const rest = restFor(scale);
    state.placedOn = scale;
    state.blockX = rest.x;
    state.blockY = rest.y;
    renderBlock();
    startWeigh(scale);
  }

  function startWeigh(scale) {
    cancelAnim();
    const target = scale === 'reg' ? cfg.regTarget : cfg.sensTarget;
    const other = scale === 'reg' ? 'sens' : 'reg';
    state[other + 'Val'] = 0;
    renderLcd();
    const dur = 1300, t0 = Date.now();
    function step() {
      const prog = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - prog, 3);
      state[scale + 'Val'] = target * eased;
      renderLcd();
      if (prog < 1) animTimer = setTimeout(step, 30);
      else settle(scale, target);
    }
    animTimer = setTimeout(step, 30);
  }

  // המאזניים הרגישים "מרפרפות" על הספרה האחרונה כמה פעמים לפני שמתייצבות.
  function settle(scale, target) {
    if (scale !== 'sens') { state.regVal = target; renderLcd(); return; }
    const res = Math.pow(10, -cfg.sensDecimals);
    let i = 0;
    function jitterStep() {
      i++;
      if (i >= 7) { state.sensVal = target; renderLcd(); return; }
      const delta = Math.round((Math.random() - 0.5) * 2) * res;
      state.sensVal = target + delta;
      renderLcd();
      jitterTimer = setTimeout(jitterStep, 110);
    }
    jitterTimer = setTimeout(jitterStep, 110);
  }

  function removeFromScale() {
    if (!state.placedOn) return;
    cancelAnim();
    state.placedOn = null;
    state.regVal = 0;
    state.sensVal = 0;
    renderLcd();
  }

  function handleDrop() {
    const cx = state.blockX + BLOCK.w / 2, cy = state.blockY + BLOCK.h / 2;
    const hit = function (s) { return cx > s.left - 30 && cx < s.left + s.w + 30 && cy > s.top - 50 && cy < s.top + s.h + 30; };
    if (hit(STATIONS.reg)) placeOn('reg');
    else if (hit(STATIONS.sens)) placeOn('sens');
  }

  function onPointerDown(e) {
    e.preventDefault();
    // גורם הקנה-מידה של #app כרגע (ראו הערת הפונקציה למעלה).
    const appRect = document.getElementById('app').getBoundingClientRect();
    const scaleFactor = appRect.width / 1280;
    const startX = e.clientX, startY = e.clientY;
    const bx = state.blockX, by = state.blockY;
    removeFromScale();
    state.dragging = true;
    renderBlock();
    try { blockEl.setPointerCapture(e.pointerId); } catch (err) {}

    function move(ev) {
      state.blockX = bx + (ev.clientX - startX) / scaleFactor;
      state.blockY = by + (ev.clientY - startY) / scaleFactor;
      renderBlock();
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      state.dragging = false;
      renderBlock();
      handleDrop();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  blockEl.addEventListener('pointerdown', onPointerDown);

  /* Gesture hint (2026-09-09, client request): show the same hand+rings used by every other drag
     question (showDragGestureHint()'s CSS classes — .gesture-hint, .gesture-hint-ring--drag-big/
     -small, .gesture-hint-hand) on the draggable block itself, so it's clear the block needs to be
     pressed/dragged. Not
     showDragGestureHint() itself — that function offsets past the target's edge specifically to
     avoid covering a text LABEL, which doesn't apply here (the block is a plain image with no text)
     — so this stays dead-center on the block via the shared CSS's own left:50%/top:50% default,
     with no inline offset override. blockEl is already position:absolute (see .dq-sim-block),
     satisfying the same "slotEl must be positioned" requirement. Dismissed on pointerdown (this
     simulation's own drag-start event, not the native HTML5 dragstart the other drag questions use). */
  function showBlockGestureHint() {
    if (blockEl.dataset.gestureShown) return;
    blockEl.dataset.gestureShown = 'true';
    const hint = document.createElement('div');
    hint.className = 'gesture-hint';
    hint.innerHTML =
      '<div class="gesture-hint-ring gesture-hint-ring--drag-big"></div>' +
      '<div class="gesture-hint-ring gesture-hint-ring--drag-small"></div>' +
      '<img class="gesture-hint-hand" src="assets/images/gesture-hand-cursor.svg" alt="">';
    blockEl.appendChild(hint);
    function dismiss() {
      hint.remove();
      blockEl.removeEventListener('pointerdown', dismiss);
    }
    blockEl.addEventListener('pointerdown', dismiss);
  }

  function reset() {
    cancelAnim();
    state.blockX = IDLE.x; state.blockY = IDLE.y;
    state.regVal = 0; state.sensVal = 0; state.placedOn = null; state.dragging = false;
    renderBlock();
    renderLcd();
    showBlockGestureHint();
  }

  reset();
  return { reset: reset };
}

const s5GoldSim = makeScaleSimulation({
  rootId: 's5-sim',
  regTarget: 9.9, sensTarget: 10, regDecimals: 1, sensDecimals: 2
});

const s6MedicineSim = makeScaleSimulation({
  rootId: 's6-sim',
  regTarget: 2.00, sensTarget: 2.037, regDecimals: 2, sensDecimals: 3,
  // גובה הבקבוקון "ביד" (193) תואם בכוונה לגובה גוש הזהב (GOLD_SIM_BLOCK).
  // visualPad=45.5: התמונה הריבועית (1024×1024) בתיבה צרה-וגבוהה 102×193
  // מותירה שוליים שקופים גדולים בהרבה מאלה של הזהב — ראו ההערה על
  // cfg.block.visualPad למעלה. (שני המספרים הוגדלו פי 1.2 נוסף יחד עם
  // שאר הסימולציה — 85×161/38 הקודמים → 102×193/45.5.)
  block: { w: 102, h: 193, visualPad: 45.5 }
});

/* =========================================================
   מסך 8 — VideoIntro, בלי דמות/בועית (נקודת התכנסות של מסלולי
   הלמידה). אין כאן סטייט דינמי משלו — ה-video-gating (VIDEO_INTRO_PLAYERS
   למעלה, זהה לתבנית מסכים 2+4) פועל ברמת onYouTubeIframeAPIReady, לא
   דרך resetScreenStateN. הפונקציה נשארת כ-hook ריק כדי לשמור על מוסכמת
   resetScreenStateN העקבית לכל מסך.
   ========================================================= */

function resetScreenState7() {}

/* =========================================================
   מסך 9 — שאלת בחירה יחידה עם תמונה (SingleChoiceQuestion), הועתק 1:1
   ממסך 2 (id="s1") של Methodica-science-mass-measure-02-01. שני
   ניסיונות, רמז, משוב. תוכן: תסריט הפקה, שקפים 18-22.
   ⚠️ correctId: הערת המפיק בשקף 18 אומרת "א", אך תוכן המשוב הנכון/שגוי-
   סופי (שקפים 21-22) מתאר את שיטת הממוצע (אפשרות ב) כתשובה הנכונה —
   הלכתי לפי תוכן המשוב, לא לפי האות. דורש אישור (ראו PROJECT_BRIEF.md).
   ========================================================= */

const S8 = {
  correctId: 'b',
  maxAttempts: 2,
  feedback: {
    correct: {
      title: 'נכון.',
      body: 'מדענים ואנשי בקרת איכות מבצעים כמה מדידות ומחשבים ממוצע. כך מצמצמים את השפעתן של טעויות אקראיות ומגדילים את הביטחון בתוצאה.'
    },
    wrong1: {
      title: 'התשובה אינה נכונה.',
      body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?'
    },
    wrong2: {
      title: 'זו טעות. התשובה הנכונה מסומנת.',
      body: 'מדענים ואנשי בקרת איכות מבצעים כמה מדידות ומחשבים ממוצע. כך מצמצמים את השפעתן של טעויות אקראיות ומגדילים את הביטחון בתוצאה.'
    }
  }
};

let s8Selected = null;
let s8Attempts = 0;
let s8Done = false;
let s8Phase = 'before'; // 'before' | 'selected' | 'wrong1' | 'correct' | 'wrong-final'

function s8OptEl(id) {
  return document.querySelector('#s8 .scq-opt[data-id="' + id + '"]');
}

function s8Select(id) {
  if (s8Done) return;
  const wasWrong1 = (s8Phase === 'wrong1');
  document.querySelectorAll('#s8 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const selectedEl = s8OptEl(id);
  selectedEl.classList.add('selected');
  selectedEl.setAttribute('aria-checked', 'true');
  s8Selected = id;
  s8Phase = 'selected';
  if (wasWrong1) {
    document.getElementById('s8-feedbox').classList.remove('visible');
  }
  const checkBtn = document.getElementById('s8-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = false;
  checkBtn.onclick = s8Check;
}

function s8ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s8-feedbox');
  const data = S8.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s8SetBarDone(label, handler) {
  const checkBtn = document.getElementById('s8-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  checkBtn.onclick = handler;
  document.getElementById('s8-hint').hidden = true;
}

function s8Check() {
  if (!s8Selected || s8Done) return;
  s8Attempts++;
  const optEl = s8OptEl(s8Selected);
  xapiAnswered('004', 'q1', s8Selected === S8.correctId,
    s8Selected === S8.correctId || s8Attempts >= S8.maxAttempts, xapiAnswerText(optEl));

  if (s8Selected === S8.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s8Phase = 'correct';
    s8Done = true;
    s8LockOptions();
    s8ShowFeedback('correct', true);
    s8SetBarDone('המשך', function () { goTo(9); });
    try { flushResumeSave(); } catch (e) {}
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s8Attempts < S8.maxAttempts) {
    s8Phase = 'wrong1';
    s8ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s8-check');
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = true;
    checkBtn.onclick = s8Check;
    const hintBtn = document.getElementById('s8-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s8OptEl(S8.correctId).classList.add('correct');
    s8Phase = 'wrong-final';
    s8Done = true;
    s8LockOptions();
    s8ShowFeedback('wrong2', false);
    s8SetBarDone('המשך', function () { goTo(9); });
  }
  try { flushResumeSave(); } catch (e) {}
}

function s8LockOptions() {
  document.querySelectorAll('#s8 .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}

function s8UnlockOptions() {
  document.querySelectorAll('#s8 .scq-opt').forEach(function (el) {
    el.classList.remove('disabled');
    el.onclick = function () { s8Select(el.dataset.id); };
  });
}

function s8OpenHint() {
  if (s8Done) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל. */
  xapiRequestedHint('004', 'q1');
  document.getElementById('s8-hint-overlay').hidden = false;
}

function s8CloseHint() {
  document.getElementById('s8-hint-overlay').hidden = true;
}

document.getElementById('s8-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s8CloseHint();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !document.getElementById('s8-hint-overlay').hidden) {
    s8CloseHint();
  }
});

function resetScreenState8() {
  if (s8Done || s8Attempts > 0 || s8Selected) return; // resume-state guard
  s8Selected = null;
  s8Attempts = 0;
  s8Phase = 'before';
  s8UnlockOptions();
  document.querySelectorAll('#s8 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s8-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s8-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = true;
  checkBtn.onclick = s8Check;
  const hintBtn = document.getElementById('s8-hint');
  hintBtn.hidden = true;
  hintBtn.disabled = false;
  document.getElementById('s8-hint-overlay').hidden = true;
}

document.querySelectorAll('#s8 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s8Select(opt.dataset.id);
    }
  });
});

/* =========================================================
   מסך 10 — מסך מעבר: דמות מלווה, וידאו (MP4 בלופ, בלי קול/סרגל
   שליטה — בקשת הלקוח, לא GIF). נבחר דינמית לפי Companion character
   system (window.lomdaState.selectedCharacter), לעולם לא מוקשח —
   אותה מוסכמה בדיוק כמו כל דמות מלווה אחרת בפרויקט (ראו
   resolveCharBubbleImg), רק עם resolveCharBubbleVideo המקביל לה
   כי <video> לא נטען/מתחיל לנגן רק מהצבת src כמו <img>.
   ========================================================= */

const S9_AVATAR_ASSETS = {
  pink: 'assets/gifs/pink-avatar-warming-up.mp4',
  boy: 'assets/gifs/boy-avatar-warming-up.mp4'
};

function resolveCharBubbleVideo(videoId, assetMap) {
  const video = document.getElementById(videoId);
  if (!video) return;
  const char = window.lomdaState.selectedCharacter;
  const src = (char && assetMap[char]) ? assetMap[char] : '';
  if (!src || video.getAttribute('data-src') === src) return;
  video.setAttribute('data-src', src);
  video.src = src;
  video.load();
  video.play().catch(function () {}); // דפדפנים חוסמים לפעמים play() אוטומטי אם autoplay עדיין לא "הותר" — muted מבטיח שזה כן יעבוד בפועל
}

function resetScreenState9() {
  resolveCharBubbleVideo('s9-avatar-video', S9_AVATAR_ASSETS);
}

function s9Continue() {
  goTo(10);
}

/* =========================================================
   stationProgress — מעקב שאלות 11-12 (2 שאלות, סרגל התקדמות משותף
   qnav). הועתק מ-updateQuestionNav של Methodica-science-mass-measure
   -02-01 (מסכים 16-20, שם 5 שאלות) ומצומצם לשתי שאלות בלבד.
   ========================================================= */

let stationProgress = { q10: null, q11: null };

function updateQuestionNav(prefix) {
  const qs = [stationProgress.q10, stationProgress.q11];
  const currentIdx = qs.indexOf(null);
  for (let i = 0; i < 2; i++) {
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
  const line = document.getElementById(prefix + '-qnav-line-1');
  if (line) {
    line.className = 'qnav-line';
    if (qs[0] !== null) line.classList.add('line-done');
  }
}

/* =========================================================
   מסך 11 — שאלה 1/2: SingleChoiceQuestion עם תמונה, 2 אפשרויות בלבד
   (תואם לתוכן השקף — אין 4 מסיחים כאן). הועתק ממסך 16 (id="s15") של
   Methodica-science-mass-measure-02-01. ניסיון מענה אחד בלבד, רמז פעיל
   מההתחלה (שני התיקונים לפי בקשה מפורשת — לא 2 ניסיונות/רמז מוסתר
   כמו במקור). תוכן: תסריט הפקה, שקפים 24-27.
   ========================================================= */

const S10 = {
  correctId: 'b',
  maxAttempts: 1,
  feedback: {
    correct: {
      title: 'נכון מאוד.',
      body: 'ברגע שיש לנו מספר ויחידת מידה, זוהי מדידה כמותית שמספקת נתונים וראיות למדענים (או לשופטים במקרה של חברת הטונה!).'
    },
    wrong1: {
      title: 'התשובה אינה נכונה.',
      body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?'
    },
    wrong2: {
      title: 'זו טעות. התשובה הנכונה מסומנת.',
      body: 'ברגע שיש לנו מספר ויחידת מידה, זוהי מדידה כמותית שמספקת נתונים וראיות למדענים (או לשופטים במקרה של חברת הטונה!).'
    }
  }
};

let s10Selected = null;
let s10Attempts = 0;
let s10Done = false;
let s10Phase = 'before';

function s10OptEl(id) {
  return document.querySelector('#s10 .scq-opt[data-id="' + id + '"]');
}

function s10Select(id) {
  if (s10Done) return;
  const wasWrong1 = (s10Phase === 'wrong1');
  document.querySelectorAll('#s10 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const selectedEl = s10OptEl(id);
  selectedEl.classList.add('selected');
  selectedEl.setAttribute('aria-checked', 'true');
  s10Selected = id;
  s10Phase = 'selected';
  if (wasWrong1) {
    document.getElementById('s10-feedbox').classList.remove('visible');
  }
  const checkBtn = document.getElementById('s10-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = false;
  checkBtn.onclick = s10Check;
}

function s10ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s10-feedbox');
  const data = S10.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s10SetBarDone(label, handler) {
  const checkBtn = document.getElementById('s10-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  checkBtn.onclick = handler;
  document.getElementById('s10-hint').hidden = true;
}

function s10Check() {
  if (!s10Selected || s10Done) return;
  s10Attempts++;
  const optEl = s10OptEl(s10Selected);
  xapiAnswered('005', 'q1', s10Selected === S10.correctId,
    s10Selected === S10.correctId || s10Attempts >= S10.maxAttempts, xapiAnswerText(optEl));

  if (s10Selected === S10.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s10Phase = 'correct';
    s10Done = true;
    s10LockOptions();
    s10ShowFeedback('correct', true);
    s10SetBarDone('המשך', function () { goTo(11); });
    stationProgress.q10 = 'success';
    updateQuestionNav('s10');
    /* resume: אחרי כל הבוקקיפינג ו**לפני** ה-return. */
    try { flushResumeSave(); } catch (e) {}
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s10Attempts < S10.maxAttempts) {
    s10Phase = 'wrong1';
    s10ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s10-check');
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = true;
    checkBtn.onclick = s10Check;
    const hintBtn = document.getElementById('s10-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s10OptEl(S10.correctId).classList.add('correct');
    s10Phase = 'wrong-final';
    s10Done = true;
    s10LockOptions();
    s10ShowFeedback('wrong2', false);
    s10SetBarDone('המשך', function () { goTo(11); });
    stationProgress.q10 = 'fail';
    updateQuestionNav('s10');
  }
  try { flushResumeSave(); } catch (e) {}
}

function s10LockOptions() {
  document.querySelectorAll('#s10 .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}

function s10UnlockOptions() {
  document.querySelectorAll('#s10 .scq-opt').forEach(function (el) {
    el.classList.remove('disabled');
    el.onclick = function () { s10Select(el.dataset.id); };
  });
}

function s10OpenHint() {
  if (s10Done) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל. */
  xapiRequestedHint('005', 'q1');
  document.getElementById('s10-hint-overlay').hidden = false;
}

function s10CloseHint() {
  document.getElementById('s10-hint-overlay').hidden = true;
}

document.getElementById('s10-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s10CloseHint();
});

function resetScreenState10() {
  updateQuestionNav('s10');
  if (s10Done || s10Attempts > 0 || s10Selected) return; // resume-state guard
  s10Selected = null;
  s10Attempts = 0;
  s10Phase = 'before';
  s10UnlockOptions();
  document.querySelectorAll('#s10 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s10-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s10-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = true;
  checkBtn.onclick = s10Check;
  const hintBtn = document.getElementById('s10-hint');
  hintBtn.hidden = false;
  hintBtn.disabled = false;
  document.getElementById('s10-hint-overlay').hidden = true;
}

document.querySelectorAll('#s10 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s10Select(opt.dataset.id);
    }
  });
});

/* =========================================================
   מסך 12 — שאלת גרירה (DragAndDropQuestion) — factory משותף, הועתק
   מ-makeDragQuestion של Methodica-science-mass-measure-02-05, בשני
   שינויים: (1) resultKey/saveResult הפכו לאופציונליים — לא נדרש כאן
   מנגנון "דילוג על מועד ב" של הפרויקט המקורי; (2) נוסף cfg.onResult
   (outcome) — hook לעדכון stationProgress/qnav שלא היה קיים במקור
   (שם לא היה סרגל התקדמות). תווית הכפתור "צדקתי?" — טקסט רגיל, לא
   טריק ה-<span dir="ltr"> של המקור (מיותר תחת RTL אמיתי, ראו
   rtl_no_direction_ltr_trick). 2 ניסיונות, רמז מוסתר עד לניסיון
   ראשון שגוי. תוכן: תסריט הפקה, שקפים 28-32.
   ========================================================= */

/* Gesture Hint — Cursor Drag (SELF-QA.md §7). Generic show-once/hide-on-drag-start helper shared by
   every drag-and-drop screen in this project (the makeDragQuestion() factory below, and screen s17's
   hand-written drag question) — one hint for the *first* draggable element only, not one per pill.
   `slotEl` must already be `position:relative` (see .dq-source-slot / .s17-drag-item's own slot rule)
   so the hint can center on it via `position:absolute`. Uses `slotEl.dataset.gestureShown` (not a
   module-level flag) so "shown once" state lives on the slot's own stable DOM node — it survives the
   inner draggable card being torn down/recreated on every render() without needing a separate
   per-screen variable, and naturally resets on a full page reload like every other resume-state guard
   in this codebase. Dismissal listens on the slot (not the card) because drag events bubble and the
   card itself gets replaced on re-render — binding on the card directly would need re-binding every
   time. */
function showDragGestureHint(slotEl) {
  if (!slotEl || slotEl.dataset.gestureShown) return;
  slotEl.dataset.gestureShown = 'true';
  /* Found the actual text-bearing element BEFORE appending the hint below — slotEl might just be a
     text-holding element itself (s17's .s17-drag-item, text as a direct child) or a wrapper around
     one (.dq-source-slot > .dq-drag-card); descending into the single child that carries the same
     full text as its parent finds whichever one actually renders the label. Must run before
     slotEl.appendChild(hint), since that call gives slotEl (and every ancestor of the label down to
     it) a second child — the hint itself — which would immediately break the "exactly one child"
     check below and leave textHost stuck one level too high. */
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
     offsetWidth) — reported 2026-09-10 still covering the label on "הפחתות"/"5.90"/"טבעת זהב":
     offsetWidth-based math assumed the text sits centered with a wide, fairly constant margin
     inside a fixed-width pill, which happened to not hold for these specific labels/positions
     (word-bank order reshuffles every load, and the source-bank items don't all share one fixed
     width) — sizing off the container's width is only ever a proxy for "past the text", and a
     wrong one whenever the real margin is smaller than assumed. Reading the text's own painted
     extent removes the guesswork: the hand can only ever land past where the text actually ends,
     regardless of pill width, label length, or shuffle position.
     Gap is RING_HALF (21px, half of .gesture-hint-ring--drag-big's 42px width) MINUS 1px, measured
     from the anchor to the text edge — i.e. the ring's own near edge lands 1px before the text, just
     touching it without crossing in. A pass at binding this to the smaller HAND radius instead (+16
     total, on the reasoning "only the opaque hand can really hide a letter, the ring is a translucent
     decoration") was tried and reverted 2026-09-10: checked against the *unpaused, running* animation
     (not a frame frozen mid-cycle) — around 30-40% into its 2s loop the ring is both near full 42px
     scale AND still ~0.6-0.65 opacity (see the `gesture-ring-big` keyframes), which reads as a clearly
     visible pale-blue disc, not a faint outline — at +16 that disc sat squarely over the label's last
     glyph for a real, visible stretch of the loop, not just a 1px graze. RING_HALF-1 keeps that disc
     off the letters entirely while still landing the cluster closer to/on the card than the original
     RING_HALF+4 (+25) margin did, since narrow chips (this project's fixed 180px pill has plenty of
     room either way, but the shared -03-05/-03-06 min-width:90px chips don't) only have so much real
     margin between the text and the card's own edge to spend.
     Falls back to the old container-edge math (still +8, safe there — see the 2026-09-09 log in git
     history) if the range ever comes back empty (e.g. a ghost placeholder with no text).
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
     at scale 1 (a 1280×710 viewport); at any other window size the on-screen gap this produces is off
     by the scale factor, landing the hint away from the card entirely. `appRect.width / 1280` recovers
     the current scale the same way it's already read elsewhere in this file (see onPointerDown in
     makeScaleSimulation); dividing the measured screen-space distance by it converts it back to the
     local units style.left expects. The +20 gap itself is already a local value (derived from the
     ring's own local 42px width) and must not be divided. */
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
    hint.remove();
    slotEl.removeEventListener('dragstart', dismiss);
    slotEl.removeEventListener('click', dismiss);
  }
  slotEl.addEventListener('dragstart', dismiss);
  /* also dismiss on plain click — screen s17's item has a click-to-place fallback
     (s17ItemClick) alongside drag; that's the same "start of the demonstrated action" for a
     learner using that input path instead of dragging. */
  slotEl.addEventListener('click', dismiss);
}

function makeDragQuestion(cfg) {
  const labels = cfg.labels;
  const correctMap = cfg.correctMap;
  const dragIds = Object.keys(labels);
  const targetIds = Object.keys(correctMap);
  let placement = {};
  dragIds.forEach(function (id) { placement[id] = 'source'; });

  let dragActive = null;
  let dropHandled = false;
  let checked = false;
  let attempts = 0;
  let done = false;
  let answerSnapshot = null; // הפלייסמנט של הלומד ברגע הניסיון השני הכושל, לפני revealCorrect()
  let revealed = false; // false = מציג "רוצים לראות?"/הצבעה של הלומד; true = הפתרון הנכון גלוי
  /* resume: ⚠️ נשמר במפורש ואינו נגזר בדיעבד — revealCorrect() דורס את
     placement בפתרון הנכון. */
  let passed = false;

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
      revealCorrect(); // מציב את הפתרון הנכון (checked=true, render())
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

    /* xAPI: **אחרי** לולאת האזורים, ולפני ההסתעפות.
       ⚠️ xapiZoneAnswer לא מתאים לפקטורי הזה: העוזר בונה מזהי אזור בתבנית
       <prefix>-zone-<id>, בעוד היעדים כאן הם <prefix>-target-N. */
    if (cfg.xapiItem) {
      const _ans = targetIds.map(function (tId) {
        let placed = null;
        dragIds.forEach(function (dId) { if (placement[dId] === tId) placed = dId; });
        return tId.replace(/^.*-target-/, '') + '=' + (placed ? labels[placed] : '—');
      }).join(' | ');
      (cfg.xapiQuestions || ['q1']).forEach(function (q) {
        /* ⚠️ 2 כמספר ולא maxAttempts: לעותק הזה של הפקטורי אין הקשירה
           הזאת — הוא בודק `attempts >= 2` ישירות. שם לא-מוגדר היה זורק
           ReferenceError תחת 'use strict'. */
        xapiAnswered(cfg.xapiItem, q, allCorrect, allCorrect || attempts >= 2, _ans);
      });
    }

    try { flushResumeSave(); } catch (e) {}

    const btn = document.getElementById(cfg.checkBtnId);
    if (allCorrect) {
      done = true;
      passed = true;
      saveResult(true);
      showFeedback('correct');
      if (cfg.onResult) cfg.onResult('success');
      if (btn) { btn.textContent = 'המשך'; btn.disabled = false; btn.onclick = cfg.onContinue; }
    } else if (attempts >= 2) {
      done = true;
      passed = false;
      saveResult(false);
      if (cfg.revealBtnId) {
        // לומד-יוזם: לא חושפים אוטומטית — שומרים snapshot של הפלייסמנט
        // *לפני* כל reveal (revealCorrect() דורס את placement בעצמו).
        answerSnapshot = Object.assign({}, placement);
        revealed = false;
        showFeedback('pending');
        const revealBtn = document.getElementById(cfg.revealBtnId);
        if (revealBtn) { revealBtn.hidden = false; revealBtn.textContent = 'התשובה הנכונה'; }
      } else {
        revealCorrect();
        showFeedback('wrongFinal');
      }
      if (cfg.onResult) cfg.onResult('fail');
      if (btn) { btn.textContent = 'המשך'; btn.disabled = false; btn.onclick = cfg.onContinue; }
    } else {
      showFeedback('wrong1');
      checked = false;
      render();
      const hintBtn = document.getElementById(cfg.hintBtnId);
      if (hintBtn) hintBtn.hidden = false;
      if (btn) { btn.textContent = 'צדקתי?'; btn.disabled = true; btn.onclick = check; }
    }
  }

  function openHint() {
    const hintBtn = document.getElementById(cfg.hintBtnId);
    if (hintBtn) hintBtn.disabled = true;
    /* xAPI: אחרי הגארד ומיד לפני שהרמז נחשף בפועל. */
    if (cfg.xapiItem) xapiRequestedHint(cfg.xapiItem, (cfg.xapiQuestions || ['q1'])[0]);
    document.getElementById(cfg.hintOverlayId).hidden = false;
  }
  function closeHint() {
    document.getElementById(cfg.hintOverlayId).hidden = true;
    const hintBtn = document.getElementById(cfg.hintBtnId);
    if (hintBtn) hintBtn.disabled = false;
  }

  function shuffleWordBank() {
    if (!cfg.wordBankId) return;
    const bank = document.getElementById(cfg.wordBankId);
    if (!bank) return;
    const shuffled = dragIds.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }
    /* מיכל ה-word-bank הוא direction:rtl, אז סדר ה-DOM (לא CSS order)
       קובע את הסדר החזותי מימין לשמאל — ולכן מספיק לשנות את סדר ה-
       appendChild של אותם אלמנטי slot קיימים, בלי לגעת בתוכן/מזהים. */
    shuffled.forEach(function (dId) {
      const slot = document.getElementById('slot-' + dId);
      if (slot) bank.appendChild(slot);
    });
  }

  function resetInitial() {
    done = false; checked = false; attempts = 0; dragActive = null; dropHandled = false;
    answerSnapshot = null; revealed = false; passed = false;
    shuffleWordBank();
    dragIds.forEach(function (dId) { placement[dId] = 'source'; });
    targetIds.forEach(function (tId) {
      const zone = document.getElementById(tId);
      if (zone) zone.classList.remove('correct', 'wrong', 'occupied', 'drag-over');
    });
    hideFeedback();
    const hintBtn = document.getElementById(cfg.hintBtnId);
    if (hintBtn) { hintBtn.hidden = true; hintBtn.disabled = false; }
    document.getElementById(cfg.hintOverlayId).hidden = true;
    if (cfg.revealBtnId) {
      const revealBtn = document.getElementById(cfg.revealBtnId);
      if (revealBtn) { revealBtn.hidden = true; revealBtn.textContent = 'התשובה הנכונה'; }
    }
    const btn = document.getElementById(cfg.checkBtnId);
    if (btn) { btn.textContent = 'צדקתי?'; btn.disabled = true; btn.onclick = check; }
    const panel = document.getElementById(cfg.panelId);
    if (panel) panel.scrollTop = 0;
    render();
  }

  function restoreFinal() {
    const btn = document.getElementById(cfg.checkBtnId);
    if (btn) { btn.textContent = 'המשך'; btn.disabled = false; btn.onclick = cfg.onContinue; }
    const hintBtn = document.getElementById(cfg.hintBtnId);
    if (hintBtn) hintBtn.hidden = true;
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
    /* אחרת: יש התקדמות (הוצב קלף ו/או בוצע ניסיון) — לא מאפסים,
       משאירים את ה-DOM/state כמו שהלומד עזב אותם */
    /* gestureHintDragId: optional override (used by dq11 — "חזרות", dragIds[0]/the actual first
       DOM slot, isn't the chip the client wants the hint on; they specified "הפחתות" by name).
       Falls back to dragIds[0] (the first labels key) for every other question, unchanged. */
    showDragGestureHint(document.getElementById('slot-' + (cfg.gestureHintDragId || dragIds[0])));
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

  /* ── resume: שער מפורש למצב ה-closure ── */
  function getState() {
    var bankOrder = null;
    if (cfg.wordBankId) {
      var bank = document.getElementById(cfg.wordBankId);
      if (bank) bankOrder = [].slice.call(bank.querySelectorAll('.dq-source-slot')).map(function (s) { return s.id; });
    }
    return {
      placement: Object.assign({}, placement),
      attempts: attempts, done: done, checked: checked, passed: passed, revealed: revealed,
      answerSnapshot: answerSnapshot ? Object.assign({}, answerSnapshot) : null,
      /* resetInitial() מערבב מחדש את המאגר, ולכן הסדר נשמר. */
      bankOrder: bankOrder
    };
  }

  function setState(s) {
    if (!s) return;
    if (s.placement) dragIds.forEach(function (id) { placement[id] = s.placement[id] || 'source'; });
    attempts = s.attempts || 0;
    done = !!s.done; checked = !!s.checked; passed = !!s.passed; revealed = !!s.revealed;
    answerSnapshot = s.answerSnapshot ? Object.assign({}, s.answerSnapshot) : null;
    if (s.bankOrder && cfg.wordBankId) {
      var bank = document.getElementById(cfg.wordBankId);
      if (bank) s.bankOrder.forEach(function (slotId) {
        var slot = document.getElementById(slotId);
        if (slot) bank.appendChild(slot);
      });
    }
    dragActive = null;
    dropHandled = false;
  }

  function restoreUI() {
    /* ⚠️ מסך נקי → render() בלבד, לעולם לא resetInitial(). */
    if (!done && attempts === 0) { hideFeedback(); render(); return; }
    targetIds.forEach(function (tId) {
      const valid = correctMap[tId];
      let placed = null;
      dragIds.forEach(function (dId) { if (placement[dId] === tId) placed = dId; });
      const ok = (placed === valid) || (placed && labels[placed] === labels[valid]);
      const zone = document.getElementById(tId);
      if (zone) { zone.classList.remove('correct', 'wrong'); zone.classList.add(ok ? 'correct' : 'wrong'); }
    });
    if (done) {
      if (passed) showFeedback('correct');
      else if (revealed) showFeedback('wrongFinal');
      else showFeedback(cfg.revealBtnId ? 'pending' : 'wrongFinal');
      restoreFinal();
      return;
    }
    showFeedback('wrong1');
    render();
    if (cfg.hintBtnId) {
      const hintBtn = document.getElementById(cfg.hintBtnId);
      if (hintBtn) hintBtn.hidden = false;
    }
    const btn = document.getElementById(cfg.checkBtnId);
    if (btn) { btn.hidden = false; btn.textContent = 'צדקתי?'; btn.disabled = true; btn.onclick = check; }
  }

  return { reset: reset, getState: getState, setState: setState, restoreUI: restoreUI };
}

const TEXTS_S11_DQ = {
  correct: {
    title: 'נכון.',
    body: 'ביצוע חזרות וחישוב ממוצע הם הכלים הבסיסיים ביותר במדע כדי להתגבר על אי-ודאות במדידות.'
  },
  wrong1: {
    title: 'התשובה אינה נכונה במלואה.',
    body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?'
  },
  wrongFinal: {
    title: 'זו טעות. התשובה הנכונה מסומנת.',
    body: 'ביצוע חזרות וחישוב ממוצע הם הכלים הבסיסיים ביותר במדע כדי להתגבר על אי-ודאות במדידות.'
  },
  pending: {
    title: 'זו טעות.',
    body: 'רוצים לראות את הפתרון הנכון?'
  }
};

const dq11 = makeDragQuestion({
  /* xAPI: פריט 006 — השלמת משפט על חזרות וממוצע. */
  xapiItem: '006',
  prefix: 's11',
  screenSelector: '#s11',
  panelId: 's11-question-panel',
  checkBtnId: 's11-check',
  hintBtnId: 's11-hint',
  hintOverlayId: 's11-hint-overlay',
  feedboxId: 's11-feedbox',
  revealBtnId: 's11-reveal-btn',
  wordBankId: 's11-word-bank',
  gestureHintDragId: 's11-drag-hafhatot', // client asked for the hint on "הפחתות" specifically, not dragIds[0] ("חזרות")
  onContinue: function () { goTo(12); },
  onResult: function (outcome) {
    stationProgress.q11 = outcome;
    updateQuestionNav('s11');
  },
  labels: {
    's11-drag-hazarot': 'חזרות',
    's11-drag-mimutza': 'ממוצע',
    's11-drag-hafhatot': 'הפחתות',
    's11-drag-sikum': 'סיכום'
  },
  correctMap: {
    's11-target-1': 's11-drag-hazarot',
    's11-target-2': 's11-drag-mimutza'
  },
  texts: TEXTS_S11_DQ
});

function resetScreenState11() {
  updateQuestionNav('s11');
  dq11.reset();
}

/* =========================================================
   מסך 13 — מסך מעבר: דמות + בועית דיבור (Transition), הועתק ממסך 1
   (id="s0") של Methodica-science-mass-measure-02-02. דמות: placeholder
   זמני מתמונות מסך 1 (כמו במסך 10 לפני שסופקה פוזה ייעודית) — טרם
   סופקה פוזה ייעודית למסך הזה.
   ========================================================= */

const S12_AVATAR_ASSETS = {
  pink: 'assets/videos/pink-avatar-holds-weight.mp4',
  boy: 'assets/videos/boy-avatar-hold-golds.mp4'
};
preloadVideo(S12_AVATAR_ASSETS.pink);
preloadVideo(S12_AVATAR_ASSETS.boy);

function resetScreenState12() {
  resolveCharBubbleImg('s12-avatar-img', S12_AVATAR_ASSETS);
}

function s12Continue() {
  goTo(13);
}

/* =========================================================
   מסך 14 — מסך הסבר (לא שאלה) עם שלוש תמונות, פתיחה לתחנת "שאלה 1
   מתוך 6". אין כאן בדיקה/ניסיונות/רמז — "המשך" תמיד פעיל. סרגל ה-qnav
   סטטי (נבנה ישירות ב-HTML כ"שאלה 1 נוכחי") — אין עדיין מסכי שאלה
   בפועל בתחנה הזו שישנו את הסטייט שלו, ולכן אין עדיין JS-tracking
   גנרי (stationProgress) כמו במסכים 11+12; ייווסף כשייבנו מסכי השאלה
   האמיתיים של התחנה הזו.
   ========================================================= */

function resetScreenState13() {}

function s13Continue() {
  goTo(14);
}

/* =========================================================
   stationBProgress — מעקב תחנת "שאלה 1 מתוך 6" (מתחילה במסך 15).
   נפרד לחלוטין מ-stationProgress/updateQuestionNav של מסכים 11+12
   (שם 2 שאלות, תחנה אחרת). שאלה 1 כוללת שני סעיפים (א/ב) הפרושים על
   פני 2+ מסכים — לכן stationBQuestionNum (המספר המוצג כ"נוכחי")
   מתקדם רק כשה"שאלה" השלמה (כל סעיפיה) נגמרת, לא אוטומטית בכל מסך.
   ========================================================= */

let stationBQuestionNum = 1;
/* חמש שאלות, לא שש. התא השישי היה קיים כאן ובניווט אך לעולם לא התמלא:
   stationBQuestionNum מתקדם בדיוק חמש פעמים (שאלה 1 = סעיפים א+ב יחד,
   ואז מסכים 16, 17, 19, 21). הקטלוג מסכים — פריטים 007..011 הם חמישה. */
let stationBProgress = { 1: null, 2: null, 3: null, 4: null, 5: null };

function updateQuestionNavB(prefix) {
  for (let i = 1; i <= 5; i++) {
    const icon = document.getElementById(prefix + '-qnav-icon-' + i);
    const label = document.getElementById(prefix + '-qnav-label-' + i);
    if (!icon) continue;
    icon.className = 'qnav-icon';
    if (label) label.className = 'qnav-label';
    const state = stationBProgress[i];
    if (state === 'success') {
      icon.classList.add('qnav-success');
      if (label) label.classList.add('qnav-label-active');
    } else if (state === 'fail') {
      icon.classList.add('qnav-fail');
      if (label) label.classList.add('qnav-label-active');
    } else if (i === stationBQuestionNum) {
      icon.classList.add('qnav-current');
      if (label) label.classList.add('qnav-label-active');
    } else {
      icon.classList.add('qnav-future');
    }
  }
  for (let j = 1; j <= 4; j++) {
    const line = document.getElementById(prefix + '-qnav-line-' + j);
    if (!line) continue;
    line.className = 'qnav-line';
    if (stationBProgress[j] !== null) line.classList.add('line-done');
  }
}

/* שאלה 1 כוללת שני סעיפים (א/ב) — לפי בקשה מפורשת: אם אחד הסעיפים
   מגיע לניסיון שגוי סופי, כל השאלה נחשבת לא-נענתה-נכון (fail/X),
   גם אם הסעיף השני נענה נכון. stationBSectionDone נקרא פעם אחת מכל
   סעיף (a מסך 15/s14, b מסך 16/s15) ומחשב את התוצאה המשולבת רק אחרי
   ששני הסעיפים נגמרו. */
let stationBSectionResults = { a: null, b: null };

function stationBSectionDone(section, outcome) {
  stationBSectionResults[section] = outcome;
  if (stationBSectionResults.a === null || stationBSectionResults.b === null) return;
  stationBProgress[stationBQuestionNum] =
    (stationBSectionResults.a === 'success' && stationBSectionResults.b === 'success') ? 'success' : 'fail';
  stationBQuestionNum++;
}

/* =========================================================
   מסך 15 — שאלה 1 מתוך 6, סעיף א: SingleChoiceQuestion עם תמונה.
   הועתק ממסך 16 (id="s15") של Methodica-science-mass-measure-02-01.
   2 ניסיונות, רמז מוסתר עד ניסיון ראשון שגוי. תוכן: תסריט הפקה,
   שקפים 35-39. ⚠️ שאלה 1 כוללת גם סעיף ב (מסך 16) — סיום סעיף א כאן
   קורא ל-stationBSectionDone('a', ...) אבל התוצאה המשולבת (וה-qnav)
   מתעדכנים רק אחרי ששני הסעיפים נגמרים (ראו הערה למעלה).
   ========================================================= */

const S14 = {
  correctId: 'b',
  maxAttempts: 2,
  feedback: {
    correct: {
      title: 'התשובה נכונה.',
      body: 'דיוק מדעי חייב להיות מותאם לשינוי שאותו נרצה למדוד.\nידיעת סדר הגודל של הגדילה מאפשרת לבחור כלי מדידה רגיש מספיק, בלי להשתמש בציוד מורכב מדי ללא צורך.'
    },
    wrong1: {
      title: 'התשובה אינה נכונה.',
      body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?'
    },
    wrong2: {
      title: 'התשובה אינה נכונה.\n התשובה הנכונה מסומנת.',
      body: 'דיוק מדעי חייב להיות מותאם לשינוי שאותו נרצה למדוד.\nידיעת סדר הגודל של הגדילה מאפשרת לבחור כלי מדידה רגיש מספיק, בלי להשתמש בציוד מורכב מדי ללא צורך.'
    }
  }
};

let s14Selected = null;
let s14Attempts = 0;
let s14Done = false;
let s14Phase = 'before';

function s14OptEl(id) {
  return document.querySelector('#s14 .scq-opt[data-id="' + id + '"]');
}

function s14Select(id) {
  if (s14Done) return;
  const wasWrong1 = (s14Phase === 'wrong1');
  document.querySelectorAll('#s14 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const selectedEl = s14OptEl(id);
  selectedEl.classList.add('selected');
  selectedEl.setAttribute('aria-checked', 'true');
  s14Selected = id;
  s14Phase = 'selected';
  if (wasWrong1) {
    document.getElementById('s14-feedbox').classList.remove('visible');
  }
  const checkBtn = document.getElementById('s14-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = false;
  checkBtn.onclick = s14Check;
}

function s14ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s14-feedbox');
  const data = S14.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s14SetBarDone(label, handler) {
  const checkBtn = document.getElementById('s14-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  checkBtn.onclick = handler;
  document.getElementById('s14-hint').hidden = true;
}

function s14Check() {
  if (!s14Selected || s14Done) return;
  s14Attempts++;
  const optEl = s14OptEl(s14Selected);
  xapiAnswered('007', 'q1', s14Selected === S14.correctId,
    s14Selected === S14.correctId || s14Attempts >= S14.maxAttempts, xapiAnswerText(optEl));

  if (s14Selected === S14.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s14Phase = 'correct';
    s14Done = true;
    s14LockOptions();
    s14ShowFeedback('correct', true);
    s14SetBarDone('המשך', function () { goTo(15); });
    stationBSectionDone('a', 'success');
    /* resume: אחרי כל הבוקקיפינג ו**לפני** ה-return. */
    try { flushResumeSave(); } catch (e) {}
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s14Attempts < S14.maxAttempts) {
    s14Phase = 'wrong1';
    s14ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s14-check');
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = true;
    checkBtn.onclick = s14Check;
    const hintBtn = document.getElementById('s14-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s14OptEl(S14.correctId).classList.add('correct');
    s14Phase = 'wrong-final';
    s14Done = true;
    s14LockOptions();
    s14ShowFeedback('wrong2', false);
    s14SetBarDone('המשך', function () { goTo(15); });
    stationBSectionDone('a', 'fail');
  }
  try { flushResumeSave(); } catch (e) {}
}

function s14LockOptions() {
  document.querySelectorAll('#s14 .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}

function s14UnlockOptions() {
  document.querySelectorAll('#s14 .scq-opt').forEach(function (el) {
    el.classList.remove('disabled');
    el.onclick = function () { s14Select(el.dataset.id); };
  });
}

function s14OpenHint() {
  if (s14Done) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל. */
  xapiRequestedHint('007', 'q1');
  document.getElementById('s14-hint-overlay').hidden = false;
}

function s14CloseHint() {
  document.getElementById('s14-hint-overlay').hidden = true;
}

document.getElementById('s14-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s14CloseHint();
});

function resetScreenState14() {
  updateQuestionNavB('s14');
  if (s14Done || s14Attempts > 0 || s14Selected) return; // resume-state guard
  s14Selected = null;
  s14Attempts = 0;
  s14Phase = 'before';
  s14UnlockOptions();
  document.querySelectorAll('#s14 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s14-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s14-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = true;
  checkBtn.onclick = s14Check;
  const hintBtn = document.getElementById('s14-hint');
  hintBtn.hidden = true;
  hintBtn.disabled = false;
  document.getElementById('s14-hint-overlay').hidden = true;
}

document.querySelectorAll('#s14 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s14Select(opt.dataset.id);
    }
  });
});

/* =========================================================
   מסך 16 — שאלה 1 מתוך 6, סעיף ב: SCQ עם מסיחי-תמונה (לא טקסט).
   הועתק בהשראת מסך 1 (id="s1") של methodica-science-mass-liquid
   -01-02-main, מותאם למוסכמות הפרויקט הזה (ראו הערת ה-HTML). 2
   ניסיונות, רמז מוסתר עד ניסיון ראשון שגוי. תוכן: תסריט הפקה, שקפים
   40-44. סיום הסעיף קורא ל-stationBSectionDone('b', ...) שמסיים את
   התוצאה המשולבת של שאלה 1 (ראו הערה למעלה) ומקדם את הסרגל.
   ========================================================= */

const S15 = {
  correctId: 'lab',
  maxAttempts: 2,
  feedback: {
    correct: {
      title: 'נכון.',
      body: 'כדי לזהות שינוי של כ-0.1 גרם בשבוע, יש לבחור משקל המסוגל למדוד הבדלים קטנים מספיק.\nגם המאזניים האנליטיים יתאימו אבל אלה לרוב יהיו יקרים הרבה יותר.'
    },
    wrong1: {
      title: 'התשובה אינה נכונה.',
      body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?'
    },
    wrong2: {
      title: 'התשובה אינה נכונה. התשובה הנכונה מסומנת.',
      body: 'כדי לזהות שינוי של כ-0.1 גרם בשבוע, יש לבחור משקל המסוגל למדוד הבדלים קטנים מספיק.\nגם המאזניים האנליטיים יתאימו אבל אלה לרוב יהיו יקרים הרבה יותר.'
    }
  }
};

let s15Selected = null;
let s15Attempts = 0;
let s15Done = false;
let s15Phase = 'before';

function s15OptEl(id) {
  return document.querySelector('#s15 .s15-card[data-id="' + id + '"]');
}

function s15Select(id) {
  if (s15Done) return;
  const wasWrong1 = (s15Phase === 'wrong1');
  document.querySelectorAll('#s15 .s15-card').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const selectedEl = s15OptEl(id);
  selectedEl.classList.add('selected');
  selectedEl.setAttribute('aria-checked', 'true');
  s15Selected = id;
  s15Phase = 'selected';
  if (wasWrong1) {
    document.getElementById('s15-feedbox').classList.remove('visible');
  }
  const checkBtn = document.getElementById('s15-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = false;
  checkBtn.onclick = s15Check;
}

function s15ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s15-feedbox');
  const data = S15.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s15SetBarDone(label, handler) {
  const checkBtn = document.getElementById('s15-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  checkBtn.onclick = handler;
  document.getElementById('s15-hint').hidden = true;
}

function s15Check() {
  if (!s15Selected || s15Done) return;
  s15Attempts++;
  const optEl = s15OptEl(s15Selected);
  xapiAnswered('007', 'q2', s15Selected === S15.correctId,
    s15Selected === S15.correctId || s15Attempts >= S15.maxAttempts, xapiAnswerText(optEl));

  if (s15Selected === S15.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s15Phase = 'correct';
    s15Done = true;
    s15LockOptions();
    s15ShowFeedback('correct', true);
    s15SetBarDone('המשך', function () { goTo(16); });
    stationBSectionDone('b', 'success');
    updateQuestionNavB('s15');
    /* resume: אחרי כל הבוקקיפינג ו**לפני** ה-return. */
    try { flushResumeSave(); } catch (e) {}
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s15Attempts < S15.maxAttempts) {
    s15Phase = 'wrong1';
    s15ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s15-check');
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = true;
    checkBtn.onclick = s15Check;
    const hintBtn = document.getElementById('s15-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s15OptEl(S15.correctId).classList.add('correct');
    s15Phase = 'wrong-final';
    s15Done = true;
    s15LockOptions();
    s15ShowFeedback('wrong2', false);
    s15SetBarDone('המשך', function () { goTo(16); });
    stationBSectionDone('b', 'fail');
    updateQuestionNavB('s15');
  }
  try { flushResumeSave(); } catch (e) {}
}

function s15LockOptions() {
  document.querySelectorAll('#s15 .s15-card').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}

function s15UnlockOptions() {
  document.querySelectorAll('#s15 .s15-card').forEach(function (el) {
    el.classList.remove('disabled');
    el.onclick = function () { s15Select(el.dataset.id); };
  });
}

function s15OpenHint() {
  if (s15Done) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל. */
  xapiRequestedHint('007', 'q2');
  document.getElementById('s15-hint-overlay').hidden = false;
}

function s15CloseHint() {
  document.getElementById('s15-hint-overlay').hidden = true;
}

document.getElementById('s15-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s15CloseHint();
});

function resetScreenState15() {
  updateQuestionNavB('s15');
  if (s15Done || s15Attempts > 0 || s15Selected) return; // resume-state guard
  s15Selected = null;
  s15Attempts = 0;
  s15Phase = 'before';
  s15UnlockOptions();
  document.querySelectorAll('#s15 .s15-card').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s15-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s15-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = true;
  checkBtn.onclick = s15Check;
  const hintBtn = document.getElementById('s15-hint');
  hintBtn.hidden = true;
  hintBtn.disabled = false;
  document.getElementById('s15-hint-overlay').hidden = true;
}

document.querySelectorAll('#s15 .s15-card').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s15Select(opt.dataset.id);
    }
  });
});

/* =========================================================
   מסך 17 — שאלה 2 מתוך 6: כותרת+משפט, ומיד מתחת שורה עם שאלת הגרירה
   מימין + טבלת התוצאות משמאל (ראו styles.css להקשר על ביטול הגלילה,
   2026-09-08). שאלת הגרירה משתמשת ב-makeDragQuestion (אותו factory
   ממסך 12) — אינסטנס נוסף (dq16), לא קוד חדש.
   ========================================================= */

const TEXTS_S16_DQ = {
  correct: {
    title: 'תשובה נכונה.',
    body: 'זיהוי חריגות הוא שלב קריטי לניקוי שגיאות אקראיות וחישוב ממוצע אמין.'
  },
  wrong1: {
    title: 'התשובה אינה נכונה.',
    body: 'לא נורא, תרגול עושה את ההבדל.\nננסה שוב?'
  },
  wrongFinal: {
    title: 'התשובה אינה נכונה.\nהתשובה הנכונה מסומנת.',
    body: 'זיהוי חריגות הוא שלב קריטי לניקוי שגיאות אקראיות וחישוב ממוצע אמין.'
  },
  pending: {
    title: 'התשובה אינה נכונה.',
    body: 'רוצים לראות את הפתרון הנכון?'
  }
};

const dq16 = makeDragQuestion({
  /* xAPI: פריט 008 — זיהוי מדידה חריגה וחישוב ממוצע. */
  xapiItem: '008',
  prefix: 's16',
  screenSelector: '#s16',
  panelId: 's16-question-panel',
  checkBtnId: 's16-check',
  hintBtnId: 's16-hint',
  hintOverlayId: 's16-hint-overlay',
  feedboxId: 's16-feedbox',
  revealBtnId: 's16-reveal-btn',
  onContinue: function () { goTo(17); },
  onResult: function (outcome) {
    stationBProgress[stationBQuestionNum] = outcome;
    stationBQuestionNum++;
    updateQuestionNavB('s16');
  },
  labels: {
    's16-drag-590': '5.90',
    's16-drag-510': '5.10',
    's16-drag-meduyeket': 'מדויקת',
    's16-drag-hariga': 'תוצאה חריגה',
    's16-drag-shgiat': 'שגיאת מדידה',
    's16-drag-1532': '15.32'
  },
  correctMap: {
    's16-target-1': 's16-drag-590',
    's16-target-2': 's16-drag-hariga',
    's16-target-3': 's16-drag-510'
  },
  texts: TEXTS_S16_DQ
});

function resetScreenState16() {
  updateQuestionNavB('s16');
  dq16.reset();
}

/* =========================================================
   מסך 18 — שאלה 3 מתוך 6: גרירה, התאמת טקסט לתמונה. מנגנון native
   HTML5 drag&drop, מבוסס ישירות על s20* של Methodica-science-mass
   -measure-02-01 (לא makeDragQuestion factory — מנגנון שונה: ולידציה
   per-zone, לא מילוי-חסר-במשפט). 2 ניסיונות, רמז מוסתר עד ניסיון
   ראשון שגוי. תוכן: תסריט הפקה, שקפים 51-55.
   ========================================================= */

const S17_ITEM_IDS = ['s17i-rice', 's17i-gold', 's17i-drug'];
const S17_ZONE_IDS = ['kitchen', 'lab', 'analytic'];
const TEXTS17 = {
  correct: {
    title: 'תשובה נכונה.',
    body: 'יש שיפור מתרגיל לתרגיל 😊\n\nנבחר מאזניים לפי רמת הדיוק הדרושה למשימה.\nככל שטעות קטנה עלולה להיות בעלת השלכות כספיות או בריאותיות גדולות יותר, נדרשים מאזניים מדויקים יותר.'
  },
  wrong1: {
    title: 'התשובה אינה נכונה.',
    body: 'לא נורא, נלמד ונשתפר מתרגיל לתרגיל.\nננסה שוב?'
  },
  wrong2: {
    title: 'זו טעות. התשובה הנכונה מסומנת.',
    body: 'נלמד ונשתפר מתרגיל לתרגיל 😊\n\nנבחר מאזניים לפי רמת הדיוק הדרושה למשימה.\nככל שטעות קטנה עלולה להיות בעלת השלכות כספיות או בריאותיות גדולות יותר, נדרשים מאזניים מדויקים יותר.'
  },
  pending: {
    title: 'התשובה אינה נכונה.',
    body: 'רוצים לראות את הפתרון הנכון?'
  }
};

let s17Done = false;
let s17Attempts = 0;
let s17HintShown = false;
let s17DragId = null;
let s17AnswerSnapshot = null; // הפלייסמנט של הלומד ברגע הניסיון השני הכושל (item id → zone id | 'source')
let s17Revealed = false;
/* resume: נשמר במפורש. אחרי reveal אין ב-DOM דבר שמבדיל בין "פתר נכון"
   לבין "חשף את הפתרון", ואין כאן משתנה phase. */
let s17Passed = false;

function s17AllPlaced() {
  return S17_ITEM_IDS.every(function (id) {
    const el = document.getElementById(id);
    return el && el.parentElement && el.parentElement.id !== 's17-source-bank';
  });
}

function s17UpdateCheckBtn() {
  document.getElementById('s17-check').disabled = !s17AllPlaced();
}

function s17ClearZoneStates() {
  S17_ZONE_IDS.forEach(function (z) {
    document.getElementById('s17-zone-' + z).classList.remove('correct', 'wrong', 's17-drag-over');
  });
}

function s17DragStart(event, itemId) {
  s17DragId = itemId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', itemId);
  setTimeout(function () {
    const el = document.getElementById(itemId);
    if (el) el.classList.add('s17-dragging');
  }, 0);
}

function s17DragEnd(itemId) {
  const el = document.getElementById(itemId);
  if (el) el.classList.remove('s17-dragging');
  s17DragId = null;
}

function s17DragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function s17DragEnter(event, zoneId) {
  event.preventDefault();
  document.getElementById(zoneId).classList.add('s17-drag-over');
}

function s17DragLeave(event, zoneId) {
  const zone = document.getElementById(zoneId);
  if (zone && !zone.contains(event.relatedTarget)) {
    zone.classList.remove('s17-drag-over');
  }
}

function s17Drop(event, targetZone) {
  event.preventDefault();
  if (s17Done) return;
  const itemId = event.dataTransfer.getData('text/plain') || s17DragId;
  if (!itemId) return;
  const zoneEl = document.getElementById('s17-zone-' + targetZone);
  const itemEl = document.getElementById(itemId);
  if (zoneEl && itemEl) {
    zoneEl.classList.remove('s17-drag-over');
    /* רק פריט אחד מותר בכל תא שחרור בו-זמנית — בקשה מפורשת (2026-09-08).
       אם כבר יש פריט אחר באזור היעד, הוא מוחזר למחסן המקור לפני שהפריט
       הנגרר נכנס, לפי אותה מוסכמת "החלפה" כמו ב-makeDragQuestion.drop(). */
    const existing = zoneEl.querySelector('.s17-drag-item');
    if (existing && existing !== itemEl) {
      document.getElementById('s17-source-bank').appendChild(existing);
    }
    if (itemEl.parentElement) itemEl.parentElement.removeChild(itemEl);
    zoneEl.appendChild(itemEl);
  }
  s17UpdateCheckBtn();
  s17ClearZoneStates();
}

function s17DropToSource(event) {
  event.preventDefault();
  if (s17Done) return;
  const itemId = event.dataTransfer.getData('text/plain') || s17DragId;
  if (!itemId) return;
  const sourceBank = document.getElementById('s17-source-bank');
  const itemEl = document.getElementById(itemId);
  if (itemEl && sourceBank && itemEl.parentElement !== sourceBank) {
    if (itemEl.parentElement) itemEl.parentElement.removeChild(itemEl);
    sourceBank.appendChild(itemEl);
  }
  s17UpdateCheckBtn();
  s17ClearZoneStates();
}

function s17ItemClick(itemId) {
  // לחיצה = חזרה למחסן המילים (fallback לאינטראקציית מגע/נגישות)
  if (s17Done) return;
  const el = document.getElementById(itemId);
  const sourceBank = document.getElementById('s17-source-bank');
  if (!el || !sourceBank || el.parentElement === sourceBank) return;
  el.parentElement.removeChild(el);
  sourceBank.appendChild(el);
  s17ClearZoneStates();
  s17UpdateCheckBtn();
}

function s17SnapshotPlacement() {
  const snap = {};
  S17_ITEM_IDS.forEach(function (id) {
    const parent = document.getElementById(id).parentElement;
    snap[id] = (parent && parent.id !== 's17-source-bank') ? parent.id.replace('s17-zone-', '') : 'source';
  });
  return snap;
}

function s17RestoreSnapshot(snap) {
  S17_ITEM_IDS.forEach(function (id) {
    const item = document.getElementById(id);
    if (item.parentElement) item.parentElement.removeChild(item);
    const dest = snap[id] === 'source' ? document.getElementById('s17-source-bank') : document.getElementById('s17-zone-' + snap[id]);
    dest.appendChild(item);
  });
  S17_ZONE_IDS.forEach(function (zoneId) {
    const zoneEl = document.getElementById('s17-zone-' + zoneId);
    const items = zoneEl.querySelectorAll('.s17-drag-item');
    let zoneOk = items.length > 0;
    items.forEach(function (item) { if (item.dataset.correct !== zoneId) zoneOk = false; });
    zoneEl.classList.remove('correct', 'wrong', 's17-drag-over');
    zoneEl.classList.add(zoneOk ? 'correct' : 'wrong');
  });
}

function s17ToggleReveal() {
  const revealBtn = document.getElementById('s17-reveal-btn');
  if (!s17Revealed) {
    s17RevealCorrect();
    s17ShowFeedback('wrong2', false);
    s17Revealed = true;
    if (revealBtn) revealBtn.textContent = 'התשובה שלי';
  } else {
    s17RestoreSnapshot(s17AnswerSnapshot);
    s17ShowFeedback('pending', false);
    s17Revealed = false;
    if (revealBtn) revealBtn.textContent = 'התשובה הנכונה';
  }
}

function s17RevealCorrect() {
  S17_ITEM_IDS.forEach(function (id) {
    const item = document.getElementById(id);
    const zoneEl = document.getElementById('s17-zone-' + item.dataset.correct);
    if (item.parentElement) item.parentElement.removeChild(item);
    zoneEl.appendChild(item);
  });
  S17_ZONE_IDS.forEach(function (zoneId) {
    const zoneEl = document.getElementById('s17-zone-' + zoneId);
    zoneEl.classList.remove('wrong', 's17-drag-over');
    zoneEl.classList.add('correct');
  });
}

function s17ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s17-feedbox');
  const data = TEXTS17[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s17Check() {
  if (s17Done) return;
  s17Attempts++;

  let allCorrect = true;
  S17_ZONE_IDS.forEach(function (zoneId) {
    const zoneEl = document.getElementById('s17-zone-' + zoneId);
    const items = zoneEl.querySelectorAll('.s17-drag-item');
    let zoneOk = items.length > 0;
    items.forEach(function (item) {
      if (item.dataset.correct !== zoneId) zoneOk = false;
    });
    zoneEl.classList.toggle('correct', zoneOk);
    zoneEl.classList.toggle('wrong', !zoneOk);
    if (!zoneOk) allCorrect = false;
  });

  /* xAPI: **אחרי** לולאת האזורים, כי allCorrect סופי רק בסופה.
     כאן — ורק כאן בפרויקט — האזורים באמת בתבנית s17-zone-<id> והפריטים
     נושאים class המכיל "drag-item", ולכן xapiZoneAnswer מתאים כמות שהוא. */
  xapiAnswered('009', 'q1', allCorrect, allCorrect || s17Attempts >= 2,
    xapiZoneAnswer('s17', S17_ZONE_IDS));

  const checkBtn = document.getElementById('s17-check');
  if (allCorrect) {
    s17Done = true;
    s17Passed = true;
    s17ShowFeedback('correct', true);
    checkBtn.textContent = 'המשך';
    checkBtn.disabled = false;
    checkBtn.onclick = function () { goTo(18); };
    document.getElementById('s17-hint').hidden = true;
    stationBProgress[stationBQuestionNum] = 'success';
    stationBQuestionNum++;
    updateQuestionNavB('s17');
  } else if (s17Attempts >= 2) {
    s17Done = true;
    s17Passed = false;
    s17AnswerSnapshot = s17SnapshotPlacement(); // לפני כל reveal
    s17Revealed = false;
    s17ShowFeedback('pending', false);
    const revealBtn = document.getElementById('s17-reveal-btn');
    if (revealBtn) { revealBtn.hidden = false; revealBtn.textContent = 'התשובה הנכונה'; }
    checkBtn.textContent = 'המשך';
    checkBtn.disabled = false;
    checkBtn.onclick = function () { goTo(18); };
    document.getElementById('s17-hint').hidden = true;
    stationBProgress[stationBQuestionNum] = 'fail';
    stationBQuestionNum++;
    updateQuestionNavB('s17');
  } else {
    s17ShowFeedback('wrong1', false);
    checkBtn.disabled = true;
    if (!s17HintShown) {
      s17HintShown = true;
      const hintBtn = document.getElementById('s17-hint');
      hintBtn.hidden = false;
      hintBtn.disabled = false;
    }
  }
  try { flushResumeSave(); } catch (e) {}
}

function s17OpenHint() {
  if (s17Done) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל. */
  xapiRequestedHint('009', 'q1');
  document.getElementById('s17-hint-overlay').hidden = false;
}

function s17CloseHint() {
  document.getElementById('s17-hint-overlay').hidden = true;
}

document.getElementById('s17-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s17CloseHint();
});

function resetScreenState17() {
  updateQuestionNavB('s17');
  const hasProgress = s17Done || s17Attempts > 0 || s17HintShown || S17_ITEM_IDS.some(function (id) {
    const el = document.getElementById(id);
    return el && el.parentElement && el.parentElement.id !== 's17-source-bank';
  });
  if (hasProgress) return; // resume-state: לא מאפסים ניסיון/הצבה שכבר קיימים

  s17Attempts = 0;
  s17HintShown = false;
  s17DragId = null;
  s17AnswerSnapshot = null;
  s17Revealed = false;

  const sourceBank = document.getElementById('s17-source-bank');
  S17_ITEM_IDS.forEach(function (id) {
    const el = document.getElementById(id);
    if (el && el.parentElement !== sourceBank) {
      el.parentElement.removeChild(el);
      sourceBank.appendChild(el);
    }
  });

  s17ClearZoneStates();
  document.getElementById('s17-feedbox').classList.remove('visible');
  document.getElementById('s17-hint-overlay').hidden = true;

  const checkBtn = document.getElementById('s17-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = true;
  checkBtn.onclick = s17Check;
  const hintBtn = document.getElementById('s17-hint');
  hintBtn.hidden = true;
  hintBtn.disabled = false;
  const revealBtn = document.getElementById('s17-reveal-btn');
  if (revealBtn) { revealBtn.hidden = true; revealBtn.textContent = 'התשובה הנכונה'; }

  /* Gesture Hint — Cursor Drag (SELF-QA.md §7). "First draggable element" = first DOM child of the
     source bank, not S17_ITEM_IDS[0] (that array's own order is 'rice'/'gold'/'drug' — unrelated to
     the visual left-to-right order the learner actually sees). Only reached on a genuinely fresh
     entry (hasProgress already returned above otherwise), matching makeDragQuestion()'s own
     show-once call site. */
  showDragGestureHint(document.querySelector('#s17-source-bank .s17-drag-item'));
}

/* =========================================================
   מסך 19 — הקדמה לשאלה 4: שתי דמויות מתווכחות. מסך סטטי, בלי qnav
   (כמו מסך 14) — "המשך" תמיד פעיל.
   ========================================================= */

function resetScreenState18() {}

function s18Continue() {
  goTo(19);
}

/* =========================================================
   מסך 20 — שאלה 4 מתוך 6: SingleChoiceQuestion בלי תמונה. שכפול מדויק
   של מסך 15 (S14). שאלה בסעיף יחיד (לא כמו שאלה 1) — סיום ישיר מעדכן
   את stationBProgress/stationBQuestionNum. 2 ניסיונות, רמז מוסתר עד
   ניסיון ראשון שגוי. תוכן: תסריט הפקה, שקפים 57-61.
   ========================================================= */

const S19 = {
  correctId: 'b',
  maxAttempts: 2,
  feedback: {
    correct: {
      title: 'נכון.',
      body: 'ככל שערך החומר גבוה יותר, כך נדרש דיוק גבוה יותר.'
    },
    wrong1: {
      title: 'התשובה אינה נכונה.',
      body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?'
    },
    wrong2: {
      title: 'התשובה אינה נכונה.\nהתשובה הנכונה מסומנת.',
      body: 'ככל שערך החומר גבוה יותר, כך נדרש דיוק גבוה יותר.'
    }
  }
};

let s19Selected = null;
let s19Attempts = 0;
let s19Done = false;
let s19Phase = 'before';

function s19OptEl(id) {
  return document.querySelector('#s19 .scq-opt[data-id="' + id + '"]');
}

function s19Select(id) {
  if (s19Done) return;
  const wasWrong1 = (s19Phase === 'wrong1');
  document.querySelectorAll('#s19 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const selectedEl = s19OptEl(id);
  selectedEl.classList.add('selected');
  selectedEl.setAttribute('aria-checked', 'true');
  s19Selected = id;
  s19Phase = 'selected';
  if (wasWrong1) {
    document.getElementById('s19-feedbox').classList.remove('visible');
  }
  const checkBtn = document.getElementById('s19-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = false;
  checkBtn.onclick = s19Check;
}

function s19ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s19-feedbox');
  const data = S19.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s19SetBarDone(label, handler) {
  const checkBtn = document.getElementById('s19-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  checkBtn.onclick = handler;
  document.getElementById('s19-hint').hidden = true;
}

function s19Check() {
  if (!s19Selected || s19Done) return;
  s19Attempts++;
  const optEl = s19OptEl(s19Selected);
  xapiAnswered('010', 'q1', s19Selected === S19.correctId,
    s19Selected === S19.correctId || s19Attempts >= S19.maxAttempts, xapiAnswerText(optEl));

  if (s19Selected === S19.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s19Phase = 'correct';
    s19Done = true;
    s19LockOptions();
    s19ShowFeedback('correct', true);
    s19SetBarDone('המשך', function () { goTo(20); });
    stationBProgress[stationBQuestionNum] = 'success';
    stationBQuestionNum++;
    updateQuestionNavB('s19');
    /* resume: אחרי כל הבוקקיפינג ו**לפני** ה-return. */
    try { flushResumeSave(); } catch (e) {}
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s19Attempts < S19.maxAttempts) {
    s19Phase = 'wrong1';
    s19ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s19-check');
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = true;
    checkBtn.onclick = s19Check;
    const hintBtn = document.getElementById('s19-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s19OptEl(S19.correctId).classList.add('correct');
    s19Phase = 'wrong-final';
    s19Done = true;
    s19LockOptions();
    s19ShowFeedback('wrong2', false);
    s19SetBarDone('המשך', function () { goTo(20); });
    stationBProgress[stationBQuestionNum] = 'fail';
    stationBQuestionNum++;
    updateQuestionNavB('s19');
  }
  try { flushResumeSave(); } catch (e) {}
}

function s19LockOptions() {
  document.querySelectorAll('#s19 .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}

function s19UnlockOptions() {
  document.querySelectorAll('#s19 .scq-opt').forEach(function (el) {
    el.classList.remove('disabled');
    el.onclick = function () { s19Select(el.dataset.id); };
  });
}

function s19OpenHint() {
  if (s19Done) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל. */
  xapiRequestedHint('010', 'q1');
  document.getElementById('s19-hint-overlay').hidden = false;
}

function s19CloseHint() {
  document.getElementById('s19-hint-overlay').hidden = true;
}

document.getElementById('s19-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s19CloseHint();
});

function resetScreenState19() {
  updateQuestionNavB('s19');
  if (s19Done || s19Attempts > 0 || s19Selected) return; // resume-state guard
  s19Selected = null;
  s19Attempts = 0;
  s19Phase = 'before';
  s19UnlockOptions();
  document.querySelectorAll('#s19 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s19-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s19-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = true;
  checkBtn.onclick = s19Check;
  const hintBtn = document.getElementById('s19-hint');
  hintBtn.hidden = true;
  hintBtn.disabled = false;
  document.getElementById('s19-hint-overlay').hidden = true;
}

document.querySelectorAll('#s19 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s19Select(opt.dataset.id);
    }
  });
});

/* =========================================================
   מסך 21 — הקדמה לשאלה 5: טקסט + תמונה. מסך סטטי, בלי qnav (כמו מסך
   14/19) — "המשך" תמיד פעיל.
   ========================================================= */

function resetScreenState20() {}

function s20Continue() {
  goTo(21);
}

/* =========================================================
   מסך 22 — שאלה 5 מתוך 6: SingleChoiceQuestion עם תמונה. שכפול מדויק
   של מסך 15 (S14) עם תמונה. שאלה בסעיף יחיד — סיום ישיר מעדכן את
   stationBProgress/stationBQuestionNum. 2 ניסיונות, רמז מוסתר עד
   ניסיון ראשון שגוי. תוכן: תסריט הפקה, שקפים 63-67.
   ========================================================= */

const S21 = {
  correctId: 'd',
  maxAttempts: 2,
  feedback: {
    correct: {
      title: 'תשובה נכונה.',
      body: 'טעות של 1 גרם לחנוכיה במסה של 150 גרם מהווה רק 0.7% טעות במסה וכמעט לא משפיעה.\nלעומתה טעות של 1 גרם בשרשרת של 2.3 גרם מהווה 43% טעות במסה, וזו טעות קריטית.'
    },
    wrong1: {
      title: 'התשובה אינה נכונה.',
      body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?'
    },
    wrong2: {
      title: 'התשובה לא נכונה. התשובה הנכונה מסומנת.',
      body: 'טעות של 1 גרם לחנוכיה במסה של 150 גרם מהווה רק 0.7% טעות במסה וכמעט לא משפיעה.\nלעומתה טעות של 1 גרם בשרשרת של 2.3 גרם מהווה 43% טעות במסה, וזו טעות קריטית.'
    }
  }
};

let s21Selected = null;
let s21Attempts = 0;
let s21Done = false;
let s21Phase = 'before';

function s21OptEl(id) {
  return document.querySelector('#s21 .scq-opt[data-id="' + id + '"]');
}

function s21Select(id) {
  if (s21Done) return;
  const wasWrong1 = (s21Phase === 'wrong1');
  document.querySelectorAll('#s21 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const selectedEl = s21OptEl(id);
  selectedEl.classList.add('selected');
  selectedEl.setAttribute('aria-checked', 'true');
  s21Selected = id;
  s21Phase = 'selected';
  if (wasWrong1) {
    document.getElementById('s21-feedbox').classList.remove('visible');
  }
  const checkBtn = document.getElementById('s21-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = false;
  checkBtn.onclick = s21Check;
}

function s21ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s21-feedbox');
  const data = S21.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s21SetBarDone(label, handler) {
  const checkBtn = document.getElementById('s21-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  checkBtn.onclick = handler;
  document.getElementById('s21-hint').hidden = true;
}

function s21Check() {
  if (!s21Selected || s21Done) return;
  s21Attempts++;
  const optEl = s21OptEl(s21Selected);
  xapiAnswered('011', 'q1', s21Selected === S21.correctId,
    s21Selected === S21.correctId || s21Attempts >= S21.maxAttempts, xapiAnswerText(optEl));

  if (s21Selected === S21.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s21Phase = 'correct';
    s21Done = true;
    s21LockOptions();
    s21ShowFeedback('correct', true);
    /* קישור בין סינים: מסך אחרון בסיין 1 -> מסך ראשון בסיין 2 (נתיב יחסי,
       אותה מוסכמה בדיוק כמו בפרויקט הקודם, Methodica-science-mass
       -measure-02-linked). goTo(22) היה no-op (TOTAL_SCREENS=22). */
    s21SetBarDone('המשך', s21Finish);
    stationBProgress[stationBQuestionNum] = 'success';
    stationBQuestionNum++;
    updateQuestionNavB('s21');
    /* resume: אחרי כל הבוקקיפינג ו**לפני** ה-return. */
    try { flushResumeSave(); } catch (e) {}
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s21Attempts < S21.maxAttempts) {
    s21Phase = 'wrong1';
    s21ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s21-check');
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = true;
    checkBtn.onclick = s21Check;
    const hintBtn = document.getElementById('s21-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s21OptEl(S21.correctId).classList.add('correct');
    s21Phase = 'wrong-final';
    s21Done = true;
    s21LockOptions();
    s21ShowFeedback('wrong2', false);
    /* קישור בין סינים: מסך אחרון בסיין 1 -> מסך ראשון בסיין 2 (נתיב יחסי,
       אותה מוסכמה בדיוק כמו בפרויקט הקודם, Methodica-science-mass
       -measure-02-linked). goTo(22) היה no-op (TOTAL_SCREENS=22). */
    s21SetBarDone('המשך', s21Finish);
    stationBProgress[stationBQuestionNum] = 'fail';
    stationBQuestionNum++;
    updateQuestionNavB('s21');
  }
  try { flushResumeSave(); } catch (e) {}
}

function s21LockOptions() {
  document.querySelectorAll('#s21 .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}

function s21UnlockOptions() {
  document.querySelectorAll('#s21 .scq-opt').forEach(function (el) {
    el.classList.remove('disabled');
    el.onclick = function () { s21Select(el.dataset.id); };
  });
}

function s21OpenHint() {
  if (s21Done) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל. */
  xapiRequestedHint('011', 'q1');
  document.getElementById('s21-hint-overlay').hidden = false;
}

function s21CloseHint() {
  document.getElementById('s21-hint-overlay').hidden = true;
}

document.getElementById('s21-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s21CloseHint();
});

function resetScreenState21() {
  updateQuestionNavB('s21');
  if (s21Done || s21Attempts > 0 || s21Selected) return; // resume-state guard
  s21Selected = null;
  s21Attempts = 0;
  s21Phase = 'before';
  s21UnlockOptions();
  document.querySelectorAll('#s21 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s21-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s21-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = true;
  checkBtn.onclick = s21Check;
  const hintBtn = document.getElementById('s21-hint');
  hintBtn.hidden = true;
  hintBtn.disabled = false;
  document.getElementById('s21-hint-overlay').hidden = true;
}

document.querySelectorAll('#s21 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s21Select(opt.dataset.id);
    }
  });
});

/* =========================================================
   פופ-אפ משוב גריר — לפי "Feedback popup system" (720-templates
   skill): גרירה מוגבלת לגבולות הקנבס, איפוס למיקום ברירת המחדל
   בכל פתיחה, כפתור סגירה (X) שלא נוגע בסטייט התשובה.
   קרא scqFbMakeDraggable('<box-id>') פעם אחת באתחול לכל תיבת
   משוב שנוספת למסך חדש.
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
   הגדלת תמונה (img-zoom) — רכיב גלובלי יחיד, לפי מפרט
   720-templates _global-components.md ("Image zoom"). עובד על
   כל תמונה שהתווית שלה מקבלת כפתור .img-zoom-btn עם
   data-zoom-src — לא מוגבל לפריים ספציפי, כי הכפתור תמיד יושב
   ישירות בתוך ה-wrapper של התמונה (ראו מפרט המרקאפ בסקיל).
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
scqFbMakeDraggable('s5-feedbox');
scqFbMakeDraggable('s6-feedbox');
scqFbMakeDraggable('s8-feedbox');
scqFbMakeDraggable('s10-feedbox');
scqFbMakeDraggable('s11-feedbox');
scqFbMakeDraggable('s14-feedbox');
scqFbMakeDraggable('s15-feedbox');
scqFbMakeDraggable('s16-feedbox');
scqFbMakeDraggable('s17-feedbox');
scqFbMakeDraggable('s19-feedbox');
scqFbMakeDraggable('s21-feedbox');

/* ═══════════════════ resume — ארבעת ה-hooks של הסין ═══════════════════
   הסין הגדול ביותר: 14 מסכים שניתן לענות בהם, שישה סוגי אינטראקציה, ארבעה
   מתגי "התשובה הנכונה" ושתי מערכות qnav. */

function capturePartPayload() {
  var st = { currentScreen: currentScreen };
  st.qResults = Object.assign({}, XAPI_Q_RESULTS);

  /* שתי התחנות. מפות פר-סין שאינן נגישות מהשכבה המשותפת. */
  st.stations = Object.assign({}, stationProgress);     /* מסכים 10, 11 */
  st.stationsB = Object.assign({}, stationBProgress);   /* מסכים 14-21 */
  /* ⚠️ הסמן, לא רק המפה. updateQuestionNavB מצייר "נוכחי" ממנו, ו-s17/s19/s21
     **כותבים** ל-stationBProgress[stationBQuestionNum]. שחזור המפה בלי הסמן
     היה גורם למסך הבא שנענה לדרוס משבצת שכבר הוכרעה. */
  st.stationBNum = stationBQuestionNum;
  /* שאלה 1 פרושה על שני מסכים (14=א, 15=ב) ותוצאתה המשולבת נקבעת רק
     כששניהם נוחתים. בלי זה, ריענון בין השניים היה מאבד את הציון. */
  st.stationBSections = Object.assign({}, stationBSectionResults);

  st.s2Selected = s2Selected;      /* מסך 2 — שאלת דעה, שער "המשך" בלבד */
  st.s4Path = s4SelectedPath;      /* מסך 4 — מחליט 5 מול 6; אובדנו מפצל מסלול */

  /* מסכים 5/6 — קלט מספרי עם מתג חשיפה. שלושת הערכים יחד:
     vals = מה שמוצג עכשיו (אולי הפתרון), snap = תשובת הלומד,
     revealed = מי מהם על המסך. */
  st.viq = { att: {}, done: {}, snap: {}, revealed: {}, vals: {} };
  [5, 6].forEach(function (n) {
    st.viq.att[n] = viqAttempts[n] || 0;
    st.viq.done[n] = !!viqDone[n];
    st.viq.snap[n] = (typeof viqAnswerSnapshot[n] === 'string') ? viqAnswerSnapshot[n] : null;
    st.viq.revealed[n] = !!viqRevealed[n];
    var cfg = VIQ_SCREENS[n];
    var el = cfg && document.getElementById(cfg.inputId);
    st.viq.vals[n] = el ? el.value : '';
  });

  st.scq = {
    s8:  { sel: s8Selected,  att: s8Attempts,  done: s8Done,  phase: s8Phase  },
    s10: { sel: s10Selected, att: s10Attempts, done: s10Done, phase: s10Phase },
    s14: { sel: s14Selected, att: s14Attempts, done: s14Done, phase: s14Phase },
    s15: { sel: s15Selected, att: s15Attempts, done: s15Done, phase: s15Phase },
    s19: { sel: s19Selected, att: s19Attempts, done: s19Done, phase: s19Phase },
    s21: { sel: s21Selected, att: s21Attempts, done: s21Done, phase: s21Phase }
  };

  st.dq11 = dq11.getState();
  st.dq16 = dq16.getState();

  /* מסך 17 — גרירה בכתב יד: המיקום **הוא** ההורות ב-DOM.
     place = מה שעל המסך עכשיו (אחרי reveal — הפתרון), snap = של הלומד. */
  st.s17 = {
    place: s17SnapshotPlacement(),
    snap: s17AnswerSnapshot ? Object.assign({}, s17AnswerSnapshot) : null,
    revealed: s17Revealed, done: s17Done, att: s17Attempts,
    hint: s17HintShown, passed: s17Passed
  };
  /* s17DragId לא נשמר במכוון: scratch של גרירה חיה, null בין גרירות, וערך
     ישן היה גורם ל-s17Drop לפעול על פריט רפאים. */
  return st;
}

function applyResumeVars(st) {
  if (!st) return;
  if (st.qResults) Object.keys(st.qResults).forEach(function (k) { XAPI_Q_RESULTS[k] = st.qResults[k]; });
  if (st.stations) Object.keys(st.stations).forEach(function (k) { stationProgress[k] = st.stations[k]; });
  if (st.stationsB) Object.keys(st.stationsB).forEach(function (k) { stationBProgress[k] = st.stationsB[k]; });
  if (typeof st.stationBNum === 'number') stationBQuestionNum = st.stationBNum;
  if (st.stationBSections) Object.keys(st.stationBSections).forEach(function (k) { stationBSectionResults[k] = st.stationBSections[k]; });

  if (typeof st.s2Selected === 'string') s2Selected = st.s2Selected;
  if (typeof st.s4Path === 'string') s4SelectedPath = st.s4Path;

  if (st.viq) [5, 6].forEach(function (n) {
    viqAttempts[n] = (st.viq.att && st.viq.att[n]) || 0;
    viqDone[n] = !!(st.viq.done && st.viq.done[n]);
    viqAnswerSnapshot[n] = (st.viq.snap && typeof st.viq.snap[n] === 'string') ? st.viq.snap[n] : null;
    viqRevealed[n] = !!(st.viq.revealed && st.viq.revealed[n]);
  });

  if (st.scq) {
    var S = st.scq;
    if (S.s8)  { s8Selected  = S.s8.sel  || null; s8Attempts  = S.s8.att  || 0; s8Done  = !!S.s8.done;  s8Phase  = S.s8.phase  || 'before'; }
    if (S.s10) { s10Selected = S.s10.sel || null; s10Attempts = S.s10.att || 0; s10Done = !!S.s10.done; s10Phase = S.s10.phase || 'before'; }
    if (S.s14) { s14Selected = S.s14.sel || null; s14Attempts = S.s14.att || 0; s14Done = !!S.s14.done; s14Phase = S.s14.phase || 'before'; }
    if (S.s15) { s15Selected = S.s15.sel || null; s15Attempts = S.s15.att || 0; s15Done = !!S.s15.done; s15Phase = S.s15.phase || 'before'; }
    if (S.s19) { s19Selected = S.s19.sel || null; s19Attempts = S.s19.att || 0; s19Done = !!S.s19.done; s19Phase = S.s19.phase || 'before'; }
    if (S.s21) { s21Selected = S.s21.sel || null; s21Attempts = S.s21.att || 0; s21Done = !!S.s21.done; s21Phase = S.s21.phase || 'before'; }
  }

  /* ⚠️ לפני goTo: reset() של הפקטורי בודק hasProgress מתוך placement/attempts,
     וכך resetInitial() (שמערבב מחדש ומוחק גרירות) נמנע כראוי. */
  if (st.dq11) dq11.setState(st.dq11);
  if (st.dq16) dq16.setState(st.dq16);

  if (st.s17) {
    s17Done = !!st.s17.done;
    s17Attempts = st.s17.att || 0;
    s17HintShown = !!st.s17.hint;
    s17Revealed = !!st.s17.revealed;
    s17AnswerSnapshot = st.s17.snap ? Object.assign({}, st.s17.snap) : null;
    s17Passed = !!st.s17.passed;
    s17DragId = null;
    __s17Place = st.s17.place || null;
  }
}

var __s17Place = null;

function applyResumeDom(st) {
  if (!st) return;
  /* מסכים 5/6 — ערך הקלט חי רק ב-DOM. מוצב כאן, לפני הצייר שמשבית אותו. */
  if (st.viq && st.viq.vals) [5, 6].forEach(function (n) {
    var cfg = VIQ_SCREENS[n];
    var el = cfg && document.getElementById(cfg.inputId);
    if (el && typeof st.viq.vals[n] === 'string') el.value = st.viq.vals[n];
  });
  /* מסך 17 — מחזירים את הפריטים להורות ה-DOM שלהם. s17RestoreSnapshot עושה
     בדיוק את זה **וגם** מסמן את האזורים, ולכן הוא מופעל רק כשיש כבר ניסיון;
     אחרת היה מסמן correct/wrong על הצבה שטרם הוגשה. */
  if (st.s17 && st.s17.place) {
    if (s17Attempts > 0 || s17Done) {
      s17RestoreSnapshot(st.s17.place);
    } else {
      S17_ITEM_IDS.forEach(function (id) {
        var item = document.getElementById(id);
        if (!item) return;
        var where = st.s17.place[id];
        var dest = (where === 'source' || !where)
          ? document.getElementById('s17-source-bank')
          : document.getElementById('s17-zone-' + where);
        if (dest && item.parentElement !== dest) {
          if (item.parentElement) item.parentElement.removeChild(item);
          dest.appendChild(item);
        }
      });
    }
  }
}

function restoreScreenUI(n) {
  try {
    /* מסכים 2 ו-4 הם שערי "המשך" בלבד, ו-resetScreenState שלהם הוא כבר
       צייר אידמפוטנטי שקורא את המשתנה ומחשב את הכפתור — אין צורך בצייר. */
    if (n === 2) resetScreenState2();
    if (n === 4) resetScreenState4();
    if (n === 5) restoreViqUI(5);
    if (n === 6) restoreViqUI(6);
    if (n === 8)  restoreScqUI({ cfg: S8,  selected: s8Selected,  attempts: s8Attempts,  done: s8Done,  phase: s8Phase,
      optEl: s8OptEl,  lock: s8LockOptions,  showFeedback: s8ShowFeedback,  setBarDone: s8SetBarDone,  check: s8Check,
      checkBtnId: 's8-check',  hintBtnId: 's8-hint',  onContinue: function () { goTo(9); } });
    if (n === 10) restoreScqUI({ cfg: S10, selected: s10Selected, attempts: s10Attempts, done: s10Done, phase: s10Phase,
      optEl: s10OptEl, lock: s10LockOptions, showFeedback: s10ShowFeedback, setBarDone: s10SetBarDone, check: s10Check,
      checkBtnId: 's10-check', hintBtnId: 's10-hint', onContinue: function () { goTo(11); } });
    if (n === 11) dq11.restoreUI();
    if (n === 14) restoreScqUI({ cfg: S14, selected: s14Selected, attempts: s14Attempts, done: s14Done, phase: s14Phase,
      optEl: s14OptEl, lock: s14LockOptions, showFeedback: s14ShowFeedback, setBarDone: s14SetBarDone, check: s14Check,
      checkBtnId: 's14-check', hintBtnId: 's14-hint', onContinue: function () { goTo(15); } });
    if (n === 15) restoreScqUI({ cfg: S15, selected: s15Selected, attempts: s15Attempts, done: s15Done, phase: s15Phase,
      optEl: s15OptEl, lock: s15LockOptions, showFeedback: s15ShowFeedback, setBarDone: s15SetBarDone, check: s15Check,
      checkBtnId: 's15-check', hintBtnId: 's15-hint', onContinue: function () { goTo(16); } });
    if (n === 16) dq16.restoreUI();
    if (n === 17) restoreS17UI();
    if (n === 19) restoreScqUI({ cfg: S19, selected: s19Selected, attempts: s19Attempts, done: s19Done, phase: s19Phase,
      optEl: s19OptEl, lock: s19LockOptions, showFeedback: s19ShowFeedback, setBarDone: s19SetBarDone, check: s19Check,
      checkBtnId: 's19-check', hintBtnId: 's19-hint', onContinue: function () { goTo(20); } });
    if (n === 21) restoreScqUI({ cfg: S21, selected: s21Selected, attempts: s21Attempts, done: s21Done, phase: s21Phase,
      optEl: s21OptEl, lock: s21LockOptions, showFeedback: s21ShowFeedback, setBarDone: s21SetBarDone, check: s21Check,
      checkBtnId: 's21-check', hintBtnId: 's21-hint', onContinue: s21Finish });
  } catch (e) { console.error('[resume] restoreScreenUI', e); }
}

/* צייר חד-ברירה — אותו אחד כמו בסינים 2/4/5. משרת כאן שישה מסכים.
   ⚠️ ה-cfg כפרמטר, לעולם לא גלובל לפי שם.
   ⚠️ אינו נוגע ב-stationProgress / stationBProgress / updateQuestionNav*:
   אלה כבר עודכנו בפעם הראשונה, ושכפולם כאן היה מקדם את הסמן פעם שנייה. */
function restoreScqUI(o) {
  if (!o.done && o.attempts === 0 && !o.selected) return;
  if (o.done) {
    if (o.phase === 'correct') {
      var okEl = o.optEl(o.selected);
      if (okEl) { okEl.classList.add('correct'); okEl.classList.remove('selected'); }
      o.showFeedback('correct', true);
    } else {
      var badEl = o.optEl(o.selected);
      if (badEl && o.selected !== o.cfg.correctId) { badEl.classList.add('wrong'); badEl.classList.remove('selected'); }
      var corrEl = o.optEl(o.cfg.correctId);
      if (corrEl) corrEl.classList.add('correct');
      o.showFeedback('wrong2', false);
    }
    o.lock();
    o.setBarDone('המשך', o.onContinue);
    return;
  }
  var checkBtn = document.getElementById(o.checkBtnId);
  if (o.phase === 'wrong1') {
    var wEl = o.optEl(o.selected);
    if (wEl) { wEl.classList.add('wrong'); wEl.classList.remove('selected'); }
    o.showFeedback('wrong1', false);
    var hintBtn = document.getElementById(o.hintBtnId);
    if (hintBtn) { hintBtn.hidden = false; hintBtn.disabled = false; }
    if (checkBtn) { checkBtn.textContent = 'צדקתי?'; checkBtn.onclick = o.check; checkBtn.disabled = true; }
    return;
  }
  var selEl = o.optEl(o.selected);
  if (selEl) { selEl.classList.add('selected'); selEl.setAttribute('aria-checked', 'true'); }
  if (checkBtn) { checkBtn.textContent = 'צדקתי?'; checkBtn.onclick = o.check; checkBtn.disabled = !o.selected; }
}

/* מסכים 5/6 — קלט מספרי עם מתג חשיפה. צייר אחד, נבדל רק ב-VIQ_SCREENS[n]. */
function restoreViqUI(n) {
  if (!viqDone[n] && !(viqAttempts[n] > 0)) return;
  var cfg = VIQ_SCREENS[n];
  if (!cfg) return;
  var input = document.getElementById(cfg.inputId);
  var btn = document.getElementById(cfg.checkBtnId);
  var fb = document.getElementById(cfg.feedboxId);
  var revealBtn = cfg.revealBtnId ? document.getElementById(cfg.revealBtnId) : null;
  if (!input || !fb) return;

  if (viqDone[n]) {
    input.disabled = true;
    fb.classList.remove('collapsed');
    fb.classList.add('visible');
    var titleEl = fb.querySelector('.scq-fb-title-text');
    var bodyEl = fb.querySelector('.scq-fb-body');
    /* snapshot === null פירושו שהלומד ענה נכון — הוא נכתב רק בענף הכישלון. */
    if (viqAnswerSnapshot[n] === null) {
      input.classList.add('correct');
      fb.classList.remove('is-wrong'); fb.classList.add('is-correct');
      if (titleEl) titleEl.textContent = 'נכון!';
      if (bodyEl) bodyEl.textContent = 'מדובר בפער קטן,\nעד כמה לדעתכם הוא משמעותי?';
    } else {
      input.classList.add(viqRevealed[n] ? 'correct' : 'wrong');
      fb.classList.remove('is-correct'); fb.classList.add('is-wrong');
      if (titleEl) titleEl.textContent = viqRevealed[n] ? 'זו טעות. התשובה הנכונה מוצגת.' : 'התשובה אינה נכונה.';
      if (bodyEl) bodyEl.textContent = viqRevealed[n] ? '' : 'רוצים לראות את הפתרון הנכון?';
      if (revealBtn) { revealBtn.hidden = false; revealBtn.textContent = viqRevealed[n] ? 'התשובה שלי' : 'התשובה הנכונה'; }
    }
    if (btn) { btn.textContent = 'המשך'; btn.disabled = false; }
    return;
  }

  /* ניסיון שגוי שאינו אחרון. */
  input.classList.add('error');
  fb.classList.remove('collapsed', 'is-correct');
  fb.classList.add('is-wrong', 'visible');
  /* אותו פרדיקט שבו viqOnInput משתמש — בלעדיו הכפתור היה מושבת לנצח. */
  if (btn) btn.disabled = !input.value.trim();
}

/* מסך 17 — גרירה בכתב יד. ההצבה עצמה כבר הוחזרה ב-applyResumeDom. */
function restoreS17UI() {
  if (!s17Done && s17Attempts === 0 && !s17HintShown) return;
  var checkBtn = document.getElementById('s17-check');
  var hintBtn = document.getElementById('s17-hint');
  var revealBtn = document.getElementById('s17-reveal-btn');

  if (s17Done) {
    if (s17Passed) {
      s17ShowFeedback('correct', true);
    } else {
      s17ShowFeedback(s17Revealed ? 'wrong2' : 'pending', false);
      if (revealBtn) { revealBtn.hidden = false; revealBtn.textContent = s17Revealed ? 'התשובה שלי' : 'התשובה הנכונה'; }
    }
    if (checkBtn) { checkBtn.textContent = 'המשך'; checkBtn.disabled = false; checkBtn.onclick = function () { goTo(18); }; }
    if (hintBtn) hintBtn.hidden = true;
    return;
  }

  s17ShowFeedback('wrong1', false);
  if (s17HintShown && hintBtn) { hintBtn.hidden = false; hintBtn.disabled = false; }
  /* אותו פרדיקט שבו s17Drop/s17ItemClick משתמשים. */
  s17UpdateCheckBtn();
}

/* ═══════════════════ xAPI (720) — קונפיגורציה של הסין ═══════════════════
   נתונים בלבד. השכבה המשותפת ב-../unit-js/ קוראת אותם בזמן call. */

/* ⚠️ חייב להחזיק בדיוק TOTAL_SCREENS מפתחות (22), 0..21, בלי חורים.
   מפתח חסר אינו ניתן להבחנה מ-null, כלומר מסך שלא מדווח בשקט. */
var SCREEN_TO_SUBCONTENT = {
  0: null,          /* בחירת דמות מלווה — כרום של היחידה, לא פריט */
  1: ['001', 1],    /* וידאו פודקאסט 1 — "3 גרם טונה ששווים 12 מיליון דולר?" */
  2: ['001', 2],    /* שאלת דעה (בלי בדיקה ובלי משוב) */
  3: ['001', 3],    /* וידאו פודקאסט 2 — התשובה; סוגר את אותו הוק נרטיבי */
  4: null,          /* בחירת מסלול: תרופה / זהב */
  5: ['002', 1],    /* מסלול זהב — סימולציה + קלט מספרי */
  6: ['003', 1],    /* מסלול תרופה — סימולציה + קלט מספרי */
  7: ['004', 1],    /* וידאו: המסלולים מתכנסים — מכין את שאלת מסך 8 */
  8: ['004', 2],    /* צמצום שגיאת מדידה אקראית */
  9: null,          /* מעבר נרטיבי */
  10: ['005', 1],   /* היומן של גברת פיקל */
  11: ['006', 1],   /* גרירה: השלמת משפט חזרות/ממוצע */
  12: null,         /* מעבר: "5 שאלות" */
  13: ['007', 1],   /* הסבר: שלושה סוגי מאזניים (מחקר האורז) */
  14: ['007', 2],   /* שאלה 1, סעיף א — q1 */
  15: ['007', 3],   /* שאלה 1, סעיף ב — q2 */
  16: ['008', 1],   /* שאלה 2 — זיהוי מדידה חריגה */
  17: ['009', 1],   /* שאלה 3 — גרירת מוצר למאזניים */
  18: ['010', 1],   /* הקדמה: יורם ואדיר מתווכחים */
  19: ['010', 2],   /* שאלה 4 — מי זקוק למאזניים מדויקים יותר */
  20: ['011', 1],   /* הקדמה: שרשרת הזהב והמנורה של דן */
  21: ['011', 2]    /* שאלה 5 — אצל מי הטעות קריטית יותר */
};

var XAPI_COMP_SLUG = 'methodica-science-mass-measure-03-01';
var XAPI_COMP_ID   = XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/';

/* פריטים שנושאים שאלה **מדורגת בקוד**.
   ⚠️ 001 מוחרג במכוון: שאלת הדעה במסך 2 היא ללא בדיקה, ללא ניסיונות וללא
   משוב — s2Select רק מאפשר את "המשך". S2.correctId הוא תיעוד בלבד. */
var XAPI_EVAL_ITEMS = {
  '002': 1, '003': 1, '004': 1, '005': 1, '006': 1,
  '007': 1, '008': 1, '009': 1, '010': 1, '011': 1
};

var XAPI_METADATA_FILE = '../metadata/methodica-science-mass-measure-03-01.json';

/* קישור בין סינים — חזרה: אם הגענו לכאן עם #screen=N (מכפתור "חזרה"
   בסיין הבא, סיין 2), קופצים ישר למסך הזה במקום למסך הראשון. אותה
   מוסכמה בדיוק כמו בפרויקט הקודם, Methodica-science-mass-measure
   -02-linked. */
(function () {
  const m = /^#screen=(\d+)$/.exec(location.hash);
  if (m) goTo(parseInt(m[1], 10));
  else resetScreenState(0);
})();
