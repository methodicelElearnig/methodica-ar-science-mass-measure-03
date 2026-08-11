# SELF-QA — Figma-exact behavior/design spec for critical recurring elements

This file applies to every sub-project/scene in this lomda family that implements one of the
template categories below (and to any new scene added later). Where a project's `CLAUDE.md`
documents *bugs that happened and must not happen again* for that specific project, this file
documents *exact Figma values for elements that must always match Figma pixel-for-pixel* — colors,
borders, radii, icon assets, and state-by-state behavior for recurring template categories and
shared chrome elements. **Figma is the source of truth.** If a screen's CSS disagrees with the
tables below, the CSS is wrong, not the table.

Figma file: `720 — UI Templates` (fileKey `eSbp4bKHgBky0rakDb8l9N`). Every value below was pulled
live via `get_design_context`/`download_assets` on the node IDs cited per section — none of it is
estimated from a screenshot or guessed from "looks about right."

Canonical icon assets (already extracted, copy into each project's own `assets/images/` — every
sub-project keeps its own asset copies per the project's independence convention, never a shared
folder):
- Green standalone checkmark (16×16, fill `#609E12`) — used inline in `ValueInputQuestion` only.
- Red standalone X (16×16, fill `#B20010`) — used inline in `ValueInputQuestion` only.
- White checkmark glyph (16×11) — for use *inside* a colored circle badge (any size: 22px/26px/32px).
- White X glyph (16×16) — for use *inside* a colored circle badge.
(The white glyphs are one shape family reused at multiple badge sizes across the design system —
scale the SVG via the container's `width`/`height`, don't treat different badge sizes as different
icons.)

Shared tokens already correct across this family — reuse, never reinvent:
`--subject-500: #019de5` (focus/selected/dragging blue) · `--subject-700: #007ac6` ·
`--subject-100` fill `#d4f3ff` (selected/dropped background) · Feedback/Correct/300 `#609e12` ·
Feedback/Correct/100 `#edf8ed` · Feedback/Incorrect/300 `#b20010` · light-pink `#fff0f4` (DDQ-image
wrong-card background only) · body text `#303030` (Assistant).

---

## 1. ValueInputQuestion — inline fill-in-the-blank "answer box"
Figma nodes: `196:3401` (correct), `196:3409` (incorrect), `196:3393` (focus).

Base box: 180×42px, radius 10px, padding 0 16px, white background, Assistant Regular 24px,
color `#303030`, text-align right. **In Figma**, the icon sits at the box's own physical right edge
via a flex row (two children — a text box and an icon box — with `justify-content: flex-end` and a
10px gap between them). **This codebase implements it differently**, and correctly so: a single
`<input>` element can't have child elements, so the icon is a CSS `background-image` on the input
itself, with enough reserved `padding-right` to keep it clear of the text (see checklist below) —
don't try to force a real flex/gap layout here, and don't read the Figma description above as
literal implementation guidance.

| State | Border | Icon | Text color | Background |
|---|---|---|---|---|
| Focus (typing) | **1.5px solid `var(--subject-500)`** | none | `#303030` | white |
| Correct | **1px solid `#609e12`** | 16×16 green check, right edge, `background-position: right 16px center` | `#303030` (**never recolored**) | **white** |
| Incorrect | **1px solid `#b20010`** | 16×16 red X, right edge, same position | `#303030` (**never recolored**) | **white** |

⚠️ **White background, even though the box is locked/`disabled` at that point.** A common
`<input>` pattern is `input:disabled { background-color: #f5f5f5; }` (a generic "this field is
locked" gray) — Figma's own correct/incorrect answer box is `bg-white` in both outcomes, with no
gray anywhere. If a `:disabled` rule sets `background-color` and the `.correct`/`.wrong` classes
don't explicitly set it back to white, the disabled-gray silently wins (same or higher specificity,
later class rule with no competing property doesn't override it) and every locked answer box reads
as grayed-out instead of white-with-a-colored-border. This is a real, recurring bug, not a
hypothetical — check the actual computed background whenever this template ships.

**Self-QA checklist:**
- [ ] Border is exactly 1px on correct/incorrect (1.5px is the focus-state width only).
- [ ] Icon is the real downloaded SVG asset, not a hand-drawn/inline data-URI shape.
- [ ] Icon `background-position` is `right 16px center` (matches the box's own 16px padding — 10px is wrong).
- [ ] Text color never changes on correct/incorrect — only the border + icon change.
- [ ] **The value text and the icon must never overlap.** Since the icon is a `background-image` on
      the `<input>` itself (not a separate flex child, unlike Figma's own two-element AnswerBox),
      the correct/wrong/error states need `padding-right: 42px` (16 base + 16 icon + 10 gap) — not
      the base rule's plain 16px — or a 2+ character value paints directly under the icon.
- [ ] `<input type="number">` must have its native spin-button arrows suppressed
      (`::-webkit-outer/inner-spin-button { -webkit-appearance: none }` + `-moz-appearance:
      textfield`) — Figma's box has no such control, and browsers show one by default.
- [ ] Every state-transition code path (first-wrong, final-wrong, correct, and the reveal-toggle's
      two directions) must each explicitly add the class that produces its border/icon — check this
      in the JS, not just the CSS. A path that only sets `disabled`/shows feedback text without also
      adding `.correct`/`.error`/`.wrong` will silently render with no border or icon at all.
- [ ] **The icon must appear on the first wrong attempt too, not only the final one.** Figma's
      "Incorrect" node doesn't distinguish attempt number — a border-only first-attempt style (icon
      added only once the attempts are exhausted) is a real, recurring gap, not an intentional
      design choice.
- [ ] The correct/incorrect box stays **white**, not gray, even though it's `disabled`/locked at
      that point. If the project has a generic `input:disabled { background-color: #f5f5f5 }` rule
      (or similar), the `.correct`/`.wrong`/`.revealed` classes must explicitly set
      `background-color: #fff` to win over it — check this by reading the actual computed
      background, not just by confirming the border color is right.

---

## 2. SingleChoiceQuestion — Image Options ("SingleChoiceQuestion - ImageOptions" in Figma)
Figma nodes: `2134:26163` (default+selected), `2134:26170` (full correct-screen state),
`2134:26792` (selecting), `2134:26841` (correct-selected), `2134:26879` (incorrect-selected).

Square photo card with a caption (bold 32px title + regular 24px sub-line) below it.

| State | Border | Background | Radius | Badge |
|---|---|---|---|---|
| Default (unselected) | 3px solid `rgba(201,206,216,0.4)` | white | 16px | none |
| Selecting (clicked, not yet checked) | 3px solid `var(--subject-500)` | `var(--subject-100)` `#d4f3ff` | **24px** | none |
| Correct (after check) | 3px solid `#609e12` | white | 16px | 32×32 circle, bg `#609e12`, overlapping the top-right corner (`top:-16px`), white checkmark |
| Incorrect (after check) | 3px solid `#b20010` | white | 16px | 32×32 circle, bg `#b20010`, same corner (`top:-19px`), white X |

⚠️ This template is often implemented with project-specific/screen-specific class names rather than
a generic `scq-image-option`-style name — a keyword/pattern search across a project's screens can
miss an instance built this way. Verify visually screen-by-screen if you need certainty that no
instance of this template exists somewhere under an unexpected class name.

**Self-QA checklist:**
- [ ] Radius is **24px only** while "selecting" (pre-check) — every other state (default, correct, incorrect) uses 16px. A single hardcoded radius across all states is wrong.
- [ ] The correct/incorrect badge is a real circle (32×32, colored background + white glyph), overlapping the card's top-right corner — not a corner-clipped triangle, not a plain small icon with no circle.
- [ ] The badge element must live outside any ancestor with `overflow:hidden` (e.g. as a sibling of
      the bordered image frame, not a child of it) or it will be clipped where it's meant to poke
      out past the border.
- [ ] Selecting/correct/incorrect backgrounds are never a same-hue *tint* of the border color —
      selecting uses the `--subject-100` fill, correct/incorrect stay white. A tinted background on
      correct/incorrect (borrowed from a different template's convention) is wrong.

---

## 3. DragAndDropQuestion — Text-fill / "Image Top" layout (fixed images above targets,
draggable text pills below — Figma name `ImageTopDragAndDropQuestion`)
Figma nodes: `1444:37398` (before interaction), `1451:37198` (dragging), `1451:37257` (all
dropped/blue), `1460:38215` (correct pill), `1460:38261` (incorrect pill).

**Draggable text pill:**

| State | Border | Background | Text | Badge |
|---|---|---|---|---|
| Idle in word bank | 1.5px solid `#ececec` | white | `#303030`, 24px | none |
| Being dragged | 1.5px solid `var(--subject-500)` | white | `#303030`, 24px | none |
| Dropped, not yet checked | 1.5px solid `var(--subject-500)` | `var(--subject-100)` `#d4f3ff` | **`#222`, 22px** (differs from idle!) | none |
| Correct (after check) | 1.5px solid `#609e12` | **white** (reverts from blue) | `#303030`, 24px (reverts) | 26×26 circle bg `#609e12`, at the pill's own physical right edge, 10px gap from text — not a corner overlay, white checkmark. ⚠️ Figma's own layer is authored LTR and calls this property `justify-content: flex-end`; in an RTL pill the CSS that actually produces the same right-anchored visual result is `justify-content: flex-start` — implement for the visual outcome, not by copying the raw Figma property name. |
| Incorrect (after check) | 1.5px solid `#b20010` | white | `#303030`, 24px | 26×26 circle bg `#b20010`, same right-edge position, white X |

**Drop zone (empty target):**
| State | Background | Border |
|---|---|---|
| Default | `#f3f4f5` | 1px dashed `rgba(0,0,0,0.6)` |
| Hover (dragging over it) | white | 1px dashed `var(--subject-500)` |

**Image frame above each target:** square (1:1 aspect; actual px floats with column count/available
width — don't hardcode one instance's pixel value into a different-column-count screen), border
3px solid `rgba(201,206,216,0.4)`, radius 16px; inner photo centered, ~79% of frame width, radius
16px, `object-fit: cover`.

⚠️ **Recurring bug to check for explicitly:** a shared drag-question factory/helper's
`.correct/.wrong .placed-card::after` rule using a **CSS `content: '✓'`/`content: '✕'` Unicode text
glyph** recolored via `color:`/`font-size`, with **no circle badge at all** — and separately
recoloring the placed text itself (e.g. `color: #3d6b0a` / `#7a000a`) — Figma does neither. The fix:
replace the `::after` rule with a real circle (`border-radius:50%`, colored `background-color`,
a real white-glyph SVG as `background-image`) and delete any text-recolor rule entirely.

```css
.dq-snt-drop.correct .dq-placed-card::after {
  content: ''; display: inline-block; width: 26px; height: 26px; flex-shrink: 0;
  border-radius: 50%; background-color: #609e12;
  background-image: url('assets/images/<white-check-badge>.svg');
  background-repeat: no-repeat; background-position: center; background-size: 12px 9px;
}
/* mirror for .wrong with #b20010 + white-X, background-size ~12px 12px */
```

**Self-QA checklist:**
- [ ] The correct/incorrect badge is a real colored circle with a white glyph inside — never a
      bare colored Unicode character.
- [ ] **The glyph asset is actually white — verify by opening the file, not by trusting its
      filename.** A recurring asset bug is a `icon-check-white.png`/`icon-x-white.png` that is
      actually solid green/red despite the name — sample a pixel if in doubt. Using it as a badge
      glyph on a same-colored circle makes the icon nearly invisible.
- [ ] The placed pill's text color never changes on correct/incorrect (`#303030` throughout).
- [ ] Gap between the pill's text and the badge is **10px** (a 6px gap is a recurring drift — check
      this explicitly, it's easy to leave at whatever the pre-badge value happened to be).
- [ ] **The badge must render on the physical right of the text, not the left.** If `.dq-placed-card`
      is `direction: rtl` with a bare text node followed by a `::after` badge — in an RTL flex row,
      the *first* item in document order lands at the main-axis start (physical right), so the text
      claims the right edge and the badge (always last, via `::after`) lands to its *left* by
      default. `justify-content` does NOT fix this (it only positions the whole group, never
      reorders items within it) — the fix is `order: -1` on the `::after` rule, moving the badge
      before the text in flex order.
- [ ] **The draggable pill must be the same width in the word bank (before dragging) as it is once
      placed in a target.** Figma's own pill is a consistent width across every state — don't size
      the source-bank item to fit only its own text (e.g. a tight `min-width`) while the target zone
      is sized wider to fit the longest label + badge. Both the source item and the target zone
      should be sized together, to fit the *longest* label used on the screen plus the badge that
      appears after checking — otherwise the learner sees a visibly smaller item that's supposed to
      fill a visibly bigger slot, which reads as broken even though nothing is functionally wrong.
- [ ] Idle word-bank pill border is 1.5px `#ececec` (not the ValueInputQuestion-style
      `rgba(174,174,174,0.5)`).
- [ ] Drop-zone default background is `#f3f4f5` with a **dashed** border (not solid).
- [ ] Dropped-but-unchecked state uses 22px/`#222` text and `#d4f3ff` background — this is a
      transient look distinct from both idle and resolved states; don't collapse it into one of them.
- [ ] Known technical limitation: the "being dragged" pill's blue border cannot be forced onto the
      *native browser drag-image snapshot* via CSS alone — the snapshot is taken before any
      `.dragging` class lands. Fixing this properly needs `e.dataTransfer.setDragImage()` JS, out of
      scope for a CSS-only pass; note it if a producer specifically flags the drag-preview color.
- [ ] **A drop-zone/pill's width must never be matched to the image above it.** The natural instinct
      when a zone needs widening (to fit the longest label + badge + gap) is to widen the image above
      it too for visual symmetry — don't. The image has a fixed `aspect-ratio`, so widening it also
      grows its height and can push content below a fixed-size canvas. Size the image and the
      drop-zone/pill independently; nothing requires a column's image and its zone to share a width.

---

## 4. DragAndDropQuestion — Image / "Classic"/"ImageOnly" layout (the draggable items themselves
are photos — Figma name `ImageOnlyDragAndDropQuestion`)
Figma nodes: `391:4247` (before interaction), `391:4388` (correct, isolated card), `395:4303`
(incorrect, isolated card). Mid-drag states (`391:4294`/`391:4341`) have not been deep-inspected —
verify those two directly against Figma before shipping this template anywhere.

**Source draggable image card (idle):** 167×167px, border 3px solid `rgba(201,206,216,0.4)`,
radius 16px, white background.

**Empty target slot:** 167×167px, background `#f8f8f8`, border 1.5px dashed `#bdbdbd`, radius 10px.

**After check:**
| State | Card background | Border | Radius | Badge |
|---|---|---|---|---|
| Correct | white | 2px solid `#609e12` | **10px** (smaller than the 16px idle radius) | 22×22 circle bg `#609e12`, inset **inside** the card's own top-right corner (`right:4.5px; top:4.5px`), white checkmark |
| Incorrect | **`#fff0f4`** (light pink — not white) | 2px solid `#b20010` | 10px | 22×22 circle bg `#b20010`, same inset corner, white X |

**Self-QA checklist:**
- [ ] Correct-state radius is 10px, not the 16px used by the idle source card — this is a real
      Figma value, not a typo to "fix."
- [ ] Incorrect-state card background is the light-pink tint `#fff0f4`, not white.
- [ ] The correct/incorrect badge sits **mostly inside** the card's own corner (4.5px inset on both
      edges) — this is visually different from category 2's 32px badge, which floats detached
      *outside* the card. Don't reuse the same badge-position CSS for both templates.
- [ ] Before shipping this template on any screen, verify the two un-inspected mid-drag states
      (`391:4294`, `391:4341`) directly against Figma, since they weren't captured in this pass.

---

## 5. MixedAnswerQuestion — paired free-text input + dropdown (Figma name `MixedAnswerQuestion`)
Figma nodes: `1126:15739` (default, State01), `1126:16444` (input focus, State02), `1126:16592`
(input filled, State03), `1126:16739` (dropdown open, State04), `1126:16897` (dropdown selected /
input filled-blurred, State05), `1126:17063` (correct/incorrect feedback, State06). Also confirmed
against a second, standalone Figma component — `DropdownQuestion/Multiple Blanks` (`415:8332`
state02, `731:10387` state06) — which has no paired input at all, so **every rule below for the
dropdown applies to a lone fill-in-the-sentence dropdown just as much as to one paired with an
input**; this isn't a MixedAnswerQuestion-only quirk.

A sentence-fill (or table-cell) question with two independently-behaving controls sharing one
180×42px, radius-10px token — a free-text input (`question/textbox` → "answer box") and a custom
dropdown (`question/textbox` → "textbox"). Despite the shared token, the two controls diverge in
exactly one respect: how they look while the learner has not focused/opened them.

**Free-text input:**

| State | Border | Opacity |
|---|---|---|
| Idle (empty) | 1px `rgba(174,174,174,0.5)` | 1 (never dims) |
| Focus (typing) | 1.5px `var(--subject-500)` `#019de5` | 1 |
| **Filled, blurred (before check)** | **1.5px `#ececec`** | 1 |
| Correct (after check) | 1px `#609e12` + real green-check icon (see §1) | 1 |
| Incorrect (after check) | 1px `#b20010` + real red-X icon (see §1) | 1 |

The filled-blurred row is a **third, distinct resting state** — not the idle gray, not the focus
blue. Easy to miss because it only shows up once the learner types something and clicks/tabs away
*before* pressing check.

**Dropdown:**

| State | Border | Opacity |
|---|---|---|
| Idle (closed, empty) | 1px `rgba(174,174,174,0.5)` | **0.8** |
| Open (menu showing) | 1.5px `var(--subject-500)` `#019de5` — same blue token as input focus | **1** |
| Selected, closed (before check) | 1px `rgba(174,174,174,0.5)` — **unchanged from idle** | **0.8** |
| Correct (after check) | 1px `#609e12`, chevron replaced by real check icon | **0.8** |
| Incorrect (after check) | 1px `#b20010`, chevron replaced by real X icon | **0.8** |

⚠️ **The dropdown sits at 80% opacity in every state except while its menu is open** — including
the final correct/incorrect state. This is a consistent Figma signal across all 6 states, not a
one-off default. **The input is never dimmed, in any state.** Unlike the input, the dropdown does
not get a distinguishing border color once it has a value — only its opacity changes between
open/closed.

⚠️ **Correct/incorrect badge position — the input and the dropdown must render it on the *same*
physical side (right, adjacent to the value), and a naive port from one to the other silently
breaks this.** The input places its check/X via a `background-image` at the box's own physical
right edge — direction-agnostic, always correct. A hand-rolled dropdown, by contrast, typically
renders its value in a `<span>` with `flex: 1` (so the value fills the box while the menu is
closed-with-a-caret) inside a `direction: rtl` flex row, with the check/X badge added as a `::after`
pseudo-element (necessarily last in DOM order). That combination — RTL row + a flex-grow value span
that is *first* in DOM order + a badge that is *last* in DOM order — makes the value span swallow
all the free space and pushes the badge to the far *opposite* edge, detached from the text, on the
correct/incorrect state specifically (the closed-idle state looks fine, which is why this hides
until someone answers a question and looks at the result). The fix, same RTL/`::after`/`order`
technique as §3's badge fix: on the correct/incorrect/revealed classes only, drop the value span's
`flex: 1` down to `flex: 0 1 auto` and give the `::after` badge `order: -1` so it's placed before
the value in flex order — plus `justify-content: flex-start; gap: 10px` on the button itself. Don't
assume matching border/opacity/icon-asset means the layout is also right — check the actual physical
position of the badge relative to the text at all three outcomes (idle-with-value, correct,
incorrect), not just its color.

⚠️ **Known gap seen in prior implementations of this template:** the dropdown's closed-state caret
built as a hand-drawn CSS border-triangle instead of the real exported Figma "chevron" SVG asset —
inconsistent with the same control's correct/incorrect icons, which should be real SVG assets. Don't
fix this opportunistically as a drive-by while touching the states above; flag it and get explicit
approval first if it's found, since it's a visual-polish item, not a functional bug.

**Self-QA checklist:**
- [ ] Input has **three** distinct resting border states, not two: idle gray, focus blue, and
      filled-blurred `#ececec`. A filled-but-unfocused input that still shows the plain idle border
      is missing this third state.
- [ ] Dropdown trigger has `opacity: 0.8` by default and `opacity: 1` only while its option list is
      open — driven by the same state/attribute that controls the list's visibility (e.g.
      `[aria-expanded="true"]`), not a separate flag that can drift out of sync.
- [ ] Do not copy the dropdown's opacity rule onto the input, and do not invent a "has a selection"
      border color for the dropdown to mirror the input's filled-blurred state — the dropdown's own
      spec has no such border, only the opacity change.
- [ ] To detect "input has a value while blurred" in pure CSS, the `<input>` needs
      `placeholder=" "` (a single space) so `:not(:placeholder-shown)` works — don't reach for a JS
      state class unless the project already tracks that input's value in JS for another reason.
- [ ] The dropdown's correct/incorrect badge lands snug against the right edge of the *text*, not
      detached at the opposite end of the box. Verify this visually (or by reading the actual
      rendered DOM order + computed flex properties, not just the CSS source) — a value span with
      `flex: 1` inside a `direction: rtl` row plus a `::after` badge is the specific combination that
      breaks this silently; see the ⚠️ note above for the exact fix.

---

## 6. Bottom-bar navigation buttons — Check/"צדקתי?", Hint/"אפשר רמז?", Back/"חזרה"
Figma nodes: `1126:16900`–`1126:16903` (`FixedNavigationBar` instance showing all three together —
check enabled, hint disabled, back), `1126:15748` (check, disabled state, from `MixedAnswerQuestion`
State01), `731:10387` (hint, enabled state, `DropdownQuestion` State06 bottom bar). Shared mechanism
doc: node `2567:20391` ("nav label" — an invisible SemiBold "sizer" reserves the button's max width
so it never resizes between states; the *visible* label is always Assistant Regular, never Bold/
SemiBold).

All three buttons share: pill radius `1000px`, `Assistant` font at `20px`, `min-width: 140px`,
horizontal padding `20px` — and, critically, **every state of every button renders at the exact same
total height: 39px.** Figma achieves this with a different padding/content recipe per button (12px
padding + text for check/back; 7.5px padding + a 26×24 icon for hint-disabled), but the codebase
should not rely on that arithmetic landing correctly on its own — **set `height: 39px` explicitly**
on the shared base rule so every state inherits it with no drift, rather than trusting
padding+line-height math across browsers/fonts.

| Button | State | Height | Padding | Border | Background | Text color |
|---|---|---|---|---|---|---|
| Check ("צדקתי?" / Figma "continue") | Enabled | 39px | `0 20px` | none | 3-stop gradient, top→bottom: `#005FBE` 9%, `#0059B2` 23.361%, `#003971` 100% | white |
| Check | Disabled | **39px (same as enabled)** | `0 20px` | none | `#AEAEAE` | `#303030` |
| Hint ("אפשר רמז?") | Disabled (pre-attempt) | 39px | `0 20px` | 1px `#aeaeae` | white | `#aeaeae` (+ gray idea icon **26×24px** — wider than tall, `gap: 6px`) |
| Hint | Enabled (post-attempt) | 39px | `0 20px` | 1px `#007ac6` (**subject-700**) | white | `#007ac6` |
| Back ("חזרה") | Single state | 39px | `0 20px` | 1px `#007ac6` (**subject-700**) | white | `#007ac6` (no icon) |

⚠️ **subject-700 (`#007ac6`) vs subject-500 (`#019de5`)** — the hint button's enabled/only-shown
color is the single most commonly confused value in this family. `#019de5` is the *focus/dragging*
token used elsewhere (input focus border, dropdown open border); it does **not** belong on the hint
or back buttons, whose token is `#007ac6`.

**Reference CSS** (verified against Figma):

```css
.btn-continue {
  display: flex; align-items: center; justify-content: center;
  height: 39px;
  background: linear-gradient(180deg, #005FBE 9%, #0059B2 23.361%, #003971 100%);
  color: #ffffff; border: none; border-radius: 1000px;
  font-family: 'Assistant', sans-serif; font-size: 20px; font-weight: 400;
  padding: 0 20px; min-width: 140px; box-sizing: border-box;
  cursor: pointer; white-space: nowrap;
}
.btn-continue:disabled { background: #AEAEAE; color: #303030; cursor: not-allowed; }

.btn-hint {
  display: flex; align-items: center; justify-content: center;
  height: 39px;
  background: #ffffff; color: #007ac6; border: 1px solid #007ac6; border-radius: 1000px;
  font-family: 'Assistant', sans-serif; font-size: 20px; font-weight: 400;
  padding: 0 20px; min-width: 140px; box-sizing: border-box;
  cursor: pointer; gap: 6px; white-space: nowrap;
}
.btn-hint .scq-hint-icon { flex-shrink: 0; width: 26px; height: 24px; }
.btn-hint:disabled { color: #aeaeae; border-color: #aeaeae; cursor: not-allowed; }

.btn-back {
  display: flex; align-items: center; justify-content: center;
  height: 39px;
  background: #ffffff; color: #007ac6; border: 1px solid #007ac6; border-radius: 1000px;
  font-family: 'Assistant', sans-serif; font-size: 20px; font-weight: 400;
  padding: 0 20px; min-width: 140px; box-sizing: border-box;
  cursor: pointer; white-space: nowrap;
}
```

**A project's own explicit product decision can legitimately override the *timing* of hint
visibility without it being a bug** — e.g. a screen might show its hint button visible-and-enabled
from screen load instead of the family default "hidden until first wrong attempt." This is only
legitimate when documented with an explicit code comment citing the client/product request, right
above the `.btn-hint` rule. **Never infer such a deviation from the code alone; a visibility/timing
difference with no comment explaining it is a bug, not a feature.** Either way, the *color/size*
spec above still applies regardless of which visibility timing a screen uses.

**Self-QA checklist:**
- [ ] `height: 39px` is set explicitly on the shared base rule for all three button classes — not
      left to padding+line-height arithmetic, which drifts across button types/fonts and easily lands
      around ~45-51px instead of Figma's 39px if left implicit.
- [ ] `min-width: 140px`, not a fixed `width: 140px` — a fixed width silently clips a longer label.
- [ ] Check button's gradient has all **3** stops (`#005FBE 9%`, `#0059B2 23.361%`, `#003971 100%`)
      — a 2-stop simplification (dropping the middle `#0059B2` stop) is a recurring drift and is
      visually a flatter, slightly different blue than Figma's.
- [ ] Hint/back border-width is `1px`, not `1.5px`.
- [ ] Hint enabled color and back color are `#007ac6` (subject-700) — check specifically for
      `#019de5` (subject-500) on the hint button; this swap is a recurring mistake.
- [ ] Hint icon is `26×24px` (width×height — **wider than tall**, matching the real bulb glyph's
      aspect ratio). Getting width/height transposed (`24×26`) visibly squishes/stretches the icon —
      always sanity-check "is the icon wider or taller than it is X" against the Figma node directly,
      never trust a remembered number without re-deriving width vs height. `26×22` (the inner glyph's
      tighter bounding box, Figma height `22.288px`) is an acceptable rounding of the same shape and
      is not a bug — `24×26` is the actual bug.
- [ ] Hint font-size is `20px`, matching check/back — not `18px`.
- [ ] Before "fixing" a screen's hint-visibility timing to match the family default, check for a
      code comment documenting an explicit client request first (see note above).

---

## 7. Gesture Hints — animated scroll/click/drag cursor overlay (new Figma component, added by the designer)
Figma nodes: `2915:35184` ("Cursor Scroll"), `2915:35189` ("Cursor Click"), `2915:35185` ("Cursor Drag") —
all three live under the same `720 — UI Templates` file. Each is a small animated overlay: a static
hand-cursor icon with two concentric ripple rings pulsing outward behind it, on an infinite 2s loop.
**The hand cursor itself never moves or changes shape — only the two ripple rings animate.** This is
stated explicitly in each component's own Figma description ("Cursor stays static; Ripple Ring 1/2 +
Spark Dots carry the motion timeline") and confirmed by pulling the actual keyframe data — do not
build a sweeping/traveling hand animation for any of the three; that is not what the design shows.

⚠️ **Figma export trap, confirmed by opening the actual asset files, not by trusting names:** the
auto-generated code for every one of these three components labels its own color variants
`CurserClickScience`/`CurserDragScience` vs. `...Math`, but **the color values are swapped relative to
those labels** — the assets referenced inside the "…Science" function are actually the Purple/Math
colors, and the assets inside the "…Math" function are actually the Blue/Science ones. This project
uses Science (Blue). Always verify by opening the downloaded SVG and reading its literal `fill`/
`stroke` hex, never by trusting which function name the MCP export happened to wrap an asset in.

**Real exported assets (Science/Blue, verified by opening each file):**
- Hand cursor icon — 28×33px, black outline (`#202123`) + white fill glove shape. Identical across
  all three gesture types and both subject variants; only the ripple-ring colors change per subject.
- Click/Scroll big ripple ring — 64×64px circle, `fill:#B0DFFF`, `stroke:#00BAFF`, `stroke-width:2.5px`.
- Click/Scroll small ripple ring ("spark") — 12×12px circle, no fill, `stroke:#B0DFFF`, `stroke-width:1.5px`.
- Drag big ripple ring — 42×43px rounded-blob path (not a perfect circle), `fill:#B9ECFF`,
  `stroke:#00BAFF`, `stroke-width:2.5px` — this exact fill/stroke pair matches this project's own
  `--subject-300`/`--subject-400` tokens already, reuse them instead of hardcoding new hex values.
- Drag small ripple ring — 8×8px circle, no fill, `stroke:#B9ECFF`, `stroke-width:1.5px`.

**Verified keyframe timing (pulled live via `get_motion_context`, not estimated):** both the big ring
and the small ring loop on a shared 2000ms cycle, `animation-iteration-count: infinite`. The two rings
are NOT synchronized to the same portion of the cycle — the small ring finishes its whole pulse in the
first 10% of the loop, the big ring takes until the 50% mark, then both sit fully transparent for the
rest of the cycle before repeating:

```css
/* small ring ("spark") — 12×12 (scroll/click) or 8×8 (drag) */
@keyframes gesture-ring-small {
  0%   { opacity: 0;    scale: 0.2 0.2; }
  3%   { opacity: 0.75; scale: 1   1; }
  10%  { opacity: 0;    scale: 1.1 1.1; }
  100% { opacity: 0;    scale: 1.1 1.1; }
}
/* big ring — 64×64 (scroll/click) or 42×43 (drag) */
@keyframes gesture-ring-big {
  0%    { opacity: 0;    scale: 0.05 0.05; }
  5%    { opacity: 0.85; }
  7.5%  {                scale: 0.22 0.22; }
  22.5% {                scale: 0.6  0.6; }
  35%   { opacity: 0.65; }
  37.5% {                scale: 0.85 0.85; }
  45%   { opacity: 0.35; }
  50%   { opacity: 0;    scale: 1 1; }
  100%  { opacity: 0;    scale: 1 1; }
}
```
(Exact per-keyframe easing curves differ slightly — `cubic-bezier(0.2,0.4,0.4,1)` in, `ease-out` mid,
`cubic-bezier(0.6,0,1,1)` out for the big ring's opacity; `cubic-bezier(0.05,0.9,0.1,1)` in /
`cubic-bezier(0.4,0,1,1)` out for the small ring — reproduce these, don't flatten to a single `ease`.)

**Behavior — shared "Source of Truth" rules from the main "Gesture Hints" component doc (applies to
all three gesture types):**
- Use the approved gesture exactly as provided — do not modify its design, animation, timing, easing,
  duration, size, colors, or proportions.
- Show the gesture only once when a screen is first opened. Do not replay it if the learner returns to
  a screen they already completed.
- Show only one gesture at a time. If a screen needs multiple gestures, show them in the order the
  learner is expected to perform the actions.
- **Hide the gesture only when the learner begins performing the demonstrated action** — no other
  interaction (hovering, an unrelated click elsewhere, opening a hint popup, etc.) should hide it.
- Position the gesture relative to its target element/interaction area; reposition it if the layout
  changes; never resize it; keep the entire animation visible (don't let it clip off-canvas).
- Stay above the rest of the interface, never cover essential content, never move/displace other
  interface elements, and **must never block interaction** — `pointer-events: none` on the overlay,
  always.

**Per-gesture "Use when / Hide when / Target" (verbatim from each component's own Figma description):**

| Gesture | Use when | Hide when | Target |
|---|---|---|---|
| Cursor Scroll | The screen contains scrollable content, including scrollable feedback areas. | The user performs a real scroll. | Position over the relevant scroll area. |
| Cursor Click | The required interaction is not visually obvious (e.g. flip cards, or objects that reveal content when clicked). **Do not use for standard buttons** (Play/Continue/צדקתי?/etc). If the interaction requires dragging, use Cursor Drag instead. | The user clicks the correct interactive element. | Position over the interactive element. |
| Cursor Drag | The learner must drag one or more elements. Show only for the first draggable element (not one hint per pill). | The user starts dragging the correct element. | Position over the first draggable element. |

**Explicit product-level rule for this project (overrides the component's own default "once per
lomda" framing for Cursor Drag above — confirmed with the client):** the gesture must appear on
**every screen** that contains scroll/click/drag, not only the very first screen in the whole unit
where that interaction type happens to occur. "Once" in the Display rule means once per *screen*
(don't replay on a completed-screen revisit), not once per *lomda*.

**Cursor shape (separate from the animated hint, applies whenever the relevant interaction is
possible on a screen, regardless of whether the animated hint is currently showing):**
- `cursor: grab` on any element being hovered that is draggable (word-bank pills, draggable image
  cards) — not the default arrow, not `pointer`.
- `cursor: pointer` on flip-card faces (or any click-to-reveal element covered by Cursor Click).
- The scrollable container itself should show a hand-shaped cursor on hover — the client's own
  wording is "the mouse should be in the shape of a hand" for scrollable areas; implement as
  `cursor: grab` on the scrollable element (matching the same hand-shape family used for drag,
  since a plain `pointer`/arrow is explicitly called out as wrong here).

**Self-QA checklist:**
- [ ] The hand-cursor icon never moves, rotates, or changes during the animation — only the two rings
      pulse. A "sweeping"/"traveling" hand implementation is not what this component is.
- [ ] Ripple ring colors are pulled from the actually-blue asset file, verified by opening it — not
      copied from whichever function name in an MCP/AI export happened to say "Science."
- [ ] The gesture is removed from the DOM/hidden the instant the learner starts the correct action —
      not on any other click/hover/scroll, and not delayed until the 2s loop finishes its current cycle.
- [ ] The gesture replays every time its screen is freshly entered (first time, per screen) but never
      replays on a return visit to a screen already marked done — same resume-state guard pattern
      already used for question state elsewhere in this codebase.
- [ ] The overlay element has `pointer-events: none` and is positioned `absolute`/`fixed` relative to
      its target, never inline in a way that could push other layout.
- [ ] Cursor Click is never applied to a standard nav button (Play/Continue/הבא/צדקתי?) — only to
      click-to-reveal interactions like flip cards.
- [ ] Draggable elements and scrollable containers show a hand-shaped (`grab`) cursor on hover, not
      the browser default arrow or a plain `pointer`.

---

## Common implementation pitfalls (seen repeatedly across prior projects — check for these explicitly)

These are generalized lessons distilled from repeated QA passes on this template family, kept here
because each one has recurred more than once across independent implementations. They are not
project-specific history — treat every one as a live risk on any new screen that uses the
corresponding template, not just a note about something that "used to be wrong somewhere else."

- A CSS `content: '✓'`/`'✕'` Unicode glyph standing in for a real circular badge (§3, §5) — always
  a real colored circle + white SVG glyph, never a recolored text character.
- Recoloring the answer/placed text itself on correct/incorrect, instead of leaving text color fixed
  and only changing the border + icon (§1, §3).
- An icon/badge missing on the *first* wrong attempt, appearing only once attempts are exhausted
  (§1) — Figma's "incorrect" state doesn't distinguish attempt number.
- Native `<input type="number">` spin arrows left visible (§1) — not part of any Figma control.
- Text/value and icon overlapping because no `padding-right` was reserved for the icon (§1, §5).
- A badge landing on the wrong physical side of the text in an RTL flex row with a `::after` badge
  (§3, §5) — `justify-content` alone never fixes this; the fix is `order: -1` on the badge.
- A "white" icon asset that is actually solid-colored despite its filename (§3) — verify by sampling
  a pixel, not by trusting the name.
- Mismatched widths between a draggable item's word-bank state and its dropped-target state (§3), or
  widening an image to match a zone's width and breaking its `aspect-ratio` in the process (§3) — size
  the pill/zone and the image independently.
- A generic `:disabled` gray background silently winning over a `.correct`/`.wrong` class that never
  explicitly resets `background-color` back to white (§1).
- A dropdown missing a distinct open-state border/opacity change, so opening it gives no visual
  "focused" feedback (§5).
- Button height left to padding+line-height arithmetic instead of an explicit `height: 39px` (§6);
  fixed `width` instead of `min-width` on nav buttons (§6); a gradient losing its middle color stop
  (§6); `subject-500` used where `subject-700` belongs, or vice versa (§6); an icon's width/height
  transposed relative to the real Figma node (§6) — always re-derive dimensions from the actual node
  data at the moment of writing, don't rely on a remembered "W×H."
- Trusting an MCP/AI-generated export's own variable/function naming ("…Science" vs "…Math") to
  identify which color variant is which (§7) — confirmed backwards in practice: the function labeled
  "Science" contained the Purple/Math asset URLs and vice versa. Always open the actual downloaded
  SVG and read its literal `fill`/`stroke` hex against the known subject token, never trust the name
  a code-export tool assigned to a wrapper function.
- An overlay element (e.g. a Gesture Hint, §7) appended directly to `#app` — rather than nested
  inside its own `.screen` — so it can freely position itself over a target anywhere on the active
  screen. This means the normal "screen becomes `display:none`, so its children disappear" cleanup
  does **not** apply to it: if the learner navigates away before triggering the element's own
  dismissal condition, it is left orphaned on `#app` and bleeds visually into every subsequent
  screen. Any such overlay must be explicitly swept in the shared screen-transition function (here,
  `closeAllPopupsAndHints()`, called at the top of every `goTo()`) — don't rely on the element's own
  hide-on-correct-action logic as the only removal path.
- Copy-pasting a dynamic-render function's state machine between two near-identical screens (e.g.
  `dqx19Render()` → `dqx27Render()`) can silently drop a property assignment that the original relied
  on but the copy never needed *until* something new (like a Gesture Hint target lookup) started
  depending on it — found in practice: `dqx27Render()`'s draggable card never got `card.id = dragId`
  (unlike `dqx19Render()`), so `document.getElementById(dragId)` returned `null` with no error, and a
  hint silently never appeared. When porting a render function, diff it line-by-line against its
  sibling rather than assuming "it already works the same way."
