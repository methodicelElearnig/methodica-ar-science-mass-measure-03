/* Structural verification of the reporting / issue-reporting / resume layer.

   WHAT THIS COVERS, AND WHY THESE CHECKS
   Every assertion here corresponds to a failure mode that is SILENT at runtime:
   the lomda keeps working, the learner notices nothing, and the data is simply
   wrong or missing. Those are the ones worth automating. Screen-level behaviour
   (does this particular question mark the right option green) is loud and is
   verified in a browser instead.

   This is deliberately NOT a port of the sibling unit's suite. That one asserts
   against its own screens — its drag instances, its table screen, its scoring
   functions — none of which exist here. Porting it would have meant rewriting
   every assertion against different content while keeping none of its value.

   Static checks need nothing installed and always run. The runtime section needs
   jsdom, which must be installed OUTSIDE this tree (it is ~26MB and this folder
   is OneDrive-synced) and reached through NODE_PATH:

     mkdir -p /tmp/lomda-test && cd /tmp/lomda-test && npm install jsdom
     NODE_PATH=/tmp/lomda-test/node_modules node _test/verify-report.js

   Without jsdom the static checks still run and the runtime ones are reported as
   skipped, so the harness is useful either way.

   Takes an optional path argument so it can be pointed at a built package:
     node _test/verify-report.js ../../deployments/2026-09-19
*/
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || path.join(__dirname, '..');
const UNIT_SLUG = 'methodica-ar-science-mass-measure-03';

/* Sain 3 was pulled from the sequence and archived on 2026-09-08; navigation
   goes 02 -> 04 directly. The gap is intentional — do not "restore" it. */
const COMPONENTS = ['01', '02', '04', '05', '06'];

const compDir = (c) => path.join(BASE, UNIT_SLUG + '-' + c);
const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p).replace(/^﻿/, ''));

let pass = 0;
const failures = [];
function ok(scope, name, cond, detail) {
  if (cond) { pass++; return; }
  failures.push('  [' + scope + '] ' + name + (detail ? '\n      -> ' + detail : ''));
}
function section(title) { console.log('\n' + title); }

/* ══════════════════════════ 1. catalogue identity ══════════════════════════
   A mismatch here means Kata accepts every statement and files it against an
   object that does not exist. Nothing errors; the data just never arrives
   anywhere useful. */
section('1. catalogue identity');

const identitySrc = read(path.join(BASE, 'unit-js', '10-identity.js'));
const prefixM = /var XAPI_ID_PREFIX = '([^']+)'/.exec(identitySrc);
const unitIdM = /window\.XAPI_UNIT_ID = '([^']+)'/.exec(identitySrc);
ok('identity', 'XAPI_ID_PREFIX is declared', !!prefixM);
ok('identity', 'XAPI_UNIT_ID is declared as a literal', !!unitIdM,
   'v2.5 §2.7 exempts the unit id from the IRI rule, so this unit uses a bare slug');
const PREFIX = prefixM ? prefixM[1] : '';
const UNIT_ID = unitIdM ? unitIdM[1] : '';

const unitMeta = readJson(path.join(BASE, 'metadata', UNIT_SLUG + '_unit.json'));
ok('identity', 'unit metadata id === XAPI_UNIT_ID', unitMeta.id === UNIT_ID,
   'metadata=' + unitMeta.id + '  code=' + UNIT_ID);
ok('identity', 'XAPI_ID_PREFIX ends with a slash', /\/$/.test(PREFIX), PREFIX);

for (const c of COMPONENTS) {
  const slug = UNIT_SLUG + '-' + c;
  const meta = readJson(path.join(BASE, 'metadata', slug + '.json'));
  const js = read(path.join(compDir(c), 'script.js'));

  const compSlug = (/var XAPI_COMP_SLUG = '([^']+)'/.exec(js) || [])[1];
  ok(c, 'XAPI_COMP_SLUG matches the folder', compSlug === slug, String(compSlug));
  ok(c, 'metadata id === XAPI_ID_PREFIX + slug + "/"', meta.id === PREFIX + slug + '/',
     'metadata=' + meta.id);
  /* The issue-report form posts shortId(learningUnitId) as the unit column of a
     sheet shared by every 720 unit. If this disagrees with the unit id, reports
     land under the wrong name and the catalogue tree is wrong. */
  ok(c, 'learningUnitId === unit id', meta.learningUnitId === UNIT_ID,
     'metadata=' + meta.learningUnitId);

  const metaFile = (/var XAPI_METADATA_FILE = '([^']+)'/.exec(js) || [])[1];
  ok(c, 'XAPI_METADATA_FILE points at this component', metaFile === '../metadata/' + slug + '.json',
     String(metaFile));

  /* Item and question id shapes. The item id repeats the component slug inside
     itself; that looks redundant and is correct. */
  for (const sc of meta.subContent || []) {
    ok(c, 'item id nested under component id', String(sc.id).startsWith(meta.id), sc.id);
    for (const q of sc.questions || []) {
      ok(c, 'question id nested under item id', String(q.questionId).startsWith(sc.id), q.questionId);
      ok(c, 'question id carries no trailing slash', !/\/$/.test(q.questionId), q.questionId);
    }
  }
}

/* ═══════════════════ 2. screen -> item map coverage ═══════════════════
   A missing key is indistinguishable from an explicit null: the screen simply
   never reports, in silence. Read from source text on purpose — the map must
   stay a literal so it can be checked without executing anything. */
section('2. screen -> item map');

for (const c of COMPONENTS) {
  const js = read(path.join(compDir(c), 'script.js'));
  const total = Number((/const TOTAL_SCREENS = (\d+)/.exec(js) || [])[1]);
  const block = (/var SCREEN_TO_SUBCONTENT = \{([\s\S]*?)\n\};/.exec(js) || [])[1];
  ok(c, 'TOTAL_SCREENS is declared', Number.isFinite(total));
  ok(c, 'SCREEN_TO_SUBCONTENT is a literal ending in "\\n};"', !!block);
  if (!block || !Number.isFinite(total)) continue;

  const keys = [...block.matchAll(/(\d+)\s*:/g)].map((m) => Number(m[1]));
  ok(c, 'map holds exactly TOTAL_SCREENS keys', keys.length === total,
     'keys=' + keys.length + ' TOTAL_SCREENS=' + total);
  const missing = [];
  for (let n = 0; n < total; n++) if (!keys.includes(n)) missing.push(n);
  ok(c, 'every screen 0..N-1 has a key', missing.length === 0, 'missing: ' + missing.join(', '));

  /* Suffixes must be quoted 3-char strings; an unquoted 001 is octal-ish and a
     2-char suffix silently never matches metadata. */
  const suffixes = [...block.matchAll(/\['(\d{3})',\s*\d+\]/g)].map((m) => m[1]);
  const bare = [...block.matchAll(/\[\s*(\d+)\s*,/g)];
  ok(c, 'item suffixes are quoted', bare.length === 0, bare.length + ' unquoted');

  const mapItems = [...new Set(suffixes)].sort();
  const meta = readJson(path.join(BASE, 'metadata', UNIT_SLUG + '-' + c + '.json'));
  const metaItems = (meta.subContent || [])
    .map((sc) => String(sc.id).replace(/\/$/, '').split('-').pop()).sort();

  ok(c, 'every mapped item exists in metadata',
     mapItems.every((i) => metaItems.includes(i)),
     'map=' + mapItems.join(',') + '  metadata=' + metaItems.join(','));
  /* The reverse direction matters just as much: an item in the catalogue that no
     screen maps to can never be reported, so the component never completes. */
  ok(c, 'every metadata item is reachable from some screen',
     metaItems.every((i) => mapItems.includes(i)),
     'map=' + mapItems.join(',') + '  metadata=' + metaItems.join(','));
}

/* ═══════════════════ 3. the shared layer is wired correctly ═══════════════════
   Load order is load-bearing and its failures are quiet: a report modal that
   never initialises, or two components running different builds of one file. */
section('3. shared layer wiring');

const EXPECTED_ORDER = ['10-identity', '20-xapi', '25-report', '40-resume', '50-loader', 'script', '90-boot'];
const versions = {};

for (const c of COMPONENTS) {
  const html = read(path.join(compDir(c), 'index.html'));

  const order = [...html.matchAll(/<script src="[^"]*?([\w.-]+)\.js\?v=(\d+)"><\/script>/g)];
  ok(c, 'script tags are in the required order',
     order.map((m) => m[1]).join(',') === EXPECTED_ORDER.join(','),
     order.map((m) => m[1]).join(','));

  /* 90-boot.js holds the only side effects and must be its own tag: a top-level
     throw in script.js kills the rest of THAT file, not a separate one. Folding
     it in leaves the report modal uninitialised with nothing in the console. */
  ok(c, '90-boot.js is last, in its own tag before </body>',
     /90-boot\.js\?v=\d+"><\/script>\s*<\/body>/.test(html));

  for (const m of html.matchAll(/(unit-js\/[\w-]+\.js|unit-css\/[\w-]+\.css|script\.js|styles\.css)\?v=(\d+)/g)) {
    (versions[m[1]] = versions[m[1]] || new Set()).add(m[2]);
  }

  /* The base rule sets display:flex, which beats the UA's [hidden] rule, so
     without the override every dialog is permanently visible. */
  ok(c, 'report stylesheet is linked after styles.css',
     html.indexOf('styles.css') < html.indexOf('25-report.css'));

  /* Overlays are position:absolute inset:0 and #app is their positioned
     ancestor, so outside #app they stop aligning with the scaled canvas. Inside
     a .screen they would be hidden whenever that screen is not active. */
  const appAt = html.indexOf('<div id="app">');
  const modalAt = html.indexOf('id="report-modal"');
  const lastSection = html.lastIndexOf('</section>');
  ok(c, 'report dialogs sit inside #app', appAt > -1 && modalAt > appAt);
  ok(c, 'report dialogs sit outside every .screen', modalAt > lastSection);

  /* The boot cover must be a SIBLING of #app: scaleApp() transforms #app, and a
     cover inside it would be scaled with the canvas instead of covering it. */
  const coverAt = html.indexOf('id="boot-cover"');
  ok(c, 'boot cover is present', coverAt > -1);
  ok(c, 'boot cover is a sibling of #app, not a child', coverAt > -1 && coverAt < appAt);

  for (const id of ['report-modal', 'report-thanks-modal', 'report-confirm-modal',
                    'report-type-wrapper', 'report-type', 'report-type-error',
                    'report-text', 'report-text-error', 'report-char-count']) {
    ok(c, 'dialog element #' + id + ' exists', html.includes('id="' + id + '"'));
  }

  /* Wired by delegation, so the count does not matter — but zero would mean the
     learner has no way to open the dialog at all. */
  ok(c, 'at least one .flag-btn exists', /class="flag-btn"/.test(html));

  /* A capital letter in a cross-component path 404s on a case-sensitive host and
     splits the resume document across two keys for the same component. */
  const badPaths = [...html.matchAll(/\.\.\/[A-Za-z-]*[A-Z][A-Za-z-]*\//g)].map((m) => m[0]);
  ok(c, 'cross-component paths are all lowercase', badPaths.length === 0, badPaths.join(', '));
}

for (const [file, seen] of Object.entries(versions)) {
  /* Two components on different ?v= of one shared file run different builds of
     the same logic inside a single learner session. */
  ok('versions', '?v= is identical across components for ' + file, seen.size === 1,
     'saw: ' + [...seen].join(', '));
}

const reportCss = read(path.join(BASE, 'unit-css', '25-report.css'));
ok('css', '.report-modal-overlay[hidden] { display:none } exists',
   /\.report-modal-overlay\[hidden\][^}]*display:\s*none/.test(reportCss),
   'without it the base display:flex keeps every dialog visible');

const reportJs = read(path.join(BASE, 'unit-js', '25-report.js'));
/* One Google Form serves every 720 unit; renaming a field breaks reporting for
   all of them, not just this one. */
ok('report', 'form endpoint has the expected shape',
   /REPORT_FORM_ACTION\s*=\s*\n?\s*'https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/formResponse'/.test(reportJs));
ok('report', 'flag button is wired by delegation, not getElementById',
   /addEventListener\('click'[\s\S]{0,200}closest\('\.flag-btn'\)/.test(reportJs));

/* ═══════════════════ 4. resume hooks and save points ═══════════════════ */
section('4. resume hooks and save points');

ok('resume', 'RESUME_ENABLED is true', /var RESUME_ENABLED = true;/.test(identitySrc));
const resumeSrc = read(path.join(BASE, 'unit-js', '40-resume.js'));
/* Two units sharing this key share a ledger, and each silently suppresses the
   other's completed statements. */
ok('resume', 'NAV_EDGE_KEY carries this unit slug',
   resumeSrc.includes("'lomda_nav_edges::" + UNIT_SLUG + "'"));
for (const k of ['lomda_moedA_part1_result', 'lomda_moedA_part4_result',
                 'lomda_moedB_part1_result', 'lomda_moedB_part3_result']) {
  ok('resume', 'RESULT_KEYS includes ' + k, resumeSrc.includes("'" + k + "'"),
     'a key missing here never reaches the state document, so the gate falls back to localStorage only');
}

for (const c of COMPONENTS) {
  const js = read(path.join(compDir(c), 'script.js'));
  for (const hook of ['capturePartPayload', 'applyResumeVars', 'applyResumeDom', 'restoreScreenUI']) {
    ok(c, 'defines ' + hook + '()', new RegExp('function ' + hook + '\\s*\\(').test(js));
  }
  /* Painting only the landing screen was a production hard-lock: variables said
     answered, the DOM said blank, and every click was swallowed. */
  ok(c, 'goTo calls repaintScreen', /repaintScreen\(n\)/.test(js));
  ok(c, 'goTo calls scheduleResumeSave', /scheduleResumeSave\(\)/.test(js));
  ok(c, 'payload includes currentScreen',
     /currentScreen:\s*currentScreen/.test(js));

  /* Every function that commits an answer must flush synchronously, and the
     flush must sit BEFORE any early return in that function. */
  const commits = [...js.matchAll(/function (s\w*Check|viqCheck|s1FinishWeighing)\s*\(/g)].map((m) => m[1]);
  for (const fn of commits) {
    const start = js.indexOf('function ' + fn + '(');
    let depth = 0, i = js.indexOf('{', start), end = i;
    for (; i < js.length; i++) {
      if (js[i] === '{') depth++;
      else if (js[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = js.slice(start, end);
    ok(c, fn + ' flushes resume state', body.includes('flushResumeSave'));
    const firstReturn = body.indexOf('\n    return;');
    if (firstReturn > -1) {
      ok(c, fn + ' flushes before its early return',
         body.lastIndexOf('flushResumeSave', firstReturn) > -1,
         'a flush only at the tail is skipped by the branch that returns');
    }
  }

  /* D-13, campaign 2026-09-21. The drag factory's check() is NOT matched by
     `commits` above, so nothing here covered it — and its flush ran BEFORE
     done/passed were assigned. Every drag question therefore saved itself as
     unanswered: after a reload the button returned to 'צדקתי?' and the learner
     sent a second answered.last for a question already answered. Verified live
     on 03-06. The ORDER is the assertion; presence is not enough. */
  const facStart = js.indexOf('function makeDragQuestion');
  if (facStart > -1) {
    const ci = js.indexOf('function check()', facStart);
    let d = 0, k = js.indexOf('{', ci), cend = k;
    for (; k < js.length; k++) {
      if (js[k] === '{') d++;
      else if (js[k] === '}') { d--; if (d === 0) { cend = k; break; } }
    }
    const cbody = js.slice(ci, cend);
    const lastDone = cbody.lastIndexOf('done = true');
    const lastSave = cbody.lastIndexOf('saveResult(');
    const flush = cbody.lastIndexOf('flushResumeSave');
    ok(c, 'drag factory check() flushes AFTER done/passed and saveResult',
       flush > -1 && lastDone > -1 && flush > lastDone && flush > lastSave,
       'D-13: a flush before the branch chain persists done:false for a question the learner just answered');
    ok(c, 'drag factory check() flushes exactly once',
       (cbody.match(/flushResumeSave/g) || []).length === 1,
       'two flushes means one of them runs at the wrong moment');
  }

  /* D-3, campaign 2026-09-21. A watch gate that lives only as btn.disabled=false
     is erased by any reload: the DOM is rebuilt from markup, where the button is
     disabled, and there is nothing to re-derive it from. Verified live on 03-01,
     where a learner who had watched all 49 seconds was made to watch again.
     A gate must be STATE, persisted, and repainted. */
  const gateMap = js.indexOf('VIDEO_INTRO_SCREEN_BTN');
  if (gateMap > -1) {
    const screens = [...js.matchAll(/(\d+)\s*:\s*'s\d+-continue'/g)].map((m) => Number(m[1]));
    ok(c, 'video gate is tracked as state, not only as btn.disabled',
       /videoIntroEnded\[\s*continueBtnId\s*\]\s*=\s*true/.test(js),
       'D-3: without a variable a reload cannot re-derive the gate');
    ok(c, 'video gate is persisted by capturePartPayload',
       /st\.videoIntro\s*=/.test(js), 'D-3: an unsaved gate is lost on reload');
    ok(c, 'video gate is restored by applyResumeVars',
       /st\.videoIntro\b[\s\S]{0,120}videoIntroEnded\[/.test(js),
       'D-3: a saved gate that is never read back is still lost');
    ok(c, 'video gate flushes synchronously when the video ends',
       /videoIntroEnded\[\s*continueBtnId\s*\][\s\S]{0,400}flushResumeSave/.test(js),
       'D-3: a learner who finishes the clip and closes the tab must not lose it');
    const rsu = js.slice(js.indexOf('function restoreScreenUI'));
    for (const n of screens) {
      ok(c, 'restoreScreenUI repaints video-gate screen ' + n,
         rsu.includes('n === ' + n + ') resetScreenState' + n + '()'),
         'D-3: the gate screen has no painter, so a resume onto it shows a dead button');
    }
  }

  /* D-12, campaign 2026-09-21. A RESULT_KEY written straight to localStorage
     never reaches the state document, and localStorage does not travel between
     devices. In 03-06 that made an isAssessment+isRequired component report
     success:false / scaled:0 for a learner who had answered all three sections
     correctly. Every result write must prefer setUnitResult; every result read
     must prefer getUnitResult. */
  const srcLines = js.split('\n');
  srcLines.forEach(function (ln, idx) {
    const near = (srcLines[idx - 1] || '') + ' ' + (srcLines[idx - 2] || '');
    if (ln.includes('localStorage.setItem(') && ln.includes("'pass' : 'fail'")) {
      ok(c, 'result write at line ' + (idx + 1) + ' prefers setUnitResult',
         near.includes('setUnitResult'),
         'D-12: this value never reaches the state document, so a second device reads null');
    }
  });
  for (const m of js.matchAll(/function ((?:read|get)Moed\w*)\s*\(/g)) {
    const fnName = m[1];
    let d2 = 0, q = js.indexOf('{', m.index), fend = q;
    for (; q < js.length; q++) {
      if (js[q] === '{') d2++;
      else if (js[q] === '}') { d2--; if (d2 === 0) { fend = q; break; } }
    }
    const fbody = js.slice(m.index, fend);
    const readsRaw = fbody.includes('localStorage.getItem(');
    ok(c, fnName + '() reads the state document, not just localStorage',
       fbody.includes('getUnitResult') || !readsRaw || /read[A-Z]\w*Result\(/.test(fbody),
       'D-12: a result read that only consults localStorage returns null on a second device');
  }
}

/* ═══════════════════ 5. the archived component stays archived ═══════════════════ */
section('5. archived component');

ok('archive', 'no metadata file for the archived 03-03',
   !fs.existsSync(path.join(BASE, 'metadata', UNIT_SLUG + '-03.json')),
   'it described a component that no longer exists; isRequired:true on a missing component means the unit can never complete');
ok('archive', 'no 03-03 folder in the active tree',
   !fs.existsSync(path.join(BASE, UNIT_SLUG + '-03')));

/* ═══════════════════ 6. runtime: the off-platform regression gate ═══════════════════
   The guarantee is NOT that the CDN library is absent — off-platform it still
   loads, and XAPI_USING_G is legitimately true. The guarantee is that no
   statement can leave the page, while scoring and navigation keep working. */
section('6. runtime (jsdom)');

let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { /* reported below */ }

if (!JSDOM) {
  console.log('  SKIPPED - jsdom not resolvable.');
  console.log('  mkdir -p /tmp/lomda-test && cd /tmp/lomda-test && npm install jsdom');
  console.log('  NODE_PATH=/tmp/lomda-test/node_modules node _test/verify-report.js');
} else {
  for (const c of COMPONENTS) {
    const dir = compDir(c);
    let dom;
    try {
      dom = new JSDOM(read(path.join(dir, 'index.html')), {
        url: 'http://localhost:8777/' + UNIT_SLUG + '-' + c + '/index.html',
        runScripts: 'dangerously',
        resources: undefined,
        /* Stub only what a real browser provides and jsdom does not. Anything
           beyond that would be stubbing the lomda's own behaviour. */
        beforeParse(w) {
          w.fetch = () => new Promise(() => {});
          w.HTMLMediaElement.prototype.play = () => Promise.resolve();
          w.HTMLMediaElement.prototype.load = () => {};
          /* goTo schedules scrollbar layout through rAF. Run the callback
             synchronously so a screen is fully settled before the next assertion. */
          w.requestAnimationFrame = (cb) => { cb(0); return 0; };
          w.cancelAnimationFrame = () => {};
          /* jsdom implements no layout, so Range has no geometry. The drag
             gesture hint measures a slot through a Range to position itself. */
          const zeroRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() { return this; } });
          w.Range.prototype.getBoundingClientRect = zeroRect;
          w.Range.prototype.getClientRects = () => Object.assign([], { item: () => null });
        },
      });
    } catch (e) { ok(c, 'index.html parses in jsdom', false, e.message); continue; }

    const w = dom.window;
    /* jsdom does not fetch external <script src>, so inject the real files in
       document order — exactly what the page does. */
    const inject = (p) => {
      const s = w.document.createElement('script');
      s.textContent = read(p);
      w.document.body.appendChild(s);
    };
    let threw = null;
    try {
      for (const f of ['10-identity', '20-xapi', '25-report', '40-resume', '50-loader']) {
        inject(path.join(BASE, 'unit-js', f + '.js'));
      }
      inject(path.join(dir, 'script.js'));
      inject(path.join(BASE, 'unit-js', '90-boot.js'));
    } catch (e) { threw = e.message; }
    ok(c, 'the whole script stack executes without throwing', !threw, threw);

    const val = (expr) => {
      const s = w.document.createElement('script');
      s.textContent = 'window.__V = (function(){ try { return (' + expr + '); } catch (e) { return "__THREW__" + e.message; } })();';
      w.document.body.appendChild(s);
      return w.__V;
    };

    ok(c, 'sendStatement720 never became available off-platform',
       val('typeof sendStatement720') === 'undefined',
       'no ?slxapi was given and jsdom loads no CDN script');
    ok(c, 'xapiOnScreen is a silent no-op with no library',
       val('(function(){ xapiOnScreen(0); xapiOnScreen(1); return "no-throw"; })()') === 'no-throw');
    /* The write to XAPI_Q_RESULTS happens before the reporting guard and outside
       the try, so a dead reporting layer can never corrupt the score. */
    ok(c, 'xapiAnswered still records the score with reporting off',
       val("(function(){ xapiAnswered('001','q1',true,true,'x'); return XAPI_Q_RESULTS['001/q1']; })()") === true);
    ok(c, 'the four resume hooks are callable',
       val('[typeof capturePartPayload, typeof applyResumeVars, typeof applyResumeDom, typeof restoreScreenUI].join(",")')
         === 'function,function,function,function');
    ok(c, 'capturePartPayload returns a payload carrying currentScreen',
       val('typeof capturePartPayload().currentScreen') === 'number');

    /* Walk every screen: navigation must work and no painter may report a
       [resume] error. Three layers of try/catch hide painter bugs otherwise. */
    const walk = val(
      '(function(){' +
      ' var errs=[]; var real=console.error;' +
      ' console.error=function(){ var s=[].join.call(arguments," "); if(/\\[resume\\]/.test(s)) errs.push(s); };' +
      ' try { var snap=capturePartPayload(); applyResumeVars(snap); applyResumeDom(snap);' +
      '   for (var n=0;n<TOTAL_SCREENS;n++) goTo(n);' +
      ' } catch(e){ errs.push("THREW: "+e.message); }' +
      ' console.error=real;' +
      ' return JSON.stringify({ errs: errs, landed: currentScreen, total: TOTAL_SCREENS });' +
      '})()');
    let walked = {};
    try { walked = JSON.parse(walk); } catch (e) { walked = { errs: [String(walk)] }; }
    ok(c, 'every screen paints with no [resume] error',
       (walked.errs || []).length === 0, (walked.errs || []).join(' | '));
    ok(c, 'navigation reaches the last screen',
       walked.landed === walked.total - 1, 'landed=' + walked.landed);
    if (c === '04') {
      /* MOE 2026-10-08: the challenge reports its real score; success only at >= 60% (of 3 declared questions; unanswered = wrong). */
      let thr = [];
      try { thr = JSON.parse(val('(function(){ var orig = xapiEndComponent, keep = JSON.stringify(stationProgress), out = [];' +
        ' xapiEndComponent = function (r) { out.push(r); };' +
        ' [0, 1, 2, 3].forEach(function (n) { ["q1", "q2", "q3"].forEach(function (k, i) { stationProgress[k] = i < n ? "success" : (i === n ? "fail" : null); }); s3Finish(); });' +
        ' xapiEndComponent = orig; Object.assign(stationProgress, JSON.parse(keep));' +
        ' return JSON.stringify(out); })()')); } catch (e) { thr = []; }
      ok(c, 'challenge: success only at >= 60%, real score (0/3, 1/3 fail; 2/3, 3/3 pass)',
         thr.length === 4 && thr.map(function (r) { return r.success + ':' + r.score.scaled.toFixed(3); }).join(',') === 'false:0.000,false:0.333,true:0.667,true:1.000',
         JSON.stringify(thr));
    }

    w.close();
  }
}

/* ═══════════════════════════════ summary ═══════════════════════════════ */
console.log('\n' + '='.repeat(64));
if (failures.length) {
  console.log(failures.length + ' FAILED, ' + pass + ' passed\n');
  failures.forEach((f) => console.log(f));
  console.log('');
  process.exit(1);
}
console.log('All ' + pass + ' checks passed.');
