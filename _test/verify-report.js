/* Headless verification of the report layer against the REAL index.html +
   script.js + unit-js/*.js of all six components.

   Scripts are executed by injecting real <script> elements, NOT via eval():
   every one of these files starts with 'use strict', and declarations inside a
   strict-mode eval stay in the eval's own scope instead of becoming globals.
   Real script tags put top-level function/var on window, which is what the
   production page relies on.  `let`/`const` at top level (currentScreen,
   TOTAL_SCREENS) never reach window even in a real page, so those are read
   through an injected expression script.

   Stubs only what the browser/CDN would provide: fetch. No ?slxapi is given —
   this doubles as the regression-gate run. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BASE = process.argv[2] || path.join(__dirname, "..");

/* BASE is the CONTENT under test and may be a deployment package. This harness's own
   files are not content: a package correctly contains no _test/, so resolving the stub
   from BASE made `node _test/verify-report.js ../../deployments/<date>` throw at load
   (readdirSync on a directory that is absent by design) rather than run. The stub
   belongs to the harness, so it is resolved from here, and a package run works. */
const HARNESS_DIR = __dirname;
const COMPONENTS = ['01', '02', '03', '04', '05', '06'];

/* Which screen each component is linked INTO via #screen=N by the "חזרה"
   button of the next component, per the cross-part navigation sites.
   Component 06 is absent on purpose: nothing links into it with a hash. */
const INBOUND_HASH = { '01': 19, '02': 8, '03': 1, '04': 1, '05': 3 };

let pass = 0, fail = 0;
const failures = [];
function ok(c, name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(c + ': ' + name + (extra ? '  -> ' + extra : '')); }
}

function makeRunner(w) {
  // Execute a snippet as a real classic script, in global scope.
  const exec = (code) => {
    const s = w.document.createElement('script');
    s.textContent = code;
    w.document.body.appendChild(s);
    s.remove();
  };
  // Evaluate an expression in global scope and bring the value back.
  const val = (expr) => {
    exec('window.__V = (function(){ try { return (' + expr + '); } catch (e) { return "__THREW__" + e.message; } })();');
    return w.__V;
  };
  return { exec, val };
}

async function run(c) {
  const dir = path.join(BASE, 'methodica-science-mass-measure-02-' + c);
  const file = path.join(dir, 'index.html');
  const loadErrors = [];
  const consoleErrors = [];

  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
    url: 'http://localhost:8777/methodica-science-mass-measure-02-' + c + '/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const { exec, val } = makeRunner(w);

  w.addEventListener('error', e => loadErrors.push(String(e.error || e.message)));
  w.console.error = function (...a) { consoleErrors.push(a.map(String).join(' ')); };
  w.console.warn = function () {};
  w.console.log = function () {};

  const sent = [];
  w.fetch = function (url, opts) { sent.push({ url, opts }); return Promise.resolve({ ok: true }); };

  /* jsdom does not implement HTMLMediaElement load()/play(); play() returns
     undefined, so the project's `video.play().catch(...)` throws. That is a
     jsdom gap, not a defect in the lomda — stub them to the browser contract
     so the harness exercises the real code path. */
  w.HTMLMediaElement.prototype.load = function () {};
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () {};

  // Load the page's own script tags, in document order, from disk.
  const tags = [...w.document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
  for (const src of tags) {
    const p = path.resolve(dir, src.split('?')[0]);
    if (!fs.existsSync(p)) { loadErrors.push('missing script file: ' + src); continue; }
    const before = consoleErrors.length;
    try { exec(fs.readFileSync(p, 'utf8')); }
    catch (e) { loadErrors.push(src + ': ' + e.message); }
    // jsdom reports script-tag exceptions via the error event, collected above.
    void before;
  }

  const d = w.document;

  /* The CDN library never loads off-platform, so getXAPIParameters never
     populates window.METADATA. Stand it in from the real file: the report body
     reads the unit and component slug from it, and with a SHARED response sheet
     an empty slug means an unattributable row. (REPORT-ISSUE.md §6 documents
     the degraded behaviour: missing METADATA falls back to {} and posts empty
     slugs — the report still arrives, just without location context.) */
  w.METADATA = JSON.parse(fs.readFileSync(
    path.join(BASE, 'metadata', 'methodica-science-mass-measure-02-' + c + '.json'),
    'utf8').replace(/^﻿/, ''));

  // ── 1. Page loaded clean ────────────────────────────────────────────
  ok(c, 'no load errors', loadErrors.length === 0, loadErrors.join(' | '));
  ok(c, 'all 5 unit-js tags + script.js + 90-boot present', tags.length === 7, 'tags=' + tags.length);

  // ── 2. Shared layer reachable ───────────────────────────────────────
  for (const fn of ['shortId', 'initReportModal', 'bootXAPI', 'sendCompletedOnce',
                    'xapiOnScreen', 'xapiFinishItems', 'xapiQ', 'submitReport',
                    'initResumeResetHatch', 'currentPartSlug',
                    /* resume, shared (unit-js/40-resume.js) */
                    'readUnitState', 'captureUnitState', 'persistUnitState',
                    'emptyUnitState', 'migrateState', 'adoptUnitCharacter',
                    'applyExecutionState', 'writeForwardState',
                    'recordForwardEdge', 'previousPartHref', 'goBackToPreviousPart',
                    'scheduleResumeSave', 'flushResumeSave', 'initResumeLeaveHandlers',
                    /* repaintScreen lives in 40-resume.js but is CALLED from every
                       part's goTo(). A version skew that ships a new script.js
                       against a cached 40-resume.js would throw a ReferenceError on
                       every navigation, so its presence is asserted here. */
                    'repaintScreen',
                    /* resume, per-part hooks (this component's script.js) */
                    'capturePartPayload', 'applyResumeVars', 'applyResumeDom',
                    'restoreScreenUI']) {
    ok(c, fn + ' defined', val('typeof ' + fn) === 'function', 'typeof=' + val('typeof ' + fn));
  }

  /* ── 3. REGRESSION GATE ─────────────────────────────────────────────
     The guarantee is NOT that XAPI_USING_G stays false — it is legitimately
     true, because it only records that the selected library letter supports
     item-level statements. The guarantee is that no statement can actually
     flow: every send path is additionally gated on sendStatement720 being a
     function, and that only exists once the CDN library has loaded, which
     needs a real ?slxapi launch. So the lomda must behave exactly as it did
     before instrumentation. */
  ok(c, 'sendStatement720 absent (CDN never loaded off-platform)',
    val('typeof sendStatement720') === 'undefined');
  ok(c, 'xapiOnScreen is a silent no-op with no library',
    val('(function(){ xapiOnScreen(0); xapiOnScreen(1); return "no-throw"; })()') === 'no-throw');
  ok(c, 'xapiFinishItems is a silent no-op with no library',
    val('(function(){ xapiFinishItems(); return "no-throw"; })()') === 'no-throw');
  ok(c, 'xapiAnswered does not throw and still records the score',
    val("(function(){ xapiAnswered('001','q1',true,true,'x'); return XAPI_Q_RESULTS['001/q1']; })()") === true);
  ok(c, 'xapiRequestedHint is a silent no-op with no library',
    val("(function(){ xapiRequestedHint('001','q1'); return 'no-throw'; })()") === 'no-throw');
  ok(c, 'no statement reached the network', sent.length === 0, 'sent=' + sent.length);

  // ── 4. Modal markup ─────────────────────────────────────────────────
  for (const id of ['report-modal', 'report-thanks-modal', 'report-confirm-modal']) {
    const el = d.getElementById(id);
    ok(c, id + ' exists', !!el);
    ok(c, id + ' starts hidden', el && el.hasAttribute('hidden'));
  }
  for (const id of ['report-type', 'report-text', 'report-text-error',
                    'report-char-count', 'report-type-error', 'report-type-wrapper']) {
    ok(c, id + ' exists', !!d.getElementById(id));
  }
  ok(c, '3 select options', d.querySelectorAll('.report-select-option').length === 3);
  const app = d.getElementById('app');
  ok(c, 'modal inside #app', app && app.contains(d.getElementById('report-modal')));
  ok(c, 'modal outside every .screen', d.querySelectorAll('.screen #report-modal').length === 0);
  ok(c, 'shared CSS linked', !!d.querySelector('link[href*="unit-css/25-report.css"]'));

  // ── 5. Flag-button delegation across EVERY instance ─────────────────
  const flags = [...d.querySelectorAll('.flag-btn')];
  ok(c, 'flag-btn instances found', flags.length >= 1, 'count=' + flags.length);
  let openedFromAll = true, whichFailed = -1;
  flags.forEach((btn, i) => {
    exec('forceCloseReportModal()');
    // click the innermost child, to prove closest() delegation rather than a direct handler
    const target = btn.querySelector('.flag-btn-label') || btn;
    target.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    if (d.getElementById('report-modal').hasAttribute('hidden')) {
      openedFromAll = false; if (whichFailed < 0) whichFailed = i;
    }
  });
  ok(c, 'all ' + flags.length + ' flag-btn instances open the modal',
    openedFromAll, 'first failing index=' + whichFailed);

  // ── 6. Validation gating ────────────────────────────────────────────
  exec('openReportModal()');
  const submit = d.querySelector('#report-modal .report-submit-btn');
  ok(c, 'submit starts disabled', submit.disabled);
  d.getElementById('report-type').value = 'technical';
  exec('reportCheckSubmit()');
  ok(c, 'submit still disabled with type only', submit.disabled);
  d.getElementById('report-text').value = 'הכפתור לא מגיב';
  exec('reportCheckSubmit()');
  ok(c, 'submit enabled once both filled', !submit.disabled);

  // ── 7. Custom select writes the hidden input and the visible label ──
  exec('resetReportForm()');
  ok(c, 'reset clears the hidden input', d.getElementById('report-type').value === '');
  d.querySelector('.report-select-option[data-value="unclear"]')
    .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(c, 'option click sets hidden input', d.getElementById('report-type').value === 'unclear');
  ok(c, 'option click sets visible Hebrew label',
    d.querySelector('.report-select-value').textContent === 'משהו לא ברור לי',
    d.querySelector('.report-select-value').textContent);

  // ── 8. Abandon-confirm is a distinct dialog from the thank-you ──────
  d.getElementById('report-text').value = 'טקסט חלקי';
  exec('tryCloseReportModal()');
  ok(c, 'abandon-confirm shown when input is unsent',
    !d.getElementById('report-confirm-modal').hasAttribute('hidden'));
  ok(c, 'form hidden behind abandon-confirm',
    d.getElementById('report-modal').hasAttribute('hidden'));
  ok(c, 'thank-you NOT shown (different dialog)',
    d.getElementById('report-thanks-modal').hasAttribute('hidden'));
  exec('backToReportForm()');
  ok(c, '"אני רוצה לדווח" returns to the form',
    !d.getElementById('report-modal').hasAttribute('hidden'));
  exec('forceCloseReportModal()');
  ok(c, 'clean close with no input leaves everything hidden',
    d.getElementById('report-modal').hasAttribute('hidden') &&
    d.getElementById('report-confirm-modal').hasAttribute('hidden'));

  /* ── 9. submitReport actually posts, to the shared 720 form ──────────
     The endpoint is deliberately shared across all 720 units (see
     unit-js/25-report.js). What makes that safe is that every submission
     carries the unit and component slug, so the shared response sheet stays
     attributable. These assertions exist to prove those two fields are really
     populated — a shared form with an empty unit slug would be exactly the
     silent mis-filing REPORT-ISSUE.md §3 warns about. */
  exec('openReportModal()');
  d.getElementById('report-type').value = 'other';
  d.getElementById('report-text').value = 'משהו אחר';
  consoleErrors.length = 0;
  sent.length = 0;
  exec('submitReport()');
  ok(c, 'the report is POSTed', sent.length === 1, 'sent=' + sent.length);
  const posted = sent[0];
  ok(c, 'posted to the shared 720 form /formResponse endpoint',
    posted && /^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/formResponse$/.test(posted.url),
    posted && posted.url);
  ok(c, 'posted with mode:no-cors (Google Forms returns an opaque response)',
    posted && posted.opts && posted.opts.mode === 'no-cors');
  ok(c, 'body is form-encoded, not JSON',
    posted && posted.opts && posted.opts.body instanceof w.URLSearchParams);

  const body = posted && posted.opts && posted.opts.body;
  const slug = 'methodica-science-mass-measure-02';
  ok(c, 'unit slug is populated and correct',
    body && body.get('entry.1933069481') === slug, body && body.get('entry.1933069481'));
  ok(c, 'component slug is populated and correct',
    body && body.get('entry.2070680092') === slug + '-' + c,
    body && body.get('entry.2070680092'));
  ok(c, 'problem type arrives as the Hebrew label, not the internal key',
    body && body.get('entry.1179822443') === 'אחר', body && body.get('entry.1179822443'));
  ok(c, 'free text arrives verbatim',
    body && body.get('entry.806447525') === 'משהו אחר');
  ok(c, 'date and time are populated',
    body && /^\d{4}$/.test(body.get('entry.301404029_year')) &&
    body.get('entry.2066097581_hour') !== null);
  ok(c, 'no console.error on a successful send', consoleErrors.length === 0,
    consoleErrors.join(' | '));
  ok(c, 'thank-you shown', !d.getElementById('report-thanks-modal').hasAttribute('hidden'));
  exec('closeReportThanks()');
  ok(c, 'thank-you closes', d.getElementById('report-thanks-modal').hasAttribute('hidden'));

  /* A forced network failure must not block the learner. */
  w.fetch = function () { return Promise.reject(new Error('offline')); };
  exec('openReportModal()');
  d.getElementById('report-type').value = 'technical';
  d.getElementById('report-text').value = 'נפילה מדומה';
  exec('submitReport()');
  ok(c, 'a failed send still shows the thank-you (learner never blocked)',
    !d.getElementById('report-thanks-modal').hasAttribute('hidden'));
  exec('closeReportThanks()');

  /* ── 10. The 'completed' ledger ──────────────────────────────────────
     Since 2026-08-17 the ledger lives in the xAPI State document (done /
     doneItems in unit-js/40-resume.js) rather than in sessionStorage, so it
     survives a tab close — the gap the sessionStorage version documented.

     In this run the CDN library is never fetched (jsdom is constructed without
     `resources`, so the injected <script> neither loads nor errors), which
     means bootXAPI stops before readUnitState and there is no document at all.
     That makes this the natural place to assert the fail-open guarantee. */
  exec('window.__calls = []; window.sendStatement720 = function(){ window.__calls.push([].slice.call(arguments)); };');

  // (a) No document → FAIL OPEN. A missing document must never suppress a real statement.
  ok(c, 'no state document in this run (library never loaded)',
    val('_unitState') === null, String(val('_unitState')));
  exec("sendCompletedOnce('done','P','onlinelesson',{success:true})");
  exec("sendCompletedOnce('done','P','onlinelesson',{success:true})");
  ok(c, 'ledger fails OPEN with no document: both sends go out',
    w.__calls.length === 2, 'n=' + w.__calls.length);
  ok(c, 'completed verb used', w.__calls[0][0] === 'completed', String(w.__calls[0][0]));

  // (b) With a document the same calls dedupe — what stops a second 'completed'
  //     once the back button makes a finished component re-enterable.
  exec('_unitState = emptyUnitState(); window.__calls = [];');
  exec("sendCompletedOnce('done','P','onlinelesson',{success:true})");
  ok(c, 'ledger sends the first completed', w.__calls.length === 1, 'n=' + w.__calls.length);
  exec("sendCompletedOnce('done','P','onlinelesson',{success:true})");
  ok(c, 'ledger dedupes a repeat completed', w.__calls.length === 1, 'n=' + w.__calls.length);
  exec("sendCompletedOnce('doneItems','P#001','question',null)");
  ok(c, 'a different ledger key still sends', w.__calls.length === 2, 'n=' + w.__calls.length);
  ok(c, 'the mark landed in the document',
    val('JSON.stringify(_unitState.done)') === '{"P":true}',
    String(val('JSON.stringify(_unitState.done)')));
  ok(c, 'item marks are namespaced per component',
    val('JSON.stringify(_unitState.doneItems)') === '{"P#001":true}',
    String(val('JSON.stringify(_unitState.doneItems)')));

  /* (c) During a restore: neither send NOR mark. applyExecutionState stubs the
     sender, so a mark taken there would permanently suppress a statement that
     never actually left — this is how the unit 'completed' would go missing for
     a learner resumed straight onto a finish screen. */
  exec('_unitState = emptyUnitState(); window.__calls = []; _restoring = true;');
  exec("sendCompletedOnce('done','Q','onlinelesson',null)");
  exec('_restoring = false;');
  ok(c, 'nothing sent while restoring', w.__calls.length === 0, 'n=' + w.__calls.length);
  ok(c, 'nothing marked while restoring',
    val('JSON.stringify(_unitState.done)') === '{}',
    String(val('JSON.stringify(_unitState.done)')));

  // ── 11. goTo sweep over every screen ───────────────────────────────
  const total = val('TOTAL_SCREENS');
  ok(c, 'TOTAL_SCREENS readable', typeof total === 'number', String(total));
  let sweepOk = true, sweepErr = '';
  for (let n = 0; n < total; n++) {
    const r = val('(function(){ goTo(' + n + '); return currentScreen; })()');
    if (r !== n) { sweepOk = false; sweepErr = 'goTo(' + n + ') -> ' + r; break; }
  }
  ok(c, 'goTo sweep across all ' + total + ' screens', sweepOk, sweepErr);
  ok(c, 'screen count in DOM matches TOTAL_SCREENS',
    d.querySelectorAll('.screen[data-screen]').length === total,
    'dom=' + d.querySelectorAll('.screen[data-screen]').length + ' total=' + total);

  // ── 12. No unexpected console.error anywhere in the run ────────────
  const unexpected = consoleErrors.filter(m => !m.includes('REPORT_FORM_ACTION'));
  ok(c, 'no unexpected console.error', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));

  w.close();
}

/* Landing via #screen=N — the "חזרה" button of the next component. A component
   that is linked into with a hash but does not read it silently drops the
   learner on screen 0, which also makes bootXAPI report the wrong item. */
async function runHashLanding(c, screen) {
  const dir = path.join(BASE, 'methodica-science-mass-measure-02-' + c);
  const dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), {
    url: 'http://localhost:8777/methodica-science-mass-measure-02-' + c +
         '/index.html?slxapi=x#screen=' + screen,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const { exec, val } = makeRunner(w);
  w.console.error = function () {}; w.console.warn = function () {}; w.console.log = function () {};
  w.fetch = function () { return Promise.resolve({ ok: true }); };
  w.HTMLMediaElement.prototype.load = function () {};
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () {};

  for (const src of [...w.document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))) {
    const p = path.resolve(dir, src.split('?')[0]);
    if (fs.existsSync(p)) { try { exec(fs.readFileSync(p, 'utf8')); } catch (e) {} }
  }
  const landed = val('currentScreen');
  ok(c, 'landing on #screen=' + screen + ' reaches that screen (not 0)',
    landed === screen, 'currentScreen=' + landed);
  const activeAttr = w.document.querySelector('.screen.active');
  ok(c, 'the active .screen matches the hash',
    activeAttr && activeAttr.getAttribute('data-screen') === String(screen),
    'active=' + (activeAttr && activeAttr.getAttribute('data-screen')));
  w.close();
}

/* ── Metadata integrity, checked statically ──────────────────────────────
   metadata/ is the single source of truth for every id the lomda emits. A
   mismatch of one trailing slash or one capital letter means every statement
   the component sends names an object that does not exist in the catalog —
   and it fails completely silently: the library sends the wrong id happily and
   Kata accepts it. So this is enforced here rather than eyeballed. */
function checkMetadata() {
  const C = 'meta';
  const idFile = fs.readFileSync(path.join(BASE, 'unit-js', '10-identity.js'), 'utf8');
  const PREFIX = /var XAPI_ID_PREFIX = '([^']+)'/.exec(idFile)[1];
  const UNIT = /window\.XAPI_UNIT_ID = XAPI_ID_PREFIX \+ '([^']+)'/.exec(idFile)[1];

  const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
  const mdDir = path.join(BASE, 'metadata');
  ok(C, 'metadata/ exists', fs.existsSync(mdDir));
  if (!fs.existsSync(mdDir)) return;

  const unit = readJson(path.join(mdDir, 'methodica-science-mass-measure-02_unit.json'));
  ok(C, 'unit id matches XAPI_UNIT_ID byte-for-byte', PREFIX + UNIT === unit.id,
    '\n      code: ' + PREFIX + UNIT + '\n      meta: ' + unit.id);

  let items = 0, questions = 0;
  for (const c of COMPONENTS) {
    const slug = 'methodica-science-mass-measure-02-' + c;
    const md = readJson(path.join(mdDir, slug + '.json'));
    const js = fs.readFileSync(path.join(BASE, 'methodica-science-mass-measure-02-' + c, 'script.js'), 'utf8');

    // The values the code will actually build, mirroring 20-xapi.js exactly.
    const compId = PREFIX + slug + '/';
    ok(c, 'component id matches metadata', compId === md.id,
      '\n      code: ' + compId + '\n      meta: ' + md.id);
    ok(c, 'XAPI_COMP_SLUG matches the metadata slug',
      (/var XAPI_COMP_SLUG = '([^']+)'/.exec(js) || [])[1] === md.id.replace(/\/+$/, '').split('/').pop());
    ok(c, 'XAPI_METADATA_FILE points at the real file',
      fs.existsSync(path.join(mdDir, slug + '.json')) &&
      (/var XAPI_METADATA_FILE = '\.\.\/metadata\/([^']+)'/.exec(js) || [])[1] === slug + '.json');

    /* The feedback popup is dragged inside a CSS-scaled canvas, so the handler
       must divide pointer deltas by the live scale and measure in layout px.
       db67eba fixed 01/02/04/05 and MISSED 06, which then dragged at the wrong
       rate for anyone not at exactly 100%. Sain 03 has no popup at all.
       Asserted from source in every Sain so a partial rollout cannot recur. */
    if (c !== '03') {
      const drag = /function scqFbMakeDraggable\([\s\S]*?\n\}/.exec(js);
      ok(c, 'the feedback-popup drag is scale-aware',
        !!drag && /scale = parentRect\.width \/ parent\.offsetWidth/.test(drag[0]) &&
        /\(e\.clientX - startX\) \/ scale/.test(drag[0]),
        drag ? 'no scale division found' : 'scqFbMakeDraggable not found');
      ok(c, 'and persists the dragged position on mouseup',
        !!drag && /fbPositions\[boxId\] = \{ left: box\.offsetLeft, top: box\.offsetTop \}/.test(drag[0]));
    }

    /* ── a check button with no inline onclick must be wired by its painter ──
       QA 2026-08-20 slide 8. resetScreenStateN guards on "question already
       started" and returns BEFORE its `btn.onclick = sNNCheck` line, while
       applyResumeVars restores the attempts counter before goTo — so on every
       resume the guard fires and the JS wiring is skipped. A button survives
       that only if the markup carries an inline onclick (all 21 in Sains
       01/02/04 do) or its painter re-wires it (the four factory instances do).
       This flags any NEW question that has neither; the behavioural proof for
       s12, the one that actually broke, is in the 06 block below. */
    const htmlSrc = fs.readFileSync(path.join(BASE, 'methodica-science-mass-measure-02-' + c, 'index.html'), 'utf8');
    for (const m of htmlSrc.matchAll(/<button[^>]*id="([^"]*-(?:check|btn-check))"[^>]*>/g)) {
      const inline = /onclick="/.test(m[0]);
      if (inline) continue;                     // markup-wired: immune to the guard
      const stem = m[1].replace(/-(?:btn-)?check$/, '');
      // the painter for this question must assign onclick somewhere
      const wired = new RegExp('onclick = (?:' + stem + 'Check|check)\\b').test(js);
      ok(c, 'check button "' + m[1] + '" has no inline onclick, so a painter must wire it',
        wired, 'neither inline nor painter-wired');
    }

    // Screen map: exactly TOTAL_SCREENS keys, 0..N-1, no gaps.
    const total = parseInt(/const TOTAL_SCREENS = (\d+);/.exec(js)[1], 10);
    const block = /var SCREEN_TO_SUBCONTENT = \{([\s\S]*?)\n\};/.exec(js)[1];
    const keys = [...block.matchAll(/^\s*(\d+):/gm)].map(m => +m[1]);
    ok(c, 'screen map has exactly TOTAL_SCREENS keys',
      keys.length === total, 'keys=' + keys.length + ' TOTAL_SCREENS=' + total);
    ok(c, 'screen map keys are exactly 0..' + (total - 1),
      keys.slice().sort((a, b) => a - b).join(',') ===
      Array.from({ length: total }, (_, i) => i).join(','));

    // Coverage both ways: no phantom items, no orphan catalog items.
    const mapped = new Set([...block.matchAll(/'(\d{3})'/g)].map(m => m[1]));
    const meta = new Set(md.subContent.map(s => s.id.replace(/\/+$/, '').split('-').pop()));
    const phantom = [...mapped].filter(i => !meta.has(i));
    const orphan = [...meta].filter(i => !mapped.has(i));
    ok(c, 'every mapped item exists in metadata', phantom.length === 0, phantom.join(','));
    ok(c, 'every metadata item has a screen', orphan.length === 0, orphan.join(','));

    // Item and question ids, built the way xapiItemId()/xapiQ() build them.
    for (const s of md.subContent) {
      const suf = s.id.replace(/\/+$/, '').split('-').pop();
      const built = compId + slug + '-' + suf + '/';
      ok(c, 'item ' + suf + ' id matches metadata', built === s.id,
        '\n      code: ' + built + '\n      meta: ' + s.id);
      items++;
      for (const q of (s.questions || [])) {
        questions++;
        ok(c, 'question ' + suf + '/' + q.questionId.split('/').pop() + ' sits under its item',
          q.questionId.startsWith(built) && /^https?:\/\//.test(q.questionId), q.questionId);
      }
    }

    // XAPI_EVAL_ITEMS must be a subset of the catalog's items.
    const ev = new Set([...(/var XAPI_EVAL_ITEMS = \{([^}]*)\}/.exec(js)[1])
      .matchAll(/'(\d{3})'/g)].map(m => m[1]));
    ok(c, 'XAPI_EVAL_ITEMS is a subset of metadata items',
      [...ev].every(i => meta.has(i)), [...ev].filter(i => !meta.has(i)).join(','));
  }
  ok(C, 'covered 6 components / 25 items / 31 questions',
    items === 25 && questions === 31, 'items=' + items + ' questions=' + questions);
}

/* ── The ?v= invariant ───────────────────────────────────────────────────
   All six index.html reference the same shared URLs, so a given shared file's
   ?v= must be identical in all six. A mismatch means one component fetches a
   second copy under a different URL, and two components can execute different
   versions of the same logic inside one learner session. */
function checkVersionQueries() {
  const seen = {};
  for (const c of COMPONENTS) {
    const html = fs.readFileSync(path.join(BASE, 'methodica-science-mass-measure-02-' + c, 'index.html'), 'utf8');
    for (const m of html.matchAll(/(?:src|href)="\.\.\/(unit-js|unit-css)\/([^"?]+)\?v=([^"]+)"/g)) {
      const file = m[1] + '/' + m[2];
      (seen[file] = seen[file] || []).push(c + ':' + m[3]);
    }
  }
  const files = Object.keys(seen);
  ok('ver', 'shared files are referenced', files.length >= 6, 'found=' + files.length);

  /* PER-COMPONENT files need a cache-buster too, and until 2026-09-07 none of them had
     one: the loop above only ever looked at ../unit-js/ and ../unit-css/, so styles.css
     was referenced bare in all six index.html and nothing noticed.

     That is not cosmetic. The 2026-09-07 hoist rewrote every styles.css to reach the
     fonts at ../unit-assets/fonts/ and deleted the per-component copies. A learner
     holding a cached bare styles.css would keep asking for assets/fonts/, which no
     longer exists -- and a missing @font-face is silent: the unit simply renders in a
     fallback face. Exactly the failure the reference unit shipped once already. */
  for (const c of COMPONENTS) {
    const html = fs.readFileSync(path.join(BASE, 'methodica-science-mass-measure-02-' + c, 'index.html'), 'utf8');
    for (const [label, re] of [['styles.css', /href="styles\.css(\?v=\d+)?"/],
                               ['script.js',  /src="script\.js(\?v=\d+)?"/]]) {
      const m = html.match(re);
      ok('ver', c + '/' + label + ' carries a ?v=', !!(m && m[1]), m ? m[0] : 'not referenced');
    }
  }
  {
    const sub = fs.readFileSync(path.join(BASE, 'methodica-science-mass-measure-02-05',
      'plane-mass-simulation', 'index.html'), 'utf8');
    ok('ver', 'the sub-app stylesheet carries a ?v=', /href="style\.css\?v=\d+"/.test(sub));
  }
  for (const f of files) {
    const versions = new Set(seen[f].map(s => s.split(':')[1]));
    ok('ver', f + ' has one ?v= across all six', versions.size === 1 && seen[f].length === 6,
      seen[f].join(' '));
  }
}

/* ── Resume: the document, the handoff, the back edge, the restore ───────
   The real transport is the CDN library (or _test/xapi-720-k.js for the browser
   walkthrough). Here it is replaced by an in-memory store the harness can read
   synchronously, so each invariant can be asserted rather than eyeballed.

   Everything below is Phase 1 scope: the screen pointer, the ledger and the
   cross-part pointer. Answer state is deliberately not restored yet, so there
   is nothing here about repainted answers. */
async function runResume(c) {
  const dir = path.join(BASE, 'methodica-science-mass-measure-02-' + c);
  const slug = 'methodica-science-mass-measure-02-' + c;
  const dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), {
    url: 'http://localhost:8777/' + slug + '/index.html?slxapi=1&registration=r1',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const { exec, val } = makeRunner(w);
  w.console.error = function () {}; w.console.warn = function () {}; w.console.log = function () {};
  w.fetch = function () { return Promise.resolve({ ok: true }); };
  w.HTMLMediaElement.prototype.load = function () {};
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () {};

  for (const src of [...w.document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))) {
    const p = path.resolve(dir, src.split('?')[0]);
    if (fs.existsSync(p)) { try { exec(fs.readFileSync(p, 'utf8')); } catch (e) { /* reported elsewhere */ } }
  }

  /* Inspectable State transport + statement log, then open the write paths. */
  exec(`
    /* v5: keyed by the state id ('execution-state::<slug>'): one document per component.
       __store is a view on THIS component's document. */
    window.__stores = {}; window.__fail = false; window.__stmts = [];
    Object.defineProperty(window, '__store', {
      get() { return window.__stores[RESUME_STATE_ID] || null; },
      set(v) { if (v === null) delete window.__stores[RESUME_STATE_ID]; else window.__stores[RESUME_STATE_ID] = v; },
    });
    window.loadState720 = function (id) { return window.__stores[id] ? JSON.parse(window.__stores[id]) : null; };
    window.__syncWrites = 0;
    window.saveState720 = function (id, doc) {
      if (window.__fail) return false;
      window.__syncWrites++;                       /* counts SYNCHRONOUS writes only */
      window.__stores[id] = JSON.stringify(doc); return true;
    };
    window.saveState720Debounced = function (id, doc) { window.__pending = JSON.stringify(doc); };
    window.sendStatement720 = function (v, t, r, o) { window.__stmts.push(v + ':' + t + ':' + ((o && o.objectId) || '')); };
    _resumeReady = true;
    _unitState = emptyUnitState();
  `);

  ok(c, 'currentPartSlug is the lowercase folder name',
    val('currentPartSlug()') === slug, String(val('currentPartSlug()')));

  // ── The payload follows goTo ───────────────────────────────────────────
  const last = val('TOTAL_SCREENS') - 1;
  exec('goTo(' + last + ');');
  ok(c, 'capturePartPayload records the current screen',
    val('capturePartPayload().currentScreen') === last,
    String(val('capturePartPayload().currentScreen')));
  ok(c, 'goTo armed a debounced save',
    typeof val('window.__pending') === 'string', String(val('typeof window.__pending')));

  /* v5: captureUnitState fills THIS component's payload and stamps `component`. There is
     no landing pointer to preserve any more — the document belongs to one component. */
  exec("captureUnitState();");
  ok(c, 'captureUnitState writes this component\'s payload',
    val('_unitState.payload.currentScreen') === last, String(val('_unitState.payload.currentScreen')));
  ok(c, 'captureUnitState stamps the document with this component\'s slug',
    val('_unitState.component') === slug, String(val('_unitState.component')));

  // ── The forward handoff (dev-only caller; the function is asserted on its own) ──
  /* v5: no landing pointer, no prev map, no seeding of the destination — the destination's
     document is another component's. The edge map and a synchronous save of THIS component
     are all that remain. */
  exec("_unitState = emptyUnitState(); window.__store = null; window.__syncWrites = 0; " +
       "try { sessionStorage.removeItem('lomda_nav_edges::methodica-science-mass-measure-02'); } catch (e) {} " +
       "writeForwardState('dest-part', '#screen=7');");
  const edges = () => { try { return JSON.parse(val("sessionStorage.getItem('lomda_nav_edges::methodica-science-mass-measure-02')")) || {}; } catch (e) { return {}; } };
  ok(c, 'writeForwardState records the back edge with its return hash',
    !!edges()['dest-part'] && edges()['dest-part'].from === slug && edges()['dest-part'].hash === '#screen=7',
    JSON.stringify(edges()));
  ok(c, 'writeForwardState saves this component synchronously',
    val('window.__syncWrites') === 1 && val('JSON.parse(window.__store).component') === slug,
    'writes=' + val('window.__syncWrites') + ' store=' + val('window.__store'));
  ok(c, 'the saved document has no landing pointer, no prev map, no parts map (v5)',
    val("(function(){ var d = JSON.parse(window.__store); return !('part' in d) && !('prev' in d) && !('parts' in d) && ('payload' in d) && ('component' in d); })()") === true,
    String(val('Object.keys(JSON.parse(window.__store)).join()')));

  // ── The back edge ──────────────────────────────────────────────────────
  /* v5: the sessionStorage edge map is the only layer; the hardcoded arguments are the
     last resort. The document carries no prev map any more. */
  exec("_unitState = emptyUnitState();");
  exec("try { sessionStorage.setItem('lomda_nav_edges::methodica-science-mass-measure-02', JSON.stringify({'" + slug + "': { from: 'from-session', hash: '#screen=3' } })); } catch (e) {}");
  ok(c, 'previousPartHref follows the sessionStorage edge',
    /\.\.\/from-session\/index\.html.*#screen=3$/.test(String(val("previousPartHref('fallback','#screen=9')"))),
    String(val("previousPartHref('fallback','#screen=9')")));
  exec("try { sessionStorage.removeItem('lomda_nav_edges::methodica-science-mass-measure-02'); } catch (e) {}");
  ok(c, 'previousPartHref falls back to the hardcoded argument',
    /\.\.\/fallback\/index\.html.*#screen=9$/.test(String(val("previousPartHref('fallback','#screen=9')"))),
    String(val("previousPartHref('fallback','#screen=9')")));
  ok(c, 'previousPartHref puts the query string before the hash',
    /\?slxapi=1&registration=r1#screen=9$/.test(String(val("previousPartHref('fallback','#screen=9')"))),
    String(val("previousPartHref('fallback','#screen=9')")));

  /* v5: dev navigation saves this component synchronously and navigates. There is no pointer
     write that could fail, so nothing holds the learner in place any more. jsdom cannot
     navigate — location.replace is reported as "not implemented" and nothing else happens. */
  exec("_unitState = emptyUnitState(); window.__store = null; window.__syncWrites = 0;");
  exec("window.__devNavWas = DEV_NAV; DEV_NAV = true;");
  exec("try { goBackToPreviousPart('fallback', '#screen=9'); } catch (e) {}");
  ok(c, 'dev back navigation saves this component synchronously first',
    val('window.__syncWrites') === 1 && val('JSON.parse(window.__store).component') === slug,
    'writes=' + val('window.__syncWrites') + ' store=' + val('window.__store'));
  exec('DEV_NAV = window.__devNavWas;');

  /* And in production the same call does nothing at all — not even a write. */
  exec("_unitState = emptyUnitState(); window.__store = null; window.__syncWrites = 0;");
  exec("try { goBackToPreviousPart('fallback', '#screen=9'); } catch (e) {}");
  ok(c, 'without DEV_NAV, goBackToPreviousPart writes nothing',
    val('window.__store') === null && val('window.__syncWrites') === 0,
    'store=' + val('window.__store') + ' writes=' + val('window.__syncWrites'));

  // ── The restore ────────────────────────────────────────────────────────
  /* Exactly one item 'initialized' for the landing screen, and nothing else:
     the no-op stub holds across goTo, then xapiCurrentItem is cleared so the
     latch cannot swallow the one statement that is owed. */
  exec("window.__stmts = []; applyExecutionState({ currentScreen: " + last + " });");
  ok(c, 'restore lands on the saved screen',
    val('currentScreen') === last, String(val('currentScreen')));
  ok(c, 'restore leaves _restoring off', val('_restoring') === false, String(val('_restoring')));
  ok(c, 'restore re-installed the real sender',
    val('window.sendStatement720.toString().indexOf("__stmts") > -1') === true);
  const stmts = val('JSON.stringify(window.__stmts)');
  const parsed = JSON.parse(stmts || '[]');
  ok(c, 'restore emits no completed and no answered',
    parsed.every(s => !/^completed:|^answered/.test(s)), stmts);
  ok(c, 'restore emits at most one item initialized',
    parsed.filter(s => s.startsWith('initialized:question')).length <= 1, stmts);

  /* ── Phase 2a: the scoring / branching round-trip ─────────────────────
     Phase 1 restored only the screen pointer, so a resumed learner carried an
     empty score map and the forward routers scored them 0 — a learner who had
     passed got sent into remediation they had already skipped. Each block below
     proves the mis-route is real (by asserting it on a wiped map) and then that
     the restore fixes it, so the assertion cannot pass vacuously. */
  exec("XAPI_Q_RESULTS['001/q1'] = true; window.__snap = capturePartPayload();");
  exec("Object.keys(XAPI_Q_RESULTS).forEach(function(k){ delete XAPI_Q_RESULTS[k]; });");
  ok(c, 'qResults is empty after a simulated reload',
    val("JSON.stringify(XAPI_Q_RESULTS)") === '{}', String(val("JSON.stringify(XAPI_Q_RESULTS)")));
  exec('applyResumeVars(window.__snap);');
  ok(c, 'restore brings XAPI_Q_RESULTS back',
    val("XAPI_Q_RESULTS['001/q1']") === true, String(val("XAPI_Q_RESULTS['001/q1']")));

  /* ── Phase 2b: the answer round-trip, part 01 ─────────────────────────
     Screen 1 stands in for all seven single-choice screens: they go through one
     shared painter, so a defect in it shows up here. */
  if (c === '01') {
    exec(`window.__wipeScq = function () {
      scqSelected = null; scqAttempts = 0; scqDone = false; scqPhase = 'before';
      document.querySelectorAll('#s1 .scq-opt').forEach(function (el) {
        el.classList.remove('selected', 'wrong', 'correct', 'disabled');
        el.setAttribute('aria-checked', 'false');
      });
      document.getElementById('scq-feedbox').classList.remove('visible');
      var h = document.getElementById('scq-hint'); if (h) h.hidden = true;
      var b = document.getElementById('scq-check');
      if (b) { b.textContent = 'צדקתי?'; b.disabled = true; }
    };`);

    exec('goTo(1); window.__wipeScq();');
    exec("window.__badScq = [].slice.call(document.querySelectorAll('#s1 .scq-opt'))" +
         "  .map(function(el){ return el.dataset.id; })" +
         "  .filter(function(id){ return id !== SCQ.correctId; })[0];");

    /* Interim wrong: one wrong attempt. scqSelected SURVIVES here (unlike the
       multi-choice screens), so this path is variable-driven. */
    exec('scqSelect(window.__badScq); scqCheck();');
    ok(c, 'one wrong single-choice attempt leaves it answerable',
      val('scqAttempts') === 1 && val('scqDone') === false && val('scqPhase') === 'wrong1',
      val('scqAttempts') + ' / ' + val('scqDone') + ' / ' + val('scqPhase'));
    exec('window.__snapScqI = capturePartPayload(); window.__wipeScq();');
    exec('applyResumeVars(window.__snapScqI); restoreScreenUI(1);');
    ok(c, 'interim restore re-marks the wrong pick and shows feedback',
      val("scqOptEl(window.__badScq).classList.contains('wrong')") === true &&
      val("document.getElementById('scq-feedbox').classList.contains('visible')") === true);
    ok(c, 'interim restore reveals the hint, as the live wrong branch does',
      val("document.getElementById('scq-hint').hidden") === false);
    ok(c, 'interim restore keeps the screen re-answerable (a click re-enables)',
      val("(function(){ scqSelect(SCQ.correctId); var b=document.getElementById('scq-check'); return b.disabled === false; })()") === true);

    /* Wrong-final: both marks must show — the learner's pick AND the answer. */
    exec('window.__wipeScq(); scqSelect(window.__badScq); scqCheck(); scqSelect(window.__badScq); scqCheck();');
    ok(c, 'two wrong attempts reach wrong-final',
      val('scqDone') === true && val('scqPhase') === 'wrong-final',
      val('scqDone') + ' / ' + val('scqPhase'));
    exec('window.__snapScqF = capturePartPayload(); window.__wipeScq();');
    exec('applyResumeVars(window.__snapScqF); restoreScreenUI(1);');
    ok(c, 'wrong-final restore marks the correct answer',
      val("scqOptEl(SCQ.correctId).classList.contains('correct')") === true);
    ok(c, "wrong-final restore also shows what the learner got wrong",
      val("scqOptEl(window.__badScq).classList.contains('wrong')") === true);
    ok(c, 'wrong-final restore locks the options and lets the learner continue',
      val("scqOptEl(SCQ.correctId).classList.contains('disabled')") === true &&
      val("document.getElementById('scq-check').disabled") === false &&
      val("document.getElementById('scq-check').textContent") === 'המשך',
      val("document.getElementById('scq-check').textContent"));

    /* Correct path. */
    exec('window.__wipeScq(); scqSelect(SCQ.correctId); scqCheck();');
    exec('window.__snapScqC = capturePartPayload(); window.__wipeScq();');
    exec('applyResumeVars(window.__snapScqC); restoreScreenUI(1);');
    ok(c, 'solved restore shows the correct mark and no wrong mark',
      val("scqOptEl(SCQ.correctId).classList.contains('correct')") === true &&
      val("scqOptEl(window.__badScq).classList.contains('wrong')") === false);

    /* An untouched screen stays pristine — painters now run on every navigation. */
    exec('window.__wipeScq(); restoreScreenUI(1);');
    ok(c, 'a never-answered single-choice screen is left pristine',
      val("document.getElementById('scq-feedbox').classList.contains('visible')") === false &&
      val("scqOptEl(SCQ.correctId).classList.contains('correct')") === false);

    /* ── The hard block: an answered screen that is NOT the landing screen ──
       Every assertion above calls restoreScreenUI() directly, so none of them
       exercise the path that was actually broken: navigation. applyExecutionState
       paints the landing screen only, so before the 2026-08-18 fix any OTHER
       answered screen came up blank *and inert* — the click is swallowed by
       `if (scqDone) return;`, and the check button keeps the `disabled` it was
       shipped with, which only restoreScqUI or a live scqCheck ever clears. The
       learner had no forward control at all, and every screen's back button is
       goTo(n-1), so one press stranded them again. Only a reload escaped.

       Landing on screen 0 and navigating to 1 is what makes this a regression
       test for repaintScreen rather than for the painter. */
    exec('window.__wipeScq(); scqSelect(SCQ.correctId); scqCheck();');
    exec('window.__snapNav = capturePartPayload(); window.__snapNav.currentScreen = 0;');
    exec('window.__wipeScq(); scqSelected = null; scqAttempts = 0; scqDone = false;');
    exec('applyExecutionState(window.__snapNav);');
    ok(c, 'a resume that lands elsewhere leaves the answered screen unpainted',
      val('currentScreen') === 0 &&
      val("scqOptEl(SCQ.correctId).classList.contains('correct')") === false,
      'landed on ' + val('currentScreen'));
    exec('goTo(1);');
    ok(c, 'navigating to an answered non-landing screen paints it',
      val("scqOptEl(SCQ.correctId).classList.contains('correct')") === true);
    ok(c, 'and the learner is not stranded on it',
      val("document.getElementById('scq-check').disabled") === false &&
      val("document.getElementById('scq-check').textContent") === 'המשך',
      'disabled=' + val("document.getElementById('scq-check').disabled") +
      ' text=' + val("document.getElementById('scq-check').textContent"));
    exec('goTo(0); goTo(1);');
    ok(c, 'a repeat visit keeps it painted and usable',
      val("scqOptEl(SCQ.correctId).classList.contains('correct')") === true &&
      val("document.getElementById('scq-check').disabled") === false);

    /* Wrong marks live ONLY as a DOM class on the multi-choice screen — see
       captureWrongMarks. applyResumeVars puts them in __scq14Wrong, which capture
       never reads, so before the fix the first save after a resume wrote
       wrong: [] and erased them for good, even for a screen never visited.
       Restoring them in applyResumeDom is what closes that. */
    exec("window.__snapW = capturePartPayload();");
    exec("window.__snapW.scq14 = { sel: [], att: 1, done: false, phase: 'wrong1', wrong: ['a'] };");
    exec("document.querySelectorAll('#s13 .scq-opt').forEach(function (el) { el.classList.remove('wrong'); });");
    exec('applyResumeDom(window.__snapW);');
    ok(c, 'applyResumeDom puts screen-13 wrong marks back into the DOM',
      val("document.querySelector('#s13 .scq-opt[data-id=\"a\"]').classList.contains('wrong')") === true);
    ok(c, 'so a save taken without visiting screen 13 keeps them',
      JSON.parse(val("JSON.stringify(capturePartPayload().scq14.wrong)")).indexOf('a') !== -1,
      val("JSON.stringify(capturePartPayload().scq14.wrong)"));

    /* ── The memory game (screen 10) ────────────────────────────────────
       The board is Fisher-Yates shuffled inside s11Init(), so re-running init
       deals a DIFFERENT board. The payload must carry the deal itself. */
    exec('goTo(10); s11Init();');
    exec("window.__deal = s11Cards.map(function(c){ return c.pairId + ':' + c.text; }).join('|');");
    /* Mark one pair as matched directly rather than through s11CardClick: the
       live handler confirms a match inside a setTimeout, which never fires in a
       synchronous jsdom run. What is under test here is the RESUME contract for
       a shuffled board — that the deal survives and matched cards come back —
       not the game's matching logic, which the existing goTo sweep covers. */
    exec(`(function(){
      var i1 = 0, i2 = -1;
      for (var j = 1; j < s11Cards.length; j++) {
        if (s11Cards[j].pairId === s11Cards[0].pairId) { i2 = j; break; }
      }
      window.__pairIdx = [i1, i2];
      s11Cards[i1].matched = true; s11Cards[i2].matched = true;
      s11Matches = 1;
    })();`);
    ok(c, 'one pair is marked matched, mid-game',
      val('s11Matches') === 1 && val('s11Cards[window.__pairIdx[0]].matched') === true,
      'matches=' + val('s11Matches'));

    exec('window.__snapS11 = capturePartPayload();');
    /* A fresh page load: variables gone AND the board markup empty, which is
       exactly what happens because resetScreenState10 early-returns when
       s11Matches > 0 and therefore never calls s11RenderBoard. */
    exec("s11Cards = []; s11Matches = 0; s11Done = false;" +
         "document.getElementById('s11-board').innerHTML = '';");
    ok(c, 'the wipe left the board empty (the real post-reload state)',
      val("document.querySelectorAll('#s11-board .s11-card').length") === 0);

    exec('applyResumeVars(window.__snapS11); restoreScreenUI(10);');
    ok(c, 'restore re-deals the SAME board, not a new shuffle',
      val("s11Cards.map(function(c){ return c.pairId + ':' + c.text; }).join('|')") === val('window.__deal'),
      'restored deal differs from the original');
    ok(c, 'restore rebuilt the board markup',
      val("document.querySelectorAll('#s11-board .s11-card').length") === val('s11Cards.length'),
      val("document.querySelectorAll('#s11-board .s11-card').length") + ' cards');
    ok(c, 'restore keeps the already-matched pair flipped and matched',
      val(`(function(){ return window.__pairIdx.every(function(i){
            var el = document.querySelector('#s11-board .s11-card[data-idx="' + i + '"]');
            return el && el.classList.contains('s11-flipped') && el.classList.contains('s11-matched');
          }); })()`) === true);
    ok(c, 'restore keeps continue disabled until all three pairs are found',
      val("document.getElementById('s11-btn-continue').disabled") === true);

    /* ── The memory game, COMPLETED (screen 10) ─────────────────────────
       The block above covers the MID-GAME state, which is the one branch
       s11RestoreUI used to paint — and that is exactly why the completed state
       shipped broken. The board is JS-injected, so after a page load it is
       empty, and NEITHER path renders it: resetScreenState10 only switches to
       the summary view and returns, and the painter opened with
       `if (s11Done) return;` on the assumption that reset had it covered.

       That would be invisible if the summary were the end of the screen — but
       its own "חזרה" un-hides the game view (s11SumBack), so the view nobody
       painted IS what the learner ends up looking at: an empty board, the
       markup's "0 מתוך 3", and a disabled המשך. With no back button in that nav
       row either, only a page reload escaped. Reported from production
       2026-08-19. */
    exec(`(function () {
      s11Cards.forEach(function (card) { card.matched = true; });
      s11Matches = 3; s11Done = true;
      window.__snapS11Done = capturePartPayload();
    })();`);
    /* A fresh page load: variables gone, board markup empty, counter and button
       back at their markup defaults. */
    exec("s11Cards = []; s11Matches = 0; s11Done = false;" +
         "document.getElementById('s11-board').innerHTML = '';" +
         "document.getElementById('s11-pairs-counter').textContent = 'זוגות שנמצאו: 0 מתוך 3';" +
         "document.getElementById('s11-btn-continue').disabled = true;");
    exec('applyResumeVars(window.__snapS11Done); goTo(10);');
    ok(c, 'resuming a completed memory game lands on the summary view',
      val("document.getElementById('s11-summary-view').hidden") === false &&
      val("document.getElementById('s11-game-view').hidden") === true,
      'game hidden=' + val("document.getElementById('s11-game-view').hidden"));
    ok(c, 'and the board behind it is painted, not left empty',
      val("document.querySelectorAll('#s11-board .s11-card').length") === val('s11Cards.length'),
      val("document.querySelectorAll('#s11-board .s11-card').length") + ' cards');

    exec('s11SumBack();');
    ok(c, 'so pressing חזרה on the summary gives back a usable board',
      val("document.getElementById('s11-game-view').hidden") === false &&
      val("document.querySelectorAll('#s11-board .s11-card').length") === val('s11Cards.length') &&
      val("document.getElementById('s11-btn-continue').disabled") === false,
      'cards=' + val("document.querySelectorAll('#s11-board .s11-card').length") +
      ' disabled=' + val("document.getElementById('s11-btn-continue').disabled"));
    ok(c, 'with all three pairs shown matched and the counter caught up',
      val(`(function(){ return s11Cards.every(function (card, i) {
            var el = document.querySelector('#s11-board .s11-card[data-idx="' + i + '"]');
            return el && el.classList.contains('s11-flipped') && el.classList.contains('s11-matched');
          }); })()`) === true &&
      val("document.getElementById('s11-pairs-counter').textContent").indexOf('3 מתוך 3') !== -1,
      val("document.getElementById('s11-pairs-counter').textContent"));

    /* applyResumeVars restores s11Matches unconditionally but the deal only when
       it is non-empty, so a document carrying progress without a deal used to
       early-return out of resetScreenState10 and then bail out of the painter on
       the empty-cards check — a board that cannot be played. */
    exec("s11Cards = []; s11Matches = 2; s11Done = false;" +
         "document.getElementById('s11-board').innerHTML = '';");
    exec('goTo(10);');
    ok(c, 'progress recorded without a deal re-deals instead of stranding',
      val("document.querySelectorAll('#s11-board .s11-card').length") === 6 &&
      val('s11Cards.length') === 6 && val('s11Matches') === 0,
      val("document.querySelectorAll('#s11-board .s11-card').length") + ' cards');

    /* The painter runs on every goTo now, and its re-render drops the flipped
       class off every unmatched card — so the transient state has to be cleared
       with it, or s11Flipped keeps pointing at a card that no longer looks
       flipped and the single-card timer fires on a replaced element. */
    exec(`(function () {
      s11Init();
      var i2 = -1;
      for (var j = 1; j < s11Cards.length; j++) {
        if (s11Cards[j].pairId === s11Cards[0].pairId) { i2 = j; break; }
      }
      s11Cards[0].matched = true; s11Cards[i2].matched = true;
      s11Matches = 1;
      s11Flipped = [(i2 === 1) ? 2 : 1];   // a third card, caught mid-flip
      s11Locked = true;
    })();`);
    exec('goTo(10);');
    ok(c, 'a repeat visit mid-game keeps the board and clears the mid-flip state',
      val("document.querySelectorAll('#s11-board .s11-card').length") === 6 &&
      val('s11Flipped.length') === 0 && val('s11Locked') === false,
      'cards=' + val("document.querySelectorAll('#s11-board .s11-card').length") +
      ' flipped=' + val('s11Flipped.length') + ' locked=' + val('s11Locked'));

    /* המשך opens only on the third pair, so without a חזרה in this nav row a
       learner who cannot solve the game has no exit — and the summary's own back
       button only leads here. Every other screen 1-19 carries one; s0's omission
       is the deliberate exception. */
    exec("window.__s11Back = (function () {" +
         "  var b = document.querySelector('#s11-game-view .bar-back .btn-back');" +
         "  return b ? (b.getAttribute('onclick') || 'NO-ONCLICK') : 'MISSING'; })();");
    ok(c, "the memory game's own nav row offers חזרה, to screen 9",
      val('window.__s11Back') === 'goTo(9)', val('window.__s11Back'));

    /* ── The multi-select (screen 13) ───────────────────────────────────
       The one multi-select in this part, and the one painter in the unit that
       read its config from a hard-coded global rather than a parameter — the
       config is MCQ14, the painter asked for SCQ14, and the resulting
       ReferenceError was swallowed by restoreScreenUI's catch. Reported from
       production 2026-08-19: answered, refreshed, came back to a blank screen
       with a dead "צדקתי?" and options that ignored every click.

       The sweep at the end of this function is the general guard; these are the
       specific ones, because "does not throw" is not the same as "paints the
       right thing". Part 02's four multi-selects go through the parameterised
       restoreMcqUI and are covered separately (see the c === '02' block). */
    ok(c, 'the multi-select painter exists', val('typeof restoreScq14UI') === 'function');
    ok(c, 'its config is MCQ14, and SCQ14 is not a thing',
      val('typeof MCQ14') === 'object' && val('typeof SCQ14') === 'undefined',
      'MCQ14=' + val('typeof MCQ14') + ' SCQ14=' + val('typeof SCQ14'));

    /* resetScreenState13 refuses to run once the question has been started —
       that is its resume guard — so the wipe has to clear the DOM itself. This
       is exactly the state a page load produces: markup defaults, no marks. */
    exec(`window.__wipeS13 = function () {
      document.querySelectorAll('#s13 .scq-opt').forEach(function (el) {
        el.classList.remove('selected', 'wrong', 'correct', 'disabled');
        el.setAttribute('aria-checked', 'false');
        el.onclick = (function (i) { return function () { scq14Toggle(i); }; }(el.dataset.id));
      });
      document.getElementById('scq14-feedbox').classList.remove('visible');
      var b = document.getElementById('scq14-check');
      b.textContent = 'צדקתי?'; b.disabled = true; b.onclick = scq14Check;
      document.getElementById('scq14-hint').hidden = true;
      scq14Selected = []; scq14Attempts = 0; scq14Done = false; scq14Phase = 'before';
      __scq14Wrong = [];
    };`);

    /* Path 1 — answered correctly. __scq14Wrong is empty here, so the loop that
       runs BEFORE the throw paints nothing and the screen came up completely
       blank. This is the exact case in the QA screenshot. */
    exec('goTo(13); window.__wipeS13();');
    exec('MCQ14.correctIds.forEach(function (id) { scq14Toggle(id); }); scq14Check();');
    ok(c, 'answering the multi-select correctly reaches done',
      val('scq14Done') === true && val('scq14Phase') === 'correct',
      val('scq14Done') + ' / ' + val('scq14Phase'));
    exec('window.__snapS13 = capturePartPayload(); window.__snapS13.currentScreen = 0;');
    exec('window.__wipeS13(); applyExecutionState(window.__snapS13); goTo(13);');
    ok(c, 'a resumed correct multi-select marks both correct answers',
      val("MCQ14.correctIds.every(function (id) { return scq14OptEl(id).classList.contains('correct'); })") === true);
    ok(c, 'and locks the options rather than leaving dead ones clickable',
      val("[].slice.call(document.querySelectorAll('#s13 .scq-opt')).every(function (el) { return el.classList.contains('disabled'); })") === true);
    ok(c, 'and shows the feedback it showed live',
      val("document.getElementById('scq14-feedbox').classList.contains('visible')") === true);
    ok(c, 'and lets the learner continue',
      val("document.getElementById('scq14-check').disabled") === false &&
      val("document.getElementById('scq14-check').textContent") === 'המשך',
      'disabled=' + val("document.getElementById('scq14-check').disabled") +
      ' text=' + val("document.getElementById('scq14-check').textContent"));

    /* Path 2 — wrong twice. Here the pre-throw loop DID paint the red marks, so
       the symptom was subtler: red present, green absent, button still dead. */
    exec('window.__wipeS13();');
    exec(`window.__badS13 = [].slice.call(document.querySelectorAll('#s13 .scq-opt'))
      .map(function (el) { return el.dataset.id; })
      .filter(function (id) { return MCQ14.correctIds.indexOf(id) === -1; });`);
    exec('window.__badS13.forEach(function (id) { scq14Toggle(id); }); scq14Check();');
    exec('window.__badS13.forEach(function (id) { scq14Toggle(id); }); scq14Check();');
    ok(c, 'two wrong multi-select attempts reach wrong-final',
      val('scq14Done') === true && val('scq14Phase') === 'wrong-final',
      val('scq14Done') + ' / ' + val('scq14Phase'));
    exec('window.__snapS13F = capturePartPayload(); window.__snapS13F.currentScreen = 0;');
    ok(c, 'the wrong picks were captured off the DOM (they exist in no variable)',
      JSON.parse(val('JSON.stringify(window.__snapS13F.scq14.wrong)')).length ===
        JSON.parse(val('JSON.stringify(window.__badS13)')).length,
      val('JSON.stringify(window.__snapS13F.scq14.wrong)'));
    exec('window.__wipeS13(); applyExecutionState(window.__snapS13F); goTo(13);');
    ok(c, 'a resumed wrong-final multi-select keeps the wrong picks marked',
      val("window.__badS13.every(function (id) { return scq14OptEl(id).classList.contains('wrong'); })") === true);
    ok(c, 'and ALSO shows what the right answer was',
      val("MCQ14.correctIds.every(function (id) { return scq14OptEl(id).classList.contains('correct'); })") === true);
    ok(c, 'and is continuable, not stranded',
      val("document.getElementById('scq14-check').disabled") === false &&
      val("document.getElementById('scq14-check').textContent") === 'המשך',
      'disabled=' + val("document.getElementById('scq14-check').disabled") +
      ' text=' + val("document.getElementById('scq14-check').textContent"));

    /* Path 3 — mid-question. This branch never threw, but it dropped the hint
       that the live wrong1 branch reveals; the seven single-choice screens get
       it from restoreScqUI's hintId parameter. */
    exec('window.__wipeS13();');
    exec('scq14Toggle(window.__badS13[0]); scq14Check();');
    ok(c, 'one wrong multi-select attempt stays answerable',
      val('scq14Done') === false && val('scq14Phase') === 'wrong1',
      val('scq14Done') + ' / ' + val('scq14Phase'));
    exec('window.__snapS13W = capturePartPayload(); window.__snapS13W.currentScreen = 0;');
    exec('window.__wipeS13(); applyExecutionState(window.__snapS13W); goTo(13);');
    ok(c, 'a resumed mid-question multi-select still offers its hint',
      val("document.getElementById('scq14-hint').hidden") === false,
      'hidden=' + val("document.getElementById('scq14-hint').hidden"));
    ok(c, 'and a click re-enables the check button, as in the live flow',
      val("(function(){ scq14Toggle(MCQ14.correctIds[0]); return document.getElementById('scq14-check').disabled; })()") === false);
    exec('window.__wipeS13();');

    /* ── The shared drag painter (screens 4 / 8 / 19) ───────────────────
       Placement is DOM parentage; screen 4 stands in for all three. */
    exec('goTo(4);');
    /* Place EVERY item — all into one zone, so the board is complete but the
       answer is wrong — and submit for real. s5Check is what captures the
       signature, and an all-placed board is what makes the button assertions
       below discriminating instead of trivially disabled. */
    exec("window.__s5item = S5_ITEM_IDS[0];" +
         "S5_ITEM_IDS.forEach(function (id) {" +
         "  var e = document.getElementById(id);" +
         "  if (e && e.parentElement) e.parentElement.removeChild(e);" +
         "  document.getElementById('s5-zone-bruto').appendChild(e);" +
         "});" +
         "s5Check();");
    ok(c, 'one wrong attempt leaves the drag question answerable',
      val('s5Attempts') === 1 && val('s5Done') === false,
      val('s5Attempts') + ' / ' + val('s5Done'));
    ok(c, 'the live code disables the check button after a wrong drag answer',
      val("document.getElementById('s5-check').disabled") === true);
    exec('window.__snapS5 = capturePartPayload();');
    ok(c, 'capture read the drag placement out of the DOM',
      val("window.__snapS5.s5.place[window.__s5item]") === 'bruto',
      String(val("window.__snapS5.s5.place[window.__s5item]")));
    /* Wipe everything back to the bank AND clear the signature, so whatever
       comes back can only have come from the snapshot. */
    exec("S5_ITEM_IDS.forEach(function (id) {" +
         "  var e = document.getElementById(id);" +
         "  if (e && e.parentElement) e.parentElement.removeChild(e);" +
         "  document.getElementById('s5-source-bank').appendChild(e);" +
         "});" +
         "s5Attempts = 0; s5LastSubmittedSig = null;");
    exec('applyResumeVars(window.__snapS5); applyResumeDom(window.__snapS5); restoreScreenUI(4);');
    ok(c, 'restore physically re-places the drag item in its zone',
      val("document.getElementById(window.__s5item).parentElement.id") === 's5-zone-bruto',
      String(val("document.getElementById(window.__s5item).parentElement.id")));
    /* QA 2026-08-20 slide 10 — see the Sain 04 block for the full rationale. */
    ok(c, 'interim drag restore does NOT allow resubmitting the unchanged answer',
      val("document.getElementById('s5-check').disabled") === true &&
      val("document.getElementById('s5-feedbox').classList.contains('visible')") === true,
      'disabled=' + val("document.getElementById('s5-check').disabled"));
    exec("var __m = document.getElementById(window.__s5item);" +
         "__m.parentElement.removeChild(__m);" +
         "document.getElementById('s5-zone-neto').appendChild(__m);" +
         "s5UpdateCheckBtn();");
    ok(c, 'and moving one card re-enables it — the learner is never stranded',
      val("document.getElementById('s5-check').disabled") === false);
  }

  if (c === '01') {
    exec("stationProgress.q16='success'; stationProgress.q17='success';" +
         "stationProgress.q18='success'; stationProgress.q19='success'; stationProgress.q20='fail';");
    ok(c, 'score reads 4/5 before capture', val('getPracticeScore()') === 4, String(val('getPracticeScore()')));
    exec('window.__snap = capturePartPayload();');
    exec("Object.keys(stationProgress).forEach(function(k){ stationProgress[k] = null; });");
    ok(c, 'the regression is real: wiped score routes to remediation',
      val('getPracticeScore()') === 0 &&
      val('practiceDestinationSlug()') === 'methodica-science-mass-measure-02-02',
      val('getPracticeScore()') + ' / ' + val('practiceDestinationSlug()'));
    exec('applyResumeVars(window.__snap);');
    ok(c, 'restore returns the score', val('getPracticeScore()') === 4, String(val('getPracticeScore()')));
    ok(c, 'restore returns the skip-branch destination',
      val('practiceDestinationSlug()') === 'methodica-science-mass-measure-02-03',
      String(val('practiceDestinationSlug()')));
  }

  /* ── Phase 2b: the answer round-trip, part 02 ─────────────────────────
     Two things here are not covered anywhere else: the shared MCQ painter
     (four screens, one helper) and drag9, whose placement lives only as DOM
     parentage rather than in any variable. */
  if (c === '02') {
    /* A fresh page load for screen 1, without resetScreenState1's progress guard. */
    exec(`window.__wipeSq2 = function () {
      sq2Selected = []; sq2Attempts = 0; sq2Done = false; sq2Phase = 'before';
      __mcqWrong.sq2 = [];
      document.querySelectorAll('#s1 .scq-opt').forEach(function (el) {
        el.classList.remove('selected', 'wrong', 'correct', 'disabled');
        el.setAttribute('aria-checked', 'false');
      });
      document.getElementById('sq2-feedbox').classList.remove('visible');
      var b = document.getElementById('sq2-check');
      if (b) { b.textContent = 'צדקתי?'; b.disabled = true; }
    };`);

    /* Answer wrong twice → wrong-final, where sqNSelected is cleared to [] and
       the learner's wrong pick survives ONLY as a DOM class. */
    exec('goTo(1); window.__wipeSq2();');
    /* MCQ_SQ2 carries only correctIds; the option ids live in the markup as
       data-id, so pick a wrong one from there. */
    exec("var __ids = [].slice.call(document.querySelectorAll('#s1 .scq-opt'))" +
         "  .map(function(el){ return el.dataset.id; });" +
         "window.__badId = __ids.filter(function(id){ return MCQ_SQ2.correctIds.indexOf(id) === -1; })[0];" +
         "sq2Toggle(window.__badId); sq2Check(); sq2Toggle(window.__badId); sq2Check();");
    ok(c, 'two wrong MCQ attempts reach wrong-final',
      val('sq2Done') === true && val('sq2Phase') === 'wrong-final',
      val('sq2Done') + ' / ' + val('sq2Phase'));
    ok(c, "the learner's wrong pick exists only in the DOM by now",
      val('sq2Selected.length') === 0 &&
      val("sq2OptEl(window.__badId).classList.contains('wrong')") === true,
      'selected=' + val('sq2Selected.length'));

    exec('window.__snapSq2 = capturePartPayload();');
    ok(c, 'capture recovered the wrong pick from the DOM',
      val("JSON.stringify(window.__snapSq2.mcq.sq2.wrong)") === JSON.stringify([val('window.__badId')]),
      String(val("JSON.stringify(window.__snapSq2.mcq.sq2.wrong)")));

    exec('window.__wipeSq2();');
    ok(c, 'the wipe cleared screen 1',
      val('sq2Done') === false &&
      val("sq2OptEl(window.__badId).classList.contains('wrong')") === false);

    exec('applyResumeVars(window.__snapSq2); applyResumeDom(window.__snapSq2); restoreScreenUI(1);');
    ok(c, 'MCQ restore marks the correct answer',
      val("MCQ_SQ2.correctIds.every(function(id){ return sq2OptEl(id).classList.contains('correct'); })") === true);
    ok(c, "MCQ restore also shows the learner what they got wrong",
      val("sq2OptEl(window.__badId).classList.contains('wrong')") === true);
    ok(c, 'MCQ restore locks the options',
      val("sq2OptEl(window.__badId).classList.contains('disabled')") === true);
    ok(c, 'MCQ restore shows the feedback and lets the learner continue',
      val("document.getElementById('sq2-feedbox').classList.contains('visible')") === true &&
      val("document.getElementById('sq2-check').disabled") === false &&
      val("document.getElementById('sq2-check').textContent") === 'המשך',
      val("document.getElementById('sq2-check').textContent"));

    /* An untouched screen must stay pristine — the painter early-returns. */
    exec('window.__wipeSq2(); restoreScreenUI(1);');
    ok(c, 'a never-answered MCQ screen is left pristine by the painter',
      val("document.getElementById('sq2-feedbox').classList.contains('visible')") === false &&
      val("MCQ_SQ2.correctIds.every(function(id){ return !sq2OptEl(id).classList.contains('correct'); })") === true);

    /* drag9: placement is DOM parentage, so capture/restore must move nodes. */
    exec('goTo(8);');
    exec("var __it = DRAG9_ITEM_IDS[0]; window.__it = __it;" +
         "var __z = document.getElementById('drag9-zone-' + DRAG9_ZONES[0]);" +
         "var __el = document.getElementById(__it);" +
         "if (__el.parentElement) __el.parentElement.removeChild(__el); __z.appendChild(__el);");
    ok(c, 'an item was moved into a zone in the DOM',
      val("document.getElementById(window.__it).parentElement.id") === 'drag9-zone-' + val('DRAG9_ZONES[0]'),
      String(val("document.getElementById(window.__it).parentElement.id")));
    exec('window.__snapD9 = capturePartPayload();');
    ok(c, 'capture read the placement out of the DOM',
      val("window.__snapD9.drag9.place[window.__it]") === val('DRAG9_ZONES[0]'),
      String(val("window.__snapD9.drag9.place[window.__it]")));
    // Send it back to the bank, as a fresh page load would.
    exec("var __el2 = document.getElementById(window.__it);" +
         "__el2.parentElement.removeChild(__el2);" +
         "document.getElementById('drag9-source-bank').appendChild(__el2);");
    ok(c, 'the wipe returned the item to the source bank',
      val("document.getElementById(window.__it).parentElement.id") === 'drag9-source-bank');
    exec('applyResumeVars(window.__snapD9); applyResumeDom(window.__snapD9);');
    ok(c, 'restore physically re-places the item in its zone',
      val("document.getElementById(window.__it).parentElement.id") === 'drag9-zone-' + val('DRAG9_ZONES[0]'),
      String(val("document.getElementById(window.__it).parentElement.id")));
  }

  if (c === '02') {
    exec("stationProgress2.q2='success'; stationProgress2.q3='success';" +
         "stationProgress2.q4='success'; stationProgress2.q5='success';" +
         "stationProgress3.q8='success'; stationProgress3.q9='success';");
    ok(c, 'both scores read before capture',
      val('getBasicPracticeScore()') === 4 && val('getStandardPracticeScore()') === 2,
      val('getBasicPracticeScore()') + ' / ' + val('getStandardPracticeScore()'));
    exec('window.__snap = capturePartPayload();');
    exec("Object.keys(stationProgress2).forEach(function(k){ stationProgress2[k] = null; });" +
         "Object.keys(stationProgress3).forEach(function(k){ stationProgress3[k] = null; });");
    ok(c, 'the regression is real: both scores wipe to 0',
      val('getBasicPracticeScore()') === 0 && val('getStandardPracticeScore()') === 0,
      val('getBasicPracticeScore()') + ' / ' + val('getStandardPracticeScore()'));
    exec('applyResumeVars(window.__snap);');
    ok(c, 'restore returns both scores (the 02 gate needs BOTH)',
      val('getBasicPracticeScore()') === 4 && val('getStandardPracticeScore()') === 2,
      val('getBasicPracticeScore()') + ' / ' + val('getStandardPracticeScore()'));
  }

  /* ── Phase 2b: the true/false round-trip, part 02 (screen 4, sq5) ─────
     QA 2026-08-20 slide 5. sq5RestoreUI's SOLVED-correct branch ran only
     sq5LockRows(false) + feedback, and every marking class sq5LockRows can add
     sits inside its skipped `revealCorrect` branch. `.tf-btn.selected` is the
     only visual indicator of a choice, and live play merely inherits it from
     the click — so a fresh DOM came back with the popup and four blank pills.
     The not-yet-solved branch always did re-apply it, which is exactly why QA
     saw this only intermittently. sq5 had no coverage here at all. */
  if (c === '02') {
    exec(`window.__wipeSq5 = function () {
      sq5Selected = { r1: null, r2: null, r3: null, r4: null };
      sq5Attempts = 0; sq5Done = false; sq5Phase = 'before';
      sq5LastAnswer = null; sq5ShowingCorrect = false;
      [1, 2, 3, 4].forEach(function (n) {
        var row = document.getElementById('sq5-row-' + n);
        if (row) row.classList.remove('row-locked', 'row-wrong');
        ['true', 'false'].forEach(function (v) {
          var b = document.getElementById('sq5-r' + n + '-' + v);
          if (b) { b.classList.remove('selected', 'btn-correct', 'btn-wrong'); b.disabled = false; }
        });
      });
      document.getElementById('sq5-feedbox').classList.remove('visible');
      var rb = document.getElementById('sq5-reveal-btn');
      if (rb) { rb.hidden = true; rb.textContent = 'התשובה הנכונה'; }
      var b = document.getElementById('sq5-check');
      if (b) { b.textContent = 'צדקתי?'; b.disabled = true; b.onclick = sq5Check; }
    };`);

    exec('goTo(4); window.__wipeSq5();');
    exec("['r1','r2','r3','r4'].forEach(function (r, i) { sq5Select(i + 1, TF_SQ5_CORRECT[r]); }); sq5Check();");
    ok(c, 'sq5 answered all-correct reaches the solved state',
      val('sq5Done') === true && val('sq5Phase') === 'correct',
      val('sq5Done') + ' / ' + val('sq5Phase'));
    ok(c, 'live play marks the choice with `selected` (the class the restore must reproduce)',
      val("document.getElementById('sq5-r1-true').classList.contains('selected')") === true);

    exec('window.__snapSq5 = capturePartPayload(); window.__wipeSq5();');
    ok(c, 'the wipe really cleared the pills',
      val("document.getElementById('sq5-r1-true').classList.contains('selected')") === false);
    exec('applyResumeVars(window.__snapSq5); applyResumeDom(window.__snapSq5); restoreScreenUI(4);');
    ok(c, 'solved sq5 restore shows WHICH answer the learner chose, on every row',
      val("document.getElementById('sq5-r1-true').classList.contains('selected')") === true &&
      val("document.getElementById('sq5-r4-false').classList.contains('selected')") === true,
      'r1=' + val("document.getElementById('sq5-r1-true').classList.contains('selected')") +
      ' r4=' + val("document.getElementById('sq5-r4-false').classList.contains('selected')"));
    ok(c, 'solved sq5 restore brings the correct-feedback popup back',
      val("document.getElementById('sq5-feedbox').classList.contains('visible')") === true);
    ok(c, 'solved sq5 restore leaves the learner able to continue',
      val("document.getElementById('sq5-check').disabled") === false &&
      val("document.getElementById('sq5-check').textContent") === 'המשך',
      val("document.getElementById('sq5-check').textContent"));

    /* The wrong-final branch already worked — btn-wrong/btn-correct override
       .selected in the cascade. Asserted so this edit cannot regress it. */
    exec('window.__wipeSq5();');
    exec("sq5Select(1,'false'); sq5Select(2,'false'); sq5Select(3,'false'); sq5Select(4,'true'); sq5Check();");
    exec("sq5Select(1,'false'); sq5Select(2,'false'); sq5Select(3,'false'); sq5Select(4,'true'); sq5Check();");
    ok(c, 'two wrong sq5 attempts reach wrong-final',
      val('sq5Done') === true && val('sq5Phase') === 'wrong-final',
      val('sq5Done') + ' / ' + val('sq5Phase'));
    exec('window.__snapSq5b = capturePartPayload(); window.__wipeSq5();');
    exec('applyResumeVars(window.__snapSq5b); applyResumeDom(window.__snapSq5b); restoreScreenUI(4);');
    ok(c, 'wrong-final sq5 restore still marks the wrong pick (path unchanged)',
      val("document.getElementById('sq5-r1-false').classList.contains('btn-wrong')") === true);
  }

  /* ── Phase 2b: the answer round-trip, part 04 ─────────────────────────
     Answer the table wrong twice to reach the reveal-toggle state, then prove
     a simulated reload comes back locked, marked and never stranded — and that
     the toggle survives with the learner's own answer intact. */
  if (c === '04') {
    // A fresh page load, expressed as resetScreenState1's body without its guard.
    exec(`window.__wipe04 = function () {
      tblDone = false; tblAttempts = 0; tblPhase = 'before';
      tblLastAnswer = null; tblShowingCorrect = false;
      TBL_DD_IDS.forEach(function (id) {
        tblDdValues[id] = '';
        var v = document.getElementById(id + '-val'); if (v) v.textContent = '';
        var b = document.getElementById(id + '-btn'); if (b) { b.disabled = false; b.className = 'tbl-dd-btn'; }
      });
      TBL_INPUT_IDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.value = ''; el.disabled = false; el.className = 'tbl-input'; }
      });
      tblHideFeedback();
      var rb = document.getElementById('tbl-reveal-btn');
      if (rb) { rb.hidden = true; rb.textContent = 'התשובה הנכונה'; }
      tblSetBtnCheck('צדקתי?', false, 'check');
    };`);

    exec('goTo(1);');

    /* First the INTERIM wrong state: one wrong attempt, not yet solved. This is
       the branch that needs tblOnInput() to recompute enablement — tblCheck
       disables the button after a wrong answer and only tblOnInput re-enables
       it, so a restore that skipped it would strand a learner whose fields are
       all still filled. The done-path button is set by tblSetBtnCheck instead,
       which is why that case cannot cover this one. */
    exec("window.__wipe04();" +
         "TBL_DD_IDS.forEach(function(id){ tblDdValues[id] = 'לא-נכון'; });" +
         "TBL_INPUT_IDS.forEach(function(id){ var el=document.getElementById(id); if(el) el.value='999'; });" +
         "tblCheck();");
    ok(c, 'one wrong attempt leaves the question answerable',
      val('tblAttempts') === 1 && val('tblDone') === false,
      val('tblAttempts') + ' / ' + val('tblDone'));
    ok(c, 'the live code disables the check button after a wrong answer',
      val("document.getElementById('tbl-check').disabled") === true);
    exec('window.__snapInterim = capturePartPayload(); window.__wipe04();');
    exec('applyResumeVars(window.__snapInterim); applyResumeDom(window.__snapInterim); restoreScreenUI(1);');
    /* QA 2026-08-20 slide 6. The dropdown's visible label lives ONLY in
       #<id>-val, written by three live-play functions (tblDdSelect,
       tblLockAll(true), tblShowMyAnswer) — none of which run on a restore.
       tblDdValues and tblMarkAll did come back, so the screen showed
       correct/wrong marks on visibly EMPTY cells. __wipe04 clears the label
       above, which is what makes this assertion meaningful. */
    ok(c, 'interim restore repaints the dropdown LABEL, not just its value',
      val("document.getElementById('tblA-dd-1-val').textContent") === 'לא-נכון',
      '"' + val("document.getElementById('tblA-dd-1-val').textContent") + '"');
    ok(c, 'interim restore keeps the retry state (attempts, not done)',
      val('tblAttempts') === 1 && val('tblDone') === false,
      val('tblAttempts') + ' / ' + val('tblDone'));
    ok(c, 'interim restore reveals the hint, as the wrong branch did',
      val("document.getElementById('tbl-hint').hidden") === false);
    /* QA 2026-08-20 slide 10 (the general defect). In live play tblCheck
       disables צדקתי after a wrong attempt, and only an edit re-enables it.
       The restore used to recompute the button from tblAllFilled alone — true,
       because the learner's own wrong answer is still in the table — so the
       IDENTICAL answer could be resubmitted and the real second attempt was
       burned silently. tblLastSubmittedSig now survives the restore, so the
       button comes back disabled; the pair below is the whole contract, and
       the second half is what keeps the §6א "stranded learner" fix intact. */
    ok(c, 'interim restore does NOT allow resubmitting the unchanged answer',
      val("document.getElementById('tbl-check').disabled") === true &&
      val("document.getElementById('tbl-check').textContent") === 'צדקתי?',
      val("document.getElementById('tbl-check').textContent") + ' disabled=' +
      val("document.getElementById('tbl-check').disabled"));
    exec("var _e0=document.getElementById(TBL_INPUT_IDS[0]); _e0.value='777'; tblOnInput();");
    ok(c, 'and editing one field re-enables it — the learner is never stranded',
      val("document.getElementById('tbl-check').disabled") === false);
    /* Restore the original wrong answer, so the wrong-final assertions below
       still describe the answer the learner actually submitted twice. */
    exec("var _e1=document.getElementById(TBL_INPUT_IDS[0]); _e1.value='999'; tblOnInput();");

    // Now burn the second attempt to land on wrong-final.
    exec("tblCheck();");
    ok(c, 'two wrong attempts reach the locked wrong-final state',
      val('tblDone') === true && val('tblPhase') === 'wrong-final',
      val('tblDone') + ' / ' + val('tblPhase'));
    ok(c, 'the learner\'s own answer was snapshotted before any reveal',
      val("tblLastAnswer && tblLastAnswer.dd['tblA-dd-1']") === 'לא-נכון',
      String(val("tblLastAnswer && tblLastAnswer.dd['tblA-dd-1']")));

    exec('window.__snap04 = capturePartPayload(); window.__wipe04();');
    ok(c, 'the wipe really cleared the screen',
      val('tblDone') === false && val("tblDdValues['tblA-dd-1']") === '',
      val('tblDone') + ' / "' + val("tblDdValues['tblA-dd-1']") + '"');

    exec('applyResumeVars(window.__snap04); applyResumeDom(window.__snap04); restoreScreenUI(1);');
    ok(c, 'wrong-final restore repaints the dropdown label too',
      val("document.getElementById('tblA-dd-1-val').textContent") === 'לא-נכון',
      '"' + val("document.getElementById('tblA-dd-1-val').textContent") + '"');
    ok(c, 'restore brings back the locked state',
      val('tblDone') === true && val("document.getElementById('tblA-input-2').disabled") === true,
      val('tblDone') + ' / ' + val("document.getElementById('tblA-input-2').disabled"));
    ok(c, 'restore re-marks the wrong dropdown',
      val("document.getElementById('tblA-dd-1-btn').classList.contains('wrong')") === true);
    ok(c, 'restore shows the feedback popup',
      val("document.getElementById('tbl-feedbox').classList.contains('visible')") === true);
    ok(c, 'restore reveals the toggle button labelled for "show me the answer"',
      val("document.getElementById('tbl-reveal-btn').hidden") === false &&
      val("document.getElementById('tbl-reveal-btn').textContent") === 'התשובה הנכונה',
      val("document.getElementById('tbl-reveal-btn').textContent"));
    ok(c, 'restore leaves the learner able to continue (never stranded)',
      val("document.getElementById('tbl-check').disabled") === false &&
      val("document.getElementById('tbl-check').textContent") === 'המשך',
      val("document.getElementById('tbl-check').textContent") + ' disabled=' +
      val("document.getElementById('tbl-check').disabled"));

    /* CLAUDE.md rule 4: with the solution on screen, tblDdValues holds the
       CORRECT answers and only tblLastAnswer still holds the learner's. A
       round-trip in that state must not promote the solution to "their answer". */
    exec('tblReveal();');
    ok(c, 'toggling shows the solution and relabels',
      val('tblShowingCorrect') === true &&
      val("document.getElementById('tbl-reveal-btn').textContent") === 'התשובה שלי',
      val('tblShowingCorrect') + ' / ' + val("document.getElementById('tbl-reveal-btn').textContent"));
    exec('window.__snap04b = capturePartPayload(); window.__wipe04();');
    exec('applyResumeVars(window.__snap04b); applyResumeDom(window.__snap04b); restoreScreenUI(1);');
    /* With the solution on screen tblDdValues holds the CORRECT answers, so the
       repainted label must follow it — otherwise the reveal view comes back blank. */
    ok(c, 'the solution view repaints the dropdown label as the correct answer',
      val("document.getElementById('tblA-dd-1-val').textContent") === val("TBL_DD_CORRECT['tblA-dd-1']"),
      '"' + val("document.getElementById('tblA-dd-1-val').textContent") + '"');
    ok(c, 'the toggle state survives the round-trip',
      val('tblShowingCorrect') === true &&
      val("document.getElementById('tbl-reveal-btn').textContent") === 'התשובה שלי',
      val('tblShowingCorrect') + ' / ' + val("document.getElementById('tbl-reveal-btn').textContent"));
    ok(c, 'the learner\'s own answer is still recoverable, not overwritten by the solution',
      val("tblLastAnswer && tblLastAnswer.dd['tblA-dd-1']") === 'לא-נכון' &&
      val("tblDdValues['tblA-dd-1']") === val("TBL_DD_CORRECT['tblA-dd-1']"),
      'mine=' + val("tblLastAnswer && tblLastAnswer.dd['tblA-dd-1']") +
      ' shown=' + val("tblDdValues['tblA-dd-1']"));
    exec('tblReveal();');
    ok(c, 'toggling back restores the learner\'s own answer',
      val("tblDdValues['tblA-dd-1']") === 'לא-נכון' &&
      val("document.getElementById('tbl-reveal-btn').textContent") === 'התשובה הנכונה',
      val("tblDdValues['tblA-dd-1']"));

    /* ── the dragged feedback-popup position ─────────────────────────────
       QA: the movable panel snapped back to its default on every refresh AND
       on every return to the screen. The position lived only in inline
       style.left/top, and scqFbResetPosition — called by every showFeedback,
       including the ones the painter re-runs — cleared it.
       jsdom has no layout, so a real drag cannot be simulated; these drive
       the seam the drag writes to (fbPositions) and assert the round-trip. */
    exec("fbPositions['tbl-feedbox'] = { left: 300, top: 200 };");
    exec('window.__snapFb = capturePartPayload();');
    ok(c, 'the dragged position is captured into the payload',
      val("window.__snapFb.fbPos && window.__snapFb.fbPos['tbl-feedbox'].left") === 300,
      JSON.stringify(val("window.__snapFb.fbPos")));

    /* Wipe as a reload would, then restore and repaint through the real path:
       goTo -> repaintScreen -> restoreScreenUI -> tblShowFeedback ->
       scqFbResetPosition, which is exactly where the position used to die. */
    exec("window.__wipe04(); Object.keys(fbPositions).forEach(function (k) { delete fbPositions[k]; });" +
         "document.getElementById('tbl-feedbox').style.left = '';" +
         "document.getElementById('tbl-feedbox').style.top = '';");
    exec('applyResumeVars(window.__snapFb);');
    ok(c, 'and restored into fbPositions',
      val("fbPositions['tbl-feedbox'] && fbPositions['tbl-feedbox'].top") === 200,
      JSON.stringify(val("fbPositions['tbl-feedbox']")));
    exec('applyResumeDom(window.__snapFb); goTo(0); goTo(1);');
    ok(c, 'a repaint re-applies the dragged position instead of resetting it',
      val("document.getElementById('tbl-feedbox').style.left") === '300px' &&
      val("document.getElementById('tbl-feedbox').style.top") === '200px',
      'left=' + val("document.getElementById('tbl-feedbox').style.left") +
      ' top=' + val("document.getElementById('tbl-feedbox').style.top"));
    /* bottom:auto is not cosmetic — the CSS anchors the box by bottom, so
       without it the restored top is ignored and the box does not move. */
    ok(c, 'and sets bottom:auto, so the restored top actually wins over the CSS',
      val("document.getElementById('tbl-feedbox').style.bottom") === 'auto',
      '"' + val("document.getElementById('tbl-feedbox').style.bottom") + '"');

    /* A genuinely NEW feedback message must still recenter: a popup parked in
       a corner has to come back into view. This is the half that must NOT
       change, and it is why the guard keys on "is a painter running". */
    exec("tblShowFeedback('wrong1', false);");
    ok(c, 'a new feedback message still resets the position',
      val("document.getElementById('tbl-feedbox').style.left") === '' &&
      val("document.getElementById('tbl-feedbox').style.bottom") === '',
      'left="' + val("document.getElementById('tbl-feedbox').style.left") + '"');
    ok(c, 'and forgets the stored position, so it will not come back',
      val("fbPositions['tbl-feedbox'] === undefined") === true,
      JSON.stringify(val("fbPositions")));
  }

  /* ── Phase 2b: the drag-question round-trip, parts 05 / 06 ────────────
     These live in makeDragQuestion's closure, reachable only through the
     getState/setState seam added for resume. Both the solved and the
     reveal-toggle paths are exercised. */
  if (c === '05' || c === '06') {
    const inst = (c === '05') ? 'dqA' : 'tbl9Q';
    const screen = 2;
    exec('goTo(' + screen + ');');

    exec(`window.__snapA = ${inst}.getState();`);
    ok(c, inst + ' exposes its closure state through the resume seam',
      val(`typeof window.__snapA === 'object' && window.__snapA !== null &&
           typeof window.__snapA.placement === 'object' &&
           'attempts' in window.__snapA && 'done' in window.__snapA &&
           'showingCorrect' in window.__snapA && 'passed' in window.__snapA`) === true,
      String(val('JSON.stringify(Object.keys(window.__snapA || {}))')));

    /* ── interim (one wrong attempt) through the factory ─────────────────
       QA 2026-08-20 slide 10. render() used to compute the check button from
       "all targets filled" alone, which is true after a wrong attempt because
       the learner's own answer is still on the board — so a reload handed back
       a live button and the identical answer could be resubmitted, burning the
       real second attempt. lastSubmittedSig now round-trips, so the restored
       button is disabled until something actually moves.
       Only 05/dqA runs this: 06 carries a byte-identical copy of the factory,
       and dqA is the instance whose target ids are known here. */
    if (c === '05') {
      /* A complete but wrong board: every target filled, assignment reversed. */
      exec(`(function () {
        var drags = Object.keys(dqA.getState().placement);
        var targets = ['dqA-target-1','dqA-target-2','dqA-target-3','dqA-target-4'];
        var pl = {};
        drags.forEach(function (d) { pl[d] = 'source'; });
        targets.forEach(function (t, i) { pl[drags[drags.length - 1 - i]] = t; });
        dqA.setState({ placement: pl, attempts: 0, done: false, checked: false,
                       lastWrongPlacement: null, showingCorrect: false, passed: false });
      })();`);
      exec('dqACheck();');
      ok(c, 'dqA: one wrong attempt, still answerable',
        val('dqA.getState().attempts') === 1 && val('dqA.getState().done') === false,
        val('dqA.getState().attempts') + ' / ' + val('dqA.getState().done'));
      ok(c, 'dqA: the live code disables the check button after a wrong answer',
        val("document.getElementById('dqA-btn-check').disabled") === true);

      exec('window.__snapI = capturePartPayload();');
      exec(`dqA.setState({ placement: {}, attempts: 0, done: false, checked: false,
                           lastWrongPlacement: null, showingCorrect: false, passed: false });
            dqA.reset();`);
      exec('applyResumeVars(window.__snapI); restoreScreenUI(' + screen + ');');
      ok(c, 'dqA: interim restore does NOT allow resubmitting the unchanged answer',
        val("document.getElementById('dqA-btn-check').disabled") === true,
        'disabled=' + val("document.getElementById('dqA-btn-check').disabled"));
      /* Move one card back to the bank: the board is no longer complete AND the
         signature changed. Then put it somewhere else, so the board is complete
         again with a genuinely different answer — that is the case that must
         re-enable, and the one that proves nobody is stranded. */
      exec(`(function () {
        var st = dqA.getState();
        var drags = Object.keys(st.placement);
        var moved = drags.filter(function (d) { return st.placement[d] !== 'source'; })[0];
        var free  = drags.filter(function (d) { return st.placement[d] === 'source'; })[0];
        var slot  = st.placement[moved];
        st.placement[moved] = 'source';
        st.placement[free]  = slot;
        dqA.setState(st);
        /* setState only writes the closure; restoreUI is what repaints, and
           render() inside it is where the button predicate actually runs. */
        dqA.restoreUI();
      })();`);
      ok(c, 'dqA: a different complete answer re-enables it — never stranded',
        val("document.getElementById('dqA-btn-check').disabled") === false,
        'disabled=' + val("document.getElementById('dqA-btn-check').disabled"));
    }

    /* Force the wrong-final state: two attempts with nothing placed correctly.
       window[P+'Check'] is the live entry point the markup calls. */
    exec(`${inst}.setState({ placement: {}, attempts: 1, done: false, checked: false,
                             lastWrongPlacement: null, showingCorrect: false, passed: false });`);
    exec(`window['${c === '05' ? 'dqA' : 'tbl9'}Check']();`);
    ok(c, inst + ' reaches wrong-final after the second attempt',
      val(`${inst}.getState().done`) === true && val(`${inst}.getState().passed`) === false,
      val(`${inst}.getState().done`) + ' / ' + val(`${inst}.getState().passed`));
    ok(c, inst + ' snapshotted the learner\'s answer before any reveal',
      val(`${inst}.getState().lastWrongPlacement !== null`) === true);

    /* Round-trip through the part-level hooks, as a real reload would. */
    exec('window.__snapP = capturePartPayload();');
    /* A real page load resets the DOM too, not just the closure vars. reset()
       calls resetInitial() once the state says "no progress", which is what
       repaints the board pristine — without it the button would keep the label
       the live check() left behind and the painter would not be under test. */
    exec(`${inst}.setState({ placement: {}, attempts: 0, done: false, checked: false,
                             lastWrongPlacement: null, showingCorrect: false, passed: false });
          ${inst}.reset();`);
    ok(c, 'the wipe cleared ' + inst, val(`${inst}.getState().done`) === false);
    ok(c, 'the wipe also reset the check button in the DOM (so the painter is under test)',
      val(`(function(){ var b=document.getElementById('${c === '05' ? 'dqA-btn-check' : 'tbl9-check'}');
            return b ? b.textContent.indexOf('המשך') === -1 : 'no-btn'; })()`) === true,
      String(val(`(function(){ var b=document.getElementById('${c === '05' ? 'dqA-btn-check' : 'tbl9-check'}');
            return b ? b.textContent : 'no-btn'; })()`)));
    exec('applyResumeVars(window.__snapP); restoreScreenUI(' + screen + ');');
    ok(c, inst + ' restores the done/failed state',
      val(`${inst}.getState().done`) === true && val(`${inst}.getState().passed`) === false,
      val(`${inst}.getState().done`) + ' / ' + val(`${inst}.getState().passed`));
    ok(c, inst + ' restore leaves the learner able to continue (never stranded)',
      val(`(function(){ var b=document.getElementById('${c === '05' ? 'dqA-btn-check' : 'tbl9-check'}');
            return b ? (b.disabled === false && b.textContent === 'המשך') : 'no-btn'; })()`) === true,
      String(val(`(function(){ var b=document.getElementById('${c === '05' ? 'dqA-btn-check' : 'tbl9-check'}');
            return b ? b.textContent + ' disabled=' + b.disabled : 'no-btn'; })()`)));

    /* CLAUDE.md rule 4 through the factory: with the solution displayed,
       placement holds the SOLUTION and only lastWrongPlacement holds the
       learner's. A round-trip must keep the two distinct. */
    exec(`window['${c === '05' ? 'dqA' : 'tbl9'}Reveal']();`);
    ok(c, inst + ' toggle shows the solution',
      val(`${inst}.getState().showingCorrect`) === true);
    exec('window.__snapR = capturePartPayload();');
    exec(`${inst}.setState({ placement: {}, attempts: 0, done: false, checked: false,
                             lastWrongPlacement: null, showingCorrect: false, passed: false });`);
    exec('applyResumeVars(window.__snapR); restoreScreenUI(' + screen + ');');
    ok(c, inst + ' toggle state survives the round-trip',
      val(`${inst}.getState().showingCorrect`) === true);
    ok(c, inst + ' keeps the learner\'s answer distinct from the displayed solution',
      val(`(function(){ var s=${inst}.getState();
            return s.lastWrongPlacement !== null &&
                   JSON.stringify(s.placement) !== JSON.stringify(s.lastWrongPlacement); })()`) === true,
      String(val(`JSON.stringify(${inst}.getState())`)).slice(0, 200));

    /* ── Unsubmitted work must survive a repaint, without inventing feedback ──
       restoreUI() used to call resetInitial() whenever attempts === 0, which
       reset every placement to 'source'. Harmless while the painter ran once at
       load; destructive now that it runs from every goTo. The naive fix — reusing
       reset()'s hasProgress predicate — is worse: it drops this state through to
       the function tail, which calls showFeedback('wrong1') and tells the learner
       their never-submitted answer is wrong. render() alone is correct. */
    /* The placement must contain REAL zone ids, not 'source' — otherwise
       resetInitial()'s wipe-to-'source' is a no-op and the assertion is vacuous.
       After the reveal above, placement holds the solution, i.e. every drag id
       mapped to its correct target. Reuse it as "what the learner dragged". */
    exec(`window.__placed = JSON.parse(JSON.stringify(${inst}.getState().placement));
          window.__placedKey = Object.keys(window.__placed).filter(function (k) {
            return window.__placed[k] !== 'source'; })[0];`);
    ok(c, inst + ' test fixture holds a real zone placement (guards vacuity)',
      val('typeof window.__placedKey === "string" && window.__placed[window.__placedKey] !== "source"') === true,
      String(val('JSON.stringify(window.__placed)')).slice(0, 160));
    exec(`${inst}.setState({ placement: JSON.parse(JSON.stringify(window.__placed)),
                             attempts: 0, done: false, checked: false,
                             lastWrongPlacement: null, showingCorrect: false, passed: false });`);
    exec('restoreScreenUI(' + screen + ');');
    ok(c, inst + ' keeps an unsubmitted placement when the painter runs',
      val(`${inst}.getState().placement[window.__placedKey] === window.__placed[window.__placedKey]`) === true,
      'expected ' + String(val('window.__placed[window.__placedKey]')) +
      ' got ' + String(val(`${inst}.getState().placement[window.__placedKey]`)));
    ok(c, inst + ' does not fabricate wrong feedback on an unsubmitted answer',
      val(`(function(){ var b = document.getElementById('${c === '05' ? 'dqA-feedbox' : 'tbl9-feedbox'}');
            return b ? (b.classList.contains('visible') === false) : 'no-box'; })()`) === true,
      String(val(`(function(){ var b = document.getElementById('${c === '05' ? 'dqA-feedbox' : 'tbl9-feedbox'}');
            return b ? b.className : 'no-box'; })()`)));
  }

  if (c === '06') {
    exec("XAPI_Q_RESULTS['001/q1']=true; XAPI_Q_RESULTS['001/q2']=true; XAPI_Q_RESULTS['001/q3']=true;");
    ok(c, 'moed-B score reads 3 before capture', val('getMoedBScore()') === 3, String(val('getMoedBScore()')));
    exec('window.__snap = capturePartPayload();');
    exec("Object.keys(XAPI_Q_RESULTS).forEach(function(k){ delete XAPI_Q_RESULTS[k]; });");
    ok(c, 'the regression is real: moed-B score wipes to 0',
      val('getMoedBScore()') === 0, String(val('getMoedBScore()')));
    exec('applyResumeVars(window.__snap);');
    ok(c, 'restore returns the moed-B score', val('getMoedBScore()') === 3, String(val('getMoedBScore()')));

    /* para10-hint ships VISIBLE (no `hidden` in the markup) and resetScreenState3
       re-shows it on purpose, while resetInitial() hides it. So a painter that
       routed a clean screen through resetInitial() made the hint vanish for a
       resumed learner on the first visit and reappear on the second. */
    exec('applyExecutionState({ currentScreen: 0 }); goTo(3);');
    ok(c, 'the para10 hint stays visible on a clean screen after a resume',
      val("document.getElementById('para10-hint').hidden") === false,
      'hidden=' + val("document.getElementById('para10-hint').hidden"));

    /* ── QA 2026-08-20 slide 8: "צדקתי is lit but does not respond" ──────
       s12-check is the only check button in the unit with no inline onclick in
       the markup, so after a reload its handler is genuinely absent until JS
       wires it. resetScreenState6 would — but it returns early on
       `s12Attempts > 0`, and applyResumeVars restores that counter before goTo,
       so the guard always fires on a resume. s12RestoreUI then set only
       `disabled`. The learner got a button that lit up on selecting an option
       (s12Select writes disabled=false) and did nothing on click: a hard lock
       on the last question of מועד ב, escapable only by another refresh.
       Setting onclick=null below is a faithful stand-in for the post-reload
       DOM precisely because this button carries no inline handler. */
    exec("s12Done = false; s12Attempts = 1; s12Selected = null;");
    exec('window.__snapS12 = capturePartPayload();');
    exec("document.getElementById('s12-check').onclick = null;");
    exec('applyResumeVars(window.__snapS12); goTo(6);');
    ok(c, 's12: an interim restore leaves the check button with a handler',
      val("!!document.getElementById('s12-check').onclick") === true,
      'onclick=' + val("String(document.getElementById('s12-check').onclick)").slice(0, 40));
    /* And the whole point: picking an option must produce a button that works. */
    exec("s12Select(document.querySelector('#s11 .s12-opt:not(.locked)').id);");
    ok(c, 's12: after picking an option the button is enabled AND responds',
      val("document.getElementById('s12-check').disabled") === false &&
      val("(function(){ var n=s12Attempts; document.getElementById('s12-check').click(); return s12Attempts !== n; })()") === true,
      'disabled=' + val("document.getElementById('s12-check').disabled"));
  }

  if (c === '02') {
    /* The progress rail is painted only by updateQuestionNav2, which used to sit
       AFTER the resume guard in resetScreenState1..5 — so an answered screen,
       which returns at that guard, never repainted it and no painter does. The
       learner saw correct answers marked but a rail of all-future icons. */
    ok(c, 'the rail icon exists (guards vacuity)',
      val("document.getElementById('sq2-qnav-icon-1') !== null") === true);
    /* Force the answered state so resetScreenState1's resume guard early-returns:
       that is the branch under test. The rail must still be repainted, and it must
       carry the SPECIFIC success class — asserting merely "not future" passes
       vacuously off a stale qnav-current left by an earlier navigation. */
    exec("goTo(0); sq2Done = true; sq2Attempts = 1; stationProgress2.q2 = 'success';");
    exec("document.getElementById('sq2-qnav-icon-1').className = 'qnav-icon qnav-future';");
    exec('goTo(1);');
    ok(c, 'the progress rail is repainted on an answered screen',
      val("document.getElementById('sq2-qnav-icon-1').classList.contains('qnav-success')") === true,
      String(val("document.getElementById('sq2-qnav-icon-1').className")));
    exec("sq2Done = false; sq2Attempts = 0; stationProgress2.q2 = null;");
  }

  /* ── An answer commitment persists SYNCHRONOUSLY ─────────────────────────
     The static checkCommitmentFlush() proves the call is present and reachable;
     these prove it actually writes, and writes the right thing. Before
     2026-08-19 there was no assertion anywhere that answer commitment produced a
     synchronous write — the 24 flush sites were covered only by a
     `typeof flushResumeSave === 'function'` existence check.

     __store is written ONLY by the synchronous saveState720 and __pending ONLY
     by saveState720Debounced, so asserting on __store is a true
     "this was persisted synchronously" assertion rather than "a save happened". */
  const slugFor = 'methodica-science-mass-measure-02-' + c;
  const storedDone = (expr) =>
    val('(function(){ try { return ' +
        'JSON.parse(window.__store).payload.' + expr + '; } ' +
        'catch (e) { return "__NO_STORE__"; } })()');

  if (c === '01') {
    exec('goTo(1); window.__wipeScq();');
    exec('window.__store = null; window.__syncWrites = 0;');
    exec('scqSelect(SCQ.correctId); scqCheck();');
    ok(c, 'a correct single-choice answer is persisted synchronously',
      storedDone('scq.scq.done') === true, String(storedDone('scq.scq.done')));
    /* The regression the insert POSITION guards against: the branch must flush
       and return, never also fall through to the tail flush. Two blocking PUTs
       on one click is a visible hitch on a school network. */
    ok(c, 'and exactly once — the branch does not also reach the tail flush',
      val('window.__syncWrites') === 1, val('window.__syncWrites') + ' sync write(s)');

    /* The wrong path always reached the tail flush; asserted so a future
       refactor cannot lose it while "fixing" the correct one. */
    exec('window.__wipeScq(); window.__store = null; window.__syncWrites = 0;');
    exec('scqSelect(window.__badScq); scqCheck();');
    ok(c, 'a wrong single-choice attempt is also persisted synchronously, once',
      storedDone('scq.scq.att') === 1 && val('window.__syncWrites') === 1,
      'att=' + storedDone('scq.scq.att') + ' writes=' + val('window.__syncWrites'));

    exec('goTo(13); window.__wipeS13();');
    exec('window.__store = null; window.__syncWrites = 0;');
    exec('MCQ14.correctIds.forEach(function (id) { scq14Toggle(id); }); scq14Check();');
    ok(c, 'a correct multi-select answer is persisted synchronously, once',
      storedDone('scq14.done') === true && val('window.__syncWrites') === 1,
      String(storedDone('scq14.done')) + ' writes=' + val('window.__syncWrites'));

    /* ORDERING GUARD. capturePartPayload reads screen 13's wrong-marks off the
       live DOM (captureWrongMarks), so a flush that ran before the marks were
       painted would persist `wrong: []` — the exact bug fixed on 2026-08-18.
       A wrong attempt must therefore reach the store WITH its marks. */
    exec('window.__wipeS13(); window.__store = null;');
    exec('scq14Toggle(window.__badS13[0]); scq14Check();');
    ok(c, 'the commitment flush runs AFTER the wrong marks are painted',
      Array.isArray(storedDone('scq14.wrong')) && storedDone('scq14.wrong').length > 0,
      JSON.stringify(storedDone('scq14.wrong')));
    exec('window.__wipeS13(); window.__wipeScq();');
  }

  if (c === '02') {
    exec(`goTo(1);
      sq2Selected = []; sq2Attempts = 0; sq2Done = false; sq2Phase = 'before';
      __mcqWrong.sq2 = [];
      document.querySelectorAll('#s1 .scq-opt').forEach(function (el) {
        el.classList.remove('selected', 'wrong', 'correct', 'disabled');
      });
      document.getElementById('sq2-feedbox').classList.remove('visible');
      window.__store = null; window.__syncWrites = 0;`);
    exec('MCQ_SQ2.correctIds.forEach(function (id) { sq2Toggle(id); }); sq2Check();');
    ok(c, 'a correct multi-select answer is persisted synchronously, once',
      storedDone('mcq.sq2.done') === true && val('window.__syncWrites') === 1,
      String(storedDone('mcq.sq2.done')) + ' writes=' + val('window.__syncWrites'));
    exec("sq2Selected = []; sq2Attempts = 0; sq2Done = false; sq2Phase = 'before';");
  }

  /* ── A painter must never throw, whatever the state ──────────────────────
     THE GENERIC DETECTOR. Three try/catch layers stand between a painter and
     the learner — restoreScreenUI's own, repaintScreen's in 40-resume.js, and
     the goTo call site. They exist so a broken paint can never break
     navigation, and they work: navigation survives. What they also do is make a
     painter fault completely invisible in production, reduced to one console
     line nobody reads.

     That is how screen 13 shipped hard-locked: restoreScq14UI dereferenced a
     config global named SCQ14, which does not exist (the real one is MCQ14), so
     it threw before locking the options, showing the feedback, or enabling
     "המשך" — leaving exactly the "variables say answered, DOM says blank" trap
     that the 2026-08-18 repaint fix was written to eliminate. The suite could
     not have caught it: restoreScq14UI was never called by a single assertion.

     So this sweep asserts the invariant directly, and does it WITHOUT naming
     any screen or state variable: force every `done` in a captured payload,
     restore it, then walk every screen and demand silence. Any new question, in
     any part, is covered the day it is written.

     Deliberately not enumerating per-screen expectations here — that is what
     the targeted assertions above are for. This one only asks "did anything
     blow up", which is the question the catches suppress. */
  exec(`
    window.__sweepErrs = [];
    window.__sweepOn = false;
    (function () {
      var orig = console.error;
      console.error = function () {
        if (window.__sweepOn) {
          window.__sweepErrs.push(Array.prototype.map.call(arguments, String).join(' '));
        }
        return orig.apply(console, arguments);
      };
    }());
  `);
  /* Recursive because payload shapes differ per part: some questions sit at the
     top level, others inside st.scq / st.mcq / st.flip. `phase` goes to
     'correct' alongside `done` so painters that branch on it take the
     answered-correctly path rather than reading a stale 'before'. */
  exec(`
    window.__forceDone = function (o) {
      if (!o || typeof o !== 'object') return o;
      Object.keys(o).forEach(function (k) {
        var v = o[k];
        if (k === 'done') o[k] = true;
        else if (k === 'phase') o[k] = 'correct';
        else if (v && typeof v === 'object') window.__forceDone(v);
      });
      return o;
    };
    window.__sweepSnap = window.__forceDone(capturePartPayload());
    applyResumeVars(window.__sweepSnap);
    window.__sweepOn = true;
    for (var __n = 0; __n < TOTAL_SCREENS; __n++) { goTo(__n); }
    window.__sweepOn = false;
  `);
  const sweepErrs = val('window.__sweepErrs.slice(0, 4).join(" || ")');
  ok(c, 'no painter throws when every question is restored as answered',
    val('window.__sweepErrs.length') === 0,
    val('window.__sweepErrs.length') + ' error(s): ' + sweepErrs);

  dom.window.close();
}

/* ── The library letter, and the state diagnostics it carries ─────────────
   The unit moved from xapi-720-j.js to -k.js. Two things must hold, and one of
   them fails SILENTLY, which is why it is asserted here rather than trusted:

   1. The letter gate regex must know the new letter. `XAPI_USING_G` is derived
      from a regex on the library filename and guards ALL item-level statements
      and video reporting — a letter missing from it silences them with no error
      whatsoever. This is the single most dangerous part of a letter migration.
   2. The diagnostic surface -k adds must actually be reachable, and every
      `reason` branch must be produced by the status it claims to describe. -j
      collapsed 404/401/412/413/422/0 into one bit, which is what made a failed
      platform run uninterpretable; a mapping that is wrong here would recreate
      that problem while looking like it had been fixed. */
function checkLibraryLetter() {
  const loader = fs.readFileSync(path.join(BASE, 'unit-js', '50-loader.js'), 'utf8');

  const libMatch = loader.match(/RESUME_ENABLED \? '(xapi-720-[a-z]\.js)'/);
  ok('lib', 'the loader names a resume-capable library build', !!libMatch,
    libMatch ? libMatch[1] : 'LIB720 selection not found');
  const letter = libMatch ? libMatch[1].match(/xapi-720-([a-z])\.js/)[1] : null;

  const gateMatch = loader.match(/\/xapi-720-\[([a-z]+)\]\\\.js\//);
  ok('lib', 'the letter gate regex is present', !!gateMatch,
    gateMatch ? gateMatch[1] : 'XAPI_USING_G regex not found');

  /* The failure this catches: bumping LIB720 without extending the gate. */
  ok('lib', 'the loaded letter is INSIDE the gate regex (else item statements go silent)',
    !!(letter && gateMatch && gateMatch[1].includes(letter)),
    'letter=' + letter + ' gate=[' + (gateMatch ? gateMatch[1] : '?') + ']');

  /* The stub filename is what the gate tests during a browser walk, so it must
     carry a letter the gate accepts too. */
  const stubs = fs.readdirSync(HARNESS_DIR).filter(f => /^xapi-720-[a-z]\.js$/.test(f));
  ok('lib', 'exactly one local stub library exists', stubs.length === 1, stubs.join(','));
  const stubLetter = stubs.length === 1 ? stubs[0].match(/xapi-720-([a-z])\.js/)[1] : null;
  ok('lib', 'the stub letter is also inside the gate regex',
    !!(stubLetter && gateMatch && gateMatch[1].includes(stubLetter)),
    'stub=' + stubLetter);
  ok('lib', 'the stub letter matches the library the unit loads', stubLetter === letter,
    'stub=' + stubLetter + ' lib=' + letter);

  /* No lingering reference to the previous letter's stub path. */
  for (const rel of ['_test/README.md', 'docs-and-tools/RESUME.md', 'unit-js/50-loader.js']) {
    /* Two of these three are dev docs, which a package contains by design: only
       unit-js/ ships. Skipping what is absent is what lets this suite also run against
       a cut package; on the working tree all three are present and all three are checked. */
    const abs = path.join(BASE, rel);
    if (!fs.existsSync(abs)) continue;
    const txt = fs.readFileSync(abs, 'utf8');
    const stale = [...txt.matchAll(/_test\/xapi-720-([a-z])\.js/g)].map(m => m[1]).filter(l => l !== letter);
    ok('lib', rel + ' has no stale stub-path letter', stale.length === 0, stale.join(','));
  }
}

/* ── Every commitment flushes ────────────────────────────────────────────
   §8.3 of ADDING-REPORTING-AND-RESUME.md states the contract as
   "flushResumeSave() at the tail of every …Check()". Until 2026-08-19 the code
   did not honour it: 13 of the 25 committing functions ended their
   correct-answer branch in `return;` BEFORE the tail flush, so a WRONG answer
   was persisted synchronously and a CORRECT one was not. The split fell exactly
   along authoring style — the choice-type questions used
   `if (isCorrect) { … return; }`, while every drag/table/dropdown/select one
   used `if / else if / else` with a common tail and was always fine.

   Nobody reading a single branch would predict that asymmetry, which is why it
   is asserted here rather than trusted. Two clauses:
     1. a function that commits must flush at all
     2. no `return` may sit between a commitment and a flush

   ⚠️ Brace-matches every `function NAME(...)`, deliberately NOT keyed on the
   `*Check` naming convention: parts 05/06 commit inside a closure named plain
   `check`, and an audit that grepped for `*Check` missed all four questions it
   serves. Any future question is covered whatever its function is called.

   ⚠️ This is a TEXTUAL approximation of control flow, not a proof. Callback
   `return`s inside .every()/.forEach() are tolerated today only because every
   one of them sits before its function's first commitment; a future callback
   return placed after one would be a false positive. Hence the line numbers in
   the failure message.

   Scope is `*Done`-style commitment flags on purpose. Reveal-only flags
   (s7Flipped, scr3Card1Flipped/scr3Card2Flipped in part 01) are deliberately
   left on the debounce — see RESUME.md §6ג. */
function checkCommitmentFlush() {
  for (const c of COMPONENTS) {
    const rel = path.join('methodica-science-mass-measure-02-' + c, 'script.js');
    const src = fs.readFileSync(path.join(BASE, rel), 'utf8');
    let found = 0;
    for (const m of src.matchAll(/function\s+(\w+)\s*\([^)]*\)\s*\{/g)) {
      const name = m.group ? m.group(1) : m[1];
      // brace-match the body
      let i = m.index + m[0].length - 1, depth = 0, j = i;
      while (j < src.length) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) break; }
        j++;
      }
      const body = src.slice(i, j);
      const commits = [...body.matchAll(/(?:\w+Done|\bdone)\s*=\s*true/g)].map(x => x.index);
      if (!commits.length) continue;
      found++;
      const flushes = [...body.matchAll(/flushResumeSave\s*\(/g)].map(x => x.index);
      const lineOf = off => src.slice(0, i + off).split('\n').length;

      ok('flush', c + '/' + name + ' flushes at all',
        flushes.length > 0, 'commits at line ' + lineOf(commits[0]) + ', no flushResumeSave');

      const firstCommit = Math.min(...commits);
      const escaping = [...body.matchAll(/\breturn\b/g)].map(x => x.index)
        .filter(r => r > firstCommit && !flushes.some(f => f < r))
        .map(lineOf);
      ok('flush', c + '/' + name + ' has no return between a commitment and its flush',
        escaping.length === 0, 'escaping return(s) at line ' + escaping.join(', '));
    }
    ok('flush', rel + ' has committing functions to check', found > 0 || c === '03',
      found + ' found');
  }
}

/* Every reason branch, driven through the stub's forced-status hook. Asserted
   against the SAME mapping the real library uses, so a green run here describes
   what will happen against Kata rather than something adjacent. */
async function checkStateDiagnostics() {
  const c = '01';
  const dir = path.join(BASE, 'methodica-science-mass-measure-02-' + c);
  const dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), {
    url: 'http://localhost:8777/methodica-science-mass-measure-02-' + c +
         '/index.html?slxapi=1&registration=r1&xapiLib=../_test/xapi-720-k.js',
    runScripts: 'dangerously', pretendToBeVisual: true,
  });
  const w = dom.window;
  const { exec, val } = makeRunner(w);
  w.console.error = w.console.warn = w.console.log = function () {};
  w.fetch = function () { return Promise.resolve({ ok: true }); };
  w.HTMLMediaElement.prototype.load = function () {};
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () {};
  for (const src of [...w.document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))) {
    const p = path.resolve(dir, src.split('?')[0]);
    if (fs.existsSync(p)) { try { exec(fs.readFileSync(p, 'utf8')); } catch (e) {} }
  }
  // Load the stub the way the loader would on localhost.
  exec(fs.readFileSync(path.join(HARNESS_DIR, 'xapi-720-k.js'), 'utf8'));

  ok('diag', 'RESUME_STATE_ID carries the component slug (one fallback slot per component)',
    val('RESUME_STATE_ID') === 'execution-state::methodica-science-mass-measure-02-01', String(val('RESUME_STATE_ID')));
  ok('diag', 'stateLastResult720 is exposed',
    val('typeof window.stateLastResult720') === 'function');

  exec("_resumeReady = true; _unitState = emptyUnitState(); window.__reset();");

  /* A first read with nothing stored is `absent` and is SUCCESS, not failure.
     This is the case -j could not distinguish from a broken deployment. */
  exec('window.loadState720(RESUME_STATE_ID);');
  ok('diag', 'a first read reports absent, and absent counts as ok',
    val("window.stateLastResult720().reason") === 'absent' &&
    val("window.stateLastResult720().ok") === true,
    JSON.stringify(val("JSON.stringify(window.stateLastResult720())")));

  exec('window.saveState720(RESUME_STATE_ID, { v: 3 });');
  ok('diag', 'a successful write reports ok with a 2xx status',
    val("window.stateLastResult720().reason") === 'ok' &&
    val("window.stateLastResult720().status") >= 200 &&
    val("window.stateLastResult720().status") < 300);

  exec('window.loadState720(RESUME_STATE_ID);');
  ok('diag', 'a read of a stored document reports ok',
    val("window.stateLastResult720().reason") === 'ok');

  /* Each documented status maps to its own name — the whole point of the change. */
  for (const [status, reason] of [[401, 'auth'], [413, 'too-large'], [412, 'stale'],
                                  [400, 'bad-address'], [422, 'validation'], [500, 'http-500']]) {
    exec('window.__failWrites(' + status + '); window.saveState720(RESUME_STATE_ID, {});');
    ok('diag', 'status ' + status + ' reports reason "' + reason + '"',
      val("window.stateLastResult720().reason") === reason &&
      val("window.stateLastResult720().ok") === false,
      String(val("window.stateLastResult720().reason")));
  }
  exec('window.__failWrites(false);');

  dom.window.close();
}

/* ── The slug-case invariant ─────────────────────────────────────────────
   Every folder on disk is lowercase, and so is every reported id. Until
   2026-08-17 the cross-part navigation paths were not: they carried a capital
   first letter, which cost two distinct bugs.

   1. On a case-sensitive host (production is one; Windows is not, which is
      exactly why this suite passed over it for so long) every cross-part hop
      404s.
   2. currentPartSlug() derives the slug from location.pathname, so the case
      follows however the learner arrived. A capitalised URL yields a second
      key for the same component, splitting the resume document's parts[] and
      the completed-ledger — and a ledger that misses means a duplicate
      'completed' reaches the LRS.

   The check is a blunt whole-file scan rather than anything comment-aware, so
   prose in these files must describe the old spelling instead of quoting it. */
function checkSlugCase() {
  const files = [];
  for (const f of fs.readdirSync(path.join(BASE, 'unit-js'))) {
    if (f.endsWith('.js')) files.push(path.join('unit-js', f));
  }
  for (const c of COMPONENTS) {
    files.push(path.join('methodica-science-mass-measure-02-' + c, 'script.js'));
    files.push(path.join('methodica-science-mass-measure-02-' + c, 'index.html'));
  }
  for (const rel of files) {
    const txt = fs.readFileSync(path.join(BASE, rel), 'utf8');
    const hits = [...txt.matchAll(/Methodica/g)].length;
    ok('case', rel + ' has no capitalised unit slug', hits === 0, hits + ' occurrence(s)');
  }
}

/* ── An item answered BEFORE a reload must still close after it ──────────
   xapi-720-k.js gates an item's 'completed' on xapiItemAnswered[itemId], a map it fills ONLY
   from an 'answered' passing through in the SAME page load:

       if (sttmContext?.expectsAnswer && !xapiItemAnswered[_cid]) {
           console.log("[XAPI] item left unanswered — deferring 'completed': " + _cid);
           return;          // "deferring" is a DROP — there is no queue, flush or retry

   A resume deliberately re-sends no answers, so without xapiSeedAnsweredFromResume()
   (unit-js/20-xapi.js, called at the end of applyExecutionState) the close below is silently
   dropped — while sendStatementOnce, having called the sender, still marks the ledger sent.
   The statement is then lost for good: the lomda never asks again and the library has no
   retry. The trigger is the ordinary path — answer, leave, come back, continue.

   Found live against Kata on 07.09.26 in methodica-math-ratio-01, whose call site is identical
   to this unit's. It runs against the STUB rather than the inline recorders the rest of this
   file uses, because only the stub models the library's guard — with a bare recorder the whole
   class is invisible, which is how it survived every assertion here. */
async function checkItemClosesAfterResume() {
  const c = '01';
  const dir = path.join(BASE, 'methodica-science-mass-measure-02-' + c);

  const openWindow = () => {
    const dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), {
      url: 'http://localhost:8777/methodica-science-mass-measure-02-' + c +
           '/index.html?slxapi=1&registration=r1&xapiLib=../_test/xapi-720-k.js',
      runScripts: 'dangerously', pretendToBeVisual: true,
    });
    const w = dom.window;
    const { exec, val } = makeRunner(w);
    w.console.error = w.console.warn = w.console.log = function () {};
    w.fetch = function () { return Promise.resolve({ ok: true }); };
    w.HTMLMediaElement.prototype.load = function () {};
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    w.HTMLMediaElement.prototype.pause = function () {};
    for (const src of [...w.document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))) {
      const p = path.resolve(dir, src.split('?')[0]);
      if (fs.existsSync(p)) { try { exec(fs.readFileSync(p, 'utf8')); } catch (e) {} }
    }
    exec(fs.readFileSync(path.join(HARNESS_DIR, 'xapi-720-k.js'), 'utf8'));
    exec('window.XAPI_USING_G = true;');
    exec('_resumeReady = true; _unitState = emptyUnitState(); window.__reset();');
    const closed = () => JSON.parse(val('JSON.stringify(window.__stmts())'))
      .filter(s => s.verb === 'completed').map(s => s.objectId);
    return { dom, exec, val, closed };
  };

  /* Session one: report item 002's question through the real reporting function, which is
     what writes XAPI_Q_RESULTS, and keep the payload the document would have held. */
  const a = openWindow();
  a.exec("xapiAnswered('002', 'q1', true, true, 'x');");
  const payload = a.val('JSON.stringify(capturePartPayload())');
  a.dom.window.close();

  /* Session two: a fresh window, so a fresh library with an empty xapiItemAnswered — which is
     the whole point — replaying that payload and landing inside item 002 (screen 3). */
  const b = openWindow();
  b.exec('applyExecutionState(' + payload + ', 3);');
  ok('reclose', 'the replay itself closes nothing', b.closed().length === 0,
    b.closed().join(','));

  /* Screen 4 is item 003, so this crossing closes 002 — the item answered in session one. */
  b.exec('goTo(4);');
  const closed = b.closed();
  ok('reclose', 'an item answered before the reload still closes after it',
    closed.length === 1 && /-01-002\/$/.test(String(closed[0])),
    'closed ' + closed.length + ': ' + closed.join(','));
  b.dom.window.close();
}

/* ══════════════ The asset contract ══════════════
   Every failure mode in this section is SILENT in a browser. A missing font renders in a
   fallback face that looks plausible; a missing <img> renders as nothing at all. There is
   no exception and no console message beyond a 404 nobody is watching.

   Nothing else in this file could see any of it: the JSDOM instances here are built with
   default `resources`, so jsdom never fetches <link rel=stylesheet>, <img> or <video> — it
   only hand-executes <script src>. Before this section existed, moving every asset in the
   unit broke exactly zero assertions.

   That is not hypothetical. The reference unit methodica-math-ratio-01 shipped this bug:
   all six of its stylesheets reached the fonts as ../assets/fonts/ while the fonts sat in
   <component>/assets/fonts/, so the whole unit rendered in a fallback typeface and nothing
   noticed.

   Two rules specific to THIS unit:

   1. Depth. A component's styles.css is at <component>/styles.css and reaches the fonts as
      ../unit-assets/fonts/. The sub-app's style.css is one level deeper, at
      <component>/plane-mass-simulation/style.css, and needs ../../. CSS url() resolves from
      the STYLESHEET's directory, not the document's.

   2. Case. This unit spells the video directory three ways — assets/videos/ (01, 02, now
      hoisted), assets/video/ (05) and assets/Video/ (06). Each component is internally
      consistent, so production is fine, but Windows is case-insensitive and would hide a
      mismatch that 404s on the CDN. fs.existsSync is therefore NOT enough: every segment is
      checked against the real directory listing. */

/* Resolve `url` from `fromDir` and confirm every segment exists with EXACTLY that case.
   Returns '' when it resolves, or the segment that does not match. */
function resolveExact(fromDir, url) {
  const clean = url.split('?')[0].split('#')[0];
  let dir = fromDir;
  const segs = clean.split('/').filter(s => s !== '' && s !== '.');
  for (let i = 0; i < segs.length; i++) {
    if (segs[i] === '..') { dir = path.dirname(dir); continue; }
    let names;
    try { names = fs.readdirSync(dir); } catch (e) { return segs.slice(0, i + 1).join('/'); }
    if (!names.includes(segs[i])) return segs.slice(0, i + 1).join('/');
    dir = path.join(dir, segs[i]);
  }
  return '';
}

const ASSET_RE = /\.(png|jpe?g|gif|svg|mp4|webm|woff2?|ttf)$/i;

function checkAssetContract() {
  /* ── the shared roots ── */
  const ua = path.join(BASE, 'unit-assets');
  for (const [sub, n] of [['fonts', 2], ['img', 2], ['video', 8]]) {
    const d = path.join(ua, sub);
    const files = fs.existsSync(d) ? fs.readdirSync(d).filter(f => ASSET_RE.test(f)) : [];
    ok('assets', 'unit-assets/' + sub + ' holds ' + n + ' file(s)', files.length === n,
      files.length + ': ' + files.join(','));
  }

  /* ── no component may re-grow its own copy of the hoisted fonts ── */
  for (const c of COMPONENTS) {
    const f = path.join(BASE, 'methodica-science-mass-measure-02-' + c, 'assets', 'fonts');
    const faces = fs.existsSync(f)
      ? fs.readdirSync(f).filter(x => /^assistant-/i.test(x)) : [];
    ok('assets', c + ' has no local copy of the Assistant faces', faces.length === 0,
      faces.join(','));
  }

  /* ── every asset reference in every shipped html/js/css resolves, with exact case ── */
  const skipDirs = ['.git', '_test', 'docs-and-tools', 'metadata-from', 'node_modules'];
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!skipDirs.includes(e.name)) walk(p); }
      else if (/\.(html|js|css)$/.test(e.name) && e.name !== 'index_dev.html') files.push(p);
    }
  })(BASE);

  let refs = 0;
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    const found = new Set();
    for (const re of [/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, /(?:src|href)="([^"]+)"/g,
                      /'((?:\.\.\/)*(?:unit-)?assets\/[^']+)'/g]) {
      for (const m of txt.matchAll(re)) {
        const u = m[1].trim();
        if (/^data:|^https?:|^\/\/|^#/.test(u)) continue;
        if (!ASSET_RE.test(u.split('?')[0])) continue;
        found.add(u);
      }
    }
    for (const u of found) {
      refs++;
      const bad = resolveExact(path.dirname(f), u);
      ok('assets', path.relative(BASE, f).replace(/\\/g, '/') + ' -> ' + u,
        bad === '', bad ? 'no such path (exact case): ' + bad : '');
    }
  }
  /* A floor, not a target: this guards against the sweep silently matching nothing
     (a regex edit, a renamed folder) and reporting a clean run over zero references.
     Counted per (file, url) pair with duplicates within a file collapsed, so it is
     well below the raw number of occurrences. */
  ok('assets', 'the sweep actually found references', refs > 100, String(refs));

  /* ── the preload bases, which a blanket rewrite gets wrong in both directions ──
     03/05/06 preload ONLY the dancing GIFs, which are now at unit level. 01 preloads
     avatar-<color>.png and -workout.gif, which stayed in the component. The two lines
     look identical; swapping either is a silent 404 that costs a preload, not a render. */
  for (const c of ['03', '05', '06']) {
    const s = fs.readFileSync(path.join(BASE, 'methodica-science-mass-measure-02-' + c, 'script.js'), 'utf8');
    ok('assets', c + ' preloads the dancing GIF from unit-assets',
      /img\.src = '\.\.\/unit-assets\/img\/' \+ name;/.test(s));
  }
  const s01 = fs.readFileSync(path.join(BASE, 'methodica-science-mass-measure-02-01', 'script.js'), 'utf8');
  ok('assets', '01 still preloads its OWN images from assets/images/',
    /img\.src = 'assets\/images\/' \+ name;/.test(s01));

  /* ── the two font depths ── */
  for (const c of COMPONENTS) {
    const css = fs.readFileSync(path.join(BASE, 'methodica-science-mass-measure-02-' + c, 'styles.css'), 'utf8');
    const n = (css.match(/url\('\.\.\/unit-assets\/fonts\//g) || []).length;
    ok('assets', c + '/styles.css reaches the fonts with one ../', n === 2, String(n));
  }
  const sub = path.join(BASE, 'methodica-science-mass-measure-02-05', 'plane-mass-simulation', 'style.css');
  const subCss = fs.readFileSync(sub, 'utf8');
  ok('assets', 'the sub-app reaches the fonts with two ../ (it sits one level deeper)',
    (subCss.match(/url\('\.\.\/\.\.\/unit-assets\/fonts\//g) || []).length === 2);
}

/* ══════════════ The platform owns routing (2026-09-16) ══════════════
   Kata launches each component and routes on our `completed`. So, in production source:
   no hop between components outside an `if (DEV_NAV)` block, no unit-level statement,
   no resume hop in the loader, a gated goBackToPreviousPart, and a DEV_NAV that needs
   ?dev=1 AND the absence of ?registration. The behavioural half is statement-flow.js →
   probeDevNav(). Comments are stripped first: the history is allowed to name what went. */
function checkPlatformRouting() {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
  const files = ['unit-js/10-identity.js', 'unit-js/20-xapi.js', 'unit-js/40-resume.js',
                 'unit-js/50-loader.js', 'unit-js/90-boot.js']
    .concat(COMPONENTS.map(c => 'methodica-science-mass-measure-02-' + c + '/script.js'));
  for (const rel of files) {
    const src = strip(fs.readFileSync(path.join(BASE, rel), 'utf8'));
    ok('routing', rel + ': no unit-level statement',
      !/xapiCompleteUnit\s*\(|scope:\s*'unit'/.test(src));
    for (const m of src.matchAll(/location\.(href|replace)\s*[=(][^\n]*index\.html/g)) {
      const before = src.slice(Math.max(0, m.index - 500), m.index);
      ok('routing', rel + ': the hop at offset ' + m.index + ' sits inside if (DEV_NAV) { … }',
        /if\s*\(\s*DEV_NAV\s*\)\s*\{[^}]*$/.test(before), m[0].slice(0, 80));
    }
  }
  const id = fs.readFileSync(path.join(BASE, 'unit-js/10-identity.js'), 'utf8');
  ok('routing', 'DEV_NAV needs ?dev=1 AND no ?registration',
    /get\('dev'\)\s*===\s*'1'\s*&&\s*!_devQ\.has\('registration'\)/.test(id));
  const ld = strip(fs.readFileSync(path.join(BASE, 'unit-js/50-loader.js'), 'utf8'));
  ok('routing', '50-loader.js: the resume hop to _saved.part is gone',
    !/_saved\.part\s*!==\s*currentPartSlug\(\)/.test(ld) && !/location\.replace\(/.test(ld));
  const rs = strip(fs.readFileSync(path.join(BASE, 'unit-js/40-resume.js'), 'utf8'));
  ok('routing', '40-resume.js: goBackToPreviousPart returns unless DEV_NAV',
    /function goBackToPreviousPart[^{]*\{\s*if \(!DEV_NAV\) return;/.test(rs));
  const xa = strip(fs.readFileSync(path.join(BASE, 'unit-js/20-xapi.js'), 'utf8'));
  ok('routing', '20-xapi.js: xapiEndComponent reports then disables the button',
    /function xapiEndComponent\(result, btn\)[\s\S]{0,200}xapiCompleteComponent\(result\)[\s\S]{0,120}btn\.disabled = true/.test(xa));
  for (const c of COMPONENTS.filter(c => c !== '01')) {
    const html = fs.readFileSync(path.join(BASE, 'methodica-science-mass-measure-02-' + c, 'index.html'), 'utf8');
    ok('routing', c + ': the first-screen "חזרה" carries id="s0-back" so 90-boot.js can hide it',
      /id="s0-back"/.test(html));
  }
  const bt = strip(fs.readFileSync(path.join(BASE, 'unit-js/90-boot.js'), 'utf8'));
  ok('routing', '90-boot.js: hideCrossPartBack runs at boot and honours DEV_NAV',
    /function hideCrossPartBack\(\)\s*\{\s*if \(DEV_NAV\) return;/.test(bt) && /hideCrossPartBack\(\);/.test(bt));
}

/* ── One document per component (v5, 2026-09-16) ──────────────────────────
   Kata's registration is per {learner, component} and the platform may clear one
   component's document on a re-take. The document is therefore flat — `component` +
   `payload` — migrated from v4 in place, never applied when it names another component,
   and the character travels 01 → 02..06 through the same-browser mirror only.
   Groups: shape / isolation / retake / character. The store below is keyed by
   registration + state id, exactly as two Kata launches would be. */
async function checkPerComponentState() {
  const stores = {};
  const warns = [];
  const bootS = (c, query) => {
    const dir = path.join(BASE, 'methodica-science-mass-measure-02-' + c);
    const dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), {
      url: 'http://localhost:8777/methodica-science-mass-measure-02-' + c + '/index.html' + query,
      runScripts: 'dangerously', pretendToBeVisual: true,
    });
    const w = dom.window;
    const { exec, val } = makeRunner(w);
    w.console.error = w.console.log = function () {};
    w.console.warn = function (m) { warns.push(String(m)); };
    w.fetch = function () { return Promise.resolve({ ok: true }); };
    w.HTMLMediaElement.prototype.load = function () {};
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    w.HTMLMediaElement.prototype.pause = function () {};
    for (const src of [...w.document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))) {
      const p = path.resolve(dir, src.split('?')[0]);
      if (fs.existsSync(p)) { try { exec(fs.readFileSync(p, 'utf8')); } catch (e) {} }
    }
    const reg = new URL(w.location.href).searchParams.get('registration') || '';
    w.__key = (id) => reg + '::' + id;
    w.loadState720 = function (id) { const k = w.__key(id); return stores[k] ? JSON.parse(stores[k]) : null; };
    w.saveState720 = function (id, doc) { stores[w.__key(id)] = JSON.stringify(doc); return true; };
    w.saveState720Debounced = w.saveState720;
    w.__stmts = [];
    w.sendStatement720 = function (v, t, r, o) { w.__stmts.push({ v, t, r, o }); };
    const seed = (doc) => { stores[w.__key(w.RESUME_STATE_ID)] = JSON.stringify(doc); };
    const stored = () => { const s = stores[w.__key(w.RESUME_STATE_ID)]; return s ? JSON.parse(s) : null; };
    return { w, exec, val, seed, stored, slug: 'methodica-science-mass-measure-02-' + c, close: () => w.close() };
  };
  const q = (r, extra) => '?slxapi=1&registration=' + r + (extra || '');

  // ── shape ──
  let b = bootS('01', q('r1'));
  ok('shape', 'emptyUnitState() has exactly the v5 fields',
    b.val('Object.keys(emptyUnitState()).sort().join()') === 'component,done,doneItems,payload,results,ui,v',
    String(b.val('Object.keys(emptyUnitState()).sort().join()')));
  ok('shape', 'the version is 5', b.val('emptyUnitState().v') === 5, String(b.val('emptyUnitState().v')));
  ok('shape', 'a fresh document names this component',
    b.val('emptyUnitState().component') === b.slug, String(b.val('emptyUnitState().component')));
  ok('shape', 'RESUME_STATE_ID carries the component slug',
    b.val('RESUME_STATE_ID') === 'execution-state::' + b.slug, String(b.val('RESUME_STATE_ID')));
  b.seed({ v: 4, part: 'x', parts: { [b.slug]: { currentScreen: 3 }, other: { currentScreen: 9 } },
           prev: { a: 1 }, done: { a: true }, doneItems: { b: true }, ui: { character: 'green' }, results: { k: 'pass' } });
  b.exec('readUnitState();');
  ok('shape', 'v4 → v5 migration keeps this component\'s slot as payload',
    b.val('_unitState.v') === 5 && b.val('_unitState.component') === b.slug && b.val('_unitState.payload.currentScreen') === 3,
    String(b.val('JSON.stringify(_unitState)')));
  ok('shape', 'v4 → v5 migration keeps the ledgers, the character and the results',
    b.val('_unitState.done.a') === true && b.val('_unitState.doneItems.b') === true &&
    b.val('_unitState.ui.character') === 'green' && b.val('_unitState.results.k') === 'pass',
    String(b.val('JSON.stringify(_unitState)')));
  ok('shape', 'v4 → v5 migration drops part, prev and parts',
    b.val("'part' in _unitState") === false && b.val("'prev' in _unitState") === false && b.val("'parts' in _unitState") === false,
    String(b.val('Object.keys(_unitState).join()')));
  b.seed({ v: 4, part: 'x', parts: { other: { currentScreen: 9 } } });
  b.exec('readUnitState();');
  ok('shape', 'a v4 document with no slot for this component migrates to payload:null',
    b.val('_unitState.payload') === null && b.val('_unitState.v') === 5, String(b.val('JSON.stringify(_unitState)')));
  b.seed({ v: 2, parts: { [b.slug]: { currentScreen: 3 } } });
  b.exec('readUnitState();');
  ok('shape', 'any other version is discarded', b.val('_unitState.payload') === null && b.val('_unitState.v') === 5);
  warns.length = 0;
  b.seed({ v: 5, component: 'other-slug', payload: { currentScreen: 7 }, done: { z: true } });
  b.exec('readUnitState();');
  ok('shape', 'a document that names another component is discarded…',
    b.val('_unitState.payload') === null && b.val('_unitState.component') === b.slug && b.val('Object.keys(_unitState.done).length') === 0,
    String(b.val('JSON.stringify(_unitState)')));
  ok('shape', '…with a console.warn naming both components',
    warns.some(m => /\[resume\] document belongs to "other-slug", not "/.test(m)), JSON.stringify(warns));
  b.exec('_resumeReady = true; readUnitState(); goTo(2);');
  ok('shape', 'captureUnitState().payload is capturePartPayload()',
    b.val('JSON.stringify(captureUnitState().payload) === JSON.stringify(capturePartPayload())') === true);
  b.close();

  // ── isolation ──
  const A = bootS('01', q('r1')), B = bootS('03', q('r2'));
  A.exec('_resumeReady = true; readUnitState(); goTo(3); flushResumeSave(); markSent("done", currentPartSlug());');
  B.exec('readUnitState();');
  ok('isolation', 'component B under its own registration sees an empty document',
    B.val('_unitState.payload') === null && B.val('Object.keys(_unitState.done).length') === 0,
    String(B.val('JSON.stringify(_unitState)')));
  ok('isolation', 'component A\'s stored document never mentions component B',
    JSON.stringify(A.stored()).indexOf(B.slug) === -1 && A.stored().component === A.slug && A.stored().done[A.slug] === true,
    JSON.stringify(A.stored()));
  ok('isolation', 'only registrations that wrote have a document',
    Object.keys(stores).filter(k => k.indexOf('r2::') === 0).length === 0, Object.keys(stores).join());
  warns.length = 0;
  B.seed(A.stored());                         // A's document under B's registration: platform-side fault
  B.exec('readUnitState();');
  ok('isolation', 'another component\'s document under my registration is discarded, not applied',
    B.val('_unitState.payload') === null && warns.some(m => /document belongs to "/.test(m)), JSON.stringify(warns));
  A.close(); B.close();

  // ── retake: Kata cleared the document; the same-browser mirrors still hold the last attempt ──
  b = bootS('05', q('r5'));
  b.exec("localStorage.setItem('lomda_moedA_partA_result', 'pass'); localStorage.setItem('lomda_moedA_partB_result', 'pass');" +
         "localStorage.setItem('lomda_selectedCharacter', 'green'); window.lomdaState.selectedCharacter = null;");
  b.exec('readUnitState(); window.__changed = adoptUnitCharacter(_unitState);');
  ok('retake', 'an absent document makes every verdict null — the mirrors are not consulted',
    b.val("getUnitResult('lomda_moedA_partA_result')") === null && b.val("getUnitResult('lomda_moedA_partB_result')") === null);
  ok('retake', 'the moed-A gate is closed again', b.val('moedAFullyPassed()') === false);
  ok('retake', 'the ledger is empty again, so the re-take will report completed',
    b.val("alreadySent('done', currentPartSlug())") === false);
  b.exec("_resumeReady = true; sendCompletedOnce('done', currentPartSlug(), 'onlinelesson', null);");
  ok('retake', 'the re-take\'s completed goes out', b.w.__stmts.filter(s => s.v === 'completed').length === 1);
  ok('retake', 'nothing is restored', b.val('_unitState.payload === null || _unitState.payload.currentScreen === 0') === true);
  ok('retake', 'the character IS adopted from the mirror (decision 2026-09-16)',
    b.val('window.lomdaState.selectedCharacter') === 'green' && b.val('_unitState.ui.character') === 'green' && b.w.__changed === true);
  b.close();

  // ── character: four steps, both stores ──
  b = bootS('01', q('r1'));
  b.exec("_resumeReady = true; readUnitState(); setUnitCharacter('green');");
  ok('character', '01: the choice lands in the mirror AND in this component\'s document',
    b.val("localStorage.getItem('lomda_selectedCharacter')") === 'green' && b.val('_unitState.ui.character') === 'green' &&
    b.stored() && b.stored().ui.character === 'green', JSON.stringify(b.stored()));
  b.close();
  b = bootS('03', q('r3'));
  b.seed({ v: 5, component: b.slug, ui: { character: 'orange' } });
  b.exec("localStorage.setItem('lomda_selectedCharacter', 'green'); readUnitState(); adoptUnitCharacter(_unitState);");
  ok('character', '03 step 1: the document wins over the mirror, and the mirror follows',
    b.val('window.lomdaState.selectedCharacter') === 'orange' && b.val("localStorage.getItem('lomda_selectedCharacter')") === 'orange');
  b.close();
  b = bootS('03', q('r3b'));
  b.exec("localStorage.setItem('lomda_selectedCharacter', 'green'); window.lomdaState.selectedCharacter = null; readUnitState(); window.__changed = adoptUnitCharacter(_unitState);");
  ok('character', '03 steps 2+3: an empty document adopts the mirror into memory and into the document',
    b.val('window.lomdaState.selectedCharacter') === 'green' && b.val('_unitState.ui.character') === 'green' &&
    b.val('getUnitCharacter()') === 'green' && b.w.__changed === true);
  ok('character', '03 step 3: the mirror is NOT deleted (the old applyUnitProfile did)',
    b.val("localStorage.getItem('lomda_selectedCharacter')") === 'green');
  ok('character', '03 step 3: nothing is written before Phase B…', b.stored() === null);
  b.exec('_resumeReady = true; drainPendingUnitState();');
  ok('character', '…and Phase B persists the adopted character into this component\'s document',
    b.stored() && b.stored().ui.character === 'green' && b.stored().component === b.slug, JSON.stringify(b.stored()));
  b.close();
  b = bootS('03', q('r3c'));
  b.exec("readUnitState(); window.__changed = adoptUnitCharacter(_unitState);");
  ok('character', '03 step 4: no document, no mirror → null, default stays, nothing thrown',
    b.val('getUnitCharacter()') === null && b.val("localStorage.getItem('lomda_selectedCharacter')") === null);
  b.close();
  b = bootS('03', q('r3d', '&resetState'));
  ok('character', '?resetState: the hatch ran at boot and cleared the mirror',
    b.val('_resetRequested') === true && b.val("localStorage.getItem('lomda_selectedCharacter')") === null);
  b.exec("localStorage.setItem('lomda_selectedCharacter', 'green'); readUnitState(); adoptUnitCharacter(_unitState);");
  ok('character', '?resetState: a mirror that reappears is NOT adopted — a reset adopts nothing',
    b.val('getUnitCharacter()') === null && b.val('window.lomdaState.selectedCharacter') === null,
    'char=' + b.val('getUnitCharacter()'));
  b.close();
}

/* ── Source scan for the v5 shape ── */
function checkStateShapeSource() {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
  const files = ['unit-js/10-identity.js', 'unit-js/20-xapi.js', 'unit-js/40-resume.js',
                 'unit-js/50-loader.js', 'unit-js/90-boot.js']
    .concat(COMPONENTS.map(c => 'methodica-science-mass-measure-02-' + c + '/script.js'));
  for (const rel of files) {
    const src = strip(fs.readFileSync(path.join(BASE, rel), 'utf8'));
    ok('shape', rel + ': no landing pointer, no prev map, no parts map',
      !/\.prev\b/.test(src) && !/(?<!old)\.parts\[/.test(src) && !/\b(doc|_unitState|_saved|st)\.part\b/.test(src));
    ok('shape', rel + ': applyUnitProfile is gone', !/applyUnitProfile/.test(src));
  }
  const rs = strip(fs.readFileSync(path.join(BASE, 'unit-js/40-resume.js'), 'utf8'));
  ok('shape', '40-resume.js: RESUME_STATE_VERSION is 5', /var RESUME_STATE_VERSION = 5;/.test(rs));
  ok('shape', '40-resume.js: RESUME_STATE_ID is per component',
    /var RESUME_STATE_ID\s*=\s*'execution-state::' \+ currentPartSlug\(\);/.test(rs));
  ok('shape', '40-resume.js: readUnitState migrates, then refuses another component\'s document with a warning',
    /doc = migrateState\(doc\);[\s\S]{0,200}doc\.component !== currentPartSlug\(\)[\s\S]{0,200}console\.warn\(/.test(rs));
  const adopt = /function adoptUnitCharacter\(doc\)\s*\{[\s\S]*?\n\}/.exec(rs);
  ok('shape', '40-resume.js: adoptUnitCharacter never deletes the mirror',
    !!adopt && !/_lsDel/.test(adopt[0]) && /_lsGet\(UI_CHARACTER_KEY\)/.test(adopt[0]) && /_pendingProfile = \{ character: c \}/.test(adopt[0]));
  const ld = strip(fs.readFileSync(path.join(BASE, 'unit-js/50-loader.js'), 'utf8'));
  ok('shape', '50-loader.js: Phase A restores payload and adopts the character',
    /_payload = _saved\.payload;/.test(ld) && /adoptUnitCharacter\(_saved\)/.test(ld));
  const scripts = COMPONENTS.map(c => fs.readFileSync(path.join(BASE, 'methodica-science-mass-measure-02-' + c, 'script.js'), 'utf8')).join('\n');
  for (const k of ['lomda_moedA_partA_result', 'lomda_moedA_partB_result', 'lomda_moedB_partA_step1_result',
                   'lomda_moedB_partA_step2_result', 'lomda_moedB_partB_result']) {
    ok('shape', 'RESULT_KEYS entry ' + k + ' has a writer in some component', scripts.indexOf("'" + k + "'") !== -1);
  }
}

(async () => {
  checkMetadata();
  checkPlatformRouting();
  checkStateShapeSource();
  await checkPerComponentState();
  checkVersionQueries();
  checkAssetContract();
  checkSlugCase();
  checkLibraryLetter();
  checkCommitmentFlush();
  await checkStateDiagnostics();
  await checkItemClosesAfterResume();
  for (const c of COMPONENTS) await run(c);
  for (const [c, screen] of Object.entries(INBOUND_HASH)) await runHashLanding(c, screen);
  for (const c of COMPONENTS) await runResume(c);
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log('  ' + f)); }
  console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail ? 1 : 0);
})();
