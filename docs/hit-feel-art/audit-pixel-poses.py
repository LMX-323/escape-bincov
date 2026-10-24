"""Validate delivered PNGs against the art contract, independently of authoring.

python docs/hit-feel-art/audit-pixel-poses.py
Writes only pixel-audit.json; never repairs images. Exits nonzero on failures.
Requires Pillow. Runtime playback and human perception remain separate checks.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = json.loads((ROOT / 'assets/hit-feel/templates/sources.json').read_text())['templates']
DIRS = ['E', 'SE', 'S', 'NE', 'N']


def equal(a, b):
    return all(c.getbbox() is None for c in ImageChops.difference(a, b).split())


def rgba_palette(im):
    return {p for p in im.getdata() if p[3]}


def changed(a, b):
    return sum(x != y for x, y in zip(a.getdata(), b.getdata()))


def centre(im, top, bottom):
    weights = [(x, im.getpixel((x, y))[3]) for y in range(top, bottom) for x in range(im.width)]
    return sum(x * a for x, a in weights) / sum(a for _, a in weights)


def outline_difference(a, b, bottom):
    return sum((a.getpixel((x, y))[3] >= 128) != (b.getpixel((x, y))[3] >= 128) for y in range(bottom) for x in range(a.width))


report = {'schema': 1, 'method': 'Independent exact-pixel validation of saved sheets, not their authoring functions. World anchor uses the original cell origin; no per-frame recentering. Pixel movement thresholds are in logical pixels.', 'sheets': [], 'failures': []}
for entry in TEMPLATES:
    id = entry['id']
    w, h = (40, 28) if id == 'creature' else (32, 48)
    file = f'assets/hit-feel/sources/{id}-hurt-sheet-pixel-v1.png'
    im = Image.open(ROOT / file).convert('RGBA')
    template = Image.open(ROOT / entry['template']).convert('RGBA')
    checks = {'canvas': im.size == template.size, 'idleColumnExact': equal(im.crop((0, 0, w * 8, h * 8 * 5)), template.crop((0, 0, w * 8, h * 8 * 5))), 'hasTrueTransparency': im.getchannel('A').histogram()[0] > 0}
    small = im.resize((w * 3, h * 5), Image.Resampling.NEAREST)
    checks['uniform8x8Blocks'] = equal(im, small.resize(im.size, Image.Resampling.NEAREST))
    rows = []
    for row, direction in enumerate(DIRS):
        frames = [small.crop((col * w, row * h, (col + 1) * w, (row + 1) * h)) for col in range(3)]
        idle = frames[0]
        fixed_foot = 24 if id == 'creature' else 40 if id.startswith('raider-') else 43
        palette = rgba_palette(idle)
        top = idle.getchannel('A').getbbox()[1]
        top_band = 24 if id == 'creature' else 19
        phases = []
        for pose, expected_drop, frame in zip(['hurt', 'recovery'], [2, 1], frames[1:]):
            bbox = frame.getchannel('A').getbbox()
            torso_centre = centre(frame, 19, 33) if id != 'creature' else centre(frame, 10, 24)
            original_centre = centre(idle, 19, 33) if id != 'creature' else centre(idle, 10, 24)
            results = {
                'footBandExact': equal(frame.crop((0, fixed_foot, w, h)), idle.crop((0, fixed_foot, w, h))),
                'onlyOriginalColours': rgba_palette(frame) <= palette,
                'headOrShellTopDrop': bbox[1] - top,
                'centreShift': round(torso_centre - original_centre, 4),
                'outlineChangedPixels': outline_difference(idle, frame, top_band),
                'changedPixels': changed(idle, frame),
                'bounds': bbox,
                'visibleWithinCell': 0 < bbox[0] and bbox[2] < w and 0 < bbox[1] and bbox[3] <= h,
            }
            results['topDropCorrect'] = results['headOrShellTopDrop'] == expected_drop
            results['centreWithinOnePixel'] = abs(torso_centre - original_centre) <= 1
            results['outlineReadableDifference'] = results['outlineChangedPixels'] >= 2
            if id != 'creature':
                results['shoulderBandExact'] = equal(frame.crop((0, 19, w, 22)), idle.crop((0, 19, w, 22)))
            # Body colour changes and contours are checked separately; alpha-only
            # getbbox would miss accidental RGB changes to the locked idle column.
            required = ['footBandExact', 'onlyOriginalColours', 'visibleWithinCell', 'topDropCorrect', 'centreWithinOnePixel', 'outlineReadableDifference']
            if id != 'creature':
                required.append('shoulderBandExact')
            for key in required:
                if not results[key]:
                    report['failures'].append(f'{id}/{direction}/{pose}: {key}')
            phases.append({'pose': pose, **results})
        recovery_less_changed = phases[1]['changedPixels'] < phases[0]['changedPixels']
        if not recovery_less_changed or equal(frames[1], frames[2]):
            report['failures'].append(f'{id}/{direction}: recovery must differ and be closer to idle')
        rows.append({'dir': direction, 'fixedFootFrom': fixed_foot, 'recoveryFewerChangedPixels': recovery_less_changed, 'phases': phases})
    for key, value in checks.items():
        if not value:
            report['failures'].append(f'{id}: {key}')
    report['sheets'].append({'id': id, 'file': file, 'sha256': hashlib.sha256((ROOT / file).read_bytes()).hexdigest(), 'checks': checks, 'rows': rows})
report['status'] = 'PASS' if not report['failures'] else 'FAIL'
path = ROOT / 'docs/hit-feel-art/pixel-audit.json'
path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(f"{report['status']}: 7 sheets / 35 directions / 70 new poses; {len(report['failures'])} failures")
for failure in report['failures']:
    print(failure)
raise SystemExit(1 if report['failures'] else 0)
