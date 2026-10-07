'use strict';

/* =========================================================
   מנוע גלובלי — canvas scaling, ניווט מסכים, סטייט גלובלי
   ========================================================= */

const TOTAL_SCREENS = 6;
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
  /* resume: לצייר מסך שכבר נענה — בכל ניווט, לא רק בנחיתת השחזור. */
  try { repaintScreen(n); } catch (e) { console.error('[resume] repaint', e); }
  /* xAPI: אחרי classList.add('active') במכוון — קריאת רשת לא מעכבת ציור.
     עטוף בנפרד כדי שדיווח שנכשל לעולם לא ישבור ניווט. */
  try { xapiOnScreen(n); } catch (e) {}
  try { scheduleResumeSave(); } catch (e) {}
  requestAnimationFrame(function () {
    target.querySelectorAll('.tbl-content').forEach(initFakeScrollbar);
  });
}

function resetScreenState(n) {
  if (n === 0) resetScreenState0();
  if (n === 1) resetScreenState1();
  if (n === 2) resetScreenState2();
  if (n === 3) resetScreenState3();
  if (n === 4) resetScreenState4();
  if (n === 5) resetScreenState5();
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
   מועד א — מעקב 4 החלקים (localStorage), לפי אותה מוסכמה שנקבעה
   בפרויקט הקודם (Methodica-science-mass-measure-02-05): כל חלק שומר
   תוצאת pass/fail תחת מפתח קבוע; moedAFullyPassed() בודקת שכולם עברו.
   part1 = מסך 2 (יישומון+טבלה, placeholder זמני, תמיד 'pass'),
   part2 = מסך 3 (סעיף א), part3 = מסך 4 (סעיף ב), part4 = מסך 5
   (סעיף ג) — "3 הסעיפים" שהמסך הראשון מזכיר הם א/ב/ג בלבד (part2-4);
   part1 הוא שלב איסוף נתונים מקדים, לא "סעיף" בפני עצמו.
   ========================================================= */

/* ⚠️ עובר דרך setUnitResult ולא ישירות ל-localStorage.
   s4SectionGDecision מנתב את הלומד על סמך התוצאות האלה, ו-localStorage אינו
   עובר בין מכשירים — לומד שממשיך את אותו registration במחשב אחר היה קורא
   null ונשלח למועד ב' שכבר עבר. setUnitResult כותב לשניהם: למסמך ה-state
   (שמגיע מ-Kata לכל מכשיר) ולקאש המקומי הסינכרוני. */
function saveMoedAResult(part, passed) {
  var key = 'lomda_moedA_part' + part + '_result';
  if (typeof setUnitResult === 'function') { setUnitResult(key, passed ? 'pass' : 'fail'); return; }
  try { localStorage.setItem(key, passed ? 'pass' : 'fail'); } catch (e) {}
}

/* קריאה תואמת: מסמך קודם, קאש מקומי כ-fallback. */
function readMoedAResult(part) {
  var key = 'lomda_moedA_part' + part + '_result';
  if (typeof getUnitResult === 'function') return getUnitResult(key);
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function moedAFullyPassed() {
  return [1, 2, 3, 4].every(function (n) { return readMoedAResult(n) === 'pass'; });
}

/* =========================================================
   מסך 1 — מעבר: הקדמה למשימת השיא. דמות: וידאו (MP4 בלופ, בלי קול/
   סרגל שליטה — בקשת הלקוח, לא GIF). שקף 131 ציין "תנועת שריר" — עכשיו
   ממומש בפועל. נבחר דינמית לפי Companion character system
   (window.lomdaState.selectedCharacter), לעולם לא מוקשח.
   ========================================================= */

const S0_AVATAR_ASSETS = {
  pink: 'assets/gifs/pink-avatar-muscle.mp4',
  boy: 'assets/gifs/boy-avatar-muscle.mp4'
};

function resetScreenState0() {
  resolveCharBubbleVideo('s0-avatar-video', S0_AVATAR_ASSETS);
}

function s0Continue() { goTo(1); }

/* קישור בין סינים: מסך ראשון בסיין 5 -> מסך אחרון בסיין 4 (s3, המסך
   האחרון בפועל שם). נתיב יחסי + #screen=N, אותה מוסכמה בדיוק כמו
   בפרויקט הקודם, Methodica-science-mass-measure-02-linked. */
function s0BackToPreviousSain() {
  window.location.href = '../methodica-ar-science-mass-measure-03-04/index.html#screen=3';
}

/* =========================================================
   מסך 2 — סעיף 1: יישומון (placeholder) + טבלה למילוי, עד 7 מדידות.
   ⚠️ בלי סימולציה אמיתית עדיין: אין מקור אמת למספרים, לכן אין ולידציה
   בפועל על הערכים — "סיימתי לשקול" נועל את הטבלה ומסמן את הסעיף
   כ"עבר" באופן placeholder זמני (ראו הערה ב-index.html/ARCHITECTURE.md).
   ========================================================= */

let s1RowCount = 1;
let s1Finished = false;

/* "הממוצע עד כה" מחושב אוטומטית (ממוצע רץ של עמודת "מסה" מהשורה
   הראשונה ועד לשורה הנוכחית) ומוצג בלבד — לא שדה קלט. מחושב מחדש בכל
   הקלדה בעמודת המסה; שורה שאין לה (או לשורה שלפניה) ערך מסה תקין
   עדיין מוצגת ריקה. */
function s1ComputeAverages() {
  const rows = document.querySelectorAll('#s1-table-body tr');
  /* סכימה ביחידות של עשיריות-גרם (מספרים שלמים) ולא בגרם עשרוני —
     סכימת float רגילה סוטה בטעויות עיגול זעירות (למשל 300.3 מצטבר
     כ-300.29999999999995), מה שגורם לממוצע-רץ בשורה 4 ו-6 לרדת מתחת
     ל-x.05 ולעגל כלפי מטה במקום כלפי מעלה כמו בטבלת הייחוס (שקף 134). */
  let sumTenths = 0, count = 0, brokenChain = false;
  rows.forEach(function (tr) {
    const massInput = tr.querySelector('.tbl-input');
    const avgSpan = tr.querySelector('.tbl-avg-display');
    const val = parseFloat((massInput.value || '').trim().replace(',', '.'));
    if (brokenChain || isNaN(val)) {
      brokenChain = true;
      avgSpan.textContent = '';
      return;
    }
    sumTenths += Math.round(val * 10);
    count++;
    const avgTenths = Math.round(sumTenths / count);
    avgSpan.textContent = (avgTenths / 10).toFixed(1);
  });
}

function s1OnCellInput() {
  s1ComputeAverages();
}

function s1AddRow() {
  if (s1RowCount >= 7 || s1Finished) return;
  s1RowCount++;
  const tbody = document.getElementById('s1-table-body');
  const tr = document.createElement('tr');
  tr.dataset.row = String(s1RowCount);
  tr.innerHTML =
    '<td class="tbl-td"><span class="tbl-avg-display" id="s1-avg-' + s1RowCount + '"></span></td>' +
    '<td class="tbl-td"><input class="tbl-input" type="text" inputmode="decimal" aria-label="الكتلة بالغرام، القياس رقم ' + s1RowCount + '" oninput="s1OnCellInput()"></td>' +
    '<td class="tbl-td">' + s1RowCount + '</td>';
  tbody.appendChild(tr);
  if (s1RowCount >= 7) document.getElementById('s1-add-row').disabled = true;
}

function s1FinishWeighing() {
  if (s1Finished) return;
  s1Finished = true;
  document.querySelectorAll('#s1-measure-table .tbl-input').forEach(function (input) {
    input.disabled = true;
  });
  document.getElementById('s1-add-row').disabled = true;
  document.getElementById('s1-finish-weighing').disabled = true;
  /* placeholder זמני: מסמן את סעיף 1 כ"עבר" עד שהסימולציה האמיתית
     תשולב עם ולידציה אמיתית של הנתונים */
  saveMoedAResult(1, true);
  document.getElementById('s1-continue').disabled = false;
  try { flushResumeSave(); } catch (e) {}
}

function s1Continue() { goTo(2); }

/* Gesture Hint — Cursor Scroll (SELF-QA.md §7). Ported from Sain 1 (methodica-science-mass-measure-
   03-01, which this family's SELF-QA.md governs) — missed here in the first pass. Shown once per
   screen visit, hidden the instant a real scroll is attempted (wheel/keydown). */
let s1ScrollGestureShown = false;
function s1MaybeShowScrollGesture() {
  if (s1ScrollGestureShown) return;
  s1ScrollGestureShown = true;
  const gesture = document.getElementById('s1-scroll-gesture');
  const scrollArea = document.getElementById('s1-scroll-area');
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
  if (s1Finished) return; // resume-state guard — הושלם כבר, לא מאפסים
  s1MaybeShowScrollGesture();
  s1RowCount = 1;
  const tbody = document.getElementById('s1-table-body');
  tbody.innerHTML =
    '<tr data-row="1">' +
    '<td class="tbl-td"><span class="tbl-avg-display" id="s1-avg-1"></span></td>' +
    '<td class="tbl-td"><input class="tbl-input" type="text" inputmode="decimal" aria-label="الكتلة بالغرام، القياس رقم 1" oninput="s1OnCellInput()"></td>' +
    '<td class="tbl-td">1</td>' +
    '</tr>';
  document.getElementById('s1-add-row').disabled = false;
  document.getElementById('s1-finish-weighing').disabled = false;
  document.getElementById('s1-continue').disabled = true;
  const scrollArea = document.getElementById('s1-scroll-area');
  if (scrollArea) {
    scrollArea.scrollTop = 0;
    initScrollbarHoverCursor(scrollArea);
  }
  s1Sim.reset();
}

/* SELF-QA.md §7 "Cursor shape" — the hand-shaped (grab) cursor over a scrollable container must only
   show near the actual scrollbar strip, not across the whole content box (client feedback, 2026-09-08:
   the grab cursor covering the entire screen was confusing). Toggles `.near-scrollbar` on `el` based
   on how close the mouse is to its right edge (where the scrollbar physically sits, since these
   containers force direction:ltr — see CLAUDE.md). thresholdPx is generous on purpose (wider than the
   8px scrollbar itself) so it's easy to hit without pixel-perfect aim. #s1-scroll-area is the only
   scroll container left in this project (2026-09-17: #s4-scroll-area was removed — see resetScreenState4). */
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

/* =========================================================
   סימולציית שקילה — מסך 2 (dq-sim-placeholder). גררו את שרשרת הזהב
   אל המאזניים כדי לקבל מדידה; כל הנחה נוספת (הרמה+החזרה למאזניים)
   חושפת את הערך הבא ברצף הקבוע (תואם לטבלת הייחוס בשקף 134/מסך 3
   סעיף א), עד 7 מדידות. אין כפתור "מדידה" נפרד — הגרירה עצמה היא
   המדידה (אותה מוסכמה כמו makeScaleSimulation בסיין 1); רק איפוס
   שייך לסימולציה. תא-הטבלה הידני (s1AddRow/s1OnCellInput) הוא רכיב
   נפרד לגמרי — הלומד/ת קוראים את התוצאה כאן ומעתיקים אותה בעצמם.
   ========================================================= */
const S1_SIM_VALUES = [50.8, 49.2, 50.4, 49.8, 50.1, 50.0, 49.9];
const S1_SIM_NECKLACE_IDLE = { x: 126, y: 100 };
/* gold-necklace.png (1536×1024) יש לו ריפוד שקוף אנכי ענק: השרשרת
   הנראית תופסת רק y:34.4%-63.8% מהקנבס (נמדד ב-PIL, alpha>10 bbox),
   לא edge-to-edge. אם מיישרים את תחתית הקופסה (113px) לקו המגש,
   השרשרת הנראית בפועל (שנגמרת ב-63.8%*113≈72px) "מרחפת" ~41px מעל
   הקו. תיקון: תחתית הקופסה = קו המגש + 41 (כלומר y גבוה יותר),
   כדי שהתחתית הנראית בפועל תשב על הקו. אופקית אין תיקון — השרשרת
   ממורכזת כמעט מדויק (4.3%-95.7%) בתוך הקנבס. */
const S1_SIM_NECKLACE_REST = { x: 126, y: 325 };
const S1_SIM_HIT = { left: 23, top: 350, w: 380, h: 203 };

function makeSingleScaleSimulation(cfg) {
  const root = document.getElementById(cfg.rootId);
  if (!root) return { reset: function () {} };

  const necklaceEl = root.querySelector('.dq-sim-necklace');
  const dropzoneEl = root.querySelector('.dq-sim-dropzone');
  const lcdValEl = root.querySelector('.dq-sim-lcd-val');

  const state = { x: S1_SIM_NECKLACE_IDLE.x, y: S1_SIM_NECKLACE_IDLE.y, placed: false, dragging: false, measureIndex: 0 };
  let animTimer = null;

  function cancelAnim() { if (animTimer) clearTimeout(animTimer); animTimer = null; }

  function renderNecklace() {
    necklaceEl.style.transform = 'translate(' + state.x + 'px, ' + state.y + 'px)';
    necklaceEl.classList.toggle('dragging', state.dragging);
  }
  function renderLcd(val) { lcdValEl.textContent = val.toFixed(1); }

  function weigh() {
    cancelAnim();
    state.measureIndex = Math.min(state.measureIndex + 1, cfg.values.length);
    const target = cfg.values[state.measureIndex - 1];
    const dur = 900, t0 = Date.now();
    function step() {
      const prog = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - prog, 3);
      renderLcd(target * eased);
      if (prog < 1) animTimer = setTimeout(step, 30);
      else renderLcd(target);
    }
    animTimer = setTimeout(step, 30);
  }

  function placeOnScale() {
    state.placed = true;
    state.x = S1_SIM_NECKLACE_REST.x;
    state.y = S1_SIM_NECKLACE_REST.y;
    renderNecklace();
    weigh();
  }

  function removeFromScale() {
    if (!state.placed) return;
    cancelAnim();
    state.placed = false;
    renderLcd(0);
  }

  function handleDrop() {
    const cx = state.x + necklaceEl.offsetWidth / 2, cy = state.y + necklaceEl.offsetHeight / 2;
    const hit = cx > cfg.hit.left - 30 && cx < cfg.hit.left + cfg.hit.w + 30 && cy > cfg.hit.top - 40 && cy < cfg.hit.top + cfg.hit.h + 30;
    if (hit) placeOnScale();
  }

  function onPointerDown(e) {
    e.preventDefault();
    const appRect = document.getElementById('app').getBoundingClientRect();
    const scaleFactor = appRect.width / 1280;
    const startX = e.clientX, startY = e.clientY;
    const bx = state.x, by = state.y;
    removeFromScale();
    state.dragging = true;
    renderNecklace();
    if (dropzoneEl) dropzoneEl.classList.add('visible');
    try { necklaceEl.setPointerCapture(e.pointerId); } catch (err) {}

    function move(ev) {
      state.x = bx + (ev.clientX - startX) / scaleFactor;
      state.y = by + (ev.clientY - startY) / scaleFactor;
      renderNecklace();
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      state.dragging = false;
      renderNecklace();
      if (dropzoneEl) dropzoneEl.classList.remove('visible');
      handleDrop();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  necklaceEl.addEventListener('pointerdown', onPointerDown);

  /* Gesture hint (2026-09-17, client request): same hand+rings effect already used for the
     draggable block in Sain 1 (.dq-sim-block, makeScaleSimulation's showBlockGestureHint()) —
     not the generic showDragGestureHint() elsewhere in this file, which offsets past a text
     LABEL's edge; the necklace is a plain image with no label, so it stays dead-center via the
     shared CSS's own left:50%/top:50% default, exactly like Sain 1's block. */
  function showNecklaceGestureHint() {
    if (necklaceEl.dataset.gestureShown) return;
    necklaceEl.dataset.gestureShown = 'true';
    const hint = document.createElement('div');
    hint.className = 'gesture-hint';
    hint.innerHTML =
      '<div class="gesture-hint-ring gesture-hint-ring--drag-big"></div>' +
      '<div class="gesture-hint-ring gesture-hint-ring--drag-small"></div>' +
      '<img class="gesture-hint-hand" src="assets/images/gesture-hand-cursor.svg" alt="">';
    necklaceEl.appendChild(hint);
    function dismiss() {
      hint.remove();
      necklaceEl.removeEventListener('pointerdown', dismiss);
    }
    necklaceEl.addEventListener('pointerdown', dismiss);
  }

  function reset() {
    cancelAnim();
    state.x = S1_SIM_NECKLACE_IDLE.x; state.y = S1_SIM_NECKLACE_IDLE.y;
    state.placed = false; state.dragging = false; state.measureIndex = 0;
    renderNecklace();
    renderLcd(0);
    showNecklaceGestureHint();
  }

  /* resume: measureIndex הוא הסמן לתוך S1_SIM_VALUES. שחזור הטבלה בלעדיו
     היה מגיש ללומד שוב את המדידה הראשונה — כלומר משבש את הנתונים שהוא
     ממשיך לחשב מהם בסעיפים א/ב/ג. `dragging` לא נשמר: scratch של גרירה. */
  function simGetState() {
    return { x: state.x, y: state.y, placed: state.placed, measureIndex: state.measureIndex };
  }
  function simSetState(s) {
    if (!s) return;
    if (typeof s.x === 'number') state.x = s.x;
    if (typeof s.y === 'number') state.y = s.y;
    state.placed = !!s.placed;
    state.measureIndex = s.measureIndex || 0;
    state.dragging = false;
    renderNecklace();
  }

  reset();
  return { reset: reset, getState: simGetState, setState: simSetState };
}

const s1Sim = makeSingleScaleSimulation({ rootId: 's1-sim', values: S1_SIM_VALUES, hit: S1_SIM_HIT });

/* =========================================================
   מסך 3 — סעיף א: SCQ עם טבלה (במקום תמונה). בלי qnav.
   ========================================================= */

const S2 = {
  correctId: 'c',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'صحيح.', body: 'بعد 4 قياسات تقريبًا، يبدأ المعدل بالتغيّر بدرجة أقل من قياس إلى آخر، ولذلك يمكن القول إنه بدأ يستقر.' },
    wrong1: { title: 'الإجابة غير صحيحة.', body: 'لا بأس، نتعلّم من الأخطاء أيضًا.\nهل نحاول مرة أخرى؟' },
    wrong2: { title: 'الإجابة غير صحيحة.\nالإجابة الصحيحة مُشار إليها.',
      body: 'بعد 4 قياسات تقريبًا، يبدأ المعدل بالتغيّر بدرجة أقل من قياس إلى آخر، ولذلك يمكن القول إنه بدأ يستقر.' }
  }
};

let s2Selected = null;
let s2Attempts = 0;
/* Retry gate (720 spec; דיווח MOE 23.09.26): מזהה התשובה שסומנה שגויה בניסיון
   הלא-סופי האחרון. "צדקתי?" מושבת כל עוד הבחירה הנוכחית זהה לה. */
let s2LastWrong = null;
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
  checkBtn.textContent = 'هل إجابتي صحيحة؟';
  /* Retry gate: חזרה לתשובה שזה עתה סומנה שגויה → מושבת. */
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
  xapiAnswered('001', 'q1', s2Selected === S2.correctId,
    s2Selected === S2.correctId || s2Attempts >= S2.maxAttempts, xapiAnswerText(optEl));

  if (s2Selected === S2.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s2Phase = 'correct';
    s2Done = true;
    s2LastWrong = null;
    s2LockOptions();
    s2ShowFeedback('correct', true);
    saveMoedAResult(2, true);
    s2SetBarDone('متابعة', function () { goTo(3); });
    try { flushResumeSave(); } catch (e) {}
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s2Attempts < S2.maxAttempts) {
    s2Phase = 'wrong1';
    s2LastWrong = s2Selected; // Retry gate (720 spec; דיווח MOE 23.09.26)
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
    saveMoedAResult(2, false);
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
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל. */
  xapiRequestedHint('001', 'q1');
  document.getElementById('s2-hint-overlay').hidden = false;
}
function s2CloseHint() { document.getElementById('s2-hint-overlay').hidden = true; }
document.getElementById('s2-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s2CloseHint();
});

function resetScreenState2() {
  if (s2Done || s2Attempts > 0 || s2Selected) return; // resume-state guard
  s2Selected = null;
  s2Attempts = 0;
  s2LastWrong = null; // איפוס טרי בלבד — כניסה חוזרת לשאלה פתוחה נעצרת בגארד למעלה
  s2Phase = 'before';
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
   מסך 4 — סעיף ב: SCQ עם תמונה + בועית דיבור. בלי qnav. סיום הסעיף
   הזה משלים את מועד א — בודק moedAFullyPassed() ומנתב בהתאם.
   ========================================================= */

const S3 = {
  correctId: 'c',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'الإجابة صحيحة.', body: 'القياس الواحد قد يتأثر من عدم اليقين أو من الخطأ اللحظي. معدل عدّة قياسات يوفّر لنا أساسًا موثوقًا أكثر لتحديد كتلة القلادة.' },
    wrong1: { title: 'الإجابة غير صحيحة.', body: 'لا بأس، نتعلّم من الأخطاء أيضًا.\nهل نحاول مرة أخرى؟' },
    wrong2: { title: 'الإجابة غير صحيحة.\nالإجابة الصحيحة مُشار إليها.', body: 'القياس الواحد قد يتأثر من عدم اليقين أو من الخطأ اللحظي. معدل عدّة قياسات يوفّر لنا أساسًا موثوقًا أكثر لتحديد كتلة القلادة.' }
  }
};

let s3Selected = null;
let s3Attempts = 0;
/* Retry gate (720 spec; דיווח MOE 23.09.26): מזהה התשובה שסומנה שגויה בניסיון
   הלא-סופי האחרון. "צדקתי?" מושבת כל עוד הבחירה הנוכחית זהה לה. */
let s3LastWrong = null;
let s3Done = false;
let s3Phase = 'before';

function s3OptEl(id) { return document.querySelector('#s3 .scq-opt[data-id="' + id + '"]'); }

function s3Select(id) {
  if (s3Done) return;
  const wasWrong1 = (s3Phase === 'wrong1');
  document.querySelectorAll('#s3 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const selectedEl = s3OptEl(id);
  selectedEl.classList.add('selected');
  selectedEl.setAttribute('aria-checked', 'true');
  s3Selected = id;
  s3Phase = 'selected';
  if (wasWrong1) document.getElementById('s3-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s3-check');
  checkBtn.textContent = 'هل إجابتي صحيحة؟';
  /* Retry gate: חזרה לתשובה שזה עתה סומנה שגויה → מושבת. */
  checkBtn.disabled = (s3Selected === s3LastWrong);
  checkBtn.onclick = s3Check;
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

function s3SetBarDone(label) {
  const checkBtn = document.getElementById('s3-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  /* סעיף ב אינו הסעיף האחרון עוד (נוסף סעיף ג אחריו) — ממשיכים תמיד
     הלאה, ללא קשר לתוצאה; ההחלטה על moedAFullyPassed() עברה לסוף
     סעיף ג (מסך 5). */
  checkBtn.onclick = function () { goTo(4); };
  document.getElementById('s3-hint').hidden = true;
}

function s3Check() {
  if (!s3Selected || s3Done) return;
  s3Attempts++;
  const optEl = s3OptEl(s3Selected);
  xapiAnswered('001', 'q2', s3Selected === S3.correctId,
    s3Selected === S3.correctId || s3Attempts >= S3.maxAttempts, xapiAnswerText(optEl));

  if (s3Selected === S3.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s3Phase = 'correct';
    s3Done = true;
    s3LastWrong = null;
    s3LockOptions();
    s3ShowFeedback('correct', true);
    saveMoedAResult(3, true);
    s3SetBarDone('متابعة');
    try { flushResumeSave(); } catch (e) {}
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s3Attempts < S3.maxAttempts) {
    s3Phase = 'wrong1';
    s3LastWrong = s3Selected; // Retry gate (720 spec; דיווח MOE 23.09.26)
    s3ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s3-check');
    checkBtn.textContent = 'هل إجابتي صحيحة؟';
    checkBtn.disabled = true;
    checkBtn.onclick = s3Check;
    const hintBtn = document.getElementById('s3-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s3OptEl(S3.correctId).classList.add('correct');
    s3Phase = 'wrong-final';
    s3Done = true;
    s3LastWrong = null;
    s3LockOptions();
    s3ShowFeedback('wrong2', false);
    saveMoedAResult(3, false);
    s3SetBarDone('متابعة');
  }
  try { flushResumeSave(); } catch (e) {}
}

function s3LockOptions() {
  document.querySelectorAll('#s3 .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}
function s3UnlockOptions() {
  document.querySelectorAll('#s3 .scq-opt').forEach(function (el) {
    el.classList.remove('disabled');
    el.onclick = function () { s3Select(el.dataset.id); };
  });
}

function s3OpenHint() {
  if (s3Done) return;
  /* xAPI: requested.1 — אחרי כל הגארדים ומיד לפני שהרמז נחשף בפועל. */
  xapiRequestedHint('001', 'q2');
  document.getElementById('s3-hint-overlay').hidden = false;
}
function s3CloseHint() { document.getElementById('s3-hint-overlay').hidden = true; }
document.getElementById('s3-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s3CloseHint();
});

function resetScreenState3() {
  if (s3Done || s3Attempts > 0 || s3Selected) return; // resume-state guard
  s3Selected = null;
  s3Attempts = 0;
  s3LastWrong = null; // איפוס טרי בלבד — כניסה חוזרת לשאלה פתוחה נעצרת בגארד למעלה
  s3Phase = 'before';
  s3UnlockOptions();
  document.querySelectorAll('#s3 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
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

document.querySelectorAll('#s3 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s3Select(opt.dataset.id);
    }
  });
});

/* =========================================================
   מסך 5 — סעיף ג. תמונה+בועה בעמודה השמאלית, כותרת+טקסט+שאלת גרירה
   (makeDragQuestion factory, זהה לזה שכבר קיים בסיין 3, הועתק לכאן
   כי כל סיין עצמאי בפני עצמו — אין script.js משותף בין הסינים)
   בעמודה הימנית. עודכן (2026-09-17, בקשה מפורשת): הוחלף לגמרי
   ל-.scq-question/.scq-content הרגילים (ראו index.html/styles.css) —
   בלי גלילה כלל יותר, לא נדרשת בפריסת שתי-העמודות הזו.
   סעיף ג הוא הסעיף האחרון של מועד א — בסיומו מתבצעת בדיקת
   moedAFullyPassed() (4 חלקים) והניתוב בהתאם.
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
     ever called" — a redundant reset() call (e.g. a screen revisit, or a scroll-position-driven
     section sync firing twice for one navigation — see the equivalent fix and full writeup in
     methodica-ar-science-mass-measure-03-06/script.js) can re-render the word bank and wipe a hint that
     was never actually seen/dismissed. Checking for an existing .gesture-hint child (not just a
     one-shot flag) lets a redundant call safely re-add it instead of leaving the slot hint-less. */
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
     offsetWidth) — reported 2026-09-10 still floating between chips / covering the label: this
     project's .dq-drag-card is only min-width:90px with padding:0 12px (unlike Sain 1's fixed 180px
     pill) — it hugs its own content, so any label whose text+padding exceeds 90px (most words longer
     than "4") leaves only the 12px padding as margin, not a wide roughly-constant one. The old
     container-edge math assumed a 21px-radius ring could safely reach 13px inside the container's
     edge; with only 12px of real padding there, that lands 1px+ into the glyphs on every such label.
     Reading the text's own painted extent removes the guesswork: the hand can only ever land past
     where the text actually ends, regardless of how tight the padding is around it.
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
     RING_HALF+4 (+25) margin did — this project's narrow min-width:90px/padding:0 12px chips only have
     so much room to spend between clearing the text and staying inside the card's own right edge.
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
     at scale 1 (a 1280×710 viewport); at any other window size the on-screen gap this produces is off
     by the scale factor, landing the hint away from the card entirely. `appRect.width / 1280` recovers
     the current scale; dividing the measured screen-space distance by it converts it back to the local
     units style.left expects. The +20 gap itself is already a local value (derived from the ring's own
     local 42px width) and must not be divided. */
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

/* makeDragQuestion factory — זהה 1:1 לזו שבסיין 3 (maxAttempts+onResult) */
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
  /* Retry gate (720 spec; דיווח MOE 23.09.26): חתימת התשובה שסומנה שגויה בניסיון
     הלא-סופי האחרון. "צדקתי?" מושבת כל עוד החתימה הנוכחית זהה לה. */
  let lastWrong = null;
  let done = false;
  let answerSnapshot = null; // הפלייסמנט של הלומד ברגע הניסיון האחרון הכושל, לפני revealCorrect()
  let revealed = false;
  /* resume: ⚠️ נשמר במפורש ואינו נגזר בדיעבד מ-placement — revealCorrect()
     דורס אותו בפתרון הנכון, ומאותו רגע הלוח "נראה" נכון תמיד. */
  let passed = false;

  /* חתימת התשובה: יעד → תווית. כרטיסים בעלי אותה תווית שקולים (כמו ב-check()),
     ולכן החלפה ביניהם אינה נחשבת תשובה חדשה. משמשת גם כמחרוזת ה-xAPI. */
  function sig() {
    return targetIds.map(function (tId) {
      let placed = null;
      dragIds.forEach(function (dId) { if (placement[dId] === tId) placed = dId; });
      return tId.replace(/^.*-target-/, '') + '=' + (placed ? labels[placed] : '—');
    }).join(' | ');
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

    const allFilled = targetIds.every(function (tId) {
      return dragIds.some(function (dId) { return placement[dId] === tId; });
    });
    const btn = document.getElementById(cfg.checkBtnId);
    /* Retry gate: השוואה חיה בכל שינוי — חזרה לתשובה השגויה משביתה שוב. */
    if (btn && !done) btn.disabled = !allFilled || sig() === lastWrong;
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

  function saveResult(passed) {
    if (!cfg.resultKey) return;
    /* אותה סיבה כמו ב-saveMoedAResult: התוצאה הזאת משתתפת בניתוב. */
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
       ⚠️ xapiZoneAnswer לא מתאים: העוזר בונה מזהי אזור בתבנית
       <prefix>-zone-<id>, בעוד היעדים כאן הם s4-target-N. */
    if (cfg.xapiItem) {
      const _ans = sig();
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
      if (cfg.onResult) cfg.onResult('success');
      if (btn) { btn.textContent = 'متابعة'; btn.disabled = false; btn.onclick = cfg.onContinue; }
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
      if (cfg.onResult) cfg.onResult('fail');
      if (btn) { btn.textContent = 'متابعة'; btn.disabled = false; btn.onclick = cfg.onContinue; }
    } else {
      showFeedback('wrong1');
      checked = false;
      lastWrong = sig(); // Retry gate (720 spec; דיווח MOE 23.09.26) — לפני render(), כדי שהכפתור יושבת
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
    lastWrong = null; // איפוס טרי בלבד — reset() לא מגיע לכאן כשיש התקדמות
    answerSnapshot = null; revealed = false; passed = false;
    shuffleWordBank();
    dragIds.forEach(function (dId) { placement[dId] = 'source'; });
    targetIds.forEach(function (tId) {
      const zone = document.getElementById(tId);
      if (zone) zone.classList.remove('correct', 'wrong', 'occupied', 'drag-over');
    });
    hideFeedback();
    if (cfg.hintBtnId) {
      const hintBtn = document.getElementById(cfg.hintBtnId);
      if (hintBtn) { hintBtn.hidden = true; hintBtn.disabled = false; }
    }
    if (cfg.hintOverlayId) document.getElementById(cfg.hintOverlayId).hidden = true;
    if (cfg.revealBtnId) {
      const revealBtn = document.getElementById(cfg.revealBtnId);
      if (revealBtn) { revealBtn.hidden = true; revealBtn.textContent = 'الإجابة الصحيحة'; }
    }
    const btn = document.getElementById(cfg.checkBtnId);
    if (btn) { btn.textContent = 'هل إجابتي صحيحة؟'; btn.disabled = true; btn.onclick = check; }
    const panel = document.getElementById(cfg.panelId);
    if (panel) panel.scrollTop = 0;
    render();
  }

  function restoreFinal() {
    const btn = document.getElementById(cfg.checkBtnId);
    if (btn) { btn.textContent = 'متابعة'; btn.disabled = false; btn.onclick = cfg.onContinue; }
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
    showDragGestureHint(document.getElementById('slot-' + dragIds[0]));
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
      lw: lastWrong,
      answerSnapshot: answerSnapshot ? Object.assign({}, answerSnapshot) : null,
      /* resetInitial() מערבב מחדש את מאגר המילים, ולכן בלי שמירת הסדר
         הלומד היה חוזר ללוח מסודר אחרת. */
      bankOrder: bankOrder
    };
  }

  function setState(s) {
    if (!s) return;
    if (s.placement) dragIds.forEach(function (id) { placement[id] = s.placement[id] || 'source'; });
    attempts = s.attempts || 0;
    /* מסמך ישן בלי lw (נשמר לפני תיקון ה-retry gate): גוזרים מהתשובה השמורה, כדי
       שהכפתור לא ייפתח על אותה תשובה שגויה. */
    lastWrong = s.lw || ((attempts > 0 && !s.done) ? sig() : null);
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

  /* מחקה את כתיבות ה-DOM של check() בלבד. */
  function restoreUI() {
    /* ⚠️ מסך נקי → render() בלבד, לעולם לא resetInitial(): הוא מאפס את
       placement **וגם** מערבב מחדש את המאגר — בכל ניווט, לא רק בשחזור. */
    if (!done && attempts === 0) { hideFeedback(); render(); return; }

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
    /* Retry gate: render() כבר חישב את המצב (השער חי שם), אבל הכתיבה המפורשת
       כאן רצה אחריו — ולכן גם היא עוברת דרך השער ולא נועלת לומד ששינה תשובה. */
    const allFilled = targetIds.every(function (tId) {
      return dragIds.some(function (dId) { return placement[dId] === tId; });
    });
    if (btn) { btn.hidden = false; btn.textContent = 'هل إجابتي صحيحة؟'; btn.disabled = !allFilled || sig() === lastWrong; btn.onclick = check; }
  }

  return { reset: reset, getState: getState, setState: setState, restoreUI: restoreUI };
}

/* תוצאת הרכיב: שלושת הסעיפים א/ב/ג (חלקים 2/3/4), בדיוק מה שמסך 0 מבטיח —
   "יש בה 3 סעיפים. עליכם להצליח בכולם".
   חלק 1 (הסימולציה) מוחרג במכוון: s1FinishWeighing כותב תמיד 'pass', ולכן
   אינו נושא מידע. */
function moedAComponentResult() {
  let _n = 0;
  try {
    _n = [2, 3, 4].filter(function (n) { return readMoedAResult(n) === 'pass'; }).length;
  } catch (e) {}
  return { success: moedAFullyPassed(), score: { scaled: _n / 3 } };
}

function s4SectionGDecision() {
  if (moedAFullyPassed()) {
    goTo(5);
  } else {
    /* לא עברו בהצלחה מלאה את מועד א -> מועד ב (סיין 6).
       ⚠️ הדיווח במסלול הכשל אינו אופציונלי — זו הלחיצה האחרונה של הלומד
       ברכיב הזה, והוא לעולם לא יגיע למסך 5.
       ⚠️ ובמכוון **לא** לפני ההסתעפות: Kata מסירה את הרכיב מהמסך ברגע
       שה-completed מגיע (הנחיות 2.7 עמ' 23), ולכן דיווח מוקדם היה מונע
       ממי שהצליח לראות את מסך 5 בכלל. כל מסלול מדווח בנפרד, בנקודת
       הסיום האמיתית שלו. */
    xapiEndComponent(moedAComponentResult(), document.getElementById('s4-check'));
    if (DEV_NAV) window.location.href = '../methodica-ar-science-mass-measure-03-06/index.html';
  }
}

const TEXTS_S4_DQ = {
  correct: {
    title: 'كل الاحترام!',
    body: 'التوصية بإجراء 4 قياسات تستند إلى الحقيقة بأن المعدل يبدأ بالاستقرار في هذه المرحلة. التكرارات الإضافية تقلّل عدم اليقين وتساعد في الحصول على نتيجة موثوقة أكثر.'
  },
  wrong1: {
    title: 'الإجابة غير صحيحة.',
    body: 'لا بأس، دنيا تعطينا محاولة أخرى.\nهل نحاول مرة أخرى؟'
  },
  wrongFinal: {
    title: 'الإجابة غير صحيحة بالكامل.\nالإجابة الصحيحة مُشار إليها.',
    body: 'التوصية بإجراء 4 قياسات تستند إلى الحقيقة بأن المعدل يبدأ بالاستقرار في هذه المرحلة. التكرارات الإضافية تقلّل عدم اليقين وتساعد في الحصول على نتيجة موثوقة أكثر.'
  },
  pending: {
    title: 'الإجابة غير صحيحة.',
    body: 'ترغبون بعرض الحل الصحيح؟'
  }
};

const dqSectionG = makeDragQuestion({
  prefix: 's4',
  screenSelector: '#s4',
  checkBtnId: 's4-check',
  hintBtnId: 's4-hint',
  hintOverlayId: 's4-hint-overlay',
  feedboxId: 's4-feedbox',
  revealBtnId: 's4-reveal-btn',
  wordBankId: 's4-word-bank',
  resultKey: 'lomda_moedA_part4_result',
  /* xAPI: סעיף ג הוא השאלה השלישית של פריט 001. */
  xapiItem: '001',
  xapiQuestions: ['q3'],
  onContinue: s4SectionGDecision,
  labels: {
    's4-drag-4': '4',
    's4-drag-3': '3',
    's4-drag-memutza': 'المعدل',
    's4-drag-hityatzev': 'استقرار',
    's4-drag-vadaut': 'عدم اليقين',
    's4-drag-amina': 'موثوقة',
    's4-drag-hazarot': 'تكرارات',
    's4-drag-hishtana': 'تغيّر',
    's4-drag-shguya': 'خاطئة'
  },
  correctMap: {
    's4-target-1': 's4-drag-4',
    's4-target-2': 's4-drag-memutza',
    's4-target-3': 's4-drag-hityatzev',
    's4-target-4': 's4-drag-3',
    's4-target-5': 's4-drag-vadaut',
    's4-target-6': 's4-drag-amina'
  },
  texts: TEXTS_S4_DQ
});

function resetScreenState4() {
  dqSectionG.reset();
}

document.getElementById('s4-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s4CloseHint();
});

/* =========================================================
   מסך 6 — סיום היחידה (מועד א הושלם בהצלחה מלאה)
   ========================================================= */

const S5_AVATAR_ASSETS = {
  pink: 'assets/gifs/pink-avatar-dancing.mp4',
  boy: 'assets/gifs/boy-avatar-dancing.mp4'
};

function resetScreenState5() {
  resolveCharBubbleVideo('s5-avatar-video', S5_AVATAR_ASSETS);
}

/* נקודת הסיום של מסלול ההצלחה — הלחיצה האחרונה של הלומד במסך 5.
   המקבילה למסלול הכשל היא s4SectionGDecision, שמדווח שם בנפרד. */
function s5Finish() {
  xapiEndComponent(moedAComponentResult(), document.getElementById('s5-finish'));
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
scqFbMakeDraggable('s2-feedbox');
scqFbMakeDraggable('s3-feedbox');
scqFbMakeDraggable('s4-feedbox');

/* ═══════════════════ resume — ארבעת ה-hooks של הסין ═══════════════════ */

function capturePartPayload() {
  var st = { currentScreen: currentScreen };
  st.qResults = Object.assign({}, XAPI_Q_RESULTS);

  /* מסך 1 — טבלת השקילה. השורות **מוזרקות** (resetScreenState1 ו-s1AddRow),
     ולכן אחרי טעינת עמוד ה-tbody חוזר לברירת המחדל שב-markup וכל ערך
     שהוקלד אבד. rowCount בונה מחדש את המבנה ו-cells ממלאים אותו;
     הממוצעים **אינם** נשמרים — s1ComputeAverages גוזרת אותם מחדש. */
  st.s1 = { rowCount: s1RowCount, finished: s1Finished, cells: [] };
  document.querySelectorAll('#s1-table-body tr .tbl-input')
    .forEach(function (i) { st.s1.cells.push(i.value); });
  st.s1.sim = s1Sim.getState ? s1Sim.getState() : null;

  st.scq = {
    s2: { sel: s2Selected, att: s2Attempts, done: s2Done, phase: s2Phase, lw: s2LastWrong },
    s3: { sel: s3Selected, att: s3Attempts, done: s3Done, phase: s3Phase, lw: s3LastWrong }
  };
  st.dqG = dqSectionG.getState();
  return st;
}

function applyResumeVars(st) {
  if (!st) return;
  if (st.qResults) Object.keys(st.qResults).forEach(function (k) { XAPI_Q_RESULTS[k] = st.qResults[k]; });
  if (st.s1) {
    s1RowCount = st.s1.rowCount || 1;
    s1Finished = !!st.s1.finished;
    if (st.s1.sim && s1Sim.setState) s1Sim.setState(st.s1.sim);
  }
  if (st.scq) {
    if (st.scq.s2) { s2Selected = st.scq.s2.sel || null; s2Attempts = st.scq.s2.att || 0; s2Done = !!st.scq.s2.done; s2Phase = st.scq.s2.phase || 'before'; s2LastWrong = st.scq.s2.lw || null; }
    if (st.scq.s3) { s3Selected = st.scq.s3.sel || null; s3Attempts = st.scq.s3.att || 0; s3Done = !!st.scq.s3.done; s3Phase = st.scq.s3.phase || 'before'; s3LastWrong = st.scq.s3.lw || null; }
  }
  if (st.dqG) dqSectionG.setState(st.dqG);
  /* הערכים של הטבלה נשמרים כאן ומוחלים ב-s1RestoreUI: אי אפשר לכתוב
     ל-<input> שעוד לא נוצר, והשורות מוזרקות. */
  __s1Cells = (st.s1 && st.s1.cells) ? st.s1.cells.slice() : null;
}

/* ⚠️ חריגה מכוונת מהכלל "ערכי DOM ב-applyResumeDom": שורות הטבלה עדיין לא
   קיימות בשלב הזה. מילוי הערכים קורה ב-s1RestoreUI, אחרי הבנייה מחדש. */
var __s1Cells = null;
function applyResumeDom(st) {}

function restoreScreenUI(n) {
  try {
    if (n === 1) s1RestoreUI();
    if (n === 2) restoreScqUI({ screenSel: '#s2', cfg: S2, selected: s2Selected, attempts: s2Attempts,
      lastWrong: s2LastWrong,
      done: s2Done, phase: s2Phase, optEl: s2OptEl, lock: s2LockOptions, showFeedback: s2ShowFeedback,
      setBarDone: s2SetBarDone, check: s2Check, checkBtnId: 's2-check', hintBtnId: 's2-hint',
      onContinue: function () { goTo(3); } });
    if (n === 3) restoreScqUI({ screenSel: '#s3', cfg: S3, selected: s3Selected, attempts: s3Attempts,
      lastWrong: s3LastWrong,
      done: s3Done, phase: s3Phase, optEl: s3OptEl, lock: s3LockOptions, showFeedback: s3ShowFeedback,
      /* ⚠️ s3SetBarDone מקבל ארגומנט אחד בלבד (היעד שלו קבוע), בניגוד לכל
         שאר sNSetBarDone בפרויקט — מתאם, אחרת המטפל היה נבלע. */
      setBarDone: function (label, handler) { s3SetBarDone(label); },
      check: s3Check, checkBtnId: 's3-check', hintBtnId: 's3-hint',
      onContinue: function () {} });
    if (n === 4) dqSectionG.restoreUI();
  } catch (e) { console.error('[resume] restoreScreenUI', e); }
}

/* צייר חד-ברירה — זהה לזה שבסיין 4 ובסיין 2. */
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
    if (checkBtn) { checkBtn.textContent = 'هل إجابتي صحيحة؟'; checkBtn.onclick = o.check; checkBtn.disabled = true; }
    return;
  }
  var selEl = o.optEl(o.selected);
  if (selEl) { selEl.classList.add('selected'); selEl.setAttribute('aria-checked', 'true'); }
  if (checkBtn) { checkBtn.textContent = 'هل إجابتي صحيحة؟'; checkBtn.onclick = o.check;
    /* Retry gate (720 spec; דיווח MOE 23.09.26): הצייר רץ בכל goTo — בלי השער
       הזה חזרה למסך הייתה משחררת את התשובה השגויה לניסיון שני. */
    checkBtn.disabled = !o.selected || o.selected === o.lastWrong; }
}

/* מסך 1 — בונה מחדש את טבלת השקילה וממלא את הערכים שהוקלדו.
   ⚠️ מתקן גם נעילה שקיימת בקוד ללא קשר ל-resume: resetScreenState1 יוצאת
   מוקדם כש-s1Finished, ולכן לומד שסיים לשקול וריענן היה נוחת על טבלה ריקה
   עם "המשך" מושבת — ובלי שום דרך להתקדם, כי s1FinishWeighing גם היא יוצאת
   מוקדם ולא תפעיל אותו שוב. */
function s1RestoreUI() {
  var hasCells = __s1Cells && __s1Cells.some(function (v) { return v !== ''; });
  if (!s1Finished && s1RowCount <= 1 && !hasCells) return;   /* מסך נקי */

  var tbody = document.getElementById('s1-table-body');
  if (!tbody) return;

  /* אותה תבנית <tr> בדיוק כמו ב-resetScreenState1 / s1AddRow. */
  var html = '';
  for (var r = 1; r <= s1RowCount; r++) {
    html += '<tr data-row="' + r + '">' +
      '<td class="tbl-td"><span class="tbl-avg-display" id="s1-avg-' + r + '"></span></td>' +
      '<td class="tbl-td"><input class="tbl-input" type="text" inputmode="decimal" aria-label="الكتلة بالغرام، القياس رقم ' + r + '" oninput="s1OnCellInput()"></td>' +
      '<td class="tbl-td">' + r + '</td>' +
      '</tr>';
  }
  tbody.innerHTML = html;

  if (__s1Cells) {
    tbody.querySelectorAll('.tbl-input').forEach(function (input, i) {
      if (typeof __s1Cells[i] === 'string') input.value = __s1Cells[i];
    });
  }
  s1ComputeAverages();   /* עמודת הממוצע נגזרת, ולכן לא נשמרה */

  var addBtn = document.getElementById('s1-add-row');
  var finishBtn = document.getElementById('s1-finish-weighing');
  var contBtn = document.getElementById('s1-continue');
  if (s1Finished) {
    tbody.querySelectorAll('.tbl-input').forEach(function (i) { i.disabled = true; });
    if (addBtn) addBtn.disabled = true;
    if (finishBtn) finishBtn.disabled = true;
    if (contBtn) contBtn.disabled = false;   /* ← שחרור הנעילה */
  } else {
    if (addBtn) addBtn.disabled = (s1RowCount >= 7);
    if (finishBtn) finishBtn.disabled = false;
    if (contBtn) contBtn.disabled = true;
  }
}

/* ═══════════════════ xAPI (720) — קונפיגורציה של הסין ═══════════════════
   נתונים בלבד. השכבה המשותפת ב-../unit-js/ קוראת אותם בזמן call. */

/* ⚠️ חייב להחזיק בדיוק TOTAL_SCREENS מפתחות (6), 0..5, בלי חורים.
   כל משימת השיא היא פריט קטלוגי אחד (001) שנושא שלוש שאלות — סעיפים
   א/ב/ג — ולכן מסכים 1..4 חולקים סיומת אחת ולא נשלח ביניהם statement.
   מסך 5 הוא null, ולכן הכניסה אליו סוגרת את הפריט. */
var SCREEN_TO_SUBCONTENT = {
  0: null,          /* מעבר: הקדמה למשימת השיא */
  1: ['001', 1],    /* סימולציית שקילה + טבלת מדידות (איסוף הנתונים) */
  2: ['001', 2],    /* סעיף א — q1 */
  3: ['001', 3],    /* סעיף ב — q2 */
  4: ['001', 4],    /* סעיף ג — q3 (גרירה) */
  5: null           /* "השלמת את היחידה בהצלחה" — מסך סיום, בלי פריט */
};

var XAPI_COMP_SLUG = 'methodica-ar-science-mass-measure-03-05';
var XAPI_COMP_ID   = XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/';

var XAPI_EVAL_ITEMS = { '001': 1 };

/* QA 2026-10-02 O-8: item 001 is the whole component, so its 'completed' carries the component's
   own result (decided 2026-10-04), rebuilt from restored state after a reload. */
var XAPI_ITEM_RESULT = { '001': function () { return moedAComponentResult(); } };

var XAPI_METADATA_FILE = '../metadata/methodica-ar-science-mass-measure-03-05.json';

/* קישור בין סינים — חזרה: אם הגענו לכאן עם #screen=N (מכפתור "חזרה"
   בסיין הבא), קופצים ישר למסך הזה במקום למסך הראשון. */
(function () {
  const m = /^#screen=(\d+)$/.exec(location.hash);
  if (m) goTo(parseInt(m[1], 10));
  else resetScreenState(0);
})();
