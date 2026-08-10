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

let s1CurrentPage = 0;
let s1Jumping = false;

function s1GoToPage(index) {
  const pages = document.querySelectorAll('#s6-scroll-area .tbl-page');
  if (index < 0 || index >= pages.length || s1Jumping || index === s1CurrentPage) return;
  s1Jumping = true;
  s1CurrentPage = index;
  /* .scq-fb-box ממוקם ביחס למסך כולו (position:absolute), לא ביחס
     לסקשן הגלילה — אם משוב פתוח נשאר פתוח בגלילה לסקשן אחר, הוא
     "נתקע" בפינה השמאלית-תחתונה מעל התוכן החדש. סוגרים את כל תיבות
     המשוב של המסך הזה בכל מעבר סקשן, לפי בקשה מפורשת. */
  ['s6a-feedbox', 's6b-feedbox', 's6c-feedbox'].forEach(function (id) {
    const box = document.getElementById(id);
    if (box) box.classList.remove('visible');
  });
  /* sync לפני הגלילה, לא אחריה: dqSectionC.reset() (בקריאה הראשונה
     לעמוד 4) מבצע render() שבונה מחדש את קלפי הגרירה ב-DOM — מוטציה
     כזו אחרי scrollTo() קוטעת את אנימציית הגלילה החלקה באמצע (הדפדפן
     מבטל scroll-in-progress כשהתוכן הגלילי משתנה). */
  s1SyncBar(index);
  document.getElementById('s6-scroll-area').scrollTo({ top: pages[index].offsetTop, behavior: 'smooth' });
  setTimeout(function () { s1Jumping = false; }, 500);
}

function s1InitScrollJump() {
  const scrollArea = document.getElementById('s6-scroll-area');
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

function resetScreenState1() {
  const scrollArea = document.getElementById('s6-scroll-area');
  if (scrollArea) scrollArea.scrollTop = 0;
  s1CurrentPage = 0;
  s1InitScrollJump();
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
