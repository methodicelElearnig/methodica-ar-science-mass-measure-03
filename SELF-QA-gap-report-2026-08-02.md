# Figma vs. built-lomda gap report — 2026-08-02

Comprehensive QA pass across all 6 sub-projects (`methodica-science-mass-measure-03-01` through
`-06`) against the exact Figma spec now recorded in `SELF-QA.md`. Figma values were pulled live via
the Figma MCP (`get_design_context`/`download_assets`) on the node IDs the client supplied — nothing
below is estimated. Every fix listed was independently re-verified after the fact (grep for the
literal before/after CSS, brace-balance check, `node -e "new Function(...)"` parse check on every
project's `script.js`) — not just taken on the fixing agent's word.

## Why these gaps existed, in general

Every one of the four template categories is implemented via **shared, copy-pasted code** — the
`makeDragQuestion()` factory and `.dq-snt-drop`/`.dq-placed-card` CSS, and the `.viq-input` CSS —
each project keeps its own independent copy (per this family's "every Sain is a standalone package"
convention). That means a mistake made once, early in the family's history, propagates to every
later project that copied the pattern instead of re-deriving it from Figma. Both confirmed bugs
below fit that shape exactly: neither looks like an isolated one-off typo, they're the same
divergence appearing project after project with the same wrong values.

---

## Category 1 — ValueInputQuestion inline answer-box

**Present in:** Sain 1 (screens s5, s6), Sain 2 (screen s7/"מסך 8"). Absent from Sain 3, 4, 5, 6.

**What was wrong (both projects, same root cause):**
| Property | Built value | Figma value |
|---|---|---|
| Border width (correct/incorrect) | 1.5px | **1px** |
| Text color on correct | recolored to `#3d6b0a` | **unchanged**, `#303030` |
| Icon | hand-drawn inline data-URI SVG | must be the real exported Figma asset |
| Icon background-position | `right 10px center` | **`right 16px center`** (box's real padding is 16px) |
| Sain 1 only: `.viq-input.error` | border present, **no icon at all** | Figma's Incorrect state always shows the 16×16 red X |

**Why it likely happened:** the icon was built by hand (an inline SVG path guessed to look like a
checkmark/X) before the real Figma asset was ever exported, and the 10px offset/1.5px border/text
recolor all read as small "looks fine" adjustments made without re-checking the actual Figma frame
— each one individually plausible, none of them matching the source of truth.

**Fixed:**
- **Sain 1** (`styles.css:1267-1274`): border → 1px on both classes; text recolor removed;
  `.viq-input.error` (which had no icon) and `.viq-input.correct` now both reference the real
  downloaded SVGs at `right 16px center`.
- **Sain 2** (`styles.css:883-891`): same fix, applied to `.correct`/`.error`/`.wrong` (this
  project has a third class, `.wrong`, matching the incorrect state, that Sain 1 doesn't).

**Icons copied:** `icon-check-green.svg` / `icon-x-red.svg` into each project's own
`assets/images/`, matching each project's existing `icon-<name>-<color>.svg` naming convention.

---

## Category 2 — SingleChoiceQuestion image-option cards

**⚠️ Correction (found after initial delivery of this report):** the original QA pass reported this
category absent everywhere. That was wrong — **Sain 1, screen `s15` (מסך 16, "בחרו את המאזניים
המתאימים")** is exactly this template, implemented under project-specific class names
(`.s15-card`/`.s15-card-frame`/`.s15-card-label`) rather than a generically-named
`scq-image-option`-style class. The per-project survey agent searched for pattern/keyword matches
and missed this because the naming didn't match what it was looking for — a real gap in that
survey method, not something the codebase hid. Found when the client pointed directly at the
screen; verified and fixed by hand afterward (not re-delegated), with a live browser check of
default/selected/correct/wrong states before considering it done.

**Present in:** Sain 1 only (`s15`, `styles.css:1646-1699` pre-fix). Confirmed absent in Sain 2-6
(re-checked: each project's SCQ screens are either plain text/radio-pill lists or pair one static
reference photo with a text-option list, never a grid of individually-selectable photo cards).

**What was wrong:**
| Property | Built value | Figma value |
|---|---|---|
| Default | 3px `rgba(201,206,216,0.4)`, radius 16px | same | matched already |
| Selecting (pre-check) | border `var(--subject-500)`, bg **`#EAF6FF`** | bg **`#d4f3ff`**, **radius grows to 24px** | wrong shade, radius didn't grow |
| Correct | border `#609e12`, bg **`#edf8ed`** (tinted) | bg **white**, **+32×32 green circle badge, white check, overlapping top-right corner** | wrong bg, **badge missing entirely** |
| Incorrect | border `#B20010`, bg **`#fff0f4`** (tinted) | bg **white**, **+32×32 red circle badge, white X** | wrong bg, **badge missing entirely** |

**Why it likely happened:** this screen was built by adapting a bg-tint convention from a
*different* template (plain SCQ correct/wrong option pills elsewhere in this family do use a subtle
tint), without re-checking that the image-option-card variant in Figma specifically keeps a white
background and signals state via a badge instead.

**Fixed** (`styles.css`, `.s15-card*` block; `index.html`, one `<span class="s15-card-badge">` added
per card):
- Selecting-state background corrected to `#d4f3ff`; radius now grows to 24px only in this state.
- Correct/incorrect backgrounds reverted to white (tints removed).
- Added the missing badge: a `.s15-card-badge` element (absolutely positioned on `.s15-card`, not on
  `.s15-card-frame`, since the frame's `overflow:hidden` would otherwise clip a badge meant to poke
  out past its border) shown via `.s15-card.correct/.wrong .s15-card-badge`, 32×32 circle,
  colored background + the real white check/X glyph, positioned to overlap the frame's top-right
  corner (`top:-16px; right:-16px`).
- Verified live in a headless browser: default → selecting (blue, light-blue fill, larger radius) →
  correct (white bg, green border, green check badge) and → incorrect (white bg, red border, red X
  badge) all render correctly and match Figma.

**Found during verification, NOT fixed (pre-existing, unrelated to this task, flagged for a
separate decision):** the hover-state CSS rule (`.s15-card:not(.disabled):hover .s15-card-frame`)
has higher specificity than the `.correct`/`.wrong` border-color rules (3 pseudo/class selectors vs
2). If a learner's pointer is still resting on the card at the moment it's marked wrong/correct
(e.g. checking via keyboard, or a trackpad hover lingering) the border briefly shows the hover blue
instead of green/red while hovered, even though the new badge still renders correctly regardless.
This predates today's fix and is unrelated to Figma-fidelity — flagging rather than silently
patching a hover/specificity issue that wasn't part of what was asked.

---

## Category 3 — DragAndDropQuestion text-fill ("Image Top" layout)

**Present in:** Sain 1 (screens s11, s16 via the shared factory; s17 is a separate hand-written
variant), Sain 3 (screen s2), Sain 5 (screen s4), Sain 6 (screen s6c). Absent from Sain 2, 4.

**Confirmed family-wide bug, present in every project that has this template (Sain 1's s11/s16,
Sain 3, Sain 5, Sain 6):** the shared `.dq-snt-drop.correct/.wrong .dq-placed-card::after` CSS
rendered the correct/incorrect indicator as a **bare Unicode character** (`content: '✓'` /
`content: '✕'`, colored via `color:`/`font-size:`) with no circle badge at all, and separately
recolored the placed-item's own text (`color: #3d6b0a` / `#7a000a`). Figma's actual spec is a real
26×26 colored circle with a white vector glyph inside, and the text color never changes from
`#303030`.

**Why it likely happened:** a Unicode `✓`/`✕` glyph is the fastest way to get *something* looking
like an icon on screen without waiting for an asset export, and once one screen's `makeDragQuestion`
CSS block had it, every later screen inherited it by copying that block rather than checking Figma
again for what "correct feedback in a drag question" is actually supposed to look like.

**Fixed identically in all four projects** — replaced the `::after` rule with a real circle badge
(`border-radius:50%`, colored `background-color`, the real white-glyph SVG as `background-image`,
`background-size` tuned per glyph) and deleted the text-recolor rule so the text stays `#303030`:

- **Sain 1** (`styles.css:1440-1458`, screens s11/s16's shared `.dq-snt-drop`): fixed. Icons copied
  as `icon-badge-correct-white.svg` / `icon-badge-incorrect-white.svg`.
- **Sain 3** (`styles.css`, screen s2): fixed, **plus three related deviations found in the same
  pass** — drop-zone default background/border was solid gray instead of `#f3f4f5` + dashed;
  `.occupied` (dropped-but-unchecked) background was `#f3f4f5` instead of the spec's `#d4f3ff`;
  idle word-bank pill border was `1px rgba(174,174,174,0.5)` instead of `1.5px #ececec`. All four
  fixed together since they're the same CSS block. Icons copied as `icon-badge-check-white.svg` /
  `icon-badge-x-white.svg`.
- **Sain 5** (`styles.css:529-540`, screen s4): fixed. This project already had suitable white-glyph
  PNG assets in its own `assets/images/` (used elsewhere for the SCQ radio-button correct/wrong
  marks) — reused those instead of copying new SVGs, since they already matched the "white glyph
  for a colored circle" spec.
- **Sain 6** (`styles.css`, screen s6c): fixed, plus the `.occupied` background was also corrected
  from `#f3f4f5` to `#d4f3ff` (same class of bug as Sain 3's, found independently). Icons copied as
  `icon-check-white-badge.svg` / `icon-x-white-badge.svg`.

**Left as flagged, not fixed (deliberately — each is a scope decision, not an oversight):**
1. **Sain 1, screen s17** — a *separate*, hand-written (non-factory) drag-question implementation.
   It has **no badge at all** on correct/incorrect, and uses tinted (`#edf8ed`/`#fff0f4`) instead of
   white zone backgrounds. Its drop-zone is hardcoded to a width (`184px` zone, `180px`-min-width
   pill) that a 26px badge would visually overflow — fixing this needs a deliberate width/padding
   redesign, not a copy of the factory fix. Needs its own follow-up pass.
2. **Sain 3** — the "being dragged" pill's blue border can't be forced onto the native browser
   drag-image *snapshot* through CSS alone (the browser snapshots the drag image before the
   `.dragging` class is applied, by the time the JS's `setTimeout(0)` runs). A real fix needs
   `e.dataTransfer.setDragImage()` in JS, which is out of scope for what was asked here (a
   CSS/asset-only pass) — flagged for a future pass if a producer specifically calls this out.
3. **Sain 1 (s11/s16) and Sain 6** — the idle word-bank pill border (`1px
   rgba(174,174,174,0.5)` vs. spec's `1.5px #ececec`) and the "dropped, unchecked" 22px/`#222`
   text treatment were left untouched in these two projects; they weren't part of the two
   originally-confirmed bug patterns, and fixing them requires additional `:not()` guard selectors
   the agents flagged as lower-confidence to add without a deliberate review. Sain 3 *did* get
   these fixed (found independently in that pass). Recommend deciding whether to backfill Sain 1
   and Sain 6 to match, since right now the three projects are inconsistent with each other on
   these two specific properties.

---

## Category 4 — DragAndDropQuestion image-drag ("Classic"/"ImageOnly" layout)

**Present in:** no project (all 6 checked and confirmed absent). The closest thing found (Sain 1) is
an interactive scale-weighing simulation, which is a different, non-DragAndDropQuestion component
entirely (dragging one item onto a fixed scale, not sorting multiple photo cards into labeled
targets). Nothing to fix; the exact spec — including the light-pink `#fff0f4` incorrect-card
background and the 22px inset corner badge (visually distinct from category 2's 32px floating
badge) — is recorded in `SELF-QA.md` for whenever this template is actually built. Two mid-drag
Figma states (`391:4294`/`391:4341`) weren't deep-inspected in this pass; verify those directly
against Figma before shipping this template.

---

## Summary table

| Project | Cat.1 ValueInput | Cat.2 SCQ-image | Cat.3 DDQ-text | Cat.4 DDQ-image |
|---|---|---|---|---|
| Sain 1 | Found, fixed | **Found, fixed (s15 — missed in first pass, corrected by hand after client flagged it)** | Found, fixed (s11/s16); s17 flagged, not fixed | Not present |
| Sain 2 | Found, fixed | Not present | Not present | Not present |
| Sain 3 | Not present | Not present | Found, fixed (most thorough — 4 related issues) | Not present |
| Sain 4 | Not present | Not present | Not present | Not present |
| Sain 5 | Not present | Not present | Found, fixed | Not present |
| Sain 6 | Not present | Not present | Found, fixed | Not present |

**Net result:** 3 confirmed, root-cause bugs (ValueInputQuestion styling, DDQ text-fill badge/color,
SCQ image-option card badge/tint) found and fixed everywhere they existed — 7 screens across 4
projects. 4 items deliberately left flagged rather than silently fixed, since each needs a scope
decision (layout redesign, a JS change outside the requested surface, a hover/specificity issue
predating this task, or a cross-project consistency call) rather than a mechanical copy of the same
recipe. 0 regressions — every project's CSS brace count balances and every `script.js` still parses
after the edits.

**Process note:** the first pass's per-project survey (keyword/pattern search for known class
names) missed Sain 1's `s15` screen because it uses project-specific class names instead of a
generic pattern. It was found only because the client pointed at it directly. This is a real
limitation of that survey method, not a guarantee that no other category-2/4 screens are hiding
under an unexpected class name elsewhere in the family — worth a manual screen-by-screen visual
pass (not just a grep-based search) if full confidence is needed.

---

## Round 2 — manual re-audit and fix, categories 1/3/4 (2026-08-02, same day)

Following the process note above, the client asked for a proper manual pass (not another keyword
grep) specifically re-covering categories 1 (ValueInputQuestion), 3 (DDQ text-fill), and 4 (DDQ
image-drag) across all 6 projects, with a mapping-and-reasoning report presented for approval before
any fix — full detail in `SELF-QA-mapping-2026-08-02-pending-approval.md`. This found real,
previously-unfixed gaps that Round 1's narrower fix (which only targeted the two originally-flagged
bug *shapes*) never checked. All approved and applied same day.

**What Round 1 missed, found in Round 2:**
- **ValueInputQuestion** (Sain 1 `s5`/`s6`, Sain 2 `s7`): `text-align:center`→`right`,
  `padding:0 8px`→`0 16px`. Root cause: the box was modeled on a drag-and-drop word-slot convention
  instead of the actual Figma node.
- **DDQ text-fill**, everywhere it exists except Sain 3 which was already fully correct and became
  the reference: wrong idle-pill border, wrong drop-zone default/hover colors, the "dropped-but-
  unchecked" transient text style never implemented, a 6px-vs-10px badge/text gap (present even in
  Sain 3 itself — fixed there too), and in Sain 5 specifically, **badge glyph icon files that were
  actually solid green/red despite being named "white"** (verified by sampling pixel colors:
  `icon-check-white.png` ≈ `#6aa421`, `icon-x-white.png` = `#b20010` exactly) — nearly invisible
  against the same-colored badge circle. This exact mislabeled file exists byte-identical in all 6
  projects; only fixed where it was actually the active badge asset (Sain 5).
- **Sain 1's `s17`** (hand-written DDQ text-fill variant, not the shared factory): had no
  correct/incorrect badge at all and mismatched zone/image-frame styling — a bigger, deliberate fix
  rather than a value swap, since it required adding new CSS rules (not editing existing ones).

**Applied:**
| Project | Fix |
|---|---|
| Sain 1 | `.viq-input` text-align/padding; `.dq-snt-drop`/`.dq-drag-card`/`.dq-placed-card` colors+gap+missing transient-text rule (`s11`/`s16`); `s17` — added badge (26×26 circle + real white SVG, reusing this project's own already-correct assets), fixed zone default/hover/resolved colors, added image-frame border+radius+inset photo |
| Sain 2 | `.viq-input` text-align/padding (done directly, not via agent) |
| Sain 3 | `.dq-placed-card` gap 6px→10px (done directly) — the one property even this "gold reference" project had wrong |
| Sain 5 | Same `.dq-snt-drop`/`.dq-drag-card`/`.dq-placed-card` fixes as Sain 1, plus replaced the misnamed colored "white" PNGs with real white SVGs (copied from Sain 3's already-correct assets) for the DDQ badge specifically |
| Sain 6 | Same `.dq-snt-drop`/`.dq-drag-card`/`.dq-placed-card` fixes; badge icons here were already genuinely white (verified), no icon change needed |
| Sain 4 | No matching screens (re-confirmed by full manual read of all 4 screens, not just re-trusting Round 1) |

**Independent verification performed (not just the fixing agents' self-reports):**
- Grepped the literal before/after CSS values directly in Sain 1, 2, 3, 5, 6 — all confirmed exactly
  as reported.
- CSS brace-balance and `node -e "new Function(...)"` parse check on all 5 touched projects — clean.
- Live headless-browser render of Sain 1's `s17` in both correct and incorrect states (the riskiest
  change, since it added a badge to a screen/zone-width that had none before, in a layout explicitly
  built with a fixed width to avoid reflow) — confirmed the badge renders cleanly with no
  overflow/clipping in either state.
- Confirmed `.scq-fb-reveal-btn` (the unrelated rule-4 answer-toggle button present on several of
  these same screens) was untouched everywhere, via before/after occurrence counts.

**Remaining known items, not part of this round (unchanged from Round 1's list):** Sain 1 `s15`'s
pre-existing hover-specificity cosmetic bug; Sain 3's native-drag-image-snapshot CSS limitation
(needs a JS `setDragImage()` fix, out of scope); the broader question of whether the misnamed
`icon-check-white.png`/`icon-x-white.png` should be renamed or fixed everywhere else it's referenced
across the family (only fixed where it was an active, visible badge-on-circle problem in this
round).

---

## Round 3 — live-testing bugs found by the client, same day (2026-08-02)

The client actually clicked through the fixed screens and found three more real, distinct problems
that neither round's static CSS comparison caught (two are JS/markup-interaction bugs, not simple
value mismatches):

1. **ValueInputQuestion, Sain 1 only: no icon/border shown on the final (2nd) wrong attempt.**
   Root cause: `viqCheck()`'s final-wrong branch never added any class to the input (`.error`,
   `.correct`, nothing) — it only disabled the input and showed feedback text. This is a JS bug, not
   a CSS mismatch, and predates all three rounds above (unrelated to any CSS values touched
   earlier). Sain 2's equivalent `s7Check()` already did this correctly (`input.classList.add
   ('wrong')` on the final attempt) — used as the reference. **Fix:** added
   `input.classList.add('error')` to `viqCheck()`'s final-wrong branch (`script.js`), matching what
   `viqToggleReveal()`'s own "show my answer" branch already did. A stale code comment claiming "no
   `.viq-input.wrong` needed because the correct value is auto-shown" was also corrected — that
   reasoning described pre-reveal-toggle behavior and no longer matched the actual code.

2. **ValueInputQuestion, both Sain 1 and Sain 2: native browser spin-button arrows visible on the
   number input.** Not part of the Figma design (a plain clean box, no controls). Root cause:
   `<input type="number">` shows OS/browser-native increment/decrement arrows by default unless
   explicitly hidden — nobody had added the (standard, well-known) CSS to suppress them. **Fix:**
   added `::-webkit-outer/inner-spin-button { -webkit-appearance: none }` plus `-moz-appearance:
   textfield` to `.viq-input` in both projects.

3. **ValueInputQuestion, both Sain 1 and Sain 2: the value text and the correct/incorrect icon
   visually overlap for 2+ character values** (e.g. "17" rendered with the X drawn directly over the
   "7", illegible). Root cause: the icon is implemented as a CSS `background-image` on the `<input>`
   itself (there's no child element an `<input>` could otherwise have) positioned at `right 16px
   center`, while the value text is `text-align:right` inside the same 16px padding box — both are
   anchored to the exact same point, so any value reaching that width paints under/behind the icon.
   Figma's real component avoids this because text and icon are two separate flex children with a
   dedicated 10px gap between them; a single `<input>` has no equivalent built-in gap mechanism.
   **Fix:** added `padding-right: 42px` (16 base inset + 16 icon width + 10 gap, taken directly from
   Figma's own spacing) scoped to the correct/wrong/error states only (so the plain default/focus
   view keeps its original 16px symmetric padding) — reserves enough room that text can never reach
   the icon's position, for values of any length actually used in this family's questions.

**Additionally found and fixed while investigating the client's report, same session:**

4. **DragAndDropQuestion text-fill, every project with this template (Sain 1 `s11`/`s16`/`s17`,
   Sain 3, Sain 5, Sain 6): the correct/incorrect badge renders on the wrong side of the text** (left
   instead of right, next to the same edge Figma places it). Root cause: `.dq-placed-card` is
   `direction: rtl`; its content is a bare text node followed by a `::after`-generated badge. In an
   RTL flex row, the main-axis "start" (where the *first* item in document order lands) is the
   *physical right* — so the text (first, and the only real content) always claims the right edge,
   with the badge (`::after`, always last in generated order) landing to its *left* — regardless of
   `justify-content`, which only controls where the whole group sits, not the relative order of
   items within it. (This is exactly why Round 2's `justify-content: center → flex-start` change
   didn't fix — and couldn't have fixed — this specific problem; it was never a `justify-content`
   issue.) **Fix:** added `order: -1` to every `::after` badge rule (both `.correct` and `.wrong`,
   in all 5 affected CSS blocks including the hand-written `s17`), which moves the badge before the
   anonymous text box in flex order so it lands at the row's start (physical right), matching
   Figma's AnswerBox layout (icon flush at the right edge, text extending left from it).

**Verification for this round:** live headless-browser testing (not just static CSS reading) of
every fix — `viqCheck()`'s final-wrong path on Sain 1 s5/s6, the spinner's absence and the
text/icon spacing on Sain 1 s5/s6 and Sain 2 s7 (values of varying length, including a 5-character
decimal), and the DDQ badge position on Sain 1 s11 (via a real `drag_and_drop` simulation, not a
synthetic state hack) — screenshotted and visually confirmed correct in every case. CSS
brace-balance and `script.js` parse-check re-run on all 5 touched projects after these changes,
clean.

## Round 4 — comprehensive re-verification, both attempts, every DDQ screen (2026-08-02, same day)

The client asked for one more full pass confirming everything actually matches Figma and that icons
appear on **both** the first and second wrong attempts. This surfaced one more real gap plus
confirmed everything else via live rendering (not static reading) across every affected screen:

**Found and fixed — Sain 2's first wrong attempt had no icon at all.** `.viq-input.error` (the
retriable first-attempt state) was border-only (`border: 1px solid #B20010;`, no
`background-image`), while `.viq-input.wrong` (final attempt) had the full icon. Figma's "Incorrect"
node makes no distinction by attempt number, so the first attempt should show the same red X. Fixed
by adding the icon + `padding-right: 42px` to `.viq-input.error`, matching `.wrong`. (Sain 1 never
had this gap — its single `.error` class was already reused for both attempts with the icon
present throughout.)

**Live-verified, screenshot-by-screenshot, no remaining issues found:**
- Sain 1 `s5`: first wrong attempt (red border + X, "99" clear of the icon), second/final wrong
  attempt (red border + X, "77" clear of the icon) — both correct.
- Sain 1 `s6`: correct-on-first-try state (green border + check, "0.037" clear of the icon) —
  correct.
- Sain 2 `s7`: first wrong attempt now shows the icon (fixed this round); final wrong attempt
  confirmed clear of overlap ("17" + X, separated).
- Sain 1 `s16` (factory instance #2): 3-target sentence, one deliberately wrong — every badge (2
  green, 1 red) renders on the physical right of its own pill, no overlap.
- Sain 1 `s17` (hand-written variant): `s17RevealCorrect()` render — all 3 badges (added fresh this
  session) render correctly positioned, no overflow/clipping.
- Sain 3 `s2`: one correct + one deliberately wrong pill — both badges correctly positioned.
- Sain 5 `s4`: 6-target sentence, one deliberately wrong — all 6 badges (5 green, 1 red) correctly
  positioned.
- Sain 6 `s6c`: 6-target sentence, two deliberately swapped to be wrong — all 6 badges (4 green, 2
  red) correctly positioned.

Every one of the above was driven by a real `drag_and_drop`/`fill`/`click` interaction (not a
synthetic state hack bypassing the actual UI), screenshotted, and visually read — not inferred from
CSS alone. CSS brace-balance and `script.js` parse-check re-confirmed clean on all 5 touched
projects after this round's one additional edit.

## Round 5 — Sain 1 `s17` sizing regression, caught by the client during live use (2026-08-02)

The client noticed the longest drag-item label ("שקילת אורז (1kg)") visually overflowing its pill
once placed and checked. **Root cause: a regression introduced by this same session's own earlier
fix**, not a new independent bug. Round 2's `s17` badge fix added `.s17-zone.correct/.wrong
.s17-drag-item { width: 100%; ... }` so the badge would sit flush at the row's end — but `width:
100%` clamped the pill to `.s17-zone-wrap`'s fixed 184px, which was only ever sized for the text
alone. Once a 26px badge + 10px gap were added inside that same fixed width, the longest label no
longer fit and spilled outside the pill's visible border.

**First fix attempt was itself wrong and reverted within the same pass:** widening
`.s17-zone-wrap` to 260px and matching `.s17-zone-img` to the same 260px seemed like the obvious
symmetric fix, but `.s17-zone-img` has a fixed `aspect-ratio` — making it wider also made it
proportionally *taller*, which pushed the whole 3-column layout down far enough that the drag items
scrolled below the visible 1280×710 canvas (caught immediately via `getBoundingClientRect()`
before ever showing it as "done").

**Actual fix:** widen only `.s17-zone-wrap`/`.s17-zone` to 260px (176px→260px is exactly `178px`
text + `26px` badge + `10px` gap + `32px` padding, with a little headroom) and leave
`.s17-zone-img` at its original 200px — `.s17-zone-wrap`'s `align-items: center` already centers
the narrower image inside the wider column without issue, since nothing requires a column's image
and drop-zone to share the same width. Verified via `getBoundingClientRect()` that every drag item
now sits comfortably above the bottom bar (bottom ≈ 613px, well clear of the ~636px visible-canvas
boundary), and via screenshots that the longest label renders fully inside its pill with the badge
in both the correct (green) and incorrect (red) states.

**Lesson recorded in `SELF-QA.md`:** when a fixed-width column contains both an aspect-ratio-locked
image and a text pill, size them independently — growing the image to "match" the pill's new width
also grows its height and can push content out of a fixed canvas.

## Round 6 — same `s17`, source-item/zone width mismatch, caught by the client (2026-08-02)

Round 5 widened the drop zone to 260px but left `.s17-drag-item`'s own `min-width` at its original
180px — meaning the *source-bank* pills (before being dragged anywhere) stayed at 180px while the
*drop zones* were now 260px. The client immediately noticed the visual size mismatch and asked for
both to be uniform, sized to fit the longest label plus the badge that appears later — exactly the
260px value Round 5 had already derived. **Fix:** changed `.s17-drag-item`'s `min-width` from 180px
to 260px, so the source pill and its target zone are always the same size, both before and after
placement. Verified via `getBoundingClientRect()` (source items and zones both measure exactly
260px) and a full drag-all-three-correctly-and-check cycle screenshotted end to end — uniform
widths in the "before" state, badges fitting cleanly in the "correct" state, feedback and
progression to question 2 all working normally.
