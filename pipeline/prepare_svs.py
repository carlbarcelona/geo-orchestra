"""Package NASA SVS 5478 (IMERG Daily Precipitation Climatology 2001-2022) for the GeoOrchestra visual feed.

All SVS assets are public (no login). Steps:
  1. download the 1000 date-overlay frames and group consecutive identical overlays into runs
  2. assert 365 ordered day runs and cross-check against IMERGclim_dates2.txt (deduplicated)
  3. download one representative source frame per day (middle of the run), keep provenance
  4. write WebP derivatives: full globe 1024x512 and a native-resolution Philippines/West Pacific ROI crop
  5. write manifest.json (visual media manifest contract) and alignment.json (frame->date evidence)

Output: public/data/svs5478/{manifest.json, alignment.json, colorbar.png, full/day_###.webp, roi/day_###.webp}
"""
from __future__ import annotations

import concurrent.futures as cf
import datetime as dt
import json
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "svs5478"
OUT = ROOT / "public" / "data" / "svs5478"
BASE = "https://svs.gsfc.nasa.gov/vis/a000000/a005400/a005478/"
OVERLAY = BASE + "frames/2048x512_4x1_30p/IMERGdaily30_date_overlay.{:05d}.png"
FRAME = BASE + "frames/2048x1024_2x1_30p/IMERGdaily30_raw_v07.{:05d}.2048x1024.png"
NFRAMES = 1000
ROI = {"lonMin": 95.0, "lonMax": 150.0, "latMin": -10.0, "latMax": 30.0}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def fetch(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "GeoOrchestra-pipeline/0.1"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            tmp = dest.with_suffix(dest.suffix + ".part")
            tmp.write_bytes(data)
            tmp.replace(dest)
            return dest
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
    return dest


CHANGE_PIXELS = 500  # same-day overlays differ by < 50 pixels (encoder noise); a new date changes thousands


def load_overlay(path: Path):
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.int16)


def changed_pixels(a, b) -> int:
    return int((np.abs(a - b).max(axis=2) > 40).sum())


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    (OUT / "full").mkdir(parents=True, exist_ok=True)
    (OUT / "roi").mkdir(parents=True, exist_ok=True)

    # 1. overlays -> runs
    with cf.ThreadPoolExecutor(8) as ex:
        paths = list(ex.map(lambda i: fetch(OVERLAY.format(i), RAW / "overlays" / f"{i:05d}.png"), range(1, NFRAMES + 1)))
    runs: list[list[int]] = [[1]]
    diffs = []
    prev = load_overlay(paths[0])
    for idx in range(2, NFRAMES + 1):
        cur = load_overlay(paths[idx - 1])
        d = changed_pixels(prev, cur)
        diffs.append(d)
        if d > CHANGE_PIXELS:
            runs.append([idx])
        else:
            runs[-1].append(idx)
        prev = cur
    same = [d for d in diffs if d <= CHANGE_PIXELS]
    new = [d for d in diffs if d > CHANGE_PIXELS]
    distinct = len(runs)
    assert len(runs) == 366, f"expected 366 day runs (incl. Feb 29), found {len(runs)}"

    # 2. dates list cross-check
    dates_txt = fetch(BASE + "IMERGclim_dates2.txt", RAW / "IMERGclim_dates2.txt").read_text().split()
    lines = [" ".join(dates_txt[i:i + 2]) for i in range(0, len(dates_txt), 2)]
    dedup = [d for k, d in enumerate(lines) if k == 0 or lines[k - 1] != d]
    days = []
    base = dt.date(2004, 1, 1)  # leap reference year: the SVS overlays include February 29
    for d in range(366):
        day = base + dt.timedelta(days=d)
        days.append(f"{MONTHS[day.month - 1]} {day.day:02d}")
    dates_list_ok = dedup == [d for d in days if d != "Feb 29"]
    dates_list_has_feb29 = "Feb 29" in lines

    # 3/4. representative frames + derivatives
    colorbar = fetch(BASE + "SOS_IMERG_cbar_1000px.png", RAW / "SOS_IMERG_cbar_1000px.png")
    Image.open(colorbar).save(OUT / "colorbar.png", optimize=True)

    def build(day_idx: int):
        run = runs[day_idx]
        src = run[len(run) // 2]
        p = fetch(FRAME.format(src), RAW / "frames" / f"{src:05d}.png")
        im = Image.open(p).convert("RGB")
        W, H = im.size
        im.resize((1024, 512), Image.LANCZOS).save(OUT / "full" / f"day_{day_idx + 1:03d}.webp", quality=82, method=6)
        x0 = round((ROI["lonMin"] + 180) / 360 * W)
        x1 = round((ROI["lonMax"] + 180) / 360 * W)
        y0 = round((90 - ROI["latMax"]) / 180 * H)
        y1 = round((90 - ROI["latMin"]) / 180 * H)
        im.crop((x0, y0, x1, y1)).save(OUT / "roi" / f"day_{day_idx + 1:03d}.webp", quality=90, method=6)
        return {"day": day_idx + 1, "label": days[day_idx], "sourceFrame": src, "runFrames": [run[0], run[-1]],
                "sourceUrl": FRAME.format(src), "full": f"full/day_{day_idx + 1:03d}.webp", "roi": f"roi/day_{day_idx + 1:03d}.webp"}

    with cf.ThreadPoolExecutor(8) as ex:
        frames = list(ex.map(build, range(366)))

    roi_px = Image.open(OUT / "roi" / "day_001.webp").size
    alignment = {
        "contract": "frame-date-alignment", "version": 1,
        "method": "Consecutive SVS date-overlay frames compared pixel-wise; a change of more than 500 pixels starts a new calendar day (same-day encoder noise stays below 50 pixels). Each run of frames is one day.",
        "pixelChange": {"sameDayMax": max(same), "newDayMin": min(new), "threshold": CHANGE_PIXELS},
        "overlayFrames": NFRAMES, "dayRuns": len(runs), "distinctOverlays": distinct,
        "datesListLines": len(lines), "datesListDedupMatchesRunsExceptFeb29": dates_list_ok, "datesListHasFeb29": dates_list_has_feb29,
        "feb29": {"day": 60, "frames": runs[59], "evidence": "Overlay frames show 'February 29' between 'February 28' and 'March 01'; IMERGclim_dates2.txt omits it, so the text list cannot be used as a frame index."},
        "manualSpotChecks": [{"frame": 3, "overlay": "January 02"}, {"frame": 1000, "overlay": "December 31"}, {"frame": 162, "overlay": "February 29"}, {"frame": 165, "overlay": "March 01"}],
        "note": "Frame index is not a calendar day: runs have 1-3 frames (366 days over 1000 frames). The dates text file (501 lines, no Feb 29) does not map 1:1 to the 1000 frames.",
        "runs": [{"day": i + 1, "label": days[i], "first": r[0], "last": r[-1]} for i, r in enumerate(runs)],
    }
    (OUT / "alignment.json").write_text(json.dumps(alignment, indent=1))

    manifest = {
        "contract": "visual-media-manifest", "version": 1,
        "assetId": "svs-5478", "title": "IMERG Daily Precipitation Climatology (2001–2022)",
        "kind": "frame-sequence", "source": {
            "provider": "NASA Scientific Visualization Studio (Earth Information Center)", "page": "https://svs.gsfc.nasa.gov/5478/",
            "credit": "NASA's Scientific Visualization Studio", "visualizer": "Alex Kekesi (GST)",
            "scientists": ["George Huffman (NASA/GSFC)", "Jackson Tan (UMBC)"],
            "original": BASE + "frames/2048x1024_2x1_30p/", "originalSize": [2048, 1024], "originalFrames": NFRAMES},
        "projection": "equirectangular", "bounds": {"lonMin": -180, "lonMax": 180, "latMin": -90, "latMax": 90},
        "roi": {**ROI, "pixelSize": list(roi_px), "note": "Native-resolution crop of the 2048x1024 frame (no resampling)."},
        "timeBasis": "seasonal-day-of-year", "days": 366, "averaging": {"years": [2001, 2022], "smoothing": "trailing 30-day mean"},
        "colorbar": {"path": "colorbar.png", "unit": "mm/day", "min": 0, "max": 24, "note": "SVS colorbar is mm/day; IMERG measurements in this app are mm/hr (×24 for mm/day)."},
        "derivatives": "One representative frame per day (middle of each overlay run), WebP: full 1024×512 and ROI crop.",
        "frames": frames,
        "measurementLinkage": {"path": "climatology-ph.json", "status": "reconstructed"},
        "alignmentEvidence": "alignment.json",
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(json.dumps({"runs": len(runs), "datesListMatchesExceptFeb29": dates_list_ok, "datesListHasFeb29": dates_list_has_feb29, "roi": roi_px,
                      "runLengths": sorted({len(r) for r in runs})}))


if __name__ == "__main__":
    main()
