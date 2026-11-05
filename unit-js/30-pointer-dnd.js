/* 30-pointer-dnd.js — pointer-based drag-and-drop (mouse + touch), shared by every part.

   Why: native HTML5 drag (`draggable` / dragstart / drop) never fires from touch input on
   Android Chrome or in DevTools touch emulation, and only via long-press on iPad Safari.
   MOE tester report, 03.11.26: "שאלות גרירה לא עובדות בטאבלט" (filmed on 02 / item 004).
   Origin: createPointerDnd() in methodica-science-mass-measure-01-01/js/main.js, the variant
   with tap detection from methodica-math-scale-01-04/script.js (DDQ_TAP_SLOP + onTap), plus:
     - pointercancel never drops (an OS gesture or incoming call cancels, it does not place);
     - opts.onGhost(ghost, src) lets the screen normalise the clone before it is shown.

   Load order (same ?v= in every part, 90-boot last): 10-identity, 20-xapi, 25-report,
   30-pointer-dnd, 40-resume, 50-loader, script.js, 90-boot. Definition-only: no IIFE, no
   top-level call (_test/verify-report.js enforces it); no identifier may be redeclared by a
   part's script.js.

   Usage (per screen, once):
     const dnd = createPointerDnd({
       canDrag:  function (dragId, elem) { return true; },   // false = press ignored
       onPick:   function (dragId, elem) {},                  // the press became a drag
       onGhost:  function (ghost, elem) {},                   // before the clone is appended
       onTap:    function (dragId, elem) {},                  // press + release, < DDQ_TAP_SLOP px
       onDrop:   function (dragId, targetId) {},              // released over an attached target
       onCancel: function (dragId) {}                         // released elsewhere / cancelled
     });
     dnd.attachSource(cardEl, 'card-1');   // idempotent; sets touch-action:none on the element
     dnd.attachTarget(zoneEl, 'zone-a');   // the hovered target gets .drag-over

   The ghost is a cloneNode(true) of the source, appended to document.body (outside #app) in
   viewport-fixed coordinates and scaled to the #app transform, with class .pointer-drag-ghost
   and no ids; the source gets .dragging while the ghost exists. Because the clone sits outside
   #app, every visual rule of the card must be class-scoped (not under a screen id selector).

   Known limitation: no setPointerCapture — a mouse released outside the window leaves the
   ghost until the next pointerup. */
var DDQ_TAP_SLOP = 6;   /* px of movement before a press becomes a drag */

function createPointerDnd(opts) {
  var targets = [];   /* [{ elem, id }] */
  var active  = null;

  function getAppScale() {
    var app = document.getElementById('app');
    var m = app && app.style.transform.match(/scale\(([^)]+)\)/);
    return m ? parseFloat(m[1]) : 1;
  }

  function attachSource(elem, dragId) {
    if (!elem) return;
    elem.dataset.pdragId = dragId;
    if (elem.dataset.pdragAttached === '1') return;
    elem.dataset.pdragAttached = '1';
    elem.style.touchAction = 'none';
    elem.addEventListener('pointerdown', onSourceDown);
  }

  function attachTarget(elem, targetId) {
    if (elem) targets.push({ elem: elem, id: targetId });
  }

  function onSourceDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var src    = e.currentTarget;
    var dragId = src.dataset.pdragId;
    if (!dragId || active) return;
    if (opts.canDrag && !opts.canDrag(dragId, src)) return;
    e.preventDefault();
    var rect = src.getBoundingClientRect();
    active = {
      dragId: dragId, srcElem: src, ghost: null, pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY, rect: rect,
      offX: e.clientX - rect.left, offY: e.clientY - rect.top,
      currentTarget: null
    };
    document.addEventListener('pointermove',   onMove, { passive: false });
    document.addEventListener('pointerup',     onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function startGhost() {
    var src   = active.srcElem;
    var rect  = active.rect;
    var scale = getAppScale();
    var ghost = src.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach(function(n) { n.removeAttribute('id'); });
    ghost.removeAttribute('tabindex');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.classList.remove('dragging', 'ghost', 'locked');
    ghost.classList.add('pointer-drag-ghost');
    ghost.style.position        = 'fixed';
    ghost.style.left            = rect.left + 'px';
    ghost.style.top             = rect.top  + 'px';
    ghost.style.width           = (rect.width  / scale) + 'px';
    ghost.style.height          = (rect.height / scale) + 'px';
    ghost.style.boxSizing       = 'border-box';
    ghost.style.margin          = '0';
    ghost.style.pointerEvents   = 'none';
    ghost.style.zIndex          = '9999';
    ghost.style.transform       = 'scale(' + scale + ')';
    ghost.style.transformOrigin = 'top left';
    if (opts.onGhost) opts.onGhost(ghost, src);
    document.body.appendChild(ghost);
    active.ghost = ghost;
    src.classList.add('dragging');
    if (opts.onPick) opts.onPick(active.dragId, src);
  }

  function findTargetUnder(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return null;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].elem === el || targets[i].elem.contains(el)) return targets[i];
    }
    return null;
  }

  function onMove(e) {
    if (!active || e.pointerId !== active.pointerId) return;
    e.preventDefault();
    if (!active.ghost) {
      if (Math.abs(e.clientX - active.startX) < DDQ_TAP_SLOP &&
          Math.abs(e.clientY - active.startY) < DDQ_TAP_SLOP) return;
      startGhost();
    }
    active.ghost.style.left = (e.clientX - active.offX) + 'px';
    active.ghost.style.top  = (e.clientY - active.offY) + 'px';
    var hit   = findTargetUnder(e.clientX, e.clientY);
    var hitId = hit ? hit.id : null;
    if (active.currentTarget !== hitId) {
      targets.forEach(function(t) { t.elem.classList.toggle('drag-over', t.id === hitId); });
      active.currentTarget = hitId;
    }
  }

  function onUp(e) {
    if (!active || (e && e.pointerId !== active.pointerId)) return;
    document.removeEventListener('pointermove',   onMove);
    document.removeEventListener('pointerup',     onUp);
    document.removeEventListener('pointercancel', onUp);
    var a = active;
    active = null;
    targets.forEach(function(t) { t.elem.classList.remove('drag-over'); });
    if (!a.ghost) {   /* no movement - a tap (pointercancel is not a tap) */
      if (e.type === 'pointerup' && opts.onTap) opts.onTap(a.dragId, a.srcElem);
      return;
    }
    a.srcElem.classList.remove('dragging');
    a.ghost.remove();
    var dropped = e.type === 'pointerup' && a.currentTarget;   /* pointercancel never drops */
    if (dropped && opts.onDrop) opts.onDrop(a.dragId, a.currentTarget);
    else if (opts.onCancel)     opts.onCancel(a.dragId);
  }

  return { attachSource: attachSource, attachTarget: attachTarget };
}
