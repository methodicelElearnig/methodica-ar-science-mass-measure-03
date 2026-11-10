# Optimization report — methodica-ar-science-mass-measure-03 (images, 2026-11-10)

Same method as the Hebrew twin (`methodica-science-mass-measure-03`, `docs-and-tools/OPTIMIZATION-REPORT.md`); the Arabic
parts have their own translated images (`*_ar.png`, `football-player.png`, `sim-scale-*.png`, …), measured here.

Part of the 03.11 boot hardening (`Documentation/reporting-and-resume/BOOT-AND-RESUME-HARDENING-2026-11-03.md` §2.4),
done together with the true/false fix and the leave save. Part 01's assets were 87 MB.

## What was done

- **Boxes measured, not guessed**: real Chrome at 1280×710 (scale 1), every screen of every part, both characters
  (`pink`, `boy`), every `.img-zoom-btn` opened — zoomable images carry their zoom-modal box.
  Result: `media-display-boxes.json` (36 files; the boxes equal the Hebrew ones, file for file).
- **30 images re-encoded** (31 candidates; `girl-weighing-tuna_ar.png` is a JPEG named `.png` and gave no gain — kept) with `reencode-media.py` (port of mass-measure-01's): type kept (`.jpg` files whose content is PNG come out
  `-opt.png`), 2 × the drawn box, never upscaled, PNG → libimagequant 256 colours + oxipng, JPEG q82
  progressive. New names `<stem>-opt.<ext>`, references rewritten in the file's own part, originals removed.
  Per-file rows: `reencode-rows.md`.
- **51.1 MB → 7.5 MB** for those files (−43.6 MB). Part 01: `screen14-*` 13.5 MB → 116 KB, `screen5-gold-blocks.jpg`
  3.6 MB → 57 KB.
- Small SVG icons stay eager (`loading="lazy"` only on raster images): they sit in buttons hidden until needed, and a
  lazy image in a hidden element only starts loading when it appears.

## Not done (left for a separate cleanup)

About **61 MB** of large images in `assets/images/` are not drawn on any screen: 21 files (≈ 41 MB) are not referenced at
all, and the avatar PNGs (`*-avatar-*.png`) appear only in comments — the screens play `.mp4` clips. They are never
fetched by a learner, so they were not renamed; they only make the package heavier. Removing them is a package
change of its own (check `package-allowlist.ps1` and the Arabic twin first).

## Checked

- Every `<img>` on every screen, both characters, loads (`naturalWidth > 0`, no HTTP ≥ 400): 146 checks, 0 problems.
- Screens with the largest downsizing (01 s5, s13, s14; 02 s3; 05 s3; 06 s2) looked at in screenshots: sharp at the
  drawn size.
