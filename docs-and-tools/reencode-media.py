#!/usr/bin/env python3
"""Re-encode the unit's raster images, keeping every file's REAL type (PNG stays PNG, JPEG stays
JPEG — unit-owner constraint 2026-11-03), downsized to 2 x the box each one is drawn in, and
written under a NEW name (`<stem>-opt.<ext>`) with every reference in ITS OWN PART rewritten — the unit is
deployed and images are fetched without ?v=, so a same-name file would be served stale from
caches (guide ADDING-REPORTING-AND-RESUME.md §15.2 rule 6).

Never shipped (docs-and-tools/ is outside the package allowlist). Run from the unit root:

    python -I docs-and-tools/reencode-media.py --dry-run [--only NAME ...]
    python -I docs-and-tools/reencode-media.py --apply   [--only NAME ...]

methodica-ar-science-mass-measure-03 port (2026-11-10, same as the Hebrew twin) of methodica-ar-science-mass-measure-01's script:
  * only files with a measured box are re-encoded (MEASURED_ONLY): every image a learner loads was
    drawn in the measurement (every screen of every part, both characters, every zoom opened), and the
    large files that were not are not referenced by any page (the avatar PNGs survive only in
    comments; the screens play .mp4 clips) - renaming them would buy the learner nothing
  * the same file name exists in several parts (pink-avatar-come-on.png in all five), so references
    are rewritten only in the file's own part (its index.html, script.js, styles.css)

Rules (ported from methodica-ar-science-mass-liquid-02/docs-and-tools/reencode-media.py, 2026-10-22):
  * only files >= MIN_BYTES; SVG never touched
  * target size = 2 x the largest box in docs-and-tools/media-display-boxes.json (cover rule: the
    larger of the two ratios), never upscaled; a shrink below 10 % is skipped
  * PNG: LANCZOS resize -> libimagequant 256-colour palette (dithered, alpha kept, quality floor 70 —
    an image that cannot reach it stays 24-bit, the banding guard) -> oxipng -o4 --strip safe
  * JPEG: LANCZOS resize -> Pillow quality 82, progressive, optimize, EXIF dropped
  * the real format decides the pipeline and the new extension: four files here carry a wrong
    extension (PNG content named .jpeg/.jpg); they come out as `-opt.png`
  * an output larger than its input is discarded: the input keeps its name, row says "kept (no gain)"
  * --apply: writes the new file, rewrites every reference in its part (index.html, script.js,
    styles.css) and deletes the original; rows -> docs-and-tools/reencode-rows.md
"""
import json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

from PIL import Image, ImageOps
import imagequant

ROOT = Path(__file__).resolve().parent.parent
BOXES = json.loads((ROOT / 'docs-and-tools' / 'media-display-boxes.json').read_text('utf-8'))
ROWS_OUT = ROOT / 'docs-and-tools' / 'reencode-rows.md'

PNG_MIN_Q, PNG_MAX_Q, JPG_Q = 70, 95, 82
MIN_SHRINK = 0.90          # scale >= this: no resample
MIN_BYTES = 100 * 1024     # smaller files are not worth a rename
MEASURED_ONLY = True       # see the header
IMG_EXT = {'.png', '.jpg', '.jpeg'}
EXT_FOR = {'PNG': '.png', 'JPEG': '.jpg'}


def asset_files():
    dirs = sorted(ROOT.glob('*-0[1-9]/assets/img')) + sorted(ROOT.glob('*-0[1-9]/assets/images')) + [ROOT / 'unit-assets' / 'img']
    out = []
    for d in dirs:
        if d.is_dir():
            out += sorted(x for x in d.iterdir() if x.is_file() and x.suffix.lower() in IMG_EXT)
    return out


def ref_files(asset):
    part = asset.parent.parent.parent          # <part>/assets/images/<file>
    return [p for p in (part / 'index.html', part / 'script.js', part / 'styles.css') if p.is_file()]


def target_scale(name, nat_w, nat_h):
    boxes = BOXES.get(name)
    if not boxes:
        return 1.0, None
    s = max(max(bw / nat_w, bh / nat_h) for bw, bh in boxes)   # cover: the larger ratio
    biggest = max(boxes, key=lambda b: b[0] * b[1])
    return min(1.0, 2.0 * s), biggest


def rel(p):
    return p.relative_to(ROOT).as_posix()


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f'{cmd[0]} failed: {r.stderr[-800:]}')
    return r.stdout


def rewrite_refs(asset, new_name):
    old_name = asset.name
    pat = re.compile(r'(?<=[/"\'(])' + re.escape(old_name) + r'(?=["\'?)])')
    touched = []
    for f in ref_files(asset):
        s = f.read_text('utf-8')
        n, cnt = pat.subn(new_name, s)
        if cnt:
            f.write_text(n, 'utf-8', newline='')
            touched.append(f'{rel(f)}:{cnt}')
    return touched


def main(apply, only):
    sys.stdout.reconfigure(encoding='utf-8')
    rows, saved, total_before = [], 0, 0
    for f in asset_files():
        if only and f.name not in only:
            continue
        before = f.stat().st_size
        if before < MIN_BYTES or f.stem.endswith('-opt'):   # already done (re-runs are safe)
            continue
        if MEASURED_ONLY and (f.name not in BOXES or not any(f.name in r.read_text('utf-8') for r in ref_files(f))):
            continue   # never drawn, or not referenced in its own part (the box table is keyed by name)
        total_before += before
        im = Image.open(f); im.load()
        fmt = im.format
        if fmt not in EXT_FOR:
            print(f'{rel(f):70} skipped: format {fmt}')
            continue
        nat = im.size
        scale, box = target_scale(f.name, *nat)
        ops, params = [], []
        tmpdir = Path(tempfile.mkdtemp())
        new_name = f.stem + '-opt' + EXT_FOR[fmt]
        out = tmpdir / new_name
        work = im
        if scale < MIN_SHRINK:
            new = (max(1, round(nat[0] * scale)), max(1, round(nat[1] * scale)))
            work = ImageOps.exif_transpose(im).resize(new, Image.LANCZOS)
            ops.append('resize'); params.append(f'LANCZOS {nat[0]}x{nat[1]} -> {new[0]}x{new[1]} (2 x box {box[0]}x{box[1]})')
        else:
            new = nat
        if fmt == 'PNG':
            rgba = work.convert('RGBA')
            try:
                q = imagequant.quantize_pil_image(rgba, dithering_level=1.0, max_colors=256, min_quality=PNG_MIN_Q, max_quality=PNG_MAX_Q)
                q.save(out, 'PNG', optimize=True)
                ops.append('quantize'); params.append(f'libimagequant 256 colours, dither 1.0, quality {PNG_MIN_Q}-{PNG_MAX_Q}')
            except RuntimeError:
                (rgba if im.mode in ('RGBA', 'LA', 'P') else work.convert('RGB')).save(out, 'PNG', optimize=True)
                params.append(f'palette refused below quality {PNG_MIN_Q}: kept 24-bit')
            run(['oxipng', '-o', '4', '--strip', 'safe', '-q', str(out)])
            params.append('oxipng -o4 --strip safe')
        else:
            work.convert('RGB').save(out, 'JPEG', quality=JPG_Q, optimize=True, progressive=True)
            ops.append('reencode'); params.append(f'Pillow JPEG q{JPG_Q} progressive optimize, EXIF dropped')
        if f.suffix.lower() != EXT_FOR[fmt]:
            params.append(f'real format {fmt}, extension corrected')
        after = out.stat().st_size
        op = '+'.join(ops) if ops else 'reencode'
        if after >= before:
            verdict, after_eff, final = 'kept (no gain)', before, f.name
        else:
            verdict, after_eff, final = 'written', after, new_name
            if apply:
                shutil.copyfile(out, f.with_name(new_name))
                touched = rewrite_refs(f, new_name)
                f.unlink()
                verdict += ' -> refs: ' + (', '.join(touched) or 'NONE (orphan?)')
        shutil.rmtree(tmpdir, ignore_errors=True)
        saved += before - after_eff
        boxtxt = f'{box[0]}x{box[1]}' if box else 'none: native kept'
        rows.append(f'| {op} | `{rel(f)}` | `{final}` | {before:,} | {after_eff:,} | {nat[0]}x{nat[1]} | {new[0]}x{new[1]} | {boxtxt} | {"; ".join(params)} | {verdict} |')
        print(f'{rel(f):70} {before:>10,} -> {after_eff:>10,}  {nat[0]}x{nat[1]}->{new[0]}x{new[1]:<5} {op:16} {verdict}')
    hdr = '| op | file | new name | bytes before | bytes after | px before | px after | box | parameters | verdict |\n|---|---|---|---|---|---|---|---|---|---|\n'
    ROWS_OUT.write_text(hdr + '\n'.join(rows) + '\n', 'utf-8')
    print(f'\n{len(rows)} files, {total_before:,} -> {total_before - saved:,} bytes ({saved:,} saved)'
          f'{" (dry run — nothing written)" if not apply else ""}; rows -> {rel(ROWS_OUT)}')


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--apply' not in args and '--dry-run' not in args:
        sys.exit(__doc__)
    only = set(args[args.index('--only') + 1:]) if '--only' in args else set()
    only -= {'--apply', '--dry-run'}
    main('--apply' in args, only)
