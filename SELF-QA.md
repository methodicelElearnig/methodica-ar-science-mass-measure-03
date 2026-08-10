# SELF-QA — Figma-exact behavior/design spec for critical recurring elements

This file applies to all sub-projects in this directory (`methodica-science-mass-measure-03-01`
through `-06`, and any new Sain added later), the same scope as `CLAUDE.md`. Where `CLAUDE.md`
documents *bugs that happened and must not happen again*, this file documents *exact Figma values
for elements that must always match Figma pixel-for-pixel* — colors, borders, radii, icon assets,
and state-by-state behavior for four recurring template categories. **Figma is the source of
truth.** If a screen's CSS disagrees with the tables below, the CSS is wrong, not the table.

Figma file: `720 — UI Templates` (fileKey `eSbp4bKHgBky0rakDb8l9N`). Every value below was pulled
live via `get_design_context`/`download_assets` on the node IDs cited per section — none of it is
estimated from a screenshot or guessed from "looks about right."

Canonical icon assets (already extracted, copy into each project's own `assets/images/` — every
Sain keeps its own asset copies per the project's independence convention, never a shared folder):
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

| State | Border | Icon | Text color |
|---|---|---|---|
| Focus (typing) | **1.5px solid `var(--subject-500)`** | none | `#303030` |
| Correct | **1px solid `#609e12`** | 16×16 green check, right edge, `background-position: right 16px center` | `#303030` (**never recolored**) |
| Incorrect | **1px solid `#b20010`** | 16×16 red X, right edge, same position | `#303030` (**never recolored**) |

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

**Reference implementation:** `methodica-science-mass-measure-03-01`, screen `s15` (מסך 16,
"בחרו את המאזניים המתאימים") — `.s15-card`/`.s15-card-frame`/`.s15-card-badge` in `styles.css`.
⚠️ This screen uses project-specific class names, not a generic `scq-image-option`-style name — a
keyword/pattern search across the family will miss it (and would miss any other screen built the
same way in a different project). Verify visually screen-by-screen if you need certainty that no
other instance of this template exists somewhere under an unexpected class name.

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
| Correct (after check) | 1.5px solid `#609e12` | **white** (reverts from blue) | `#303030`, 24px (reverts) | 26×26 circle bg `#609e12`, at the pill's own physical right edge, 10px gap from text — not a corner overlay, white checkmark. ⚠️ Figma's own layer is authored LTR and calls this property `justify-content: flex-end`; in this codebase's `direction:rtl` pill, the CSS that actually produces the same right-anchored visual result is `justify-content: flex-start` (per CLAUDE.md rule #3) — implement for the visual outcome, not by copying the raw Figma property name. |
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

⚠️ **Confirmed family-wide bug, fixed 2026-08-02 across every project that has this template**
(Sain 1, 3, 5, 6): the shared `makeDragQuestion()` factory's `.dq-snt-drop.correct/.wrong
.dq-placed-card::after` rule used a **CSS `content: '✓'`/`content: '✕'` Unicode text glyph**
recolored via `color:`/`font-size`, with **no circle badge at all**, and separately recolored the
placed text itself (`.dq-placed-card { color: #3d6b0a / #7a000a }`) — Figma does neither. The fix:
replace the `::after` rule with a real circle (`border-radius:50%`, colored `background-color`,
a real white-glyph SVG as `background-image`) and delete the text-recolor rule entirely.

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
      filename.** A family-wide asset bug exists where `icon-check-white.png`/`icon-x-white.png`
      (present, byte-identical, in every project's `assets/images/`) are actually solid green/red
      despite the name — sample a pixel if in doubt. Using them as a badge glyph on a same-colored
      circle makes the icon nearly invisible.
- [ ] The placed pill's text color never changes on correct/incorrect (`#303030` throughout).
- [ ] Gap between the pill's text and the badge is **10px** (a 6px gap has recurred across multiple
      projects, including the "gold reference" implementation — check this explicitly, it's easy to
      leave at whatever the pre-badge value happened to be).
- [ ] **The badge must render on the physical right of the text, not the left.** `.dq-placed-card`
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
- [ ] Known open limitation (Sain 3): the "being dragged" pill's blue border cannot be forced onto
      the *native browser drag-image snapshot* via CSS alone — the snapshot is taken before any
      `.dragging` class lands. Fixing this properly needs `e.dataTransfer.setDragImage()` JS, out of
      scope for a CSS-only pass; note it if a producer specifically flags the drag-preview color.
- [ ] **A drop-zone/pill's width must never be matched to the image above it.** In a hand-written
      (non-factory) variant of this template, a too-tight zone (sized to fit text alone, before a
      badge existed) was widened to fit the longest label + badge + gap — the natural instinct was
      to widen the image above it to the same width for visual symmetry, but the image has a fixed
      `aspect-ratio`, so widening it also grows its height and can push content below a fixed-size
      canvas. Size the image and the drop-zone/pill independently; nothing requires a column's image
      and its zone to share a width.

---

## 4. DragAndDropQuestion — Image / "Classic"/"ImageOnly" layout (the draggable items themselves
are photos — Figma name `ImageOnlyDragAndDropQuestion`)
Figma nodes: `391:4247` (before interaction), `391:4388` (correct, isolated card), `395:4303`
(incorrect, isolated card). Mid-drag states (`391:4294`/`391:4341`) were not deep-inspected in this
pass — verify those two directly against Figma before shipping this template anywhere.

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
- [ ] No project in this family has built this template yet (as of 2026-08-02) — when one does,
      also verify the two un-inspected mid-drag states (`391:4294`, `391:4341`) directly against
      Figma, since they weren't captured in this pass.

---

## Change log

Everything below happened the same day (2026-08-02), as one long QA/fix session across categories
1, 2, and 3, run against this specific family's 6 existing sub-projects
(`methodica-science-mass-measure-03-01` through `-06`). Category 4 was never found built anywhere in
the family and so was never touched. This log is a brief summary of what each round found, kept here
so the reasoning behind the tables/checklists above isn't lost — it doesn't depend on any other file
to be useful. A companion document, `SELF-QA-gap-report-2026-08-02.md`, has the full narrative
detail (file:line references, before/after values, verification steps) for anyone working in *this*
family who wants to trace a specific fix back to its source; it isn't needed anywhere else and
doesn't need to travel with this file if this spec is reused in an unrelated project.

- **Round 1** — Initial Figma extraction + family-wide keyword-search QA pass across all 6
  sub-projects. Found and fixed: the DDQ text-fill Unicode-glyph/text-recolor bug (Sain 1, 3, 5, 6),
  the ValueInputQuestion border-width/hand-drawn-icon/text-recolor bug (Sain 1, 2), and the SCQ
  image-option card missing-badge/wrong-tint bug (Sain 1, screen `s15` — missed by the initial
  automated survey, found and fixed after the client pointed directly at the screen since it uses
  project-specific class names a keyword search couldn't match).
- **Round 2** — Client asked for a proper manual (non-keyword-search) re-audit of categories 1/3/4
  before any further fix, with explicit approval required first (see
  `SELF-QA-mapping-2026-08-02-pending-approval.md` for the full mapping). Found and fixed (after
  approval): ValueInputQuestion `text-align`/`padding` (Sain 1, 2); DDQ text-fill idle-pill border,
  drop-zone colors, missing dropped-unchecked text style, and badge/text gap in every project that
  has this template (Sain 1 `s11`/`s16`, Sain 3, Sain 5, Sain 6); the family-wide misnamed-white-icon
  asset bug where it was an active visible problem (Sain 5's badge); and Sain 1's hand-written `s17`
  variant, which needed a badge added from scratch plus zone/image-frame styling fixes.
- **Round 3** — Client live-tested the fixed screens and found real interaction bugs a static CSS
  read can't catch: (1) Sain 1's `viqCheck()` never added any class on the final wrong attempt, so
  no border/icon showed at all — a JS bug, not a CSS mismatch; (2) native browser number-input spin
  arrows were visible (not part of the Figma design) in both Sain 1 and 2; (3) the value text and the
  correct/incorrect icon visually overlapped for 2+ character values, since both were anchored to the
  same position with no reserved gap; (4) the DDQ badge rendered on the wrong (left) side of the text
  everywhere the template exists, because `justify-content` only positions the item *group* and never
  reorders items within it — the real fix was `order: -1` on the badge, which Round 2's
  `justify-content` change could never have achieved.
- **Round 4** — One more full live-verification pass, explicitly checking both the first *and*
  second wrong attempts and every DDQ screen's badge. Found one more gap (Sain 2's first wrong
  attempt had no icon, unlike its final attempt) and fixed it; confirmed everything else already
  matched Figma via real drag/fill/click interactions on every affected screen (not just reading
  code).
- **Round 5** — Client caught a sizing regression from Round 2's own `s17` badge fix: forcing the
  placed pill to `width: 100%` of a zone that was only ever sized for text (184px) meant the longest
  label overflowed once a 26px badge was added. First fix attempt (matching the zone width to the
  image above it) was itself wrong and reverted within the same pass — the image has a fixed aspect
  ratio, so widening it also grew its height and pushed content below the visible canvas. Actual fix:
  widen only the zone (to 260px, sized for the longest label + badge + gap) and leave the image at
  its original size, since a column's image and drop-zone never need to share a width.
- **Round 6** — Client immediately noticed the follow-on issue Round 5 left behind: the source-bank
  pill (before dragging) was still 180px wide while the target zone was now 260px — an obvious size
  mismatch. Fixed by widening the source pill's `min-width` to match the zone (260px), so both are
  always uniform. This is now a general checklist rule in category 3 above, not just an `s17` note.
