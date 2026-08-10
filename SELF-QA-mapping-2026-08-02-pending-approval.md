# Manual mapping pass — ValueInputQuestion / DDQ text-fill / DDQ image-drag

**Status: APPROVED AND APPLIED (2026-08-02).** Every finding below was produced by a read-only agent
per project (reading `ARCHITECTURE.md`/`PROJECT_BRIEF.md` in full, then every screen's own comment
header in `index.html`, classifying by behavior rather than by CSS class name), and several of the
most surprising claims were independently re-verified by hand afterward (see "Independently
verified" notes). This replaces the class-name-keyword-search method used in the first pass, which
is what missed Sain 1's `s15` SCQ-image-options screen.

**All fixes listed below have since been applied and independently re-verified** — CSS brace
balance and `script.js` parse-check on every touched project, plus a live headless-browser render
of Sain 1's `s17` (the most invasive change, since it added a badge to a screen that had none) in
both its correct and incorrect states, confirming no overflow/clipping/reflow. See
`SELF-QA-gap-report-2026-08-02.md`'s final section for the applied-fixes summary. This file is kept
as the historical record of what was found and why; treat `SELF-QA.md` as the current live spec.

## Where each template actually appears

| Project | Cat.1 ValueInputQuestion | Cat.3 DDQ text-fill | Cat.4 DDQ image-drag |
|---|---|---|---|
| Sain 1 | `s5`, `s6` | `s11`, `s16` (factory), `s17` (hand-written) | none |
| Sain 2 | `s7` | none | none |
| Sain 3 | none | `s2` | none |
| Sain 4 | none | none | none |
| Sain 5 | none | `s4` | none |
| Sain 6 | none | `s6c` | none |

Category 4 (DDQ image-drag) genuinely does not exist anywhere in the family yet — confirmed across
all 6 projects independently. Category 1 exists in 2 projects, category 3 in 4 projects (6 screens
total, since Sain 1 has 3).

---

## Category 1 — ValueInputQuestion — 2 screens (Sain 1: `s5`,`s6`; Sain 2: `s7`)

The prior fix pass (2026-08-02, first round) corrected border-width/icon-authenticity/text-recolor
everywhere this template exists. This new pass found **two properties that pass's own checklist
never tested**, present identically in both projects (shared `.viq-input` CSS block):

| Property | Current | Figma | Sain 1 (`styles.css`) | Sain 2 (`styles.css`) |
|---|---|---|---|---|
| `text-align` | `center` | `right` | :1254 | (same rule, shared block) |
| `padding` | `0 8px` | `0 16px` | :1255 | :874 |

**Why:** Sain 1's own comment (`styles.css:1275-1279`) says this box's dimensions were modeled on
`.dq-snt-drop` (a drag-and-drop word-slot styled for a short, centered label inside a sentence) —
not on the actual ValueInputQuestion Figma node. Sain 2 copied Sain 1's version verbatim. So this is
one shared root cause, not two separate mistakes.

**Independently verified:** yes — read `styles.css:1244-1279` (Sain 1) and `:863-877` (Sain 2)
myself; both confirmed.

---

## Category 3 — DragAndDropQuestion text-fill — 6 screens across 4 projects

### 3a. Already-fixed and holding up correctly
`Sain 3` (`s2`) is the one screen in the whole family that already matches Figma almost perfectly —
it received the most thorough fix in the first round. `Sain 6` (`s6c`)'s badge-shape/text-recolor
fix from round 1 is also confirmed still intact. **Sain 3's CSS block is the cleanest real-world
reference for what "correct" looks like** — more useful to copy from than re-deriving each value
from the Figma spec text again.

### 3b. New mismatches found (not covered by round 1's narrower fix)

Round 1 only fixed the "Unicode-glyph-instead-of-circle-badge" bug and the "text gets recolored"
bug. This pass found that almost every *other* property on the same components was never checked
against Figma at all. Shown against Sain 3's now-correct values as ground truth, cross-checked
against SELF-QA.md:

| # | Property | Figma / Sain-3-correct value | Sain 1 (`s11`/`s16`) | Sain 1 (`s17`, hand-written) | Sain 5 (`s4`) | Sain 6 (`s6c`) |
|---|---|---|---|---|---|---|
| 1 | Idle word-bank pill border | `1.5px solid #ececec` | ❌ `1px rgba(174,174,174,.5)` | n/a (own markup) | ❌ same wrong value | ❌ same wrong value |
| 2 | Empty drop-zone bg/border | `#f3f4f5` / `1px dashed rgba(0,0,0,.6)` | ❌ `#fff` / `1px solid rgba(174,174,174,.5)` | ❌ `#f8f8f8` / `2px dashed rgba(174,174,174,.7)` | ❌ `#fff` / solid gray | ❌ `#fff` / solid gray |
| 3 | Drop-zone hover | `#fff` / `1px dashed var(--subject-500)` | ❌ `#eaf6ff` / `1.5px solid` (solid, tinted) | ❌ `#eaf6ff` / solid | ❌ same | ❌ same |
| 4 | Dropped-not-checked bg | `#d4f3ff` | ❌ `#f3f4f5` (identical to empty-zone bg — states not differentiated at all) | n/a | ❌ same collapse | ❌ same |
| 5 | Dropped-not-checked text | `22px` / `#222` (transient look) | ❌ missing entirely (always 24px/#303030) | n/a | ❌ missing | ❌ missing |
| 6 | Badge/text gap | `10px` | ❌ not checked by round-1 agent, but confirmed present: `gap: 6px` | n/a | not reported | not reported (likely same, unverified) |
| 7 | Placed-pill `justify-content` | `flex-start` (per CLAUDE.md rule #3 — canonical, not Figma's raw LTR wording) | ✅ already `flex-start` | n/a | ❌ `center` | ❌ `center` |
| 8 | Placed-pill padding | `0 8px` | ✅ (not flagged as wrong) | n/a | ❌ `0 6px` | not reported |
| 9 | Badge glyph size (wrong/X) | `~12px 12px` | ✅ | n/a | ❌ `10px 10px` | not reported |
| 10 | **Badge glyph color** | must be **white**, sitting on a colored circle | ✅ (uses real white SVGs, `icon-badge-correct-white.svg` etc.) | n/a | **❌ uses `icon-check-white.png`/`icon-x-white.png` — these files are actually solid green/red despite the filename (verified: sampled pixel colors are `#6aa421`≈`#609e12` and `#b20010`), making the glyph nearly invisible against the same-colored circle** | not reported (worth checking) |
| 11 | Image-frame border/radius (Sain1 `s17` only) | `3px solid rgba(201,206,216,.4)`, radius 16px, inset photo ~79% | — | n/a | **missing entirely** — frame has no border at all, radius 14px not 16px, photo fills 100% not inset | — |
| 12 | Correct/incorrect badge at all (Sain1 `s17` only) | 26×26 circle | — | n/a | **completely absent** — known limitation already logged in SELF-QA.md, confirmed still present | — |

**Independently verified by me directly (not just taken on the reporting agents' word):**
- `gap: 6px` in Sain 1's `.dq-placed-card` (`styles.css:1444`) — confirmed.
- `.dq-snt-drop` default/hover/occupied wrong colors in Sain 1 (`styles.css:1429-1436`) vs. Sain 3's
  correct version (`styles.css:531-538`) — confirmed, side by side.
- **The misnamed icon files are a family-wide asset bug**, not unique to Sain 5: `icon-check-white.png`
  is the *identical* colored (green) PNG in **all 6 projects'** `assets/images/` folders (byte-identical
  pixel sampling). It is genuinely mislabeled everywhere. Whether it's a *visible* bug depends on
  where it's used: as a badge glyph on a same-colored circle (Sain 5's DDQ badge, this project's own
  `.scq-opt.correct .scq-radio::after`) it is a real, visible problem (near-invisible glyph); if used
  elsewhere against a neutral/white background it may look fine despite the wrong filename. This
  pass did not audit every other place this file is referenced across the family — flagging that as
  a separate, broader follow-up if wanted (outside the 3 categories in scope here).

**Why these likely happened:** per each project's own comment headers, Sain 1's `s11`/`s16` and
Sain 5's `s4` were both documented as copied "verbatim" from an earlier source (Sain 5's own comment
literally cites Sain 3 as the source) — but the CSS actually shipped doesn't match Sain 3's current
(corrected) values. The most likely explanation: the copy was made from an *earlier* revision of
Sain 3, before that project's own values were corrected, or from a different sibling project
(Sain 1's not-yet-fixed version) rather than the one the comment credits. Sain 1's `s17` is a
separate, hand-written implementation (explicitly not using the shared factory) that was modeled on
a different, non-interactive photo-display card's border/radius convention from elsewhere in that
same project, which is why it's missing the border/badge treatment entirely rather than just having
wrong values.

---

## Category 4 — DDQ image-drag — no instances anywhere

Confirmed independently by all 6 project agents (behavioral read, not just keyword grep) — genuinely
not built yet anywhere in the family. Nothing to compare.

---

## Two items surfaced that are NOT part of this task, flagged for awareness only

1. **Pre-existing, unrelated cosmetic bug** in Sain 1's `s15` (SCQ image-options, fixed last round):
   a hover-CSS-specificity issue can make the border flash blue instead of red/green if the pointer
   lingers on the card — already reported, not fixed, not part of this pass either.
2. **Doc/code drift** in Sain 2: `ARCHITECTURE.md`/`PROJECT_BRIEF.md` describe screen `s8` as a
   TrueFalseQuestion, but the shipped code is an ordinary 4-option SCQ (the screen's own in-code
   comment already acknowledges the change) — harmless, but the two markdown docs are stale on this
   one point. Also ~14 unused `.tf-*` CSS rules remain from before that conversion.

---

## What happens next

Nothing has been changed. If you approve, the fix pass would:
- Apply the `text-align`/`padding` correction to `.viq-input` in Sain 1 and Sain 2 (one shared fix).
- Bring every DDQ text-fill screen's idle-pill border, drop-zone colors, dropped-unchecked text
  style, badge gap, and badge-glyph-color in line with Sain 3's already-correct reference — in
  Sain 1 (`s11`/`s16`), Sain 5 (`s4`), and Sain 6 (`s6c`).
- For Sain 1's `s17` (hand-written variant): this needs a slightly bigger, deliberate fix (adding a
  badge for the first time, plus fixing the zone/image-frame styling) rather than a one-line value
  swap — worth confirming you want this one done in the same pass or scoped separately, since it's
  more invasive than the others.
- Replace the misnamed `icon-check-white.png`/`icon-x-white.png` usage specifically where it's used
  as a badge-on-colored-circle (Sain 5's DDQ badge at minimum) with the real white SVG assets already
  used correctly in Sain 1/Sain 3 — separate from the wider question of whether that mislabeled file
  should be renamed/fixed everywhere it's referenced (bigger scope, your call).
