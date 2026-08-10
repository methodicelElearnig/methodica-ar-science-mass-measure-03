'use strict';

/* =========================================================
   מנוע גלובלי — canvas scaling, ניווט מסכים, סטייט גלובלי
   ========================================================= */

const TOTAL_SCREENS = 6;
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

function saveMoedAResult(part, passed) {
  try { localStorage.setItem('lomda_moedA_part' + part + '_result', passed ? 'pass' : 'fail'); } catch (e) {}
}

function moedAFullyPassed() {
  let p1 = null, p2 = null, p3 = null, p4 = null;
  try {
    p1 = localStorage.getItem('lomda_moedA_part1_result');
    p2 = localStorage.getItem('lomda_moedA_part2_result');
    p3 = localStorage.getItem('lomda_moedA_part3_result');
    p4 = localStorage.getItem('lomda_moedA_part4_result');
  } catch (e) {}
  return p1 === 'pass' && p2 === 'pass' && p3 === 'pass' && p4 === 'pass';
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
  window.location.href = '../methodica-science-mass-measure-03-04/index.html#screen=3';
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
    '<td class="tbl-td"><input class="tbl-input" type="text" inputmode="decimal" aria-label="מסה בגרם, מדידה ' + s1RowCount + '" oninput="s1OnCellInput()"></td>' +
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
}

function s1Continue() { goTo(2); }

function resetScreenState1() {
  if (s1Finished) return; // resume-state guard — הושלם כבר, לא מאפסים
  s1RowCount = 1;
  const tbody = document.getElementById('s1-table-body');
  tbody.innerHTML =
    '<tr data-row="1">' +
    '<td class="tbl-td"><span class="tbl-avg-display" id="s1-avg-1"></span></td>' +
    '<td class="tbl-td"><input class="tbl-input" type="text" inputmode="decimal" aria-label="מסה בגרם, מדידה 1" oninput="s1OnCellInput()"></td>' +
    '<td class="tbl-td">1</td>' +
    '</tr>';
  document.getElementById('s1-add-row').disabled = false;
  document.getElementById('s1-finish-weighing').disabled = false;
  document.getElementById('s1-continue').disabled = true;
  const scrollArea = document.getElementById('s1-scroll-area');
  if (scrollArea) scrollArea.scrollTop = 0;
  s1InitScrollJump();
  s1CurrentPage = 0;
  s1Sim.reset();
}

/* אפקט "קפיצת עמוד" — הועתק מאותו מקור ששימש בכל מסכי הגלילה בפרויקט */
let s1CurrentPage = 0;
let s1Jumping = false;

function s1GoToPage(index) {
  const pages = document.querySelectorAll('#s1-scroll-area .tbl-page');
  if (index < 0 || index >= pages.length || s1Jumping || index === s1CurrentPage) return;
  s1Jumping = true;
  s1CurrentPage = index;
  document.getElementById('s1-scroll-area').scrollTo({ top: pages[index].offsetTop, behavior: 'smooth' });
  setTimeout(function () { s1Jumping = false; }, 500);
}

function s1InitScrollJump() {
  const scrollArea = document.getElementById('s1-scroll-area');
  if (!scrollArea || scrollArea.dataset.jumpInit) return;
  scrollArea.dataset.jumpInit = 'true';

  scrollArea.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (s1Jumping || e.deltaY === 0) return;
    s1GoToPage(s1CurrentPage + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });

  scrollArea.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); s1GoToPage(s1CurrentPage + 1); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); s1GoToPage(s1CurrentPage - 1); }
  });
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

  function reset() {
    cancelAnim();
    state.x = S1_SIM_NECKLACE_IDLE.x; state.y = S1_SIM_NECKLACE_IDLE.y;
    state.placed = false; state.dragging = false; state.measureIndex = 0;
    renderNecklace();
    renderLcd(0);
  }

  reset();
  return { reset: reset };
}

const s1Sim = makeSingleScaleSimulation({ rootId: 's1-sim', values: S1_SIM_VALUES, hit: S1_SIM_HIT });

/* =========================================================
   מסך 3 — סעיף א: SCQ עם טבלה (במקום תמונה). בלי qnav.
   ========================================================= */

const S2 = {
  correctId: 'c',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'נכון.', body: 'לאחר כ-4 מדידות הממוצע מתחיל להשתנות פחות בין מדידה למדידה, ולכן אפשר לומר שהוא מתחיל להתייצב.' },
    wrong1: { title: 'התשובה אינה נכונה.', body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?' },
    wrong2: { title: 'התשובה אינה נכונה.\nהתשובה הנכונה מסומנת.',
      body: 'לאחר כ-4 מדידות הממוצע מתחיל להשתנות פחות בין מדידה למדידה, ולכן אפשר לומר שהוא מתחיל להתייצב.' }
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
    saveMoedAResult(2, true);
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
    saveMoedAResult(2, false);
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
  if (s2Done || s2Attempts > 0 || s2Selected) return; // resume-state guard
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
   מסך 4 — סעיף ב: SCQ עם תמונה + בועית דיבור. בלי qnav. סיום הסעיף
   הזה משלים את מועד א — בודק moedAFullyPassed() ומנתב בהתאם.
   ========================================================= */

const S3 = {
  correctId: 'c',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'התשובה נכונה.', body: 'מדידה אחת יכולה להיות מושפעת מאי ודאות או מטעות רגעית. ממוצע של כמה מדידות נותן בסיס אמין יותר לקביעת מסת התליון.' },
    wrong1: { title: 'התשובה אינה נכונה.', body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?' },
    wrong2: { title: 'התשובה אינה נכונה.\nהתשובה הנכונה מסומנת.', body: 'מדידה אחת יכולה להיות מושפעת מאי ודאות או מטעות רגעית. ממוצע של כמה מדידות נותן בסיס אמין יותר לקביעת מסת התליון.' }
  }
};

let s3Selected = null;
let s3Attempts = 0;
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
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = false;
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

  if (s3Selected === S3.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s3Phase = 'correct';
    s3Done = true;
    s3LockOptions();
    s3ShowFeedback('correct', true);
    saveMoedAResult(3, true);
    s3SetBarDone('המשך');
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s3Attempts < S3.maxAttempts) {
    s3Phase = 'wrong1';
    s3ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s3-check');
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = true;
    checkBtn.onclick = s3Check;
    const hintBtn = document.getElementById('s3-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s3OptEl(S3.correctId).classList.add('correct');
    s3Phase = 'wrong-final';
    s3Done = true;
    s3LockOptions();
    s3ShowFeedback('wrong2', false);
    saveMoedAResult(3, false);
    s3SetBarDone('המשך');
  }
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
  s3Phase = 'before';
  s3UnlockOptions();
  document.querySelectorAll('#s3 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
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

document.querySelectorAll('#s3 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s3Select(opt.dataset.id);
    }
  });
});

/* =========================================================
   מסך 5 — סעיף ג: מסך גלילה. עמוד 1 = תמונה+בועה (לפי פיגמה, ראו
   index.html/styles.css/ARCHITECTURE.md). עמוד 2 = שאלת גרירה
   (makeDragQuestion factory, זהה לזה שכבר קיים בסיין 3, הועתק לכאן
   כי כל סיין עצמאי בפני עצמו — אין script.js משותף בין הסינים).
   סעיף ג הוא הסעיף האחרון של מועד א — בסיומו מתבצעת בדיקת
   moedAFullyPassed() (4 חלקים) והניתוב בהתאם.
   ========================================================= */

let s4CurrentPage = 0;
let s4Jumping = false;

function s4GoToPage(index) {
  const pages = document.querySelectorAll('#s4-scroll-area .tbl-page');
  if (index < 0 || index >= pages.length || s4Jumping || index === s4CurrentPage) return;
  s4Jumping = true;
  s4CurrentPage = index;
  document.getElementById('s4-scroll-area').scrollTo({ top: pages[index].offsetTop, behavior: 'smooth' });
  setTimeout(function () { s4Jumping = false; }, 500);
}

function s4InitScrollJump() {
  const scrollArea = document.getElementById('s4-scroll-area');
  if (!scrollArea || scrollArea.dataset.jumpInit) return;
  scrollArea.dataset.jumpInit = 'true';

  scrollArea.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (s4Jumping || e.deltaY === 0) return;
    s4GoToPage(s4CurrentPage + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });

  scrollArea.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); s4GoToPage(s4CurrentPage + 1); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); s4GoToPage(s4CurrentPage - 1); }
  });
}

/* makeDragQuestion factory — זהה 1:1 לזו שבסיין 3 (maxAttempts+onResult) */
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
      if (cfg.onResult) cfg.onResult('success');
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
      if (cfg.onResult) cfg.onResult('fail');
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
    answerSnapshot = null; revealed = false;
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

function s4SectionGDecision() {
  if (moedAFullyPassed()) {
    goTo(5);
  } else {
    /* לא עברו בהצלחה מלאה את מועד א -> קישור בין סינים לסיין 6 ("מועד ב",
       נתיב יחסי, אותה מוסכמה בדיוק כמו בפרויקט הקודם, Methodica-science
       -mass-measure-02-linked). אם כן עברו (branch למעלה) — אין צורך
       במועד ב כלל, s5Finish() נשאר נקודת הסיום האמיתית (לא מקושר הלאה). */
    window.location.href = '../methodica-science-mass-measure-03-06/index.html';
  }
}

const TEXTS_S4_DQ = {
  correct: {
    title: 'כל הכבוד!',
    body: 'ההמלצה לבצע 4 מדידות מבוססת על כך שבשלב זה הממוצע מתחיל להתייצב. חזרות נוספות מפחיתות את אי הוודאות ומאפשרות לקבל תוצאה אמינה יותר.'
  },
  wrong1: {
    title: 'התשובה אינה נכונה.',
    body: 'לא נורא, מוריה נותנת לנו עוד ניסיון.\nננסה שוב?'
  },
  wrongFinal: {
    title: 'התשובה אינה נכונה במלואה.\nהתשובה הנכונה מסומנת.',
    body: 'ההמלצה לבצע 4 מדידות מבוססת על כך שבשלב זה הממוצע מתחיל להתייצב. חזרות נוספות מפחיתות את אי הוודאות ומאפשרות לקבל תוצאה אמינה יותר.'
  },
  pending: {
    title: 'התשובה אינה נכונה.',
    body: 'רוצים לראות את הפתרון הנכון?'
  }
};

const dqSectionG = makeDragQuestion({
  prefix: 's4',
  screenSelector: '#s4',
  panelId: 's4-scroll-area',
  checkBtnId: 's4-check',
  hintBtnId: 's4-hint',
  hintOverlayId: 's4-hint-overlay',
  feedboxId: 's4-feedbox',
  revealBtnId: 's4-reveal-btn',
  wordBankId: 's4-word-bank',
  resultKey: 'lomda_moedA_part4_result',
  onContinue: s4SectionGDecision,
  labels: {
    's4-drag-4': '4',
    's4-drag-3': '3',
    's4-drag-memutza': 'ממוצע',
    's4-drag-hityatzev': 'התייצב',
    's4-drag-vadaut': 'אי-ודאות',
    's4-drag-amina': 'אמינה',
    's4-drag-hazarot': 'חזרות',
    's4-drag-hishtana': 'השתנה',
    's4-drag-shguya': 'שגויה'
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
  s4InitScrollJump();
  const scrollArea = document.getElementById('s4-scroll-area');
  if (scrollArea) scrollArea.scrollTop = 0;
  s4CurrentPage = 0;
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

function s5Finish() {
  /* TODO: לחבר לפעולת סיום הלומדה/היחידה כשתיבנה (LMS) — זהה למוסכמה
     בפרויקט הקודם (s4Finish/s13Finish/s14Finish ב-Methodica-02-05/06). */
  console.log('TODO: כפתור "סיימתי" — לחבר לפעולת סיום הלומדה כשתיבנה.');
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
/* קישור בין סינים — חזרה: אם הגענו לכאן עם #screen=N (מכפתור "חזרה"
   בסיין הבא), קופצים ישר למסך הזה במקום למסך הראשון. */
(function () {
  const m = /^#screen=(\d+)$/.exec(location.hash);
  if (m) goTo(parseInt(m[1], 10));
  else resetScreenState(0);
})();
