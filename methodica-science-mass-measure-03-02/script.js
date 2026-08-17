'use strict';

/* =========================================================
   מנוע גלובלי — canvas scaling, ניווט מסכים, סטייט גלובלי
   ========================================================= */

const TOTAL_SCREENS = 10;
let currentScreen = 0;

/* הדמות שנבחרה בסיין 1 (מסך 1, TwoOptionSelection) נשמרה שם
   ב-localStorage תחת אותו מפתח בדיוק ('lomda_selectedCharacter') —
   כאן היא נקראת מחדש, כדי שהדמות הנלווית תמשיך "לזכור" את הבחירה
   גם בסיין נפרד לחלוטין (סיין = מסמך HTML נפרד, window.lomdaState
   לא "עובר" בין סינים בטעינת עמוד מלאה — localStorage הוא הגשר).
   try/catch: בפתיחה מ-file:// חלק מהדפדפנים חוסמים גישה ל-
   localStorage עם SecurityError — בלי ה-try/catch, חריגה כאן
   הייתה עוצרת את טעינת כל script.js */
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
  /* כל מסך תוכן שנוסף מקבל כאן שורת if (n === X) resetScreenStateX(); משלו,
     ומגדיר את הפונקציה resetScreenStateX() ליד קטע ה-HTML/JS של המסך —
     בדיוק לפי המוסכמה שנקבעה בסיין 1. */
  if (n === 0) resetScreenState0();
  if (n === 1) resetScreenState1();
  if (n === 2) resetScreenState2();
  if (n === 3) resetScreenState3();
  if (n === 4) resetScreenState4();
  if (n === 5) resetScreenState5();
  if (n === 6) resetScreenState6();
  if (n === 7) resetScreenState7();
  if (n === 8) resetScreenState8();
  if (n === 9) resetScreenState9();
}

/* =========================================================
   פונקציית עזר גלובלית — Companion character system
   (720-templates skill: _global-components.md). זהה 1:1 לזו שבסיין 1.
   עודכן (2026-08-11): תומכת גם ב-<video> (לפי tagName בפועל) — מסכים 1+5
   הוחלפו מתמונה סטטית לווידאו בלולאה/מושתק, ראו preloadVideo() למטה.
   ========================================================= */
function preloadVideo(src) {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'video';
  link.href = src;
  document.head.appendChild(link);
}

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
   מסך 1 — מעבר/הזנקה לפני תרגול. שוכפל ממסך 13 (id="s12") של סיין 1.
   דמות: פוזה ייעודית "come-on" (pink-avatar-come-on.png/boy-avatar-
   come-on.png, סופקה 2026-07-14). boy-avatar-come-on הגיע עם רקע לבן
   אפוי (RGB, לא שקוף) — הוסר באותו pipeline flood-fill/feathering/
   color-decontamination כמו שאר תמונות הדמות בפרויקט (numpy/scipy/
   Pillow); המקור נשמר ב-assets/images/originals/boy-avatar-come-on-
   original.png. pink-avatar-come-on הגיע כבר RGBA שקוף — לא נדרש עיבוד.
   ========================================================= */

const S0_AVATAR_ASSETS = {
  pink: 'assets/videos/pink-avatar-come-on.mp4',
  boy: 'assets/videos/boy-avatar-come-on.mp4'
};
preloadVideo(S0_AVATAR_ASSETS.pink);
preloadVideo(S0_AVATAR_ASSETS.boy);

function resetScreenState0() {
  resolveCharBubbleImg('s0-avatar-img', S0_AVATAR_ASSETS);
}

function s0Continue() { goTo(1); }

/* קישור בין סינים: מסך ראשון בסיין 2 -> מסך אחרון בסיין 1 (s21, המסך
   האחרון בפועל שם). נתיב יחסי + #screen=N, אותה מוסכמה בדיוק כמו
   בפרויקט הקודם, Methodica-science-mass-measure-02-linked. */
function s0BackToPreviousSain() {
  window.location.href = '../methodica-science-mass-measure-03-01/index.html#screen=21';
}

/* =========================================================
   stationProgress — מעקב 3 השאלות של הסיין הזה (מסכים 2-4)
   הסרגל המשותף (updateQuestionNav) קורא מהאובייקט הזה, בדיוק לפי
   המוסכמה שנקבעה בסיין 1 (עותק גנרי, לא תלוי-פרויקט).
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
   מסך 2 — שאלה 1 מתוך 3: רב-ברירה (MultipleChoiceQuestion, checkbox)
   הועתק ממסך 2 (id="s1") של Methodica-science-mass-measure-02-02.
   2 ניסיונות. תוכן: תסריט הפקה, שקפים 70-74 (2 תשובות נכונות: ב+ג).
   ========================================================= */

const MCQ_S1 = {
  correctIds: ['b', 'c'],
  maxAttempts: 2,
  feedback: {
    correct: { title: 'נכון.', body: 'ככל שטעות במדידה משמעותית יותר, כך נדרשת רמת דיוק גבוהה יותר.' },
    wrong1: { title: 'התשובה אינה נכונה.', body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?' },
    wrong2: { title: 'זו טעות. התשובה הנכונה מסומנת.', body: 'ככל שטעות במדידה משמעותית יותר, כך נדרשת רמת דיוק גבוהה יותר.' }
  }
};

let s1Selected = [];
let s1Attempts = 0;
let s1Done = false;
let s1Phase = 'before';

function s1OptEl(id) { return document.querySelector('#s1 .scq-opt[data-id="' + id + '"]'); }

function s1Toggle(id) {
  if (s1Done) return;
  if (s1Phase === 'wrong1') {
    document.querySelectorAll('#s1 .scq-opt').forEach(function (el) { el.classList.remove('wrong'); });
    document.getElementById('s1-feedbox').classList.remove('visible');
    s1Phase = 'before';
  }
  const el = s1OptEl(id);
  const idx = s1Selected.indexOf(id);
  if (idx >= 0) {
    s1Selected.splice(idx, 1);
    el.classList.remove('selected');
    el.setAttribute('aria-checked', 'false');
  } else {
    s1Selected.push(id);
    el.classList.add('selected');
    el.setAttribute('aria-checked', 'true');
  }
  if (s1Selected.length > 0) s1Phase = 'selected';
  const checkBtn = document.getElementById('s1-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = s1Selected.length === 0;
  checkBtn.onclick = s1Check;
}

function s1ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s1-feedbox');
  const data = MCQ_S1.feedback[kind];
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
  if (s1Selected.length === 0 || s1Done) return;
  s1Attempts++;
  const correct = MCQ_S1.correctIds;
  const isCorrect = correct.length === s1Selected.length &&
    correct.every(function (cid) { return s1Selected.indexOf(cid) >= 0; });

  if (isCorrect) {
    s1Phase = 'correct';
    s1Done = true;
    correct.forEach(function (cid) {
      const el = s1OptEl(cid);
      el.classList.remove('selected');
      el.classList.add('correct');
    });
    s1LockOptions();
    s1ShowFeedback('correct', true);
    stationProgress.q1 = 'success';
    updateQuestionNav('s1');
    s1SetBarDone('המשך', function () { goTo(2); });
    return;
  }

  document.querySelectorAll('#s1 .scq-opt').forEach(function (el) {
    if (s1Selected.indexOf(el.dataset.id) >= 0) {
      el.classList.remove('selected');
      el.classList.add('wrong');
    }
  });
  s1Selected = [];

  if (s1Attempts < MCQ_S1.maxAttempts) {
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
    correct.forEach(function (cid) {
      const el = s1OptEl(cid);
      el.classList.remove('wrong');
      el.classList.add('correct');
    });
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
    el.onclick = function () { s1Toggle(el.dataset.id); };
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
  if (s1Done || s1Attempts > 0 || s1Selected.length > 0) return; // resume-state guard
  s1Selected = [];
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
  hintBtn.hidden = false;
  hintBtn.disabled = false;
  document.getElementById('s1-hint-overlay').hidden = true;
}

/* =========================================================
   מסך 3 — שאלה 2 מתוך 3: חד-ברירה עם תמונה (SingleChoiceQuestion)
   שוכפל ממסך 15 (id="s14") של סיין 1. 2 ניסיונות, רמז מוסתר עד
   ניסיון ראשון שגוי. תוכן: תסריט הפקה, שקפים 75-79 (correctId='a').
   ========================================================= */

const S2 = {
  correctId: 'a',
  maxAttempts: 2,
  feedback: {
    correct: {
      title: 'נכון.',
      body: 'חזרות מצמצמות אי־ודאות ומגדילות את הביטחון בתוצאה.'
    },
    wrong1: {
      title: 'התשובה אינה נכונה.',
      body: 'זה קורה לכולם בלמידה אמיתית.\nננסה שוב?'
    },
    wrong2: {
      title: 'התשובה אינה נכונה. התשובה הנכונה מסומנת.',
      body: 'חזרות מצמצמות אי־ודאות ומגדילות את הביטחון בתוצאה.'
    }
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
  hintBtn.hidden = false;
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
   מסך 4 — שאלה 3 מתוך 3: חד-ברירה עם תמונה (SingleChoiceQuestion)
   שוכפל ממסך 3 (לעיל, s2) של הסיין הזה. 2 ניסיונות. תוכן: תסריט
   הפקה, שקפים 80-84 (correctId='c', התשובה הנכונה של הגברת מילי).
   ========================================================= */

const S3 = {
  correctId: 'c',
  maxAttempts: 2,
  feedback: {
    correct: {
      title: 'נכון!',
      body: 'מדידה כמותית מספקת נתונים שניתן לבדוק ולהשוות.'
    },
    wrong1: {
      title: 'התשובה אינה נכונה.',
      body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?'
    },
    wrong2: {
      title: 'זו טעות. התשובה הנכונה מסומנת.',
      body: 'מדידה כמותית מספקת נתונים שניתן לבדוק ולהשוות.'
    }
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

function s3SetBarDone(label, handler) {
  const checkBtn = document.getElementById('s3-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  checkBtn.onclick = handler;
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
    stationProgress.q3 = 'success';
    updateQuestionNav('s3');
    /* באג ישן: זו לא הייתה "מסך אחרון של הסיין" — s4 (מסך 5) כבר קיים
       בפועל, ההערה/callback הריק נשארו מזמן שהמסך הזה היה אכן האחרון
       שנבנה. תוקן ל-goTo(4) בפועל. */
    s3SetBarDone('המשך', function () { goTo(4); });
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
    stationProgress.q3 = 'fail';
    updateQuestionNav('s3');
    /* באג ישן: זו לא הייתה "מסך אחרון של הסיין" — s4 (מסך 5) כבר קיים
       בפועל, ההערה/callback הריק נשארו מזמן שהמסך הזה היה אכן האחרון
       שנבנה. תוקן ל-goTo(4) בפועל. */
    s3SetBarDone('המשך', function () { goTo(4); });
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
  updateQuestionNav('s3');
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
  hintBtn.hidden = false;
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
   מסך 5 — מעבר: "יופי של עבודה! עוד 2 תרגילים". שוכפל ממסך 13
   (id="s12") של סיין 1. דמות: placeholder זמני (ברירת מחדל pink/boy) —
   שקף 85 ציין "מקום לגיף" (גיף אנימציה טרם סופק), כמו מסך 10 בסיין 1
   לפני שסופקה פוזה ייעודית.
   ========================================================= */

const S4_AVATAR_ASSETS = {
  pink: 'assets/videos/pink-avatar-holds-weight.mp4',
  boy: 'assets/videos/boy-avatar-hold-golds.mp4'
};
preloadVideo(S4_AVATAR_ASSETS.pink);
preloadVideo(S4_AVATAR_ASSETS.boy);

function resetScreenState4() {
  resolveCharBubbleImg('s4-avatar-img', S4_AVATAR_ASSETS);
}

function s4Continue() { goTo(5); }

/* =========================================================
   stationProgress2 — תחנת התקדמות **חדשה ונפרדת** לשתי השאלות
   המתקדמות (מסכים 6+, לפי שקף 85 "עוד 2 תרגילים ברמת קושי גבוהה
   יותר"). לא אותו אובייקט כמו stationProgress (3 השאלות הבסיסיות,
   מסכים 2-4) — תחנה עצמאית עם ה-qnav והמונה שלה, בדיוק כמו שסיין 1
   מחזיק כמה תחנות נפרדות (stationProgress/stationBProgress) זו לצד זו.
   ========================================================= */

let stationProgress2 = { q1: null, q2: null };

function updateQuestionNav2(prefix) {
  const qs = [stationProgress2.q1, stationProgress2.q2];
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
   מסך 6 — שאלה 1 מתוך 2: הקדמה + טבלה + תמונה. מסך זה עצמו לא
   פותר את השאלה (אין בדיקה/תשובות כאן) — הוא רק מציג את התרחיש
   וטבלת רמות הדיוק; הסעיפים (א/ב/ג) שבאמת קובעים success/fail
   ייבנו כמסכים נפרדים בהמשך ויעדכנו את stationProgress2.q1 עצמם.
   ========================================================= */

function resetScreenState5() {
  updateQuestionNav2('s5');
}

function s5Continue() { goTo(6); }

/* =========================================================
   שאלה 1 מתוך 2 — מורכבת מ-4 סעיפים (א/ב/ג/ד, מסכים 7-10). אם סעיף
   כלשהו נכשל (ניסיון שגוי סופי), כל השאלה מסומנת fail על ה-qnav, גם
   אם שאר הסעיפים נענו נכון — בדיוק לפי המוסכמה שנקבעה בסיין 1 לשאלה
   1 שם (stationBSectionResults/stationBSectionDone, שם רק 2 סעיפים;
   כאן 4). q1SectionDone נקרא פעם אחת מכל סעיף עם התוצאה שלו; רק
   כשכל ה-4 נרשמים היא קובעת את stationProgress2.q1 ומעדכנת qnav.
   ========================================================= */

let q1SectionResults = { a: null, b: null, c: null, d: null };

function q1SectionDone(section, outcome) {
  q1SectionResults[section] = outcome;
  const values = [q1SectionResults.a, q1SectionResults.b, q1SectionResults.c, q1SectionResults.d];
  if (values.indexOf(null) === -1) {
    stationProgress2.q1 = values.every(function (v) { return v === 'success'; }) ? 'success' : 'fail';
  }
}

/* =========================================================
   מסך 7 — שאלה 1/2, סעיף א: SCQ עם תמונה. שוכפל ממסך 15 בסיין 1.
   ========================================================= */

const S6 = {
  correctId: 'a',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'נכון.', body: 'רמת הדיוק צריכה להתאים לדרישות התקן.' },
    wrong1: { title: 'התשובה אינה נכונה.', body: 'המשיכו לנסות, אתם בכיוון הנכון.\nננסה שוב?' },
    wrong2: { title: 'זו טעות. התשובה הנכונה מסומנת.', body: 'רמת הדיוק צריכה להתאים לדרישות התקן.' }
  }
};

let s6Selected = null;
let s6Attempts = 0;
let s6Done = false;
let s6Phase = 'before';

function s6OptEl(id) { return document.querySelector('#s6 .scq-opt[data-id="' + id + '"]'); }

function s6Select(id) {
  if (s6Done) return;
  const wasWrong1 = (s6Phase === 'wrong1');
  document.querySelectorAll('#s6 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const selectedEl = s6OptEl(id);
  selectedEl.classList.add('selected');
  selectedEl.setAttribute('aria-checked', 'true');
  s6Selected = id;
  s6Phase = 'selected';
  if (wasWrong1) document.getElementById('s6-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s6-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = false;
  checkBtn.onclick = s6Check;
}

function s6ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s6-feedbox');
  const data = S6.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s6SetBarDone(label, handler) {
  const checkBtn = document.getElementById('s6-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  checkBtn.onclick = handler;
  document.getElementById('s6-hint').hidden = true;
}

function s6Check() {
  if (!s6Selected || s6Done) return;
  s6Attempts++;
  const optEl = s6OptEl(s6Selected);

  if (s6Selected === S6.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s6Phase = 'correct';
    s6Done = true;
    s6LockOptions();
    s6ShowFeedback('correct', true);
    q1SectionDone('a', 'success');
    updateQuestionNav2('s6');
    s6SetBarDone('המשך', function () { goTo(7); });
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s6Attempts < S6.maxAttempts) {
    s6Phase = 'wrong1';
    s6ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s6-check');
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = true;
    checkBtn.onclick = s6Check;
    const hintBtn = document.getElementById('s6-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s6OptEl(S6.correctId).classList.add('correct');
    s6Phase = 'wrong-final';
    s6Done = true;
    s6LockOptions();
    s6ShowFeedback('wrong2', false);
    q1SectionDone('a', 'fail');
    updateQuestionNav2('s6');
    s6SetBarDone('המשך', function () { goTo(7); });
  }
}

function s6LockOptions() {
  document.querySelectorAll('#s6 .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}
function s6UnlockOptions() {
  document.querySelectorAll('#s6 .scq-opt').forEach(function (el) {
    el.classList.remove('disabled');
    el.onclick = function () { s6Select(el.dataset.id); };
  });
}

function s6OpenHint() {
  if (s6Done) return;
  document.getElementById('s6-hint-overlay').hidden = false;
}
function s6CloseHint() { document.getElementById('s6-hint-overlay').hidden = true; }
document.getElementById('s6-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s6CloseHint();
});

function resetScreenState6() {
  updateQuestionNav2('s6');
  if (s6Done || s6Attempts > 0 || s6Selected) return; // resume-state guard
  s6Selected = null;
  s6Attempts = 0;
  s6Phase = 'before';
  s6UnlockOptions();
  document.querySelectorAll('#s6 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s6-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s6-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = true;
  checkBtn.onclick = s6Check;
  const hintBtn = document.getElementById('s6-hint');
  hintBtn.hidden = false;
  hintBtn.disabled = false;
  document.getElementById('s6-hint-overlay').hidden = true;
}

document.querySelectorAll('#s6 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s6Select(opt.dataset.id);
    }
  });
});

/* =========================================================
   מסך 8 — שאלה 1/2, סעיף ב: ValueInputQuestion (3 כרטיסי-תצוגה +
   קלט מספרי). הרכיב הרלוונטי בלבד הושרא ממסך 6 בסיין 1 (viqCheck-
   style), לא כל הפקטורי הגנרי — נכתב ייעודי למסך הזה, לפי מוסכמת
   השמות הפרטניות של שאר מסכי הסיין הזה (s6Select/s6Check וכו').
   ========================================================= */

const S7 = {
  correct: 429,
  maxAttempts: 2,
  feedback: {
    correct: { title: 'התשובה נכונה. כל הכבוד.', body: 'אם נחבר את שלושת המספרים ונחלק בשלוש נקבל את הממוצע: 429 גרם' },
    wrong1: { title: 'התשובה אינה נכונה.', body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?' },
    wrong2: { title: 'זו טעות. התשובה הנכונה מוצגת.', body: 'אם נחבר את שלושת המספרים ונחלק בשלוש נקבל את הממוצע: 429 גרם' },
    pending: { title: 'זו טעות.', body: 'רוצים לראות את הפתרון הנכון?' }
  }
};

let s7Attempts = 0;
let s7Done = false;
let s7AnswerSnapshot = null; // הערך שהלומד הזין בפועל בניסיון האחרון (לא הערך הנכון)
let s7Revealed = false;

function s7OnInput() {
  const input = document.getElementById('s7-input');
  const btn = document.getElementById('s7-check');
  if (input.classList.contains('error')) {
    input.classList.remove('error');
    document.getElementById('s7-feedbox').classList.remove('visible');
  }
  btn.disabled = !input.value.trim();
}

function s7ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s7-feedbox');
  const data = S7.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s7Check() {
  if (s7Done) { goTo(8); return; }
  const input = document.getElementById('s7-input');
  const isCorrect = Number(input.value) === S7.correct;
  s7Attempts++;

  if (isCorrect) {
    input.classList.add('correct');
    input.disabled = true;
    s7Done = true;
    s7ShowFeedback('correct', true);
    q1SectionDone('b', 'success');
    updateQuestionNav2('s7');
    const btn = document.getElementById('s7-check');
    btn.textContent = 'המשך';
    btn.disabled = false;
    btn.onclick = function () { goTo(8); };
    document.getElementById('s7-hint').hidden = true;
    return;
  }

  if (s7Attempts < S7.maxAttempts) {
    input.classList.add('error');
    s7ShowFeedback('wrong1', false);
    document.getElementById('s7-check').disabled = true;
    const hintBtn = document.getElementById('s7-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s7AnswerSnapshot = input.value; // הערך שהלומד הזין בפועל, לפני שנדרוס אותו ב-reveal
    s7Revealed = false;
    input.classList.remove('error');
    input.classList.add('wrong'); // מוצג כרגע: ערך הלומד עצמו (שגוי)
    input.disabled = true;
    s7Done = true;
    s7ShowFeedback('pending', false);
    const revealBtn = document.getElementById('s7-reveal-btn');
    if (revealBtn) { revealBtn.hidden = false; revealBtn.textContent = 'התשובה הנכונה'; }
    q1SectionDone('b', 'fail');
    updateQuestionNav2('s7');
    const btn = document.getElementById('s7-check');
    btn.textContent = 'המשך';
    btn.disabled = false;
    btn.onclick = function () { goTo(8); };
    document.getElementById('s7-hint').hidden = true;
  }
}

function s7ToggleReveal() {
  const input = document.getElementById('s7-input');
  const revealBtn = document.getElementById('s7-reveal-btn');
  if (!s7Revealed) {
    input.value = S7.correct;
    input.classList.remove('wrong');
    input.classList.add('correct');
    s7ShowFeedback('wrong2', false);
    s7Revealed = true;
    if (revealBtn) revealBtn.textContent = 'התשובה שלי';
  } else {
    input.value = s7AnswerSnapshot;
    input.classList.remove('correct');
    input.classList.add('wrong');
    s7ShowFeedback('pending', false);
    s7Revealed = false;
    if (revealBtn) revealBtn.textContent = 'התשובה הנכונה';
  }
}

function s7OpenHint() {
  if (s7Done) return;
  document.getElementById('s7-hint-overlay').hidden = false;
}
function s7CloseHint() { document.getElementById('s7-hint-overlay').hidden = true; }
document.getElementById('s7-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s7CloseHint();
});

function resetScreenState7() {
  updateQuestionNav2('s7');
  if (s7Done || s7Attempts > 0) return; // resume-state guard
  const input = document.getElementById('s7-input');
  input.value = '';
  input.classList.remove('error', 'correct', 'wrong');
  input.disabled = false;
  s7AnswerSnapshot = null;
  s7Revealed = false;
  const btn = document.getElementById('s7-check');
  btn.textContent = 'צדקתי?';
  btn.disabled = true;
  btn.onclick = s7Check;
  document.getElementById('s7-feedbox').classList.remove('visible');
  const hintBtn = document.getElementById('s7-hint');
  hintBtn.hidden = false;
  hintBtn.disabled = false;
  document.getElementById('s7-hint-overlay').hidden = true;
  const revealBtn = document.getElementById('s7-reveal-btn');
  if (revealBtn) { revealBtn.hidden = true; revealBtn.textContent = 'התשובה הנכונה'; }
}

/* =========================================================
   מסך 9 — שאלה 1/2, סעיף ג: SCQ עם 4 טענות (הוחלף מ-TrueFalseQuestion
   לפי בקשה מפורשת — במקור הותאם ממסך 5, id="s4", של
   Methodica-science-mass-measure-02-02). אותו מבנה בדיוק כמו מסך 10
   (S9 למטה).
   ========================================================= */

const S8 = {
  correctId: 'a',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'נכון.', body: 'הכדור נמצא בטווח 410-450 ולכן עומד בתקן FIFA.' },
    wrong1: { title: 'התשובה אינה נכונה.', body: 'לא נורא, גם מטעויות לומדים.\nננסה שוב?' },
    wrong2: { title: 'זו טעות. התשובה הנכונה מסומנת.', body: 'הכדור נמצא בטווח 410-450 ולכן עומד בתקן FIFA.' }
  }
};

let s8Selected = null;
let s8Attempts = 0;
let s8Done = false;
let s8Phase = 'before';

function s8OptEl(id) { return document.querySelector('#s8 .scq-opt[data-id="' + id + '"]'); }

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
  if (wasWrong1) document.getElementById('s8-feedbox').classList.remove('visible');
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

  if (s8Selected === S8.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s8Phase = 'correct';
    s8Done = true;
    s8LockOptions();
    s8ShowFeedback('correct', true);
    q1SectionDone('c', 'success');
    updateQuestionNav2('s8');
    s8SetBarDone('המשך', function () { goTo(9); });
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
    q1SectionDone('c', 'fail');
    updateQuestionNav2('s8');
    s8SetBarDone('המשך', function () { goTo(9); });
  }
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
  document.getElementById('s8-hint-overlay').hidden = false;
}
function s8CloseHint() { document.getElementById('s8-hint-overlay').hidden = true; }
document.getElementById('s8-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s8CloseHint();
});

function resetScreenState8() {
  updateQuestionNav2('s8');
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
  hintBtn.hidden = false;
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
   מסך 10 — שאלה 1/2, סעיף ד (האחרון): SCQ בלי תמונה. שוכפל ממסך 20
   בסיין 1. סיום סעיף זה משלים את q1SectionResults (כל 4 הסעיפים) —
   q1SectionDone קובעת כאן בפועל את stationProgress2.q1 (success רק
   אם כל הסעיפים הצליחו).
   ========================================================= */

const S9 = {
  correctId: 'd',
  maxAttempts: 2,
  feedback: {
    correct: { title: 'נכון.', body: 'ממוצע מצמצם את השפעתן של טעויות אקראיות.' },
    wrong1: { title: 'התשובה אינה נכונה.', body: 'זה חלק טבעי מתהליך למידה.\nננסה שוב?' },
    wrong2: { title: 'זו טעות. התשובה הנכונה מסומנת.', body: 'ממוצע מצמצם את השפעתן של טעויות אקראיות.' }
  }
};

let s9Selected = null;
let s9Attempts = 0;
let s9Done = false;
let s9Phase = 'before';

function s9OptEl(id) { return document.querySelector('#s9 .scq-opt[data-id="' + id + '"]'); }

function s9Select(id) {
  if (s9Done) return;
  const wasWrong1 = (s9Phase === 'wrong1');
  document.querySelectorAll('#s9 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong');
    el.setAttribute('aria-checked', 'false');
  });
  const selectedEl = s9OptEl(id);
  selectedEl.classList.add('selected');
  selectedEl.setAttribute('aria-checked', 'true');
  s9Selected = id;
  s9Phase = 'selected';
  if (wasWrong1) document.getElementById('s9-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s9-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = false;
  checkBtn.onclick = s9Check;
}

function s9ShowFeedback(kind, isCorrect) {
  const box = document.getElementById('s9-feedbox');
  const data = S9.feedback[kind];
  box.querySelector('.scq-fb-title-text').textContent = data.title;
  box.querySelector('.scq-fb-body').innerHTML = data.body.replace(/\n/g, '<br>');
  box.classList.remove('is-correct', 'is-wrong', 'collapsed');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  scqFbResetPosition(box.id);
  box.classList.add('visible');
}

function s9SetBarDone(label, handler) {
  const checkBtn = document.getElementById('s9-check');
  checkBtn.textContent = label;
  checkBtn.disabled = false;
  checkBtn.onclick = handler;
  document.getElementById('s9-hint').hidden = true;
}

function s9Check() {
  if (!s9Selected || s9Done) return;
  s9Attempts++;
  const optEl = s9OptEl(s9Selected);

  if (s9Selected === S9.correctId) {
    optEl.classList.add('correct');
    optEl.classList.remove('selected');
    s9Phase = 'correct';
    s9Done = true;
    s9LockOptions();
    s9ShowFeedback('correct', true);
    q1SectionDone('d', 'success');
    updateQuestionNav2('s9');
    /* קישור בין סינים: מסך אחרון בסיין 2 -> מסך ראשון בסיין 3 (נתיב יחסי,
       אותה מוסכמה בדיוק כמו בפרויקט הקודם, Methodica-science-mass
       -measure-02-linked). goTo(10) היה no-op (TOTAL_SCREENS=10). */
    s9SetBarDone('המשך', function () { window.location.href = '../methodica-science-mass-measure-03-03/index.html'; });
    return;
  }

  optEl.classList.add('wrong');
  optEl.classList.remove('selected');

  if (s9Attempts < S9.maxAttempts) {
    s9Phase = 'wrong1';
    s9ShowFeedback('wrong1', false);
    const checkBtn = document.getElementById('s9-check');
    checkBtn.textContent = 'צדקתי?';
    checkBtn.disabled = true;
    checkBtn.onclick = s9Check;
    const hintBtn = document.getElementById('s9-hint');
    hintBtn.hidden = false;
    hintBtn.disabled = false;
  } else {
    s9OptEl(S9.correctId).classList.add('correct');
    s9Phase = 'wrong-final';
    s9Done = true;
    s9LockOptions();
    s9ShowFeedback('wrong2', false);
    q1SectionDone('d', 'fail');
    updateQuestionNav2('s9');
    /* קישור בין סינים: מסך אחרון בסיין 2 -> מסך ראשון בסיין 3 (נתיב יחסי,
       אותה מוסכמה בדיוק כמו בפרויקט הקודם, Methodica-science-mass
       -measure-02-linked). goTo(10) היה no-op (TOTAL_SCREENS=10). */
    s9SetBarDone('המשך', function () { window.location.href = '../methodica-science-mass-measure-03-03/index.html'; });
  }
}

function s9LockOptions() {
  document.querySelectorAll('#s9 .scq-opt').forEach(function (el) {
    el.classList.add('disabled');
    el.onclick = null;
  });
}
function s9UnlockOptions() {
  document.querySelectorAll('#s9 .scq-opt').forEach(function (el) {
    el.classList.remove('disabled');
    el.onclick = function () { s9Select(el.dataset.id); };
  });
}

function s9OpenHint() {
  if (s9Done) return;
  document.getElementById('s9-hint-overlay').hidden = false;
}
function s9CloseHint() { document.getElementById('s9-hint-overlay').hidden = true; }
document.getElementById('s9-hint-overlay').addEventListener('click', function (e) {
  if (e.target === this) s9CloseHint();
});

function resetScreenState9() {
  updateQuestionNav2('s9');
  if (s9Done || s9Attempts > 0 || s9Selected) return; // resume-state guard
  s9Selected = null;
  s9Attempts = 0;
  s9Phase = 'before';
  s9UnlockOptions();
  document.querySelectorAll('#s9 .scq-opt').forEach(function (el) {
    el.classList.remove('selected', 'wrong', 'correct');
    el.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s9-feedbox').classList.remove('visible');
  const checkBtn = document.getElementById('s9-check');
  checkBtn.textContent = 'צדקתי?';
  checkBtn.disabled = true;
  checkBtn.onclick = s9Check;
  const hintBtn = document.getElementById('s9-hint');
  hintBtn.hidden = false;
  hintBtn.disabled = false;
  document.getElementById('s9-hint-overlay').hidden = true;
}

document.querySelectorAll('#s9 .scq-opt').forEach(function (opt) {
  opt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s9Select(opt.dataset.id);
    }
  });
});

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
   פופ-אפ משוב גריר — לפי "Feedback popup system" (720-templates
   skill): גרירה מוגבלת לגבולות הקנבס, איפוס למיקום ברירת המחדל
   בכל פתיחה.
   קרא scqFbMakeDraggable('<box-id>') פעם אחת באתחול לכל תיבת
   משוב שנוספת למסך חדש. (אין עדיין אף תיבת משוב בסיין הזה.)
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
scqFbMakeDraggable('s1-feedbox');
scqFbMakeDraggable('s2-feedbox');
scqFbMakeDraggable('s3-feedbox');
scqFbMakeDraggable('s6-feedbox');
scqFbMakeDraggable('s7-feedbox');
scqFbMakeDraggable('s8-feedbox');
scqFbMakeDraggable('s9-feedbox');
/* קישור בין סינים — חזרה: אם הגענו לכאן עם #screen=N (מכפתור "חזרה"
   בסיין הבא), קופצים ישר למסך הזה במקום למסך הראשון. אותה מוסכמה
   בדיוק כמו בפרויקט הקודם, Methodica-science-mass-measure-02-linked. */
(function () {
  const m = /^#screen=(\d+)$/.exec(location.hash);
  if (m) goTo(parseInt(m[1], 10));
  else resetScreenState(0);
})();
